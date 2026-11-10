const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn('EMAIL_USER or EMAIL_PASS is not configured in environment variables.');
    return false;
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 9000,
    greetingTimeout: 9000,
    socketTimeout: 9000,
  });

  await transporter.sendMail({
    from: `"GENERAL HOSPITAL" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });

  return true;
};

module.exports = sendEmail;