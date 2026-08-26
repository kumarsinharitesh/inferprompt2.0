import express from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import RiskAnalysis from "../models/RiskAnalysis";
import { executeRiskAnalysis } from "../services/riskDecisionOrchestrator";

const router = express.Router();

// POST endpoints triggering atomic SSE orchestration directly bypassing frontend logic!
router.post("/analyze", authMiddleware as any, executeRiskAnalysis as any);

router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const history = await RiskAnalysis.find({ userId: req.user?.userId })
            .sort({ createdAt: -1 })
            .limit(50);

        const mappedHistory = history.map(h => {
            const obj = h.toObject();
            return {
                ...obj,
                transaction: obj.transactionSnapshot,
                reasoningComparisons: obj.abtd,
            };
        });
        res.json(mappedHistory);
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve risk history" });
    }
});

router.post("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { analysisId, transaction, platformRisk, modelResults, consensus, reasoningComparisons } = req.body;

        const risk = new RiskAnalysis({
            userId: req.user?.userId,
            analysisId: analysisId || `dip-${Date.now()}`,
            transactionSnapshot: transaction,
            platformRisk,
            modelResults,
            consensus,
            abtd: reasoningComparisons
        });

        await risk.save();
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Failed to store risk history" });
    }
});

export default router;
