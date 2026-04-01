import { CookieOptions, Request, Response } from 'express';
import { AuthRequest } from '@/types';
import { authService } from '@/services/authService';
import { registerSchema, loginSchema, refreshTokenSchema } from '@/validators';
import { config } from '@/config';
import { isDatabaseConnectionError } from '@/lib/databaseErrors';
import { logWarn } from '@/lib/logger';

export class AuthController {
  private readonly refreshCookieName = 'dg_refresh_token';
  private toPublicAuthPayload(result: { user: unknown; tokens: { accessToken: string } }) {
    return {
      user: result.user,
      tokens: {
        accessToken: result.tokens.accessToken,
      },
    };
  }

  private getRefreshCookieOptions(): CookieOptions {
    const maxAgeMs = this.getRefreshTokenMaxAgeMs(config.JWT_REFRESH_EXPIRE);

    return {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth',
      maxAge: maxAgeMs,
    };
  }

  private getRefreshTokenMaxAgeMs(value: string): number {
    const input = String(value || '7d').trim().toLowerCase();
    const match = input.match(/^(\d+)([smhd])$/);
    if (!match) {
      const asNumber = Number(input);
      return Number.isFinite(asNumber) ? asNumber : 7 * 24 * 60 * 60 * 1000;
    }

    const amount = Number(match[1]);
    const unit = match[2];
    const multiplier =
      unit === 's'
        ? 1000
        : unit === 'm'
        ? 60 * 1000
        : unit === 'h'
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;
    return amount * multiplier;
  }

  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(this.refreshCookieName, refreshToken, this.getRefreshCookieOptions());
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.refreshCookieName, {
      ...this.getRefreshCookieOptions(),
      maxAge: undefined,
    });
  }

  private readRefreshCookie(req: Request): string | undefined {
    const header = req.headers.cookie;
    if (!header) return undefined;

    const tokenPair = header
      .split(';')
      .map(item => item.trim())
      .find(item => item.startsWith(`${this.refreshCookieName}=`));
    if (!tokenPair) return undefined;

    const [, value] = tokenPair.split('=');
    return value ? decodeURIComponent(value) : undefined;
  }

  async register(req: Request, res: Response) {
    try {
      const validated = registerSchema.parse(req.body);
      const result = await authService.register(validated);
      this.setRefreshCookie(res, result.tokens.refreshToken);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: this.toPublicAuthPayload(result),
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async login(req: Request, res: Response) {
    try {
      const validated = loginSchema.parse(req.body);
      const result = await authService.login(validated);
      this.setRefreshCookie(res, result.tokens.refreshToken);

      res.json({
        success: true,
        message: 'Login successful',
        data: this.toPublicAuthPayload(result),
        timestamp: new Date(),
      });
    } catch (error: any) {
      const isDatabaseError = isDatabaseConnectionError(error);
      const statusCode = isDatabaseError ? 503 : 401;
      logWarn('Login request failed', {
        email: String(req.body?.email || '').trim().toLowerCase(),
        statusCode,
        reason: error?.message || 'unknown_error',
      });

      res.status(statusCode).json({
        success: false,
        message: isDatabaseError
          ? 'Database connection failed. Check backend DATABASE_URL and network access, then try again.'
          : error.message,
        timestamp: new Date(),
      });
    }
  }

  async refresh(req: Request, res: Response) {
    try {
      const parsed = refreshTokenSchema.safeParse(req.body || {});
      const bodyToken = parsed.success ? parsed.data.refreshToken : undefined;
      const cookieToken = this.readRefreshCookie(req);
      const refreshToken = bodyToken || cookieToken;
      if (!refreshToken) {
        throw new Error('Refresh token is required');
      }

      const tokens = await authService.refresh({ refreshToken });
      this.setRefreshCookie(res, tokens.refreshToken);

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
        },
        timestamp: new Date(),
      });
    } catch (error: any) {
      logWarn('Refresh token request failed', {
        reason: error?.message || 'invalid_refresh_token',
      });
      res.status(401).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async getCurrentUser(req: AuthRequest, res: Response) {
    try {
      if (!req.userId) {
        return res.status(401).json({
          success: false,
          message: 'Not authenticated',
          timestamp: new Date(),
        });
      }

      const user = await authService.getCurrentUser(req.userId);

      return res.json({
        success: true,
        message: 'User retrieved successfully',
        data: user,
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        message: error.message,
        timestamp: new Date(),
      });
    }
  }

  async logout(req: AuthRequest, res: Response) {
    try {
      if (req.userId) {
        await authService.logout(req.userId);
      }
      this.clearRefreshCookie(res);

      return res.json({
        success: true,
        message: 'Logged out successfully',
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to log out',
        timestamp: new Date(),
      });
    }
  }
}

export const authController = new AuthController();
