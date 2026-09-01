import type { DiffToken, SessionMetrics } from "../types";

/**
 * Estimates the number of tokens in a text string.
 * Uses the standard ~4 chars/token heuristic (matches GPT-4 / Llama / Gemma tokenizers closely).
 * Falls back to chunk count if text is empty.
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length / 4));
}

/**
 * @param chunks     Raw SSE chunk strings that have been received so far
 * @param startTime  Performance.now() or Date.now() at stream start
 * @param now        Current timestamp (default: Date.now())
 */
export function computeMetrics(
  chunks: string[],
  startTime: number,
  now: number = Date.now()
): Pick<SessionMetrics, "tokenCount" | "tokensPerSec" | "latencyMs"> {
  const joinedText = chunks.join("");
  // Estimate real token count from text, not chunk count
  const tokenCount = estimateTokenCount(joinedText);
  const latencyMs = now - startTime;
  const latencySec = latencyMs / 1000;
  // Use 1 decimal place (parseFloat removes trailing zero) so "3.7" not "1"
  const tokensPerSec = latencySec > 0
    ? parseFloat((tokenCount / latencySec).toFixed(1))
    : 0;
  return { tokenCount, tokensPerSec, latencyMs };
}


export function computeSimilarity(diffs: DiffToken[]): number {
  if (diffs.length === 0) return 100;
  const equal = diffs.filter((d) => d.type === "equal").length;
  return Math.round((equal / diffs.length) * 100);
}

export function formatLatency(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
  return `${ms} ms`;
}
