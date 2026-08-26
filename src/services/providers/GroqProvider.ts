import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

function getGroqKey(): string {
  if (typeof (process as any) !== "undefined" && (process as any).env && (process as any).env.VITE_GROQ_API_KEY) {
    return (process as any).env.VITE_GROQ_API_KEY;
  }
  return (import.meta as any).env?.VITE_GROQ_API_KEY || "";
}

interface GroqDelta {
  choices: Array<{ delta: { content?: string } }>;
}

export class GroqProvider implements InferenceProvider {
  private key: string;
  private model: string;

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("groq") || getGroqKey() || "";
    this.key = rawKey.trim().replace(/^groq-/i, "");
    this.model = (typeof process !== 'undefined' && (process as any).env) ? ((process as any).env.VITE_GROQ_MODEL ?? "llama3-8b-8192") : ((import.meta as any).env?.VITE_GROQ_MODEL ?? "llama3-8b-8192");
    if (!this.key) throw new Error("Groq needs an API key — add it via the Keys panel");
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    const content = req.mode === "audio" ? (req.text ?? "") : (req.text ?? "");
    const apiKey = this.key;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        stream: true,
        max_tokens: 1500,
      }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    if (!res.body) throw new Error("Groq returned empty body");

    return makeSseStream(res.body, (parsed) => {
      const d = parsed as GroqDelta;
      return d.choices[0]?.delta?.content;
    });
  }
}
