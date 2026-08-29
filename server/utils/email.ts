import nodemailer from "nodemailer";

// Accept both naming conventions: SMTP_* (current) and EMAIL_* (legacy, used in Render dashboard)
function getSMTPUser(): string {
  const u = process.env.SMTP_USER || process.env.EMAIL_USER;
  if (!u) {
    console.error("[Email] Missing env var — set SMTP_USER (or EMAIL_USER) in your environment.");
    throw new Error("SMTP_USER and SMTP_PASS must be set in environment.");
  }
  return u;
}

function getTransporter() {
  const user = getSMTPUser();
  const rawPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = parseInt(process.env.SMTP_PORT || "587");

  if (!rawPass) {
    console.error("[Email] Missing env var — set SMTP_PASS (or EMAIL_PASS) in your environment.");
    throw new Error("SMTP_USER and SMTP_PASS must be set in environment.");
  }

  // Gmail App Passwords are shown with spaces for readability but must be sent without them
  const pass = rawPass.replace(/\s/g, "");

  console.log(`[Email] Transporter ready — host: ${host}, port: ${port}, user: ${user}`);

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function sendOTPEmail(to: string, otp: string, name: string) {
  const transporter = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background: #0a0a12; color: #e2e8f0; padding: 40px; border-radius: 16px; max-width: 480px; margin: auto;">
      <div style="text-align: center; margin-bottom: 28px;">
        <span style="font-size: 28px; font-weight: 900; color: #f59e0b; letter-spacing: -0.5px;">InferPrompt</span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #ffffff;">Verify your email, ${name} 👋</h2>
      <p style="color: #94a3b8; margin-bottom: 24px; font-size: 14px;">Use the OTP below to complete your registration. It expires in <strong style="color: #f59e0b;">10 minutes</strong>.</p>
      <div style="background: #12121a; border: 1px solid #1e1e2c; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 42px; font-weight: 900; letter-spacing: 16px; color: #f59e0b; font-family: monospace;">${otp}</span>
      </div>
      <p style="color: #475569; font-size: 12px; text-align: center;">If you did not request this, you can safely ignore this email.</p>
    </div>`;

  await transporter.sendMail({
    from: `"InferPrompt" <${getSMTPUser()}>`,
    to,
    subject: `${otp} — Your InferPrompt verification code`,
    html,
  });
}

export async function sendResetPasswordEmail(to: string, otp: string, name: string) {
  const transporter = getTransporter();

  const html = `
    <div style="font-family: 'Segoe UI', sans-serif; background: #0a0a12; color: #e2e8f0; padding: 40px; border-radius: 16px; max-width: 480px; margin: auto;">
      <div style="text-align: center; margin-bottom: 28px;">
        <span style="font-size: 28px; font-weight: 900; color: #f59e0b; letter-spacing: -0.5px;">InferPrompt</span>
      </div>
      <h2 style="font-size: 20px; font-weight: 700; margin-bottom: 8px; color: #ffffff;">Reset your password, ${name}</h2>
      <p style="color: #94a3b8; margin-bottom: 24px; font-size: 14px;">Use the OTP below to reset your password. It expires in <strong style="color: #f59e0b;">10 minutes</strong>.</p>
      <div style="background: #12121a; border: 1px solid #1e1e2c; border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <span style="font-size: 42px; font-weight: 900; letter-spacing: 16px; color: #f59e0b; font-family: monospace;">${otp}</span>
      </div>
      <p style="color: #475569; font-size: 12px; text-align: center;">If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    </div>`;

  await transporter.sendMail({
    from: `"InferPrompt" <${getSMTPUser()}>`,
    to,
    subject: `Password Reset Request — Code: ${otp}`,
    html,
  });
}
