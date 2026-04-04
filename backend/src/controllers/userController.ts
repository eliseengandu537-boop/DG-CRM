import { Request, Response } from 'express';
import { prisma } from '@/lib/prisma';
import { generatePin, generateRandomString, hashPassword } from '@/helpers';
import { emailService } from '@/services/emailService';
import { getAuthenticatableRoles } from '@/lib/authRoles';

class UserController {
  async createManager(req: Request, res: Response) {
    try {
      const { email, name, password } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required', timestamp: new Date() });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const managerName = String(name || '').trim() || normalizedEmail.split('@')[0];
      const rawPassword = String(password ?? '').trim();
      if (rawPassword && rawPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters', timestamp: new Date() });
      }

      const managerPassword = rawPassword || generateRandomString(10);

      const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Email already registered', timestamp: new Date() });
      }

      const existingBroker = await prisma.broker.findUnique({ where: { email: normalizedEmail } });
      if (existingBroker) {
        return res.status(400).json({
          success: false,
          message: 'Email already belongs to a broker profile. Use a different email for manager.',
          timestamp: new Date(),
        });
      }

      const hashed = await hashPassword(managerPassword);
      const user = await prisma.user.create({
        data: { email: normalizedEmail, name: managerName, password: hashed, role: 'manager' },
      });

      let passwordSent = false;
      let passwordError: string | undefined;
      try {
        await emailService.sendManagerPasswordEmail({
          managerEmail: normalizedEmail,
          managerName,
          password: managerPassword,
        });
        passwordSent = true;
      } catch (error: any) {
        passwordError = error?.message || 'Failed to send password email';
      }

      return res.status(201).json({
        success: true,
        message: passwordSent
          ? 'Manager created and password email sent'
          : 'Manager created, but password email could not be sent',
        data: { id: user.id, email: user.email, name: user.name, role: user.role },
        meta: {
          passwordSent,
          passwordError,
          // Always return the password when email failed so admin can share it manually
          temporaryPassword: passwordSent ? undefined : managerPassword,
        },
        timestamp: new Date(),
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message, timestamp: new Date() });
    }
  }

  async listUsers(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
      const sanitized = users.map(u => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, updatedAt: u.updatedAt }));
      return res.json({ success: true, data: sanitized, timestamp: new Date() });
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message, timestamp: new Date() });
    }
  }

  async updateUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { name, role } = req.body;
      const allowedRoles = getAuthenticatableRoles();
      const updateData: any = {};
      if (name) updateData.name = name;
      if (role && allowedRoles.includes(role)) updateData.role = role;

      const updated = await prisma.user.update({ where: { id }, data: updateData });
      return res.json({ success: true, data: { id: updated.id, email: updated.email, name: updated.name, role: updated.role }, timestamp: new Date() });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message, timestamp: new Date() });
    }
  }

  async deleteUser(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      await prisma.user.delete({ where: { id } });
      return res.json({ success: true, message: 'User deleted', timestamp: new Date() });
    } catch (err: any) {
      return res.status(400).json({ success: false, message: err.message, timestamp: new Date() });
    }
  }

  async exportUsers(req: Request, res: Response) {
    try {
      const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });

      // simple CSV export (Excel can open CSV files)
      const header = ['id', 'email', 'name', 'role', 'createdAt', 'updatedAt'];
      const rows = users.map(u => [u.id, u.email, u.name || '', u.role, u.createdAt.toISOString(), u.updatedAt.toISOString()].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      const csv = [header.join(','), ...rows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
      return res.send(csv);
    } catch (err: any) {
      return res.status(500).json({ success: false, message: err.message, timestamp: new Date() });
    }
  }
}

export const userController = new UserController();
