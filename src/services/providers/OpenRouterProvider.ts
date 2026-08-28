import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

interface OpenRouterDelta {
  choices: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string; reasoning?: string; reasoning_content?: string };
  }>;
}

function streamFromText(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (encoded.length) controller.enqueue(encoded);
      controller.close();
    },
  });
}

function getOpenRouterKey(): string {
  if (typeof process !== "undefined" && process.env) {
    // Support the server-safe key name and the project's existing Vite-era
    // name while deployments migrate their environment configuration.
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
    // OpenRouter maintains this router over the available free models, avoiding
    // hard failures when a specific free model is retired or saturated.
    // Override via VITE_OPENROUTER_MODEL to pin a model if desired.
    this.model = (typeof process !== 'undefined' && (process as any).env)
      ? ((process as any).env.VITE_OPENROUTER_MODEL ?? "openrouter/free")
      : ((import.meta as any).env?.VITE_OPENROUTER_MODEL ?? "openrouter/free");
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
        // The free router selects an available model that supports the
        // requested JSON capability. Pinning a single free model made risk
        // analysis fail whenever that provider was unavailable.
        model: isRiskAnalysis ? "openrouter/free" : this.model,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        // Risk Analyzer needs one complete JSON object, not incremental UI
        // tokens. Some OpenRouter free models split or omit final SSE frames,
        // which produced an empty/truncated object for the risk parser.
        stream: !isRiskAnalysis,
        max_tokens: isRiskAnalysis ? 1600 : 4096,
        ...(isRiskAnalysis ? { temperature: 0 } : {}),
        ...(isRiskAnalysis ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
    if (isRiskAnalysis) {
      const raw = await res.text();
      let completion: OpenRouterDelta;
      try {
        completion = JSON.parse(raw) as OpenRouterDelta;
      } catch {
        throw new Error("OpenRouter returned an invalid risk completion");
      }
      const message = completion.choices?.[0]?.message;
      const content = message?.content ?? message?.reasoning_content ?? message?.reasoning;
      if (!content || typeof content !== "string") {
        throw new Error("OpenRouter returned an empty risk completion");
      }
      return streamFromText(content);
    }

    if (!res.body) throw new Error("OpenRouter returned empty body");

    return makeSseStream(res.body, (parsed) => {
      const d = parsed as OpenRouterDelta;
      const delta = d.choices[0]?.delta;
      if (!delta) return "";
      return delta.content ?? "";
    });
  }
}
