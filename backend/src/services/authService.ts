
import { BrokerDepartment, User } from '@/types';
import { RegisterInput, LoginInput, RefreshTokenInput } from '@/validators';
import {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  verifyPassword,
  verifyRefreshToken,
} from '@/helpers';
import { prisma } from '@/lib/prisma';
import { deleteRefreshTokenHash, getRefreshTokenHash, saveRefreshTokenHash } from '@/lib/refreshTokenStore';
import { normalizeBrokerDepartment } from '@/lib/departmentAccess';
import { isDatabaseConnectionError } from '@/lib/databaseErrors';
import { isAuthenticatableRole } from '@/lib/authRoles';
import { logError, logWarn } from '@/lib/logger';

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

type StoredUser = User & { password: string };
type TokenUser = Pick<User, 'id' | 'email' | 'role' | 'permissions' | 'brokerId' | 'department'>;

const DEFAULT_BROKER_PHONE = '0000000000';

export class AuthService {
  async register(data: RegisterInput): Promise<{ user: User; tokens: AuthTokens }> {
    const normalizedEmail = data.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      throw new Error('Email already registered');
    }

    const hashedPassword = await hashPassword(data.password);
    const normalizedRole = this.normalizeRole(data.role);

    const created = await prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: data.name,
          role: normalizedRole,
        },
      });

      const brokerId = await this.ensureBrokerProfileForUser({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tx,
      });

      return { user, brokerId };
    });

    const department = await this.getBrokerDepartmentByEmail(created.user.email);
    const user: StoredUser = {
      id: created.user.id,
      email: created.user.email,
      name: created.user.name,
      role: created.user.role as User['role'],
      permissions: this.getPermissionsForRole(created.user.role),
      brokerId: created.brokerId,
      department,
      password: created.user.password,
      createdAt: created.user.createdAt,
      updatedAt: created.user.updatedAt,
    };

    const tokens = this.buildTokens(user);
    await this.persistRefreshToken(user.id, tokens.refreshToken);
    const { password, ...userWithoutPassword } = user;

    return {
      user: userWithoutPassword,
      tokens,
    };
  }

  async login(data: LoginInput): Promise<{ user: User; tokens: AuthTokens }> {
    const normalizedEmail = data.email.trim().toLowerCase();

    try {
      const found = await prisma.user.findUnique({ where: { email: normalizedEmail } });

      if (!found) {
        logWarn('Authentication failed', {
          email: normalizedEmail,
          reason: 'user_not_found',
        });
        throw new Error('Invalid credentials');
      }

      const isPasswordValid = await verifyPassword(data.password, found.password);
      if (!isPasswordValid) {
        logWarn('Authentication failed', {
          email: normalizedEmail,
          reason: 'invalid_password',
        });
        throw new Error('Invalid credentials');
      }

      this.assertRoleCanAuthenticate(found.role, found.email);

      await this.assertBrokerAccountActive(found.email, found.role);

      const brokerId = await this.ensureBrokerProfileForUser({
        userId: found.id,
        email: found.email,
        name: found.name,
        role: found.role,
      });
      const department = await this.getBrokerDepartmentByEmail(found.email);

      const user: StoredUser = {
        id: found.id,
        email: found.email,
        name: found.name,
        role: found.role as User['role'],
        permissions: this.getPermissionsForRole(found.role),
        brokerId,
        department,
        password: found.password,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      };

      const tokens = this.buildTokens(user);
      await this.persistRefreshToken(user.id, tokens.refreshToken);
      const { password, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        tokens,
      };
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        logError('Authentication failed because the database is unavailable', error, {
          email: normalizedEmail,
        });
        throw new Error('Database connection failed. Check backend DATABASE_URL and network access, then try again.');
      }

      throw error;
    }
  }

  async refresh(input: RefreshTokenInput): Promise<AuthTokens> {
    const refreshToken = input.refreshToken?.trim();
    if (!refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      const payload = verifyRefreshToken(refreshToken) as any;
      const found = await prisma.user.findUnique({ where: { id: payload.userId } });

      if (!found) {
        throw new Error('User not found');
      }

      this.assertRoleCanAuthenticate(found.role, found.email);

      try {
        await this.assertBrokerAccountActive(found.email, found.role);
      } catch {
        await deleteRefreshTokenHash(found.id);
        throw new Error('Account no longer has access');
      }

      const isTokenKnown = await this.verifyRefreshTokenForUser(payload.userId, refreshToken);
      if (!isTokenKnown) {
        throw new Error('Refresh token has been revoked');
      }

      const brokerId = await this.ensureBrokerProfileForUser({
        userId: found.id,
        email: found.email,
        name: found.name,
        role: found.role,
      });
      const department = await this.getBrokerDepartmentByEmail(found.email);

      const user: StoredUser = {
        id: found.id,
        email: found.email,
        name: found.name,
        role: found.role as User['role'],
        permissions: this.getPermissionsForRole(found.role),
        brokerId,
        department,
        password: found.password,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      };

      const nextTokens = this.buildTokens(user);
      await this.persistRefreshToken(user.id, nextTokens.refreshToken);
      return nextTokens;
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        throw new Error('Database connection failed. Check backend DATABASE_URL and network access, then try again.');
      }
      throw new Error('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await deleteRefreshTokenHash(userId);
  }

  async getCurrentUser(userId: string): Promise<User> {
    const found = await prisma.user.findUnique({ where: { id: userId } });
    if (!found) {
      throw new Error('User not found');
    }

    this.assertRoleCanAuthenticate(found.role, found.email);

    await this.assertBrokerAccountActive(found.email, found.role);

    const brokerId = await this.ensureBrokerProfileForUser({
      userId: found.id,
      email: found.email,
      name: found.name,
      role: found.role,
    });
    const department = await this.getBrokerDepartmentByEmail(found.email);

    const user: User = {
      id: found.id,
      email: found.email,
      name: found.name,
      role: found.role as User['role'],
      permissions: this.getPermissionsForRole(found.role),
      brokerId,
      department,
      createdAt: found.createdAt,
      updatedAt: found.updatedAt,
    };

    return user;
  }

  private normalizeRole(role: string): User['role'] {
    if (role === 'agent') return 'broker';
    if (role === 'admin' || role === 'manager' || role === 'broker' || role === 'viewer') {
      return role;
    }
    return 'viewer';
  }

  private getPermissionsForRole(role: string): string[] {
    const permissions: Record<string, string[]> = {
      admin: [
        'manage_users',
        'manage_brokers',
        'manage_leads',
        'manage_deals',
        'manage_properties',
        'view_analytics',
        'manage_settings',
      ],
      manager: [
        'manage_brokers',
        'manage_properties',
        'manage_deals',
        'view_leads',
        'edit_leads',
        'view_deals',
        'edit_deals',
        'view_analytics',
        'manage_contacts',
      ],
      broker: ['view_leads', 'edit_own_leads', 'view_deals', 'edit_own_deals', 'manage_contacts'],
      viewer: ['view_leads', 'view_deals', 'view_contacts'],
    };

    return permissions[this.normalizeRole(role)] || permissions.viewer;
  }

  private async ensureBrokerProfileForUser(params: {
    userId: string;
    email: string;
    name: string;
    role: string;
    tx?: any;
    department?: string | null;
  }): Promise<string | null> {
    if (this.normalizeRole(params.role) !== 'broker') {
      return null;
    }

    const db = params.tx || prisma;
    const email = params.email.trim().toLowerCase();
    const existing = await db.broker.findUnique({
      where: { email },
      select: { id: true, department: true, company: true },
    });
    if (existing) {
      return existing.id;
    }

    const fallbackDepartment = normalizeBrokerDepartment(params.department) || 'sales';
    const created = await db.broker.create({
      data: {
        name: params.name || email.split('@')[0],
        email,
        phone: DEFAULT_BROKER_PHONE,
        company: fallbackDepartment,
        department: fallbackDepartment,
        billingTarget: 0,
        status: 'active',
      },
    });

    return created.id;
  }

  private buildTokens(user: TokenUser): AuthTokens {
    const payload = {
      userId: user.id,
      email: user.email,
      role: this.normalizeRole(user.role),
      permissions: user.permissions || [],
      brokerId: user.brokerId || null,
      department: user.department || null,
    };

    return {
      accessToken: generateAccessToken(payload),
      refreshToken: generateRefreshToken(payload),
    };
  }

  private async persistRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const hashedToken = await hashPassword(refreshToken);
    await saveRefreshTokenHash(userId, hashedToken);
  }

  private async verifyRefreshTokenForUser(userId: string, refreshToken: string): Promise<boolean> {
    const hashedToken = await getRefreshTokenHash(userId);
    if (!hashedToken) {
      return false;
    }

    return verifyPassword(refreshToken, hashedToken);
  }

  private async assertBrokerAccountActive(email: string, role: string): Promise<void> {
    if (this.normalizeRole(role) !== 'broker') {
      return;
    }

    const brokerProfile = await prisma.broker.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { status: true },
    });

    if (brokerProfile?.status === 'archived') {
      throw new Error('Broker account has been removed. Contact an administrator.');
    }
  }

  private assertRoleCanAuthenticate(role: string, email: string): void {
    if (isAuthenticatableRole(role)) {
      return;
    }

    logWarn('Authentication rejected for unsupported role', {
      email: email.trim().toLowerCase(),
      role,
    });
    throw new Error('Account role is not allowed to sign in');
  }

  private async getBrokerDepartmentByEmail(email: string): Promise<BrokerDepartment | null> {
    const broker = await prisma.broker.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { department: true, company: true },
    });

    if (!broker) return null;
    const department = broker.department || broker.company || null;
    return normalizeBrokerDepartment(department);
  }
}

export const authService = new AuthService();
