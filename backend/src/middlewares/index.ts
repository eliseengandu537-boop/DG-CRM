import { Request, Response, NextFunction } from 'express';
import { requireAuth } from './auth';
import { requireRoles, scopeBrokerData } from './roles';
import { logError } from '@/lib/logger';

// Backward-compatible exports for existing routes during migration
export const authMiddleware = requireAuth;
export const adminMiddleware = requireRoles('admin');

export { requireAuth, requireRoles, scopeBrokerData };

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = Number(err?.statusCode) || Number(err?.status) || 500;
  const message = statusCode >= 500 ? 'Internal server error' : err?.message || 'Request failed';
  const errorCode = String(err?.code || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'));

  logError('Unhandled API error', err, {
    method: req.method,
    path: req.originalUrl,
    statusCode,
    errorCode,
  });

  return res.status(statusCode).json({
    success: false,
    message,
    error: {
      code: errorCode,
    },
    timestamp: new Date(),
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date(),
  });
}
