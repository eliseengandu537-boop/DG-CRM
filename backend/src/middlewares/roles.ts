import { NextFunction, Response } from 'express';
import { AuthRequest, User } from '@/types';

type Role = User['role'];

export function requireRoles(...allowedRoles: Role[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden',
        timestamp: new Date(),
      });
    }

    return next();
  };
}

// Enforces broker-level ownership on list/detail/update routes.
// For broker users, it injects brokerId in query and validates param ownership when present.
export function scopeBrokerData(brokerField: string = 'brokerId') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        timestamp: new Date(),
      });
    }

    if (user.role === 'admin' || user.role === 'manager') {
      return next();
    }

    const effectiveBrokerId = user.brokerId || user.id;
    req.query = { ...req.query, [brokerField]: effectiveBrokerId };

    const brokerIdParam = (req.params as Record<string, string | undefined>)[brokerField];
    if (brokerIdParam && brokerIdParam !== effectiveBrokerId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: cross-broker access denied',
        timestamp: new Date(),
      });
    }

    return next();
  };
}
