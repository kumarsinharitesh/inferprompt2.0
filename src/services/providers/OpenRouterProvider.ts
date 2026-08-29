
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
  if (typeof process !== "undefined" && process.env) {
    return (
      process.env.OPENROUTER_API_KEY ||
      process.env.VITE_OPENROUTER_API_KEY ||
      ""
    );
  }

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
   * Normal inference:
   * Let OpenRouter choose from currently available free models.
   */
  private readonly normalModel = "openrouter/free";

  /*
   * Risk analysis:
   *
   * Use a small model instead of the random free router.
   * LFM2.5-2.6B is currently listed by OpenRouter as free
   * and is intended for data extraction / agent workflows.
   */
  private readonly riskModel =
    "liquid/lfm-2.5-2.6b:free";

  constructor(customKey?: string) {
    const rawKey =
      customKey ||
      local.getKey("openrouter") ||
      getOpenRouterKey() ||
      "";

    this.key = rawKey
      .trim()
      .replace(/^openrouter-/i, "");

    if (!this.key) {
      throw new Error(
        "OpenRouter needs an API key — add it via the Keys panel"
      );
    }
  }

  async streamResponse(
    req: InferenceRequest
  ): Promise<ReadableStream<Uint8Array>> {
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
      console.log(
        "[OpenRouter] Risk model:",
        this.riskModel
      );

      const res = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.key}`,
            "HTTP-Referer":
              "https://developer-inference-portal.vercel.app",
            "X-Title": "Inferprompt",
          },

          body: JSON.stringify({
            model: this.riskModel,

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

            /*
             * Get the complete JSON object.
             */
            stream: false,

            /*
             * Risk analysis should be small.
             */
            max_tokens: 1024,

            temperature: 0,

            /*
             * Request JSON.
             */
            response_format: {
              type: "json_object",
            },
          }),

          signal: req.signal,
        }
      );

      if (!res.ok) {
        const errorText = await res.text();

        console.error(
          "[OpenRouter] Risk error:",
          res.status,
          errorText
        );

        if (res.status === 429) {
          throw new Error(
            "OpenRouter risk model is temporarily rate-limited. Please retry shortly."
          );
        }

        throw new Error(
          `OpenRouter ${res.status}: ${errorText}`
        );
      }

      const data =
        (await res.json()) as OpenRouterResponse;

      console.log(
        "[OpenRouter] Risk response:",
        data
      );

      const content =
        data.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error(
          "OpenRouter returned an empty risk analysis"
        );
      }

      /*
       * Validate JSON before returning it.
       */
      try {
        JSON.parse(content);
      } catch {
        console.error(
          "[OpenRouter] Invalid risk JSON:",
          content
        );

        throw new Error(
          "OpenRouter returned invalid risk JSON"
        );
      }

      return streamFromText(content);
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
          "HTTP-Referer":
            "https://developer-inference-portal.vercel.app",
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

