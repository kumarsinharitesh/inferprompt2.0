import type { DiffToken, SessionMetrics } from "../types";

/**
 * @param tokens     
 * @param startTime  
 * @param now       
 */
export function computeMetrics(
  tokens: string[],
  startTime: number,
  now: number = Date.now()
): Pick<SessionMetrics, "tokenCount" | "tokensPerSec" | "latencyMs"> {
  const tokenCount = tokens.length;
  const latencyMs = now - startTime;
  const latencySec = latencyMs / 1000;
  const tokensPerSec = latencySec > 0 ? Math.round(tokenCount / latencySec) : 0;
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
