import express from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import InferenceSession from "../models/InferenceSession";
import { createProvider } from "../../src/services/providerFactory";
import type { Provider } from "../../src/types";

const router = express.Router();

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
        const history = await InferenceSession.find({ userId: req.user?.userId })
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
        const session = new InferenceSession({
            userId: req.user?.userId,
            sessionId: sessionId || `session-${Date.now()}`,
            provider: provider || "unknown",
            totalTokens: totalTokens || 0,
            latencyMs: latencyMs || 0,
        });
        await session.save();
        res.status(201).json({ success: true });
    } catch (err) {
        console.error("Failed to save inference session:", err);
        res.status(500).json({ error: "Failed to save inference session" });
    }
});

export default router;

