import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

interface OpenRouterDelta {
  choices: Array<{ delta: { content?: string; reasoning_content?: string } }>;
}

function getOpenRouterKey(): string {
  if (typeof (process as any) !== "undefined" && (process as any).env && (process as any).env.VITE_OPENROUTER_API_KEY) {
    return (process as any).env.VITE_OPENROUTER_API_KEY;
  }
  return (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
}

export class OpenRouterProvider implements InferenceProvider {
  private key: string;
  private model: string;
  private riskModel: string;

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("openrouter") || getOpenRouterKey() || "";
    this.key = rawKey.trim().replace(/^openrouter-/i, "");
    // OpenRouter maintains this router over the available free models, avoiding
    // hard failures when a specific free model is retired or saturated.
    // Override via VITE_OPENROUTER_MODEL to pin a model if desired.
    this.model = (typeof process !== 'undefined' && (process as any).env)
      ? ((process as any).env.VITE_OPENROUTER_MODEL ?? "openrouter/free")
      : ((import.meta as any).env?.VITE_OPENROUTER_MODEL ?? "openrouter/free");
    // Risk analysis requires short, structured JSON. A compact free model
    // avoids the slow, variable routing to large reasoning models.
    this.riskModel = (typeof process !== 'undefined' && (process as any).env)
      ? ((process as any).env.VITE_OPENROUTER_RISK_MODEL ?? "liquid/lfm-2.5-1.2b-instruct:free")
      : ((import.meta as any).env?.VITE_OPENROUTER_RISK_MODEL ?? "liquid/lfm-2.5-1.2b-instruct:free");
    if (!this.key) throw new Error("OpenRouter needs an API key — add it via the Keys panel");
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    const isRiskAnalysis = /payment[- ]risk analysis/i.test(req.systemPrompt ?? "");
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.key}`,
        "HTTP-Referer": "https://developer-inference-portal.vercel.app",
      },
      body: JSON.stringify({
        model: isRiskAnalysis ? this.riskModel : this.model,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        stream: true,
        max_tokens: isRiskAnalysis ? 700 : 4096,
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
      return delta.content ?? "";
    });
  }
}
