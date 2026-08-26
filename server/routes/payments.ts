import express from "express";
import Razorpay from "razorpay";
import { CREDIT_PACKS } from "../../src/config/billing";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import Payment from "../models/Payment";
import CreditBalance from "../models/CreditBalance";
import CreditLedger from "../models/CreditLedger";
import { verifyRazorpaySignature } from "../utils/hmac";

const router = express.Router();

function getRazorpay() {
    if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
        return new Razorpay({
            key_id: process.env.RAZORPAY_KEY_ID,
            key_secret: process.env.RAZORPAY_KEY_SECRET,
        });
    }
    return null;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/payments/create-order
// ---------------------------------------------------------------------------
router.post("/create-order", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { packId } = req.body;
        if (!packId) return res.status(400).json({ error: "packId is required" });

        const pack = CREDIT_PACKS.find(p => p.id === packId);
        if (!pack) return res.status(400).json({ error: "Invalid packId" });

        const rzp = getRazorpay();
        if (!rzp) {
            return res.status(503).json({ error: "Razorpay Test Mode is not configured." });
        }

        // Razorpay works in subunits (e.g. paisa for INR)
        const amountPaisa = pack.amountINR * 100;

        const options: any = {
            amount: amountPaisa,
            currency: "INR",
            receipt: `receipt_${Date.now()}`,
            notes: {
                userId: req.user?.userId || "unknown",
                credits: pack.credits
            }
        };

        const order: any = await rzp.orders.create(options);

        // Safe frontend payload
        return res.json({
            keyId: process.env.RAZORPAY_KEY_ID,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            credits: pack.credits
        });
    } catch (error: any) {
        console.error("Error creating order:", error);
        const errMsg = error?.error?.description || error.message || "Failed to create order";
        return res.status(500).json({ error: errMsg });
    }
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// POST /api/payments/verify
// ---------------------------------------------------------------------------
router.post("/verify", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { orderId, paymentId, signature } = req.body;

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({ verified: false, error: "Missing parameters" });
        }

        if (!process.env.RAZORPAY_KEY_SECRET) {
            return res.status(503).json({ verified: false, error: "Configuration missing." });
        }

        const isValid = verifyRazorpaySignature(orderId, paymentId, signature, process.env.RAZORPAY_KEY_SECRET);
        if (!isValid) {
            return res.status(400).json({ verified: false, error: "Invalid signature" });
        }

        // --- IDEMPOTENCY CHECK ---
        const existingPayment = await Payment.findOne({ razorpayPaymentId: paymentId });
        if (existingPayment) {
            return res.json({ verified: true, message: "Payment already fulfilled" });
        }

        // We need to fetch the credits from the order or frontend notes,
        // SECURITY: Never trust credits from req.body — derive from verified amount against server-side pack config.
        const { amount } = req.body;
        const matchedPack = CREDIT_PACKS.find(p => p.amountINR * 100 === amount);
        const safeCredits = matchedPack?.credits ?? 0;

        const payment = new Payment({
            userId: req.user?.userId,
            razorpayOrderId: orderId,
            razorpayPaymentId: paymentId,
            amount: amount || 0,
            currency: "INR",
            credits: safeCredits,
            status: "SUCCESS"
        });
        await payment.save();

        if (safeCredits > 0) {
            await CreditBalance.findOneAndUpdate(
                { userId: req.user?.userId },
                { $inc: { balance: safeCredits, totalPurchased: safeCredits } },
                { upsert: true, new: true }
            );

            await CreditLedger.create({
                userId: req.user?.userId,
                type: "PURCHASE",
                amount: safeCredits,
                description: `Purchased ${safeCredits} Credits via Razorpay`,
                metadata: { orderId: orderId, paymentId: paymentId }
            });
        }

        return res.json({ verified: true });
    } catch (error) {
        console.error("Error verifying payment:", error);
        return res.status(500).json({ verified: false, error: "Internal verification error" });
    }
});
// ---------------------------------------------------------------------------
// GET /api/payments/history
// ---------------------------------------------------------------------------
router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const payments = await Payment.find({ userId: req.user?.userId }).sort({ createdAt: -1 });
        return res.json(payments);
    } catch (error) {
        console.error("Error fetching payment history:", error);
        return res.status(500).json({ error: "Failed to fetch payments" });
    }
});

export default router;
