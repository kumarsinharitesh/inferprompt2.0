import express from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import RiskAnalysis from "../models/RiskAnalysis";
import { executeRiskAnalysis } from "../services/riskDecisionOrchestrator";

const router = express.Router();

// POST endpoints triggering atomic SSE orchestration directly bypassing frontend logic!
router.post("/analyze", authMiddleware as any, executeRiskAnalysis as any);

router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        // The orchestrator creates the authoritative record together with its
        // credit reservation. Older browser-written records had no reservation
        // and duplicated every completed analysis, corrupting analytics.
        const history = await RiskAnalysis.find({
            userId: req.user?.userId,
            creditTransactionId: { $exists: true, $ne: null }
        })
            .sort({ createdAt: -1 })
            .limit(50);

        const mappedHistory = history.map(h => {
            const obj = h.toObject();
            return {
                ...obj,
                transaction: obj.transactionSnapshot,
                reasoningComparisons: obj.reasoningComparisons ?? obj.abtd,
            };
        });
        res.json(mappedHistory);
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve risk history" });
    }
});

export default router;
