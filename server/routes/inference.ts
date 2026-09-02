import express from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import InferenceSession from "../models/InferenceSession";
import { createProvider } from "../../src/services/providerFactory";
import type { Provider } from "../../src/types";

const router = express.Router();

const hasConfiguredKey = (...names: string[]) => names.some(name => Boolean(process.env[name]?.trim()));
const ANALYTICS_PROVIDERS = ["sarvam", "openrouter", "gemini", "groq"] as const;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Returns availability only. API key values are never sent to the browser.
router.get("/providers", (_req, res) => {
    res.json({
        providers: {
            sarvam: hasConfiguredKey("SARVAM_API_KEY", "VITE_SARVAM_API_KEY"),
            openrouter: hasConfiguredKey("OPENROUTER_API_KEY", "VITE_OPENROUTER_API_KEY"),
            gemini: hasConfiguredKey("GEMINI_API_KEY", "VITE_GEMINI_API_KEY"),
            groq: hasConfiguredKey("GROQ_API_KEY", "VITE_GROQ_API_KEY"),
        }
    });
});

// ---------------------------------------------------------------------------
// POST /api/inference/stream
// Runs the provider server-side and pipes tokens as SSE to the client.
// This avoids CORS issues from direct-browser API calls and keeps keys secure.
// ---------------------------------------------------------------------------
router.post("/stream", authMiddleware, async (req: AuthRequest, res) => {
    const { provider, text, systemPrompt, customKey } = req.body as {
        provider: Provider;
        text: string;
        systemPrompt?: string;
        customKey?: string;
    };

    if (!provider || typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "provider and text are required" });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const sendEvent = (event: string, data: string) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify({ chunk: data })}\n\n`);
    };

    try {
        const providerInst = createProvider(provider, typeof customKey === "string" ? customKey : undefined);
        const stream = await providerInst.streamResponse({
            mode: "text",
            provider,
            text,
            systemPrompt,
        });

        const reader = stream.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
                const chunk = decoder.decode(value, { stream: true });
                if (chunk) sendEvent("chunk", chunk);
            }
        }

        res.write("event: done\ndata: {}\n\n");
        res.end();
    } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: err.message || "Provider error" })}\n\n`);
        res.end();
    }
});

router.get("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        // Analytics is intentionally Playground-only. Do not let incomplete,
        // mock, Diff, or risk-analysis records affect these metrics. Legacy
        // browser records are accepted only when they have a real UUID and
        // complete, positive measurements.
        const history = await InferenceSession.find({
            userId: req.user?.userId,
            provider: { $in: ANALYTICS_PROVIDERS },
            totalTokens: { $gt: 0 },
            latencyMs: { $gt: 0 },
            $or: [
                { source: "playground", status: "completed" },
                {
                    source: { $exists: false },
                    sessionId: { $regex: SESSION_ID_PATTERN },
                },
            ],
        })
            .sort({ createdAt: -1 })
            .limit(50);
        res.json(history);
    } catch (err) {
        res.status(500).json({ error: "Failed to retrieve inference history" });
    }
});

router.post("/history", authMiddleware, async (req: AuthRequest, res) => {
    try {
        const { sessionId, provider, totalTokens, latencyMs } = req.body;
        const tokenCount = Number(totalTokens);
        const durationMs = Number(latencyMs);

        if (
            typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId) ||
            !ANALYTICS_PROVIDERS.includes(provider) ||
            !Number.isFinite(tokenCount) || tokenCount <= 0 ||
            !Number.isFinite(durationMs) || durationMs <= 0
        ) {
            return res.status(400).json({ error: "Invalid completed Playground session metrics" });
        }

        // An identical client retry must not inflate dashboard totals.
        await InferenceSession.updateOne(
            { userId: req.user?.userId, sessionId },
            {
                $setOnInsert: {
                    userId: req.user?.userId,
                    sessionId,
                    provider,
                    totalTokens: tokenCount,
                    latencyMs: durationMs,
                    source: "playground",
                    status: "completed",
                },
            },
            { upsert: true }
        );
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Failed to save inference session:", err);
        res.status(500).json({ error: "Failed to save inference session" });
    }
});

export default router;

