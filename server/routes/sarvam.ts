import { Router, Request, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import multer from "multer";

const router = Router();

// In-memory storage — recordings are short (< 30s per Sarvam REST limit)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Extend the request type to include multer's `file` property
type MulterRequest = AuthRequest & { file?: Express.Multer.File };

/**
 * POST /api/sarvam/stt
 * Server-side proxy to Sarvam Saras v3 speech-to-text REST API.
 * Keeps the SARVAM_API_KEY secret from the browser.
 *
 * Body: multipart/form-data
 *   - file: audio blob (webm / ogg / wav)
 *   - model: (optional, default "saaras:v3")
 *   - language_code: (optional, default "unknown" = auto-detect)
 */
router.post(
    "/stt",
    authMiddleware,
    upload.single("file"),
    async (req: Request, res: Response) => {
        const multerReq = req as MulterRequest;

        if (!multerReq.file) {
            return res.status(400).json({ error: "No audio file provided." });
        }

        const apiKey = process.env.SARVAM_API_KEY;
        if (!apiKey) {
            return res.status(503).json({ error: "Sarvam API key is not configured on the server. Add SARVAM_API_KEY to Render." });
        }

        try {
            const model = "saaras:v3";
            const languageCode = "unknown";

            // Forward as multipart to Sarvam — use Node 18+ global FormData & Blob
            const form = new FormData();
            form.append(
                "file",
                new Blob([multerReq.file.buffer], { type: multerReq.file.mimetype }),
                multerReq.file.originalname || "recording.webm"
            );
            form.append("model", model);
            form.append("mode", "transcribe");
            form.append("language_code", languageCode);
            form.append("with_timestamps", "false");

            console.log(`[Sarvam STT] Forwarding ${multerReq.file.size} bytes, model=${model}, lang=${languageCode}`);

            const upstream = await fetch("https://api.sarvam.ai/speech-to-text", {
                method: "POST",
                headers: { "api-subscription-key": apiKey },
                body: form,
            });

            const upstreamText = await upstream.text();
            let data: { transcript?: string; transcripts?: Array<{ transcript?: string }>; message?: string; error?: string } = {};
            try {
                data = JSON.parse(upstreamText);
            } catch {
                data = { message: upstreamText.slice(0, 500) };
            }

            if (!upstream.ok) {
                console.error("[Sarvam STT] Upstream error:", upstream.status, data);
                return res.status(upstream.status >= 500 ? 502 : upstream.status).json({
                    error: data?.message || data?.error || `Sarvam STT error ${upstream.status}`,
                });
            }

            return res.json({
                transcript: data.transcript || data.transcripts?.[0]?.transcript || "",
            });

        } catch (err: any) {
            console.error("[Sarvam STT] Proxy error:", err);
            return res.status(500).json({ error: err.message || "Internal STT proxy error." });
        }
    }
);

export default router;
