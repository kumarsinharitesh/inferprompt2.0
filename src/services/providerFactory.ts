import type { Provider, InferenceProvider, ProviderMeta } from "../types";
import { SarvamProvider } from "./providers/SarvamProvider";
import { OpenRouterProvider } from "./providers/OpenRouterProvider";
import { GeminiProvider } from "./providers/GeminiProvider";
import { GroqProvider } from "./providers/GroqProvider";

export function createProvider(provider: Provider, customKey?: string): InferenceProvider {
  switch (provider) {
    case "sarvam": return new SarvamProvider(customKey);
    case "openrouter": return new OpenRouterProvider(customKey);
    case "gemini": return new GeminiProvider(customKey);
    case "groq": return new GroqProvider(customKey);
    default: {
      const _: never = provider;
      throw new Error(`Unknown provider: ${String(_)}`);
    }
  }
}

export const PROVIDER_META: ProviderMeta[] = [
  {
    id: "sarvam",
    label: "Sarvam AI",
    description: "[Model: sarvam-105b] Indic language models, low-latency inference.",
    requiresKey: true,
    envKey: "VITE_SARVAM_API_KEY",
    docsUrl: "https://docs.sarvam.ai/",
  },
  {
    id: "openrouter",
    label: "OpenRouter Free Router",
    description: "[Model: openrouter/free] Free, fast automatic routing to available models.",
    requiresKey: true,
    envKey: "VITE_OPENROUTER_API_KEY",
    docsUrl: "https://openrouter.ai/docs",
  },
  {
    id: "gemini",
    label: "Gemini",
    description: "[Model: gemini-1.5-flash] Google's multimodal foundation model.",
    requiresKey: true,
    envKey: "VITE_GEMINI_API_KEY",
    docsUrl: "https://ai.google.dev/",
  },
  {
    id: "groq",
    label: "Groq",
    description: "[Model: llama3-8b-8192] Ultra-fast LPU inference.",
    requiresKey: true,
    envKey: "VITE_GROQ_API_KEY",
    docsUrl: "https://console.groq.com/",
  },
];
