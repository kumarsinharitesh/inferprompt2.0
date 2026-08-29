import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

interface OpenRouterDelta {
  choices: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string; reasoning?: string; reasoning_content?: string };
  }>;
}

function getOpenRouterKey(): string {
  if (typeof process !== "undefined" && process.env) {
    return process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || "";
  }
  return (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
}

export class OpenRouterProvider implements InferenceProvider {
  private key: string;
  private model: string;

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("openrouter") || getOpenRouterKey() || "";
    this.key = rawKey.trim().replace(/^openrouter-/i, "");
    // Use openrouter/auto for regular inference — picks the best available model automatically.
    // Override via OPENROUTER_MODEL env var to pin a specific model if desired.
    this.model = (typeof process !== "undefined" && (process as any).env)
      ? ((process as any).env.OPENROUTER_MODEL ?? (process as any).env.VITE_OPENROUTER_MODEL ?? "openrouter/auto")
      : ((import.meta as any).env?.OPENROUTER_MODEL ?? (import.meta as any).env?.VITE_OPENROUTER_MODEL ?? "openrouter/auto");
    if (!this.key) throw new Error("OpenRouter needs an API key — add it via the Keys panel");
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    const isRiskAnalysis = /payment[- ]risk analysis/i.test(req.systemPrompt ?? "");

    // For risk analysis: use a small, fast free model (Qwen3 8B) with streaming so tokens
    // arrive incrementally — avoids hitting the 45 s timeout on a large blocked response.
    // qwen/qwen3-8b:free typically responds in 5-10 s for a ~500-token JSON output.
    // Override via OPENROUTER_RISK_MODEL env var if needed.
    const riskModel = (typeof process !== "undefined" && (process as any).env)
      ? ((process as any).env.OPENROUTER_RISK_MODEL ?? "qwen/qwen3-8b:free")
      : ((import.meta as any).env?.OPENROUTER_RISK_MODEL ?? "qwen/qwen3-8b:free");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.key}`,
        "HTTP-Referer": "https://developer-inference-portal.vercel.app",
      },
      body: JSON.stringify({
        model: isRiskAnalysis ? riskModel : this.model,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        // Always use streaming — the orchestrator accumulates chunks into fullText either way.
        // Streaming means tokens arrive immediately, dramatically reducing timeout risk.
        stream: true,
        max_tokens: isRiskAnalysis ? 1024 : 4096,
        ...(isRiskAnalysis ? { temperature: 0 } : {}),
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("OpenRouter returned empty body");

    return makeSseStream(res.body, (parsed) => {
      const d = parsed as OpenRouterDelta;
      const delta = d.choices[0]?.delta;
      if (!delta) return "";
      // For risk analysis ONLY collect content — never reasoning_content.
      // Qwen3/DeepSeek emit thinking tokens through reasoning_content; mixing them
      // into fullText produces garbage that the JSON parser can't extract from.
      // The riskResultParser already strips <think>...</think> from content if needed.
      if (isRiskAnalysis) return delta.content ?? "";
      // Regular inference: also surface reasoning tokens so they appear in the UI.
      return delta.content ?? (delta as any).reasoning_content ?? "";
    });
  }
}

