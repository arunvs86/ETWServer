const { sendEmail } = require('./src/services/email.service');

(async () => {
  await sendEmail({
    to: 'arunvs7475@gmail.com',
    subject: 'Test Email from EducateTheWorld',
    html: '<h2>Hello!</h2><p>This is a test email.</p>',
  });
})();
