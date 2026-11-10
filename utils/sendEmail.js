


const nodemailer = require('nodemailer');

const sendEmail = async ({ to, subject, html }) => {
  const fromName = 'HAQMS Clinical Portal';

  // 1. RESEND HTTP API (https://resend.com) — Port 443
  if (process.env.RESEND_API_KEY) {
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [to],
        subject,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || `Resend API Error (${response.status})`);
    }
    return true;
  }

  // 2. BREVO HTTP API (https://brevo.com) — Port 443
  // Note: Brevo allows sending to ANY recipient email address on the free tier
  // after verifying a single sender Gmail address (no custom domain required).
  if (process.env.BREVO_API_KEY) {
    const senderEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': process.env.BREVO_API_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { name: fromName, email: senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent: html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Brevo API Error (${response.status})`);
    }
    return true;
  }

  // 3. SENDGRID HTTP API (https://sendgrid.com) — Port 443
  if (process.env.SENDGRID_API_KEY) {
    const fromEmail = process.env.EMAIL_FROM || process.env.EMAIL_USER;

    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API Error (${response.status}): ${errorText}`);
    }
    return true;
  }

  // 4. LOCAL DEVELOPMENT FALLBACK: Nodemailer SMTP
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 5000,
    });

    await transporter.sendMail({
      from: `"${fromName}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  }

  console.warn('No email provider configured (RESEND_API_KEY, BREVO_API_KEY, SENDGRID_API_KEY, or EMAIL_USER).');
  return false;
};

module.exports = sendEmail;

// const nodemailer = require('nodemailer');

// const sendEmail = async ({ to, subject, html }) => {
//   if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
//     console.warn('EMAIL_USER or EMAIL_PASS is not configured in environment variables.');
//     return false;
//   }

//   const transporter = nodemailer.createTransport({
//     host: 'smtp.gmail.com',
//     port: 587,
//     secure: false,
//     auth: {
//       user: process.env.EMAIL_USER,
//       pass: process.env.EMAIL_PASS,
//     },
//     connectionTimeout: 9000,
//     greetingTimeout: 9000,
//     socketTimeout: 9000,
//   });

//   await transporter.sendMail({
//     from: `"GENERAL HOSPITAL" <${process.env.EMAIL_USER}>`,
//     to,
//     subject,
//     html,
//   });

//   return true;
// };

// module.exports = sendEmail;