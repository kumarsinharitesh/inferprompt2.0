import { Response } from "express";
import CreditLedger from "../models/CreditLedger";
import CreditBalance from "../models/CreditBalance";
import RiskAnalysis from "../models/RiskAnalysis";
import { AuthRequest } from "../middleware/auth";
import { buildTransactionEvidence } from "../../src/services/riskEvidence";
import { validateModelFactors } from "../../src/services/riskEvidenceValidator";
import { calculateFinalDecision } from "../../src/services/finalDecisionEngine";
import { calculateConsensus } from "../../src/services/consensusEngine";
import { generateModelPairs } from "../../src/utils/modelPairing";
import { calculateRiskScore } from "../../src/services/riskEngine";
import { buildRiskPrompt } from "../../src/services/riskAnalysisPrompt";
import { createProvider } from "../../src/services/providerFactory";
import { parseModelRiskResult } from "../../src/services/riskResultParser";
import { ModelRiskResult, Provider } from "../../src/types";

// ---------------------------------------------------------------------------
// F4: Atomic refund helper — only transitions PENDING → REFUNDED exactly once.
// Uses a conditional findOneAndUpdate so concurrent callers cannot double-refund.
// Returns true if this call performed the refund.
// ---------------------------------------------------------------------------
async function tryRefundReservation(reservationId: string, reason: string, userId: string): Promise<boolean> {
    const updated = await CreditLedger.findOneAndUpdate(
        { _id: reservationId, status: "PENDING" },   // Guard: skip if already COMPLETED/REFUNDED
        {
            status: "REFUNDED",
            type: "REFUND",
            completedAt: new Date(),
            description: reason
        },
        { new: false }                                // Return old doc — non-null means we updated it
    );
    if (updated !== null) {
        await CreditBalance.findOneAndUpdate(
            { userId },
            { $inc: { balance: 1, totalUsed: -1 } }
        );
        return true;
    }
    return false;
}

export async function executeRiskAnalysis(req: AuthRequest, res: Response) {
    const { transaction, selectedModels, idempotencyKey, customKeys } = req.body;

    // 1. Authenticate & validate
    if (!req.user?.userId) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    if (!transaction || !selectedModels || selectedModels.length === 0 || !idempotencyKey) {
        return res.status(400).json({ error: "Invalid request payload" });
    }

    // Deduplicate by userId + idempotencyKey (also enforced by DB unique index)
    const existingRun = await RiskAnalysis.findOne({ userId: req.user.userId, analysisId: idempotencyKey });
    if (existingRun) {
        return res.status(409).json({ error: "Duplicate idempotencyKey safely rejected." });
    }

    // 2. Build Canonical Evidence
    const canonicalEvidence = buildTransactionEvidence(transaction);
    const platformRisk = calculateRiskScore(transaction);

    // 3. Atomically Reserve Credit — deduct balance securely and create a PENDING ledger entry
    let reservationLock: any = null;
    try {
        const balanceResult = await CreditBalance.findOneAndUpdate(
            { userId: req.user.userId, balance: { $gte: 1 } },
            { $inc: { balance: -1, totalUsed: 1 } },
            { new: true }
        );

        if (!balanceResult) {
            return res.status(402).json({ error: "Insufficient credits" });
        }

        reservationLock = await CreditLedger.create({
            userId: req.user.userId,
            type: "RESERVATION",
            status: "PENDING",
            amount: -1,
            description: "Risk Analysis Execution Reservation",
            idempotencyKey: `rsrv_${idempotencyKey}`,
        });
    } catch (e: any) {
        if (e.code === 11000) {
            // Already generated ledger record (duplicate) — refund the balance we just pre-deducted
            await CreditBalance.findOneAndUpdate(
                { userId: req.user.userId },
                { $inc: { balance: 1, totalUsed: -1 } }
            );
            return res.status(409).json({ error: "Duplicate state execution natively trapped." });
        }
        return res.status(500).json({ error: "State collision during reservation" });
    }

    // 4. Open SSE stream
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendSse = (eventName: string, data: any) => {
        try {
            res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
        } catch { /* stream already closed */ }
    };

    sendSse("analysis_started", { analysisId: idempotencyKey, creditStatus: "RESERVED" });
    sendSse("platform_result", platformRisk);

    // F4: Disconnect handler.
    // Uses tryRefundReservation which has a PENDING guard — safe against race with:
    //   - analysis success path (which transitions PENDING → COMPLETED first)
    //   - analysis failure path (which also calls tryRefundReservation)
    // If analysis already completed when disconnect fires, status is "COMPLETED" → guard is false → no-op.
    res.on("close", async () => {
        // `close` also fires after a normal `res.end()`. Only refund when the
        // client disconnected before the analysis completed.
        if (res.writableEnded) return;
        try {
            const wasRefunded = await tryRefundReservation(
                reservationLock._id.toString(),
                "Client disconnected mid-analysis — credit refunded",
                req.user.userId
            );
            if (wasRefunded) {
                console.warn(`[Credits] Disconnect refund for idempotencyKey: ${idempotencyKey}`);
            }
        } catch (e) {
            console.error("Disconnect refund error:", e);
        }
    });

    const promptText = buildRiskPrompt(transaction);

    // F3: Separate tracks — only successfully parsed models enter completedModels.
    // Errored models are tracked in failedModelIds for UI transparency only.
    const completedModels: ModelRiskResult[] = [];
    const failedModelIds: string[] = [];

    try {
        // 5. Execute LLMs concurrently server-side
        const promises = (selectedModels as Provider[]).map(async (providerId) => {
            sendSse("model_started", { provider: providerId });
            const startTime = Date.now();
            const requestController = providerId === "openrouter" ? new AbortController() : undefined;
            let timedOut = false;
            const timeout = requestController
                ? setTimeout(() => {
                    timedOut = true;
                    requestController.abort();
                }, 20_000)
                : undefined;
            try {
                const providerInst = createProvider(providerId, customKeys?.[providerId]);
                const stream = await providerInst.streamResponse({
                    mode: "text",
                    provider: providerId,
                    systemPrompt: promptText,
                    text: "Analyze the attached transaction.",
                    signal: requestController?.signal,
                });

                const reader = stream.getReader();
                const decoder = new TextDecoder();
                let fullText = "";

                while (true) {
                    try {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) fullText += decoder.decode(value, { stream: true });
                    } catch (readErr: any) {
                        console.warn(`[Stream] ${providerId} stream broke mid-read:`, readErr.message);
                        break; // Salvage fullText and attempt extraction fallback
                    }
                }
                fullText += decoder.decode();

                const result = parseModelRiskResult(providerId as Provider, fullText, {
                    latencyMs: Date.now() - startTime,
                    tokenCount: 0
                });

                // F3: Only accept successfully parsed results into consensus pipeline.
                // A result with an `error` field is a parse failure — exclude it entirely
                // from completedModels so it cannot skew average score, median, or factor agreement.
                if (result.error) {
                    failedModelIds.push(providerId);
                    sendSse("model_failed", {
                        provider: providerId,
                        error: result.error,
                        status: "parse_error"
                    });
                } else {
                    completedModels.push(result);
                    sendSse("model_completed", { provider: providerId, status: "success", result });
                }
            } catch (err: any) {
                console.error(`Provider error for ${providerId}:`, err);
                failedModelIds.push(providerId);
                sendSse("model_failed", {
                    provider: providerId,
                    error: timedOut ? "OpenRouter risk analysis timed out after 20 seconds." : (err.message || "Failed")
                });
            } finally {
                if (timeout) clearTimeout(timeout);
            }
        });

        await Promise.allSettled(promises);

        // 6. Validate factors — only for successfully parsed models
        const validatedModelResults = completedModels.map(model => ({
            ...model,
            riskFactors: validateModelFactors(transaction, model)
        }));

        const supportedFactors = validatedModelResults.flatMap(m => m.riskFactors.filter(f => f.supported));
        const rejectedFactors = validatedModelResults.flatMap(m => m.riskFactors.filter(f => !f.supported));

        sendSse("evidence_validation", {
            supportedFactors: supportedFactors.map(f => f.name),
            rejectedFactors: rejectedFactors.map(f => f.name),
            failedModels: failedModelIds,   // UI transparency — which models did not contribute
            unknownFactors: []
        });

        // 7. Consensus — computed exclusively from validated successful models
        const consensus = calculateConsensus(validatedModelResults, platformRisk);
        sendSse("consensus", consensus);

        // 8. Final Decision
        const finalDecision = calculateFinalDecision({
            transaction,
            canonicalEvidence,
            platformRisk,
            validatedModels: validatedModelResults,
            consensus
        });
        sendSse("final_decision", finalDecision);

        // 9. ABTD (reasoning comparison only — cannot mutate scores/levels)
        const reasoningComparisons = generateModelPairs(validatedModelResults);
        sendSse("abtd", { reasoningComparisons });

        // 10. Persist DB record
        const finalDoc = new RiskAnalysis({
            userId: req.user?.userId,
            analysisId: idempotencyKey,
            transactionSnapshot: transaction,
            deterministicEvidence: canonicalEvidence,
            platformRisk,
            modelResults: completedModels,
            validatedModelResults,
            consensus,
            reasoningComparisons,
            finalDecision,
            creditTransactionId: reservationLock._id
        });
        await finalDoc.save();

        // 11. Commit credit: PENDING → COMPLETED (conditional — if disconnect already refunded, this is a no-op)
        await CreditLedger.findOneAndUpdate(
            { _id: reservationLock._id, status: "PENDING" },
            {
                status: "COMPLETED",
                type: "USAGE",
                description: "Risk Analysis Execution",
                completedAt: new Date()
            }
        );

        sendSse("analysis_complete", { analysisId: idempotencyKey, creditStatus: "COMPLETED" });
        res.end();

    } catch (err) {
        console.error("Execution pipeline fatal error:", err);
        // F4: Use atomic helper — safe against race with disconnect handler
        if (reservationLock) {
            await tryRefundReservation(
                reservationLock._id.toString(),
                "Analysis pipeline failure — credit refunded",
                req.user.userId
            );
        }
        sendSse("error", { message: "Internal Engine Failure" });
        res.end();
    }
}
