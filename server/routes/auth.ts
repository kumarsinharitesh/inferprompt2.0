import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import CreditBalance from "../models/CreditBalance";
import CreditLedger from "../models/CreditLedger";
import OTP from "../models/OTP";
import { sendOTPEmail, sendResetPasswordEmail } from "../utils/email";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = express.Router();

function generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

const getSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("CRITICAL: JWT_SECRET missing!");
    return secret;
};

// ---------------------------------------------------------------------------
// POST /api/auth/send-otp
// Step 1 of registration: validate input, send OTP email
// ---------------------------------------------------------------------------
router.post("/send-otp", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password || password.length < 8) {
            return res.status(400).json({ error: "Name, valid email, and password (min 8 chars) are required." });
        }

        // Check if already registered
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        // Generate OTP and store (replace any previous OTP for this email)
        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await OTP.findOneAndDelete({ email: email.toLowerCase() }); // Remove stale OTP
        await OTP.create({ email: email.toLowerCase(), code, expiresAt });

        // Send email
        await sendOTPEmail(email, code, name);

        console.log(`[OTP] Sent to ${email}`);
        return res.json({ message: "OTP sent successfully. Please check your email." });
    } catch (err: any) {
        console.error("send-otp error:", err);
        // Surface email config errors clearly
        if (err.message?.includes("SMTP_USER") || err.message?.includes("SMTP_PASS") || err.message?.includes("Invalid login") || err.code === "EAUTH" || err.code === "ECONNECTION") {
            return res.status(503).json({ error: "Email service is not configured on the server. Please contact support." });
        }
        return res.status(500).json({ error: "Failed to send OTP. Please try again." });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp
// Step 2 of registration: verify OTP, create the user account
// ---------------------------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
    try {
        const { name, email, password, code } = req.body;

        if (!email || !code || !name || !password) {
            return res.status(400).json({ error: "All fields are required." });
        }

        const otpRecord = await OTP.findOne({ email: email.toLowerCase() });

        if (!otpRecord) {
            return res.status(400).json({ error: "OTP expired or not found. Please request a new one." });
        }

        if (otpRecord.code !== code.trim()) {
            return res.status(400).json({ error: "Incorrect OTP. Please try again." });
        }

        if (new Date() > otpRecord.expiresAt) {
            await OTP.findOneAndDelete({ email: email.toLowerCase() });
            return res.status(400).json({ error: "OTP has expired. Please request a new one." });
        }

        // OTP valid — create user
        const passwordHash = await bcrypt.hash(password, 10);
        const user = new User({ name, email: email.toLowerCase(), passwordHash });
        await user.save();

        // Initialize free credits (5 on signup — buy more after)
        await CreditBalance.create({ userId: user._id, balance: 5 });

        // Clean up OTP
        await OTP.findOneAndDelete({ email: email.toLowerCase() });

        console.log(`[Auth] New user registered: ${email}`);
        return res.status(201).json({ message: "Account created successfully! You can now log in." });
    } catch (err: any) {
        console.error("verify-otp error:", err);
        if (err.code === 11000) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }
        return res.status(500).json({ error: "Registration failed. Please try again." });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password
// Step 1: Check email, generate OTP, send reset email
// ---------------------------------------------------------------------------
router.post("/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: "Email is required." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // To prevent email enumeration, usually we return success anyway,
            // but for smaller apps returning an error is better UX.
            return res.status(404).json({ error: "No account found with this email." });
        }

        const code = generateOTP();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        await OTP.findOneAndDelete({ email: email.toLowerCase() });
        await OTP.create({ email: email.toLowerCase(), code, expiresAt });

        await sendResetPasswordEmail(email, code, user.name);

        console.log(`[Auth] Password reset OTP sent to ${email}`);
        return res.json({ message: "Password reset OTP sent successfully." });

    } catch (err: any) {
        console.error("forgot-password error:", err);
        if (err.message?.includes("SMTP_USER") || err.message?.includes("SMTP_PASS") || err.message?.includes("Invalid login") || err.code === "EAUTH" || err.code === "ECONNECTION") {
            return res.status(503).json({ error: "Email service is not configured on the server. Please contact support." });
        }
        return res.status(500).json({ error: "Failed to send reset email. Please try again." });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// Step 2: Validate OTP and update password
// ---------------------------------------------------------------------------
router.post("/reset-password", async (req, res) => {
    try {
        const { email, code, newPassword } = req.body;
        if (!email || !code || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: "Email, OTP, and a new password (min 8 chars) are required." });
        }

        const otpRecord = await OTP.findOne({ email: email.toLowerCase() });
        if (!otpRecord) {
            return res.status(400).json({ error: "OTP expired or not found. Please request a new one." });
        }

        if (otpRecord.code !== code.trim()) {
            return res.status(400).json({ error: "Incorrect OTP. Please try again." });
        }

        if (new Date() > otpRecord.expiresAt) {
            await OTP.findOneAndDelete({ email: email.toLowerCase() });
            return res.status(400).json({ error: "OTP has expired. Please request a new one." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        user.passwordHash = passwordHash;
        await user.save();

        await OTP.findOneAndDelete({ email: email.toLowerCase() });

        console.log(`[Auth] Password reset successful for ${email}`);
        return res.json({ message: "Password has been reset successfully. You can now log in." });

    } catch (err) {
        console.error("reset-password error:", err);
        return res.status(500).json({ error: "Failed to reset password. Please try again." });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email and password are required." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
            return res.status(401).json({ error: "Invalid email or password." });
        }

        const token = jwt.sign(
            { userId: user._id.toString() },
            getSecret(),
            { expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any }
        );

        res.cookie("token", token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        const balance = await CreditBalance.findOne({ userId: user._id });

        return res.json({
            user: { id: user._id, name: user.name, email: user.email },
            credits: balance?.balance || 0,
        });
    } catch (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
router.post("/logout", (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
    });
    res.json({ message: "Logout successful" });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
router.get("/me", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const user = await User.findById(req.user?.userId);
        if (!user) return res.status(401).json({ error: "User not found" });

        const balance = await CreditBalance.findOne({ userId: user._id });
        return res.json({
            user: { id: user._id, name: user.name, email: user.email },
            credits: balance?.balance || 0,
            totalPurchased: balance?.totalPurchased || 0,
            totalUsed: balance?.totalUsed || 0
        });
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/consume  (atomic credit deduction)
// ---------------------------------------------------------------------------
router.post("/consume", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { totalTokens } = req.body;
        // token-based deduction: minimum 1 credit, then 1 per 2500 tokens
        const tokensToCharge = totalTokens && totalTokens > 0 ? totalTokens : 2500;
        const creditsToDeduct = Math.max(1, Math.ceil(tokensToCharge / 2500));

        const result = await CreditBalance.findOneAndUpdate(
            { userId: req.user?.userId, balance: { $gte: creditsToDeduct } },
            { $inc: { balance: -creditsToDeduct, totalUsed: creditsToDeduct } },
            { new: true }
        );

        if (!result) {
            return res.status(400).json({ error: "Insufficient credits" });
        }

        // Log the exact dynamic token deduction onto the new native ledger 
        await CreditLedger.create({
            userId: req.user?.userId,
            type: "USAGE",
            amount: -creditsToDeduct,
            description: "Risk Analysis AI Usage",
            metadata: { totalTokens: tokensToCharge }
        });

        return res.json({ credits: result.balance, totalUsed: result.totalUsed });
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// ---------------------------------------------------------------------------
// GET /api/auth/ledger (Fetch Usage Transactions)
// ---------------------------------------------------------------------------
router.get("/ledger", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const ledger = await CreditLedger.find({ userId: req.user?.userId }).sort({ createdAt: -1 }).limit(100);
        return res.json(ledger);
    } catch (err) {
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
