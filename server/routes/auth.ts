import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User";
import CreditBalance from "../models/CreditBalance";
import CreditLedger from "../models/CreditLedger";
import { sendSupabaseEmailOtp, SupabaseOtpError, verifySupabaseEmailOtp } from "../utils/supabaseOtp";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = express.Router();

const normalizeEmail = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function otpFailure(res: express.Response, err: any) {
    const message = String(err?.message || "");
    if (message.includes("SUPABASE_OTP_NOT_CONFIGURED")) {
        return res.status(503).json({
            error: "Email OTP is not configured on the server. Set SUPABASE_URL and SUPABASE_ANON_KEY."
        });
    }
    if (err instanceof SupabaseOtpError && err.status === 429) {
        return res.status(429).json({ error: "Please wait a minute before requesting another verification code." });
    }
    return res.status(502).json({
        error: "We could not deliver the verification code. Please try again shortly."
    });
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
        const { name, password } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!name || !isEmail(email) || !password || password.length < 8) {
            return res.status(400).json({ error: "Name, valid email, and password (min 8 chars) are required." });
        }

        // Check if already registered
        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: "An account with this email already exists." });
        }

        // Supabase Auth delivers and verifies the OTP. MongoDB remains the
        // application database and does not store authentication codes.
        await sendSupabaseEmailOtp(email, name, true);

        console.log(`[OTP] Sent to ${email}`);
        return res.json({ message: "OTP sent successfully. Please check your email." });
    } catch (err: any) {
        console.error("send-otp error:", err);
        return otpFailure(res, err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp
// Step 2 of registration: verify OTP, create the user account
// ---------------------------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
    try {
        const { name, password, code } = req.body;
        const email = normalizeEmail(req.body.email);

        if (!email || !code || !name || !password) {
            return res.status(400).json({ error: "All fields are required." });
        }

        try {
            await verifySupabaseEmailOtp(email, code.trim());
        } catch (err: any) {
            if (String(err?.message || "").includes("SUPABASE_OTP_NOT_CONFIGURED")) return otpFailure(res, err);
            return res.status(400).json({ error: "Incorrect or expired OTP. Please request a new one." });
        }

        // OTP valid — create user
        const passwordHash = await bcrypt.hash(password, 10);
        const user = new User({ name, email: email.toLowerCase(), passwordHash });
        await user.save();

        // Initialize free credits (5 on signup — buy more after)
        await CreditBalance.create({ userId: user._id, balance: 5 });

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
        const email = normalizeEmail(req.body.email);
        if (!isEmail(email)) {
            return res.status(400).json({ error: "Enter a valid email address." });
        }

        const user = await User.findOne({ email });
        if (!user) {
            // To prevent email enumeration, usually we return success anyway,
            // but for smaller apps returning an error is better UX.
            return res.status(404).json({ error: "No account found with this email." });
        }

        // Existing InferPrompt users may predate Supabase Auth. Creating the
        // matching Auth identity here lets them use the same OTP reset flow
        // without migrating any MongoDB application data.
        await sendSupabaseEmailOtp(email, undefined, true);

        console.log(`[Auth] Password reset OTP sent to ${email}`);
        return res.json({ message: "Password reset OTP sent successfully." });

    } catch (err: any) {
        console.error("forgot-password error:", err);
        return otpFailure(res, err);
    }
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// Step 2: Validate OTP and update password
// ---------------------------------------------------------------------------
router.post("/reset-password", async (req, res) => {
    try {
        const { code, newPassword } = req.body;
        const email = normalizeEmail(req.body.email);
        if (!email || !code || !newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: "Email, OTP, and a new password (min 8 chars) are required." });
        }

        try {
            await verifySupabaseEmailOtp(email, code.trim());
        } catch (err: any) {
            if (String(err?.message || "").includes("SUPABASE_OTP_NOT_CONFIGURED")) return otpFailure(res, err);
            return res.status(400).json({ error: "Incorrect or expired OTP. Please request a new one." });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: "User not found." });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);
        user.passwordHash = passwordHash;
        await user.save();

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
router.get("/me", async (req: AuthRequest, res) => {
    try {
        const token = req.cookies?.token;
        if (!token) return res.json({ user: null, credits: 0, totalPurchased: 0, totalUsed: 0 });

        const payload = jwt.verify(token, getSecret()) as { userId: string };
        const user = await User.findById(payload.userId);
        if (!user) {
            res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
            return res.json({ user: null, credits: 0, totalPurchased: 0, totalUsed: 0 });
        }

        const balance = await CreditBalance.findOne({ userId: user._id });
        return res.json({
            user: { id: user._id, name: user.name, email: user.email },
            credits: balance?.balance || 0,
            totalPurchased: balance?.totalPurchased || 0,
            totalUsed: balance?.totalUsed || 0
        });
    } catch (err) {
        // The session probe is called during normal app startup. An expired
        // cookie is a guest session, not a client-visible server failure.
        res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" });
        return res.json({ user: null, credits: 0, totalPurchased: 0, totalUsed: 0 });
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
