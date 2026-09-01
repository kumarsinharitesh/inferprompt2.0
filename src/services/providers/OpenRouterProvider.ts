
import type { InferenceProvider, InferenceRequest } from "../../types";
import { local } from "../../utils/storage";
import { makeSseStream } from "../../utils/sseParser";

interface OpenRouterResponse {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
    message?: {
      content?: string;
      reasoning_content?: string;
      reasoning?: string;
    };
  }>;
}

function getOpenRouterKey(): string {
  // Use `typeof window` to distinguish server (Node/Render) from browser.
  // Vite polyfills `process` in the browser so `typeof process !== 'undefined'`
  // is always true in a browser bundle — making it an unreliable server check.
  if (typeof window === "undefined") {
    // Server-side: read from actual Node.js process.env (Render dashboard vars)
    return (
      process.env.OPENROUTER_API_KEY ||
      process.env.VITE_OPENROUTER_API_KEY ||
      ""
    );
  }
  // Browser-side: Vite injects VITE_* vars at build time into import.meta.env
  return (import.meta as any).env?.VITE_OPENROUTER_API_KEY || "";
}

function streamFromText(
  text: string
): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      if (encoded.length > 0) {
        controller.enqueue(encoded);
      }

      controller.close();
    },
  });
}

export class OpenRouterProvider implements InferenceProvider {
  private key: string;

  /*
   * Normal inference (Playground):
   * `openrouter/auto` is OpenRouter's official auto-routing identifier —
   * it picks the best available model for the request automatically.
   */
  private readonly normalModel = "openrouter/auto";

  constructor(customKey?: string) {
    const rawKey =
      customKey ||
      local.getKey("openrouter") ||
      getOpenRouterKey() ||
      "";

    this.key = rawKey
      .trim()
      .replace(/^openrouter-/i, "");

    // Do NOT throw here — defer to streamResponse so the SSE stream is already
    // open and can deliver the error as a proper event instead of crashing the route.
  }

  async streamResponse(
    req: InferenceRequest
  ): Promise<ReadableStream<Uint8Array>> {
    // Validate key here (not constructor) so the SSE stream is open and the
    // error surfaces as a proper event instead of crashing the Express route.
    if (!this.key) {
      throw new Error(
        "OpenRouter API key is missing. Set OPENROUTER_API_KEY on Render, or add your key via the Keys panel."
      );
    }

    const isRiskAnalysis =
      /payment[- ]risk analysis/i.test(
        req.systemPrompt ?? ""
      );

    /*
     * =====================================================
     * RISK ANALYSIS
     * =====================================================
     */
    if (isRiskAnalysis) {
      // Models verified live from OpenRouter API (Sept 2026) that support response_format: json_object.
      // Ordered by reliability & throughput. On 429/502/503 we move to the next.
      const RISK_MODEL_FALLBACKS = [
        "inclusionai/ling-3.0-flash-fin:free",    // Finance-focused MoE, high throughput
        "z-ai/glm-5.2:free",                      // High intelligence index (52.6), good JSON
        "nvidia/nemotron-3-super-120b-a12b:free", // Structured output support, 12B active
        "minimax/minimax-m3:free",                // Reliable, response_format supported
        "google/gemma-4-31b-it:free",             // Google, widely available
        "liquid/lfm-2.5-2.6b:free",              // Smallest — last resort
      ];

      let lastError: Error | null = null;

      for (const model of RISK_MODEL_FALLBACKS) {
        console.log(`[OpenRouter] Trying risk model: ${model}`);

        try {
          const res = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.key}`,
                "HTTP-Referer": "https://inferprompt2-0.onrender.com",
                "X-Title": "Inferprompt",
              },
              body: JSON.stringify({
                model,
                messages: [
                  ...(req.systemPrompt
                    ? [{ role: "system", content: req.systemPrompt }]
                    : []),
                  { role: "user", content: req.text ?? "" },
                ],
                stream: false,
                max_tokens: 1024,
                temperature: 0,
                response_format: { type: "json_object" },
              }),
              signal: req.signal,
            }
          );

          if (!res.ok) {
            const errorText = await res.text();
            console.warn(`[OpenRouter] ${model} → ${res.status}: ${errorText}`);
            // 429 = rate-limited, 503 = model down — both are retryable
            if (res.status === 429 || res.status === 503 || res.status === 502) {
              lastError = new Error(`${model} rate-limited (${res.status})`);
              continue; // Try next model
            }
            // Non-retryable error (e.g. 400 bad request) — fail immediately
            throw new Error(`OpenRouter ${res.status}: ${errorText}`);
          }

          const data = (await res.json()) as OpenRouterResponse;
          const content = data.choices?.[0]?.message?.content?.trim();

          if (!content) {
            console.warn(`[OpenRouter] ${model} returned empty content — trying next`);
            lastError = new Error(`${model} returned empty content`);
            continue;
          }

          // Validate JSON
          try {
            JSON.parse(content);
          } catch {
            console.warn(`[OpenRouter] ${model} returned invalid JSON — trying next`);
            lastError = new Error(`${model} returned invalid JSON`);
            continue;
          }

          console.log(`[OpenRouter] Risk analysis succeeded with model: ${model}`);
          return streamFromText(content);

        } catch (err: any) {
          // AbortError means the client disconnected — don't retry
          if (err.name === "AbortError") throw err;
          console.warn(`[OpenRouter] ${model} threw: ${err.message}`);
          lastError = err;
          // Continue to next model
        }
      }

      // All models failed
      throw new Error(
        lastError?.message?.includes("rate-limited")
          ? "All OpenRouter free models are currently rate-limited. Please wait 1–2 minutes and retry."
          : `OpenRouter risk analysis failed on all models: ${lastError?.message ?? "unknown error"}`
      );
    }

    /*
     * =====================================================
     * NORMAL INFERENCE
     * =====================================================
     */

    console.log(
      "[OpenRouter] Normal model:",
      this.normalModel
    );

    const res = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.key}`,
          "HTTP-Referer": "https://inferprompt2-0.onrender.com",
          "X-Title": "Inferprompt",
        },

        body: JSON.stringify({
          model: this.normalModel,

          messages: [
            ...(req.systemPrompt
              ? [
                {
                  role: "system",
                  content: req.systemPrompt,
                },
              ]
              : []),

            {
              role: "user",
              content: req.text ?? "",
            },
          ],

          stream: true,

          max_tokens: 2048,
        }),

        signal: req.signal,
      }
    );

    if (!res.ok) {
      const errorText = await res.text();

      if (res.status === 429) {
        throw new Error(
          "OpenRouter free models are temporarily rate-limited. Please retry shortly."
        );
      }

      throw new Error(
        `OpenRouter ${res.status}: ${errorText}`
      );
    }

    if (!res.body) {
      throw new Error(
        "OpenRouter returned empty response body"
      );
    }

    return makeSseStream(
      res.body,
      (parsed) => {
        const data =
          parsed as OpenRouterResponse;

        const delta =
          data.choices?.[0]?.delta;

        if (!delta) {
          return "";
        }

        return delta.content ?? "";
      }
    );
  }
}

