const nodemailer = require('nodemailer');

const createEmailService = (env = process.env) => {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT || 587),
    secure: String(env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    requireTLS: String(env.SMTP_REQUIRE_TLS || 'true').toLowerCase() === 'true',
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  });

  const from = env.SMTP_FROM || env.SMTP_USER;

  return {
    async verifyConnection() {
      await transporter.verify();
    },

    async sendMail({ to, subject, text, html }) {
      await transporter.sendMail({
        from,
        to,
        subject,
        text,
        html,
      });
    },
  };
};

module.exports = { createEmailService };
