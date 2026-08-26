import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";

function getGeminiKey(): string {
  if (typeof (process as any) !== "undefined" && (process as any).env && (process as any).env.VITE_GEMINI_API_KEY) {
    return (process as any).env.VITE_GEMINI_API_KEY;
  }
  return (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
}

export class GeminiProvider implements InferenceProvider {
  private key: string;
  private model: string;

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("gemini") || getGeminiKey() || "";
    this.key = rawKey.trim().replace(/^gemini-/i, "");
    this.model = (typeof process !== 'undefined' && (process as any).env) ? ((process as any).env.VITE_GEMINI_MODEL ?? "gemini-1.5-flash") : ((import.meta as any).env?.VITE_GEMINI_MODEL ?? "gemini-1.5-flash");
    if (!this.key) throw new Error("Gemini needs an API key — add it via the Keys panel");
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    const content = req.mode === "audio" ? (req.text ?? "") : (req.text ?? "");
    const apiKey = this.key;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:streamGenerateContent?alt=sse&key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: req.text ?? "" }] }],
        generationConfig: { maxOutputTokens: 1500 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("Gemini returned empty body");

    const dec = new TextDecoder();
    const enc = new TextEncoder();
    const reader = res.body.getReader();
    let buf = "";

    return new ReadableStream({
      async pull(ctrl) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) { ctrl.close(); return; }
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const s = line.trim();
            if (!s.startsWith("data:")) continue;
            try {
              const d = JSON.parse(s.slice(5)) as {
                candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
              };
              const text = d.candidates[0]?.content?.parts[0]?.text;
              if (text) { ctrl.enqueue(enc.encode(text)); }
            } catch { /* skip */ }
          }
        }
      },
      cancel() { void reader.cancel(); },
    });
  }
}
