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

  async sendLoginOtpEmail(params: {
    to: string;
    name?: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<void> {
    const { to, name, code, expiresInMinutes } = params;
    const subject = 'Your DG Property verification code';
    const text = [
      `Hello ${name || 'there'},`,
      '',
      'Use this one-time verification code to finish signing in:',
      code,
      '',
      `This code expires in ${expiresInMinutes} minutes. If you did not try to sign in, you can ignore this email and your account will remain secure.`,
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hello ${name || 'there'},</p>
        <p>Use this one-time verification code to finish signing in:</p>
        <p style="font-size: 30px; letter-spacing: 8px; font-weight: 700; margin: 16px 0; color: #4f46e5;">${code}</p>
        <p>This code expires in ${expiresInMinutes} minutes.</p>
        <p style="color: #6b7280; font-size: 13px;">If you did not try to sign in, you can ignore this email and your account will remain secure.</p>
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({ to, subject, text, html });
  }

  isSmtpConfigured(): boolean {
    return this.isConfigured();
  }

  async sendTestEmail(to: string): Promise<void> {
    await this.sendMail({
      to,
      subject: 'DG Property SMTP Test',
      text: 'SMTP is configured correctly and this is a test message.',
      html: '<p>SMTP is configured correctly and this is a test message.</p>',
    });
  }

  // Notifies a brochure's owner broker that another broker sent their brochure to a client.
  async sendBrochureSentNotification(params: {
    ownerEmail: string;
    ownerName?: string;
    brochureName: string;
    actingBrokerName: string;
    clientEmail?: string;
  }): Promise<void> {
    const { ownerEmail, ownerName, brochureName, actingBrokerName, clientEmail } = params;
    const subject = `Your brochure "${brochureName}" was sent to a client`;
    const text = [
      `Hello ${ownerName || 'there'},`,
      '',
      `Your brochure "${brochureName}" was sent to a client by ${actingBrokerName}.`,
      ...(clientEmail ? ['', `Sent to: ${clientEmail}`] : []),
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hello ${ownerName || 'there'},</p>
        <p>Your brochure <strong>"${brochureName}"</strong> was sent to a client by <strong>${actingBrokerName}</strong>.</p>
        ${clientEmail ? `<p><strong>Sent to:</strong> ${clientEmail}</p>` : ''}
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({ to: ownerEmail, subject, text, html });
  }

  // Notifies the admin that a new legal document was created and needs review.
  async sendLegalDocCreatedToAdmin(params: {
    adminEmail: string;
    documentName: string;
    documentType: string;
    createdBy: string;
    description?: string;
    fileName?: string;
    status?: string;
    createdDate?: string;
  }): Promise<void> {
    const {
      adminEmail,
      documentName,
      documentType,
      createdBy,
      description,
      fileName,
      status,
      createdDate,
    } = params;
    const subject = `Legal document "${documentName}" (${documentType}) needs review`;
    const text = [
      `A legal document "${documentName}" (${documentType}) was created by ${createdBy} and needs review.`,
      '',
      'Document Details:',
      `Name: ${documentName}`,
      `Type: ${documentType}`,
      `Created By: ${createdBy}`,
      ...(createdDate ? [`Created Date: ${createdDate}`] : []),
      ...(status ? [`Status: ${status}`] : []),
      ...(fileName ? [`File: ${fileName}`] : []),
      ...(description ? ['', `Description: ${description}`] : []),
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>A legal document <strong>"${documentName}"</strong> (${documentType}) was created by <strong>${createdBy}</strong> and needs review.</p>
        <p style="margin: 8px 0 0;"><strong>Name:</strong> ${documentName}</p>
        <p style="margin: 4px 0 0;"><strong>Type:</strong> ${documentType}</p>
        <p style="margin: 4px 0 0;"><strong>Created By:</strong> ${createdBy}</p>
        ${createdDate ? `<p style="margin: 4px 0 0;"><strong>Created Date:</strong> ${createdDate}</p>` : ''}
        ${status ? `<p style="margin: 4px 0 0;"><strong>Status:</strong> ${status}</p>` : ''}
        ${fileName ? `<p style="margin: 4px 0 0;"><strong>File:</strong> ${fileName}</p>` : ''}
        ${description ? `<p style="margin: 8px 0 0;"><strong>Description:</strong> ${description}</p>` : ''}
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({ to: adminEmail, subject, text, html });
  }

  // Notifies the document creator that the admin completed/approved their legal document.
  async sendLegalDocCompletedToBroker(params: {
    recipientEmail: string;
    recipientName?: string;
    documentName: string;
    documentType?: string;
    status: string;
  }): Promise<void> {
    const { recipientEmail, recipientName, documentName, documentType, status } = params;
    const subject = `Your legal document "${documentName}" has been ${status.toLowerCase()}`;
    const text = [
      `Hello ${recipientName || 'there'},`,
      '',
      `Admin has marked your legal document "${documentName}"${
        documentType ? ` (${documentType})` : ''
      } as ${status}.`,
      '',
      'DG Property CRM',
    ].join('\n');

    const html = `
      <div style="font-family: Arial, sans-serif; color: #111827;">
        <p>Hello ${recipientName || 'there'},</p>
        <p>Admin has marked your legal document <strong>"${documentName}"</strong>${
          documentType ? ` (${documentType})` : ''
        } as <strong>${status}</strong>.</p>
        <p>DG Property CRM</p>
      </div>
    `;

    await this.sendMail({ to: recipientEmail, subject, text, html });
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
