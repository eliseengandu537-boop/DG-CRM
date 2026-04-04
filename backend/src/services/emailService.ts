import nodemailer, { Transporter } from 'nodemailer';
import { config } from '@/config';

export class EmailService {
  private transporter: Transporter | null = null;
  private readonly connectionTimeoutMs = this.parseTimeout(process.env.SMTP_CONNECTION_TIMEOUT_MS);
  private readonly greetingTimeoutMs = this.parseTimeout(process.env.SMTP_GREETING_TIMEOUT_MS);
  private readonly socketTimeoutMs = this.parseTimeout(process.env.SMTP_SOCKET_TIMEOUT_MS);

  private parseTimeout(value: string | undefined): number | undefined {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    return parsed;
  }

  private isConfigured(): boolean {
    return Boolean(config.SMTP_HOST && config.SMTP_PORT && config.SMTP_USER && config.SMTP_PASS);
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;

    if (!this.isConfigured()) {
      throw new Error('SMTP is not configured. Check SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
    }

    // Port 465 always requires implicit TLS (secure: true).
    // Honour the env var when explicitly set to true; otherwise auto-detect from port.
    const useSecure = config.SMTP_SECURE || config.SMTP_PORT === 465;

    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: useSecure,
      // requireTLS only applies to STARTTLS (port 587); skip it when using implicit TLS.
      requireTLS: useSecure ? false : config.SMTP_REQUIRE_TLS,
      connectionTimeout: this.connectionTimeoutMs,
      greetingTimeout: this.greetingTimeoutMs,
      socketTimeout: this.socketTimeoutMs,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    });

    return this.transporter;
  }

  async verifyConnection(): Promise<void> {
    const transporter = this.getTransporter();
    try {
      await transporter.verify();
    } catch (error: any) {
      throw this.normalizeSmtpError(error);
    }
  }

  async sendMail(params: {
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<void> {
    const transporter = this.getTransporter();

    try {
      await transporter.sendMail({
        from: config.SMTP_FROM,
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
      });
    } catch (error: any) {
      throw this.normalizeSmtpError(error);
    }
  }

  async sendBrokerPasswordEmail(params: {
    brokerEmail: string;
    brokerName: string;
    password: string;
  }): Promise<void> {
    const { brokerEmail, brokerName, password } = params;
    const loginUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/login`;
    const subject = 'Your DG Property Broker Login Details';
    const text = [
      `Hello ${brokerName},`,
      '',
      'Your temporary broker password is:',
      password,
      '',
      `Login at: ${loginUrl}`,
      '',
      'Please change this password after your first login.',
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hello ${brokerName},</p>
        <p>Your temporary broker password is:</p>
        <p style="font-size: 24px; letter-spacing: 2px; font-weight: 700; margin: 16px 0;">${password}</p>
        <p><a href="${loginUrl}" target="_blank" rel="noreferrer">Click here to login</a></p>
        <p>Please change this password after your first login.</p>
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({
      to: brokerEmail,
      subject,
      text,
      html,
    });
  }

  async sendManagerPasswordEmail(params: {
    managerEmail: string;
    managerName: string;
    password: string;
  }): Promise<void> {
    const { managerEmail, managerName, password } = params;
    const loginUrl = `${config.FRONTEND_URL.replace(/\/$/, '')}/login`;
    const subject = 'Your DG Property Manager Login Details';
    const text = [
      `Hello ${managerName},`,
      '',
      'Your manager account has been created.',
      'Use these credentials to login:',
      `Email: ${managerEmail}`,
      `Password: ${password}`,
      '',
      `Login at: ${loginUrl}`,
      '',
      'Please change this password after your first login.',
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hello ${managerName},</p>
        <p>Your manager account has been created.</p>
        <p>Use these credentials to login:</p>
        <p style="margin: 8px 0 0;"><strong>Email:</strong> ${managerEmail}</p>
        <p style="margin: 8px 0;"><strong>Password:</strong></p>
        <p style="font-size: 24px; letter-spacing: 2px; font-weight: 700; margin: 8px 0 16px;">${password}</p>
        <p><a href="${loginUrl}" target="_blank" rel="noreferrer">Click here to login</a></p>
        <p>Please change this password after your first login.</p>
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({
      to: managerEmail,
      subject,
      text,
      html,
    });
  }

  // Backward-compatible wrapper.
  async sendBrokerPinEmail(params: {
    brokerEmail: string;
    brokerName: string;
    pin: string;
  }): Promise<void> {
    return this.sendBrokerPasswordEmail({
      brokerEmail: params.brokerEmail,
      brokerName: params.brokerName,
      password: params.pin,
    });
  }

  async sendTestEmail(to: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'DG Property SMTP Test',
      text: 'SMTP is configured correctly and this is a test message.',
      html: '<p>SMTP is configured correctly and this is a test message.</p>',
    });
  }

  private normalizeSmtpError(error: any): Error {
    const message = String(error?.message || 'Unknown SMTP error');
    const lower = message.toLowerCase();

    if (lower.includes('smtpclientauthentication is disabled')) {
      return new Error(
        'SMTP authentication is disabled for this Microsoft 365 tenant. Enable SMTP AUTH for the mailbox and tenant, then retry.'
      );
    }

    if (lower.includes('authentication unsuccessful') || lower.includes('invalid login')) {
      return new Error('SMTP authentication failed. Verify SMTP_USER, SMTP_PASS, and mailbox SMTP AUTH settings.');
    }

    if (lower.includes('unexpected socket close') || lower.includes('connection refused') || lower.includes('econnrefused')) {
      return new Error(
        `SMTP connection failed (${message}). Check: (1) SMTP_HOST and SMTP_PORT are correct on the server, (2) SMTP_SECURE=true when using port 465, (3) firewall allows outbound port ${config.SMTP_PORT}, (4) Gmail requires an App Password if 2FA is enabled.`
      );
    }

    if (lower.includes('self signed certificate') || lower.includes('certificate has expired')) {
      return new Error('SMTP TLS certificate error. Set SMTP_SECURE=false and SMTP_REQUIRE_TLS=false, or contact your email provider.');
    }

    return new Error(message);
  }
}

export const emailService = new EmailService();
