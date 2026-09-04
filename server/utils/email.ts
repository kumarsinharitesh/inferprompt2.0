import nodemailer from "nodemailer";

// SMTP is the single delivery path. EMAIL_USER/EMAIL_PASS remain supported
// so an existing local or Render SMTP configuration keeps working unchanged.
const fromAddress = () => process.env.EMAIL_FROM || process.env.SMTP_FROM || process.env.SMTP_USER || process.env.EMAIL_USER;

function getSmtpTransporter() {
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  if (!user || !rawPass) {
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED: set SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASS.");
  }

  const port = Number(process.env.SMTP_PORT || "587");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED: SMTP_PORT is invalid.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: { user, pass: rawPass.replace(/\s/g, "") },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

function emailHtml(title: string, copy: string, otp: string, footer: string) {
  return `
    <div style="font-family:Arial,sans-serif;background:#0b1220;color:#e2e8f0;padding:32px;border-radius:16px;max-width:480px;margin:auto">
      <div style="font-size:25px;font-weight:800;color:#60a5fa;margin-bottom:24px">InferPrompt</div>
      <h1 style="font-size:20px;color:#f8fafc;margin:0 0 10px">${title}</h1>
      <p style="color:#a8b7cf;font-size:14px;line-height:1.5">${copy}</p>
      <div style="background:#101b30;border:1px solid #29466f;border-radius:12px;padding:22px;text-align:center;margin:24px 0">
        <span style="font-size:36px;font-weight:800;letter-spacing:12px;color:#93c5fd;font-family:monospace">${otp}</span>
      </div>
      <p style="color:#71829e;font-size:12px;line-height:1.5">${footer}</p>
    </div>`;
}

async function deliver(to: string, subject: string, html: string) {
  const from = fromAddress();
  if (!from) throw new Error("EMAIL_DELIVERY_NOT_CONFIGURED: set EMAIL_FROM or SMTP_USER.");

  const transporter = getSmtpTransporter();
  await transporter.sendMail({ from: `InferPrompt <${from}>`, to, subject, html });
}

export async function sendOTPEmail(to: string, otp: string, name: string) {
  await deliver(
    to,
    `${otp} - Your InferPrompt verification code`,
    emailHtml(`Verify your email, ${name}`, "Use this one-time code to complete your registration. It expires in 10 minutes.", otp, "If you did not request an account, you can safely ignore this email.")
  );
}

export async function sendResetPasswordEmail(to: string, otp: string, name: string) {
  await deliver(
    to,
    `${otp} - Reset your InferPrompt password`,
    emailHtml(`Reset your password, ${name}`, "Use this one-time code to reset your password. It expires in 10 minutes.", otp, "If you did not request this reset, you can safely ignore this email. Your password will remain unchanged.")
  );
}
