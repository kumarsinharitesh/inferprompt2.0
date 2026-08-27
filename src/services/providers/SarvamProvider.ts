import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

function getSarvamKey(): string {
  if (typeof (process as any) !== "undefined" && (process as any).env && (process as any).env.SARVAM_API_KEY) {
    return (process as any).env.SARVAM_API_KEY;
  }
  return (import.meta as any).env?.SARVAM_API_KEY || "";
}

export class SarvamProvider implements InferenceProvider {
  private key: string;

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("sarvam") || getSarvamKey() || "";
    this.key = rawKey.trim().replace(/^sarvam--/i, "");
    if (!this.key) throw new Error(
      "Sarvam AI needs an API key — add it via the Keys panel or set SARVAM_API_KEY in .env.local"
    );
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    const content = req.mode === "audio" ? (req.text ?? "") : (req.text ?? "");
    const isRiskAnalysis = /payment[- ]risk analysis/i.test(req.systemPrompt ?? "");
    const res = await fetch("https://api.sarvam.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-subscription-key": this.key
      },
      body: JSON.stringify({
        model: "sarvam-105b",
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content },
        ],
        stream: true,
        // Sarvam enables thinking by default. Its reasoning tokens consume the
        // completion budget and can leave `content` empty, which caused the
        // blank playground and unparseable risk responses. These UI flows need
        // the final answer, so request direct visible output instead.
        reasoning_effort: null,
        max_tokens: isRiskAnalysis ? 1600 : 1024,
        ...(isRiskAnalysis ? { response_format: { type: "json_object" } } : {})
      }),
    });
    if (!res.ok) throw new Error(`Sarvam ${res.status}: ${await res.text()}`);

    return makeSseStream(res.body!, (d: any) => {
      const delta = d.choices?.[0]?.delta;
      if (!delta) return "";

      // Be defensive for requests created before reasoning was disabled: if a
      // provider sends both fields in one delta, never discard the answer.
      return delta.content ?? delta.reasoning_content ?? "";
    });
  }
}
