// src/services/notifyPurchase.js
const { sendEmail } = require('./email.service');
const { createLiveIcsAttachment } = require('./ics.helper');

const {
  FRONTEND_URL = 'http://localhost:5173',
  MAIL_FROM,
} = process.env;

function formatMoney(minor, currency = 'GBP', locale = 'en-GB') {
  const amount = (Number(minor || 0) / 100);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function fmtDate(dateLike, tz = 'Europe/London', locale = 'en-GB') {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  try {
    // e.g., "Wed, 17 Sep 2025, 19:30"
    const day = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: tz }).format(d);
    const date = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: tz }).format(d);
    const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(d);
    return `${day}, ${date}, ${time}`;
  } catch {
    return d.toISOString();
  }
}

function userDisplayName(user) {
  if (!user) return 'there';
  if (user.name && String(user.name).trim()) return user.name.trim();
  if (user.email) return String(user.email).split('@')[0];
  return 'there';
}

function wrapHtml(title, bodyHtml) {
  const support = (MAIL_FROM || '').replace(/.*<([^>]+)>.*/, '$1') || '';
  return `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#111">
    <h2 style="margin:0 0 12px 0">${title}</h2>
    ${bodyHtml}
    <hr style="margin:20px 0;border:none;border-top:1px solid #eee"/>
    <p style="font-size:12px;color:#666">
      If you have any questions, just reply to this email${support ? ` or contact <a href="mailto:${support}">${support}</a>` : ''}.
    </p>
  </div>
  `;
}

function createTutoringIcsAttachment({ session, title = '1-to-1 Tutoring Session', description = '', location = '' }) {
  try {
    const dt = (d) => new Date(d).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const uid = `tutoring-${session._id}@yourapp`;
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//YourApp//Tutoring//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dt(new Date())}`,
      `DTSTART:${dt(session.startAt)}`,
      `DTEND:${dt(session.endAt)}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${(description || 'Tutoring session').replace(/\n/g, '\\n')}`,
      location ? `LOCATION:${location}` : '',
      'END:VEVENT',
      'END:VCALENDAR'
    ].filter(Boolean).join('\r\n');

    return {
      filename: 'tutoring.ics',
      content: ics,
      contentType: 'text/calendar; charset=utf-8',
    };
  } catch {
    return undefined;
  }
}

async function sendTutoringEmails({ student, tutor, session, meetingLink, tutorProfile }) {
  const toStudent = student?.email;
  const toTutor   = tutor?.email;

  const whenTz = tutorProfile?.timezone || 'Europe/London';
  const whenLabel = fmtDate(session.startAt, whenTz);

  const summaryStudent = `Tutoring with ${userDisplayName(tutor)}`;
  const summaryTutor   = `Tutoring with ${userDisplayName(student)}`;
  const description    = `Join link: ${meetingLink}`;

  const icsStudent = createTutoringIcsAttachment({
    session, title: summaryStudent, description, location: meetingLink
  });
  const icsTutor = createTutoringIcsAttachment({
    session, title: summaryTutor, description, location: meetingLink
  });

  if (toStudent) {
    const subject = 'Your tutoring session is confirmed';
    const title = 'Tutoring confirmed ✅';
    const body = `
      <p>Hi ${userDisplayName(student)},</p>
      <p>Your session is booked with <b>${userDisplayName(tutor)}</b>.</p>
      <ul>
        <li>When: <b>${whenLabel}</b> (${whenTz})</li>
        <li>Join: <a href="${meetingLink}" target="_blank">${meetingLink}</a></li>
        <li>Tutor email: <b>${tutor?.email || '—'}</b></li>
        ${tutorProfile?.meetingNote ? `<li>Note from tutor: ${tutorProfile.meetingNote}</li>` : ''}
      </ul>
    `;
    await sendEmail({
      to: toStudent,
      subject,
      html: wrapHtml(title, body),
      attachments: icsStudent ? [icsStudent] : undefined,
    });
  }

  if (toTutor) {
    const subject = 'A tutoring session has been booked';
    const title = 'New session booked 📅';
    const body = `
      <p>Hi ${userDisplayName(tutor)},</p>
      <p>You have a session booked by <b>${userDisplayName(student)}</b>.</p>
      <ul>
        <li>When: <b>${whenLabel}</b> (${whenTz})</li>
        <li>Join: <a href="${meetingLink}" target="_blank">${meetingLink}</a></li>
        <li>Student email: <b>${student?.email || '—'}</b></li>
      </ul>
      ${tutorProfile?.meetingNote ? `<p>Your meeting note on profile:</p><blockquote>${tutorProfile.meetingNote}</blockquote>` : ''}
    `;
    await sendEmail({
      to: toTutor,
      subject,
      html: wrapHtml(title, body),
      attachments: icsTutor ? [icsTutor] : undefined,
    });
  }
}

/** ---------------- Membership ---------------- */
async function sendMembershipEmail({ user, planId, periodStart, periodEnd, amountMinor, currency = 'GBP' }) {
  const to = user?.email;
  if (!to) return { ok: false, error: 'missing_user_email' };

  const subject = 'Your membership is active';
  const title = 'Membership confirmed 🎉';
  const body = `
    <p>Hi ${userDisplayName(user)},</p>
    <p>Your <b>${planId === 'lifetime' ? 'Lifetime' : '1-Year'}</b> membership is now active.</p>
    <ul>
      ${amountMinor != null ? `<li>Paid: <b>${formatMoney(amountMinor, currency)}</b></li>` : ''}
      ${periodStart ? `<li>Starts: <b>${fmtDate(periodStart)}</b></li>` : ''}
      ${periodEnd ? `<li>Valid until: <b>${fmtDate(periodEnd)}</b></li>` : ''}
    </ul>
    <p>You can browse all member content here:</p>
    <p><a href="${FRONTEND_URL}/" target="_blank">${FRONTEND_URL}</a></p>
  `;
  return sendEmail({ to, subject, html: wrapHtml(title, body) });
}

/** ---------------- Live Session ---------------- */
async function sendLiveEmail({ user, live, joinUrl }) {
  const to = user?.email;
  if (!to) return { ok: false, error: 'missing_user_email' };

  const subject = `Your ticket: ${live?.title || 'Live Session'}`;
  const title = 'Live session ticket 🎫';
  const body = `
    <p>Hi ${userDisplayName(user)},</p>
    <p>You’re booked for:</p>
    <ul>
      <li>Title: <b>${live?.title || 'Live Session'}</b></li>
      ${live?.startAt ? `<li>Starts: <b>${fmtDate(live.startAt, live?.timezone || 'Europe/London')}</b></li>` : ''}
      ${live?.endAt ? `<li>Ends: <b>${fmtDate(live.endAt, live?.timezone || 'Europe/London')}</b></li>` : ''}
      ${live?.timezone ? `<li>Timezone: <b>${live.timezone}</b></li>` : ''}
    </ul>
    <p>When it’s time, join using this link:</p>
    <p><a href="${joinUrl}" target="_blank">${joinUrl}</a></p>
    <p>You can view the session page here:</p>
    <p><a href="${FRONTEND_URL}/live/${live?._id || ''}" target="_blank">${FRONTEND_URL}/live/${live?._id || ''}</a></p>
  `;

  const ics = createLiveIcsAttachment({ live, joinUrl });
  const attachments = ics ? [ics] : undefined;

  return sendEmail({
    to,
    subject,
    html: wrapHtml(title, body),
    attachments,              
  });
}

/** ---------------- Quiz ---------------- */
async function sendQuizEmail({ user, quiz, amountMinor, currency = 'GBP' }) {
  const to = user?.email;
  if (!to) return { ok: false, error: 'missing_user_email' };

  const subject = `Quiz unlocked: ${quiz?.title || 'Quiz'}`;
  const title = 'Quiz purchase confirmed ✅';
  const url = `${FRONTEND_URL}/quizzes/${quiz?.slug || quiz?._id || ''}`;
  const body = `
    <p>Hi ${userDisplayName(user)},</p>
    <p>Your quiz is now unlocked:</p>
    <ul>
      <li>Title: <b>${quiz?.title || 'Quiz'}</b></li>
      ${amountMinor != null ? `<li>Paid: <b>${formatMoney(amountMinor, currency)}</b></li>` : ''}
    </ul>
    <p>Start here:</p>
    <p><a href="${url}" target="_blank">${url}</a></p>
  `;
  return sendEmail({ to, subject, html: wrapHtml(title, body) });
}

/** ---------------- Resource ---------------- */
async function sendResourceEmail({ user, resource, amountMinor, currency = 'GBP' }) {
  const to = user?.email;
  if (!to) return { ok: false, error: 'missing_user_email' };

  const subject = `Resource unlocked: ${resource?.title || 'Resource'}`;
  const title = 'Resource purchase confirmed 📦';
  const url = `${FRONTEND_URL}/resources/${resource?.slug || resource?._id || ''}`;
  const body = `
    <p>Hi ${userDisplayName(user)},</p>
    <p>Your resource is now available:</p>
    <ul>
      <li>Title: <b>${resource?.title || 'Resource'}</b></li>
      ${amountMinor != null ? `<li>Paid: <b>${formatMoney(amountMinor, currency)}</b></li>` : ''}
    </ul>
    <p>Open it here:</p>
    <p><a href="${url}" target="_blank">${url}</a></p>
  `;
  return sendEmail({ to, subject, html: wrapHtml(title, body) });
}

module.exports = {
  sendMembershipEmail,
  sendLiveEmail,
  sendQuizEmail,
  sendResourceEmail,
  // helpers (exported in case you want them elsewhere)
  sendTutoringEmails,
  formatMoney,
  fmtDate,
};
