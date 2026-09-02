import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";
import { parseModelRiskResult } from "../riskResultParser";

interface OpenRouterResponse {
  choices?: Array<{
    delta?: { content?: string; reasoning_content?: string };
    message?: { content?: string | Array<{ type?: string; text?: string }>; reasoning_content?: string; reasoning?: string };
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
  // The shared risk parser performs tolerant JSON recovery and schema
  // normalization. Do not discard a recoverable free-router completion here.
  return candidate;
}

export class OpenRouterProvider implements InferenceProvider {
  private key: string;
  private readonly freeRouterModel = "openrouter/free";

  constructor(customKey?: string) {
    const rawKey = customKey || local.getKey("openrouter") || getOpenRouterKey() || "";
    this.key = rawKey.trim().replace(/^openrouter-/i, "");
  }

  private async completeRisk(req: InferenceRequest, structuredOutput: boolean, reinforceJson = false): Promise<string> {
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
          ...(reinforceJson ? [{
            role: "system",
            content: "Return exactly one valid JSON object matching the requested risk schema. Do not include prose, markdown, or reasoning outside the JSON object.",
          }] : []),
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
    const messageContent = data.choices?.[0]?.message?.content;
    const content = typeof messageContent === "string"
      ? messageContent.trim()
      : Array.isArray(messageContent)
        ? messageContent.map(part => part.text ?? "").join("").trim()
        : "";
    if (!content) throw new Error("OpenRouter returned an empty risk completion");
    const candidate = extractJsonObject(content);

    // Validate before handing the response to the SSE analysis pipeline. Free
    // router models occasionally ignore JSON mode; retrying here prevents a
    // non-JSON answer from becoming a late parser failure in the UI.
    const normalized = parseModelRiskResult("openrouter", candidate, { latencyMs: 0, tokenCount: 0 });
    if (normalized.error) {
      throw new Error(normalized.error);
    }
    return JSON.stringify({
      riskScore: normalized.riskScore,
      riskLevel: normalized.riskLevel,
      recommendation: normalized.recommendation,
      confidence: normalized.confidence,
      reasoning: normalized.reasoning,
      riskFactors: normalized.riskFactors,
    });
  }

  async streamResponse(req: InferenceRequest): Promise<ReadableStream<Uint8Array>> {
    if (!this.key) {
      throw new Error("OpenRouter API key is missing. Set OPENROUTER_API_KEY on Render, or add your key via the Keys panel.");
    }

    const isRiskAnalysis = /payment[- ]risk analysis/i.test(req.systemPrompt ?? "");

    if (isRiskAnalysis) {
      let lastError: any;
      // Try the native JSON mode first, then two safe fallbacks for models
      // behind the free router that either do not support or ignore it.
      for (const attempt of [
        { structuredOutput: true, reinforceJson: false },
        { structuredOutput: false, reinforceJson: false },
        { structuredOutput: false, reinforceJson: true },
      ]) {
        try {
          return streamFromText(await this.completeRisk(req, attempt.structuredOutput, attempt.reinforceJson));
        } catch (error: any) {
          if (error?.name === "AbortError") throw error;
          lastError = error;
        }
      }
      if (lastError?.status === 429) {
        throw new Error("OpenRouter free capacity is temporarily busy. Please retry in a moment or add your own OpenRouter key in Keys.");
      }
      throw new Error(`OpenRouter risk analysis could not return a valid JSON result after retrying: ${lastError?.message ?? "unknown error"}`);
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
