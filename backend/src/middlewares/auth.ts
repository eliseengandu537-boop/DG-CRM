import { NextFunction, Response } from 'express';
import { verifyToken } from '@/helpers';
import { AuthRequest, JwtPayload } from '@/types';
import { prisma } from '@/lib/prisma';
import { isDatabaseConnectionError } from '@/lib/databaseErrors';
import { normalizeBrokerDepartment } from '@/lib/departmentAccess';
import { isAuthenticatableRole } from '@/lib/authRoles';
import { logError, logWarn } from '@/lib/logger';

function getBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  if (!authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7).trim();
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const token = getBearerToken(req.headers.authorization as string | undefined);

    if (!token) {
      logWarn('Authentication failed', {
        path: req.originalUrl,
        reason: 'missing_bearer_token',
      });
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date(),
      });
    }

    const decoded = verifyToken(token) as JwtPayload;

    try {
      const found = await prisma.user.findUnique({ where: { id: decoded.userId } });
      if (!found) {
        logWarn('Authentication failed', {
          path: req.originalUrl,
          userId: decoded.userId,
          reason: 'user_not_found',
        });
        return res.status(401).json({
          success: false,
          message: 'User no longer exists',
          timestamp: new Date(),
        });
      }

      if (!isAuthenticatableRole(found.role)) {
        logWarn('Authentication rejected for unsupported role', {
          path: req.originalUrl,
          userId: found.id,
          role: found.role,
        });
        return res.status(403).json({
          success: false,
          message: 'Account role is not allowed to sign in',
          timestamp: new Date(),
        });
      }

      let brokerId: string | null = decoded.brokerId || null;
      let department = normalizeBrokerDepartment(decoded.department);
      if (found.role === 'broker' || found.role === 'manager') {
        const brokerProfile = await prisma.broker.findUnique({
          where: { email: found.email.toLowerCase() },
          select: {
            id: true,
            department: true,
            company: true,
          },
        });
        brokerId = brokerProfile?.id || brokerId;
        department =
          normalizeBrokerDepartment(brokerProfile?.department) ||
          normalizeBrokerDepartment(brokerProfile?.company) ||
          department;
      }

      req.token = token;
      req.userId = found.id;
      req.user = {
        id: found.id,
        email: found.email,
        name: found.name,
        role: found.role as any,
        permissions: decoded.permissions || [],
        brokerId,
        department,
        createdAt: found.createdAt,
        updatedAt: found.updatedAt,
      };

      return next();
    } catch (error) {
      if (isDatabaseConnectionError(error)) {
        logError('Authentication failed because the database is unavailable', error, {
          path: req.originalUrl,
        });
        return res.status(503).json({
          success: false,
          message: 'Database connection failed. Check backend DATABASE_URL and network access, then try again.',
          timestamp: new Date(),
        });
      }

      logError('Authentication check failed', error, {
        path: req.originalUrl,
      });
      return res.status(500).json({
        success: false,
        message: 'Authentication check failed',
        timestamp: new Date(),
      });
    }
  } catch (error) {
    logWarn('Authentication failed', {
      path: req.originalUrl,
      reason: 'invalid_or_expired_token',
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      timestamp: new Date(),
    });
  }
}
