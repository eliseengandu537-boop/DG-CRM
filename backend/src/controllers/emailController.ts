import { Request, Response } from 'express';
import { emailService } from '@/services/emailService';
import { config } from '@/config';

export class EmailController {
  async health(req: Request, res: Response) {
    try {
      await emailService.verifyConnection();
      res.json({
        success: true,
        message: 'SMTP connection is healthy',
        data: {
          host: config.SMTP_HOST,
          port: config.SMTP_PORT,
          secure: config.SMTP_SECURE,
          requireTLS: config.SMTP_REQUIRE_TLS,
          from: config.SMTP_FROM,
        },
        timestamp: new Date(),
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error?.message || 'SMTP health check failed',
        timestamp: new Date(),
      });
    }
  }

  async test(req: Request, res: Response) {
    try {
      const to = String(req.body?.to || '').trim() || String(config.SMTP_USER || '').trim();
      if (!to) {
        return res.status(400).json({
          success: false,
          message: 'Recipient email is required. Provide body.to or set SMTP_USER.',
          timestamp: new Date(),
        });
      }

      await emailService.sendTestEmail(to);

      return res.json({
        success: true,
        message: 'SMTP test email sent successfully',
        data: { to },
        timestamp: new Date(),
      });
    } catch (error: any) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'Failed to send test email',
        timestamp: new Date(),
      });
    }
  }
}

export const emailController = new EmailController();
