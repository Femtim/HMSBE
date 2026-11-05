const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html, fallbackUrl }) => {
  // Always log the action URL to the server console so you never get stuck
  if (fallbackUrl) {
    console.log(`🔗 [ACTION LINK for ${to}]: ${fallbackUrl}`);
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('⚠️ EMAIL_USER or EMAIL_PASS missing in .env. Skipping SMTP send.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 5000, // Fail fast in 5s instead of hanging Render
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });

  await transporter.sendMail({
    from: `"HAQMS Portal" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  return true;
};

module.exports = sendEmail;