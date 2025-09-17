// src/services/email.service.js
const nodemailer = require('nodemailer');
require('dotenv').config();

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  MAIL_BCC_ADMIN,
} = process.env;

function mask(s = '') {
  if (!s) return '';
  return s.length <= 4 ? '****' : s.slice(0, 2) + '****' + s.slice(-2);
}

function buildTransportConfig() {
  // If explicit host is provided, use it
  if (SMTP_HOST) {
    return {
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }

  // Auto-detect common providers by email domain if host not provided
  const user = (SMTP_USER || '').toLowerCase();
  if (user.endsWith('@gmail.com')) {
    return {
      service: 'gmail',
      auth: { user: SMTP_USER, pass: SMTP_PASS }, // requires App Password
    };
  }
  if (user.endsWith('@outlook.com') || user.endsWith('@hotmail.com') || user.endsWith('@live.com')) {
    return {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }
  if (user.endsWith('@yahoo.com') || user.endsWith('@yahoo.co.uk')) {
    return {
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }

  // If we get here, we don’t know the host
  return null;
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  // Validate required fields
  const missing = [];
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  if (missing.length) {
    console.warn('[EMAIL] Missing env:', missing.join(', '));
    return null;
  }

  const cfg = buildTransportConfig();
  if (!cfg) {
    console.warn('[EMAIL] SMTP not configured and provider not auto-detected. Set SMTP_HOST/SMTP_PORT or use a known email (Gmail/Outlook/Yahoo).');
    return null;
  }

  transporter = nodemailer.createTransport(cfg);
  return transporter;
}

async function sendEmail({ to, subject, html, text, attachments } = {}) {
  const tx = getTransporter();
  if (!tx) {
    console.warn('[EMAIL] Disabled.'); 
    return { ok: false, disabled: true };
  }

  const mailOptions = {
    from: MAIL_FROM || SMTP_USER,
    to,
    subject,
    html,
    text,
    bcc: MAIL_BCC_ADMIN || undefined,
    attachments,                     // ⬅️ NEW
  };

  try {
    const info = await tx.sendMail(mailOptions);
    console.log('[EMAIL SENT]', subject, '→', to, info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EMAIL FAILED]', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail };

