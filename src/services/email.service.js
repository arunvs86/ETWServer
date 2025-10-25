// // src/services/email.service.js
// const nodemailer = require('nodemailer');
// require('dotenv').config();

// const {
//   SMTP_HOST,
//   SMTP_PORT,
//   SMTP_USER,
//   SMTP_PASS,
//   MAIL_FROM,
//   MAIL_BCC_ADMIN,
// } = process.env;

// function mask(s = '') {
//   if (!s) return '';
//   return s.length <= 4 ? '****' : s.slice(0, 2) + '****' + s.slice(-2);
// }

// function buildTransportConfig() {
//   // If explicit host is provided, use it
//   if (SMTP_HOST) {
//     return {
//       host: SMTP_HOST,
//       port: Number(SMTP_PORT || 587),
//       secure: Number(SMTP_PORT) === 465,
//       auth: { user: SMTP_USER, pass: SMTP_PASS },
//     };
//   }

//   // Auto-detect common providers by email domain if host not provided
//   const user = (SMTP_USER || '').toLowerCase();
//   if (user.endsWith('@gmail.com')) {
//     return {
//       service: 'gmail',
//       auth: { user: SMTP_USER, pass: SMTP_PASS }, // requires App Password
//     };
//   }
//   if (user.endsWith('@outlook.com') || user.endsWith('@hotmail.com') || user.endsWith('@live.com')) {
//     return {
//       host: 'smtp.office365.com',
//       port: 587,
//       secure: false,
//       auth: { user: SMTP_USER, pass: SMTP_PASS },
//     };
//   }
//   if (user.endsWith('@yahoo.com') || user.endsWith('@yahoo.co.uk')) {
//     return {
//       host: 'smtp.mail.yahoo.com',
//       port: 465,
//       secure: true,
//       auth: { user: SMTP_USER, pass: SMTP_PASS },
//     };
//   }

//   // If we get here, we don’t know the host
//   return null;
// }

// let transporter = null;

// function getTransporter() {
//   if (transporter) return transporter;

//   // Validate required fields
//   const missing = [];
//   if (!SMTP_USER) missing.push('SMTP_USER');
//   if (!SMTP_PASS) missing.push('SMTP_PASS');
//   if (missing.length) {
//     console.warn('[EMAIL] Missing env:', missing.join(', '));
//     return null;
//   }

//   const cfg = buildTransportConfig();
//   if (!cfg) {
//     console.warn('[EMAIL] SMTP not configured and provider not auto-detected. Set SMTP_HOST/SMTP_PORT or use a known email (Gmail/Outlook/Yahoo).');
//     return null;
//   }

//   transporter = nodemailer.createTransport(cfg);
//   return transporter;
// }

// async function sendEmail({ to, subject, html, text, attachments } = {}) {
//   const tx = getTransporter();
//   if (!tx) {
//     console.warn('[EMAIL] Disabled.'); 
//     return { ok: false, disabled: true };
//   }

//   const mailOptions = {
//     from: MAIL_FROM || SMTP_USER,
//     to,
//     subject,
//     html,
//     text,
//     bcc: MAIL_BCC_ADMIN || undefined,
//     attachments,                     // ⬅️ NEW
//   };

//   try {
//     const info = await tx.sendMail(mailOptions);
//     console.log('[EMAIL SENT]', subject, '→', to, info.messageId);
//     return { ok: true, messageId: info.messageId };
//   } catch (err) {
//     console.error('[EMAIL FAILED]', err.message);
//     return { ok: false, error: err.message };
//   }
// }

// module.exports = { sendEmail };


// src/services/email.service.js
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
require('dotenv').config();

const {
  NODE_ENV,
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  MAIL_FROM,
  MAIL_BCC_ADMIN,
  RESEND_API_KEY,
  MAIL_PROVIDER,
} = process.env;

function mask(s = '') {
  if (!s) return '';
  return s.length <= 4 ? '****' : s.slice(0, 2) + '****' + s.slice(-2);
}

/* ---------------------------------
   Local SMTP fallback (for dev)
----------------------------------*/
function buildTransportConfig() {
  if (SMTP_HOST) {
    return {
      host: SMTP_HOST,
      port: Number(SMTP_PORT || 587),
      secure: Number(SMTP_PORT) === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }

  const user = (SMTP_USER || '').toLowerCase();

  if (user.endsWith('@gmail.com')) {
    return { service: 'gmail', auth: { user: SMTP_USER, pass: SMTP_PASS } };
  }

  if (user.match(/@(outlook|hotmail|live)\.com$/)) {
    return {
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }

  if (user.match(/@yahoo(\.co\.uk|\.com)$/)) {
    return {
      host: 'smtp.mail.yahoo.com',
      port: 465,
      secure: true,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    };
  }

  return null;
}

let smtpTransporter = null;
function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const missing = [];
  if (!SMTP_USER) missing.push('SMTP_USER');
  if (!SMTP_PASS) missing.push('SMTP_PASS');
  if (missing.length) {
    console.warn('[EMAIL][SMTP] Missing env:', missing.join(', '));
    return null;
  }

  const cfg = buildTransportConfig();
  if (!cfg) {
    console.warn('[EMAIL][SMTP] No SMTP config found');
    return null;
  }

  console.log('[EMAIL][SMTP CFG]', {
    host: cfg.host || cfg.service,
    port: cfg.port,
    secure: cfg.secure,
    user: mask(SMTP_USER),
  });

  smtpTransporter = nodemailer.createTransport(cfg);
  return smtpTransporter;
}

/* ---------------------------------
   RESEND sender (for production)
----------------------------------*/
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

async function sendWithResend({ to, subject, html, text, attachments }) {
  if (!resend) {
    console.error('[EMAIL][RESEND] Missing RESEND_API_KEY');
    return { ok: false, error: 'RESEND_API_KEY not set' };
  }

  try {
    const { data, error } = await resend.emails.send({
      from: MAIL_FROM,
      to,
      bcc: MAIL_BCC_ADMIN || undefined,
      subject,
      html,
      text,
      attachments: attachments?.map((a) => ({
        filename: a.filename,
        content: a.content, // Buffer or string
      })),
    });

    if (error) {
      console.error('[EMAIL FAILED][RESEND]', error);
      return { ok: false, error: error.message };
    }

    console.log('[EMAIL SENT][RESEND]', subject, '→', to, data?.id);
    return { ok: true, messageId: data?.id };
  } catch (err) {
    console.error('[EMAIL FAILED][RESEND]', err);
    return { ok: false, error: err.message };
  }
}

/* ---------------------------------
   PUBLIC FUNCTION
----------------------------------*/
async function sendEmail({ to, subject, html, text, attachments } = {}) {
  // Automatically use Resend on Render/production
  const useResend = MAIL_PROVIDER === 'resend' || NODE_ENV === 'production';

  if (useResend) {
    return await sendWithResend({ to, subject, html, text, attachments });
  }

  // Fallback to SMTP (local dev)
  const tx = getSmtpTransporter();
  if (!tx) {
    console.warn('[EMAIL][SMTP] Disabled.');
    return { ok: false, disabled: true };
  }

  const mailOptions = {
    from: MAIL_FROM || SMTP_USER,
    to,
    subject,
    html,
    text,
    bcc: MAIL_BCC_ADMIN || undefined,
    attachments,
  };

  try {
    const info = await tx.sendMail(mailOptions);
    console.log('[EMAIL SENT][SMTP]', subject, '→', to, info.messageId);
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    console.error('[EMAIL FAILED][SMTP]', err.message);
    return { ok: false, error: err.message };
  }
}

module.exports = { sendEmail };
