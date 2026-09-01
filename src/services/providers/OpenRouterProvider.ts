import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

interface OpenRouterResponse {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string; reasoning_content?: string; reasoning?: string };
  }>;
}

function getOpenRouterKey(): string {
  if (typeof window === "undefined") {
    return process.env.OPENROUTER_API_KEY || process.env.VITE_OPENROUTER_API_KEY || "";
  }
  return (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
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

function extractJsonObject(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? content;
  const candidate = fenced.match(/\{[\s\S]*\}/)?.[0] ?? fenced.trim();
  JSON.parse(candidate);
  return candidate;
}

export class OpenRouterProvider implements InferenceProvider {
  private key: string;
  private readonly freeRouterModel = "openrouter/free";

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("openrouter") || getOpenRouterKey() || "";
    this.key = rawKey.trim().replace(/^openrouter-/i, "");
  }

  private async completeRisk(req: InferenceRequest, structuredOutput: boolean): Promise<string> {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.key}`,
        "HTTP-Referer": "https://inferprompt2-0.onrender.com",
        "X-Title": "InferPrompt",
      },
      body: JSON.stringify({
        // The official router always targets the current free catalogue. It is
        // safer than hard-coding free model slugs that may be retired.
        model: this.freeRouterModel,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        stream: false,
        max_tokens: 1200,
        temperature: 0,
        ...(structuredOutput ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      throw Object.assign(new Error(`OpenRouter ${response.status}: ${detail}`), { status: response.status });
    }

    const data = await response.json() as OpenRouterResponse;
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("OpenRouter returned an empty risk completion");
    return extractJsonObject(content);
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    if (!this.key) {
      throw new Error("OpenRouter API key is missing. Set OPENROUTER_API_KEY on Render, or add your key via the Keys panel.");
    }

    const isRiskAnalysis = /payment[- ]risk analysis/i.test(req.systemPrompt ?? "");

    if (isRiskAnalysis) {
      try {
        return streamFromText(await this.completeRisk(req, true));
      } catch (structuredError: any) {
        if (structuredError?.name === "AbortError") throw structuredError;
        // Some models selected by the free router can produce JSON but do not
        // implement response_format. Retry once without that optional feature.
        try {
          return streamFromText(await this.completeRisk(req, false));
        } catch (fallbackError: any) {
          if (fallbackError?.name === "AbortError") throw fallbackError;
          const status = fallbackError?.status ?? structuredError?.status;
          if (status === 429) {
            throw new Error("OpenRouter free capacity is temporarily busy. Please retry in a moment or add your own OpenRouter key in Keys.");
          }
          throw new Error(`OpenRouter risk analysis could not return a valid JSON result: ${fallbackError?.message ?? structuredError?.message ?? "unknown error"}`);
        }
      }
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.key}`,
        "HTTP-Referer": "https://inferprompt2-0.onrender.com",
        "X-Title": "InferPrompt",
      },
      body: JSON.stringify({
        model: this.freeRouterModel,
        messages: [
          ...(req.systemPrompt ? [{ role: "system", content: req.systemPrompt }] : []),
          { role: "user", content: req.text ?? "" },
        ],
        stream: true,
        max_tokens: 2048,
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      if (response.status === 429) {
        throw new Error("OpenRouter free capacity is temporarily busy. Please retry in a moment or add your own OpenRouter key in Keys.");
      }
      throw new Error(`OpenRouter ${response.status}: ${detail}`);
    }
    if (!response.body) throw new Error("OpenRouter returned an empty response body");

    return makeSseStream(response.body, parsed => {
      const delta = (parsed as OpenRouterResponse).choices?.[0]?.delta;
      return delta?.content ?? "";
    });
  }
}
