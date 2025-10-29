// services/sendTutorRequestEmails.js
const { sendEmail } = require('../services/email.service'); // adjust path to wherever you send mails
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@educatetheworld.co.uk';

function formatStudentEmail({ student, request }) {
  const studentName = student?.name || 'there';

  const lines = [
    `Hi ${studentName},`,
    '',
    `We've received your tutor request for "${request.subject}".`,
    `Our team will review your request and aim to contact you within 72 hours.`,
    '',
    `Details you submitted:`,
    `- Subject / help needed: ${request.subject || '(not provided)'}`,
    `- Level / exam: ${request.level || '(not provided)'}`,
    `- Availability: ${request.availabilityPref || '(not provided)'}`,
    `- Urgency: ${request.urgency || '(not provided)'}`,
    '',
    `You don't need to do anything else right now.`,
    '',
    `Thank you,`,
    `EducateTheWorld team`,
  ];

  const text = lines.join('\n');

  const html = `
    <p>Hi ${studentName},</p>
    <p>We've received your tutor request for "<b>${request.subject || ''}</b>".</p>
    <p>Our team will review your request and aim to contact you within <b>72 hours</b>.</p>
    <p><b>Details you submitted:</b><br/>
      • Subject / help needed: ${request.subject || '(not provided)'}<br/>
      • Level / exam: ${request.level || '(not provided)'}<br/>
      • Availability: ${request.availabilityPref || '(not provided)'}<br/>
      • Urgency: ${request.urgency || '(not provided)'}<br/>
    </p>
    <p>You don't need to do anything else right now.</p>
    <p>Thank you,<br/>EducateTheWorld team</p>
  `;

  return { text, html };
}

function formatAdminEmail({ student, request }) {
  const studentName = student?.name || '(no name)';
  const studentEmail = student?.email || '(no email)';

  const lines = [
    `New PAID tutor request.`,
    '',
    `Student: ${studentName} <${studentEmail}>`,
    `Subject: ${request.subject || '(not provided)'}`,
    `Level: ${request.level || '(not provided)'}`,
    `Availability: ${request.availabilityPref || '(not provided)'}`,
    `Urgency: ${request.urgency || '(not provided)'}`,
    `Notes: ${request.notes || '(none)'}`,
    '',
    `Status: ${request.status}`,
    `Request ID: ${request._id}`,
    `Created: ${request.createdAt}`,
  ];

  const text = lines.join('\n');

  const html = `
    <p><b>New PAID tutor request.</b></p>
    <p>
      <b>Student:</b> ${studentName} &lt;${studentEmail}&gt;<br/>
      <b>Subject:</b> ${request.subject || '(not provided)'}<br/>
      <b>Level:</b> ${request.level || '(not provided)'}<br/>
      <b>Availability:</b> ${request.availabilityPref || '(not provided)'}<br/>
      <b>Urgency:</b> ${request.urgency || '(not provided)'}<br/>
      <b>Notes:</b> ${request.notes || '(none)'}<br/>
    </p>
    <p>
      <b>Status:</b> ${request.status}<br/>
      <b>Request ID:</b> ${request._id}<br/>
      <b>Created:</b> ${request.createdAt}<br/>
    </p>
  `;

  return { text, html };
}

async function sendTutorRequestEmails({ student, request }) {
  // email student
  if (student?.email) {
    const { text, html } = formatStudentEmail({ student, request });
    try {
      await sendEmail({
        to: student.email,
        subject: 'We received your tutor request',
        text,
        html,
      });
    } catch (err) {
        console.error('[tutorRequestEmails] student email failed:', err.message);
    }
  }

  // email admin
  if (ADMIN_EMAIL) {
    const { text, html } = formatAdminEmail({ student, request });
    try {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: 'New PAID tutor request',
        text,
        html,
      });
    } catch (err) {
      console.error('[tutorRequestEmails] admin email failed:', err.message);
    }
  }
}

module.exports = { sendTutorRequestEmails };
