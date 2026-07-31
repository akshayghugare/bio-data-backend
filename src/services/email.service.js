const nodemailer = require('nodemailer');
const env = require('../config/env');

let transporter = null;

/**
 * SMTP transport.
 * When MAIL_ENABLED=false a JSON transport is used instead, so local
 * development exercises the whole flow without sending real mail.
 */
function getTransporter() {
  if (transporter) return transporter;

  if (!env.mail.enabled) {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure, // true for 465, false for 587 (STARTTLS)
    auth: { user: env.mail.user, pass: env.mail.pass },
    pool: true,
    maxConnections: 3,
  });

  return transporter;
}

/** Verified once at boot so a bad SMTP config is reported immediately. */
async function verifyConnection() {
  if (!env.mail.enabled) return { ok: true, mode: 'console' };
  try {
    await getTransporter().verify();
    return { ok: true, mode: 'smtp' };
  } catch (error) {
    return { ok: false, mode: 'smtp', error: error.message };
  }
}

function layout(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 20px -6px rgba(190,24,93,.15)">
      <div style="background:#db2777;padding:28px 24px;text-align:center;color:#fff">
        <h1 style="margin:0;font-size:20px;font-weight:700">FindJodi</h1>
      </div>
      <div style="padding:32px 24px;font-size:15px;line-height:1.7">
        <h2 style="margin:0 0 12px;font-size:18px;color:#111827">${title}</h2>
        ${bodyHtml}
      </div>
      <div style="padding:20px 24px;background:#f9fafb;text-align:center;font-size:12px;color:#9ca3af">
        <p style="margin:0">&copy; ${new Date().getFullYear()} FindJodi. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
}

/** Sends a message. Failures are reported to the caller, never thrown blindly. */
async function send({ to, subject, html }) {
  try {
    const info = await getTransporter().sendMail({
      from: `"${env.mail.fromName}" <${env.mail.fromAddress}>`,
      to,
      subject,
      html,
      text: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Email send failed:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Verification email. The link points at the frontend, which posts the token
 * back to /api/auth/verify-email.
 */
async function sendVerificationEmail({ to, name, token }) {
  const link = `${env.clientUrl}/verify-email?token=${token}`;

  // Without SMTP configured the link goes to the console so the flow is testable.
  if (!env.mail.enabled) {
    console.log('\n─── EMAIL VERIFICATION (MAIL_ENABLED=false) ───');
    console.log(`  To     : ${to}`);
    console.log(`  Link   : ${link}`);
    console.log('───────────────────────────────────────────────\n');
  }

  return send({
    to,
    subject: 'Verify your email — FindJodi',
    html: layout(
      `Welcome, ${name}!`,
      `<p>Thanks for registering. Please confirm your email address to activate your account — you will not be able to sign in until you do.</p>
       <div style="text-align:center;margin:28px 0">
         <a href="${link}" style="display:inline-block;padding:13px 30px;background:#db2777;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Verify my email</a>
       </div>
       <p style="color:#6b7280;font-size:13px">This link is valid for ${env.mail.tokenExpiryHours} hours and can be used once.</p>
       <p style="color:#6b7280;font-size:13px">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all;color:#db2777">${link}</span></p>
       <hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">
       <p style="color:#9ca3af;font-size:12px">If you did not create this account, you can safely ignore this email.</p>`
    ),
  });
}

/** Sent once the address is confirmed, nudging the user into the next step. */
async function sendWelcomeEmail({ to, name }) {
  return send({
    to,
    subject: 'Your email is verified — FindJodi',
    html: layout(
      `You're all set, ${name}!`,
      `<p>Your email address has been verified. You can now sign in and complete your profile.</p>
       <div style="text-align:center;margin:28px 0">
         <a href="${env.clientUrl}/login" style="display:inline-block;padding:13px 30px;background:#db2777;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">Sign in</a>
       </div>
       <p style="color:#6b7280;font-size:13px">A complete profile with clear details receives far more interest from other members.</p>`
    ),
  });
}

/**
 * "Someone liked your profile."
 * `senderId` makes the button open that member's full biodata directly.
 */
async function sendInterestEmail({ to, name, senderName, senderId }) {
  const link = `${env.clientUrl}/biodatas/${senderId}`;

  if (!env.mail.enabled) {
    console.log('\n─── INTEREST NOTIFICATION (MAIL_ENABLED=false) ───');
    console.log(`  To     : ${to}`);
    console.log(`  From   : ${senderName}`);
    console.log(`  Link   : ${link}`);
    console.log('──────────────────────────────────────────────────\n');
  }

  return send({
    to,
    subject: `${senderName} liked your profile — FindJodi`,
    html: layout(
      `Good news, ${name}!`,
      `<p><strong>${senderName}</strong> liked your profile and would like to know you better.</p>
       <p>You can view their full biodata and accept or decline the interest from your account.</p>
       <div style="text-align:center;margin:28px 0">
         <a href="${link}" style="display:inline-block;padding:13px 30px;background:#db2777;color:#fff;text-decoration:none;border-radius:999px;font-weight:600">View full profile</a>
       </div>
       <p style="color:#6b7280;font-size:13px">You can also see every interest you have received under <a href="${env.clientUrl}/interests" style="color:#db2777">Interests</a>.</p>`
    ),
  });
}

module.exports = { sendVerificationEmail, sendWelcomeEmail, sendInterestEmail, verifyConnection };
