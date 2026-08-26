import dotenv from "dotenv";
dotenv.config();
import nodemailer from "nodemailer";

const user = process.env.SMTP_USER;
const rawPass = process.env.SMTP_PASS;
const pass = rawPass!.replace(/\s/g, "");

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: { user, pass },
});

transporter.sendMail({
    from: `"InferPrompt" <${user}>`,
    to: "test.someone.else@example.com",
    subject: "Test email to external",
    html: "<p>Hello</p>",
}).then(info => {
    console.log("Sent successfully!");
    console.log("Envelope:", info.envelope);
    console.log("MessageId:", info.messageId);
}).catch(err => {
    console.error("FAIL", err);
});
