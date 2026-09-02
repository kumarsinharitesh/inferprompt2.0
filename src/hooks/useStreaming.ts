import { useState, useRef, useCallback, useEffect } from "react";
import type { InferenceRequest, StreamingStatus, SessionRecord } from "../types";
import { createProvider } from "../services/providerFactory";
import { computeMetrics } from "../utils/metrics";
import { local, session } from "../utils/storage";
import { useAuth } from "../context/AuthContext";

export interface StreamingState {
  output: string;
  rawOutput: string;
  tokens: string[];
  status: StreamingStatus;
  error: string | null;
  metrics: {
    tokenCount: number;
    tokensPerSec: number;
    latencyMs: number;
  };
  isThinking: boolean;
  // Real-time token count as chunks arrive (updates every chunk)
  liveTokenCount: number;
  start: (request: InferenceRequest) => Promise<void>;
  abort: () => void;
  reset: () => void;
}

const STREAM_TIMEOUT_MS = 30_000;

export function useStreaming(): StreamingState {
  const { credits, refreshUser } = useAuth();

  const [tokens, setTokens] = useState<string[]>([]);
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState({
    tokenCount: 0,
    tokensPerSec: 0,
    latencyMs: 0,
  });
  // Live token count that updates on every chunk (not just at end)
  const [liveTokenCount, setLiveTokenCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);

  const clearStreamTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    clearStreamTimeout();
    abortControllerRef.current?.abort();
    setStatus("aborted");
  }, [clearStreamTimeout]);

  const reset = useCallback(() => {
    clearStreamTimeout();
    abortControllerRef.current?.abort();
    setTokens([]);
    setStatus("idle");
    setError(null);
    setMetrics({ tokenCount: 0, tokensPerSec: 0, latencyMs: 0 });
    setLiveTokenCount(0);
  }, [clearStreamTimeout]);

  const start = useCallback(
    async (request: InferenceRequest) => {
      clearStreamTimeout();
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setTokens([]);
      setError(null);
      setStatus("streaming");
      setLiveTokenCount(0);
      const startTime = Date.now();
      startTimeRef.current = startTime;

      if (request.mode === "text" && request.text) {
        session.setPrompt(request.text);
      }

      try {
        const res = await fetch("/api/inference/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            provider: request.provider,
            text: request.text ?? "",
            systemPrompt: request.systemPrompt,
            customKey: local.getKey(request.provider) || undefined,
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Server error ${res.status}: ${errText}`);
        }

        if (!res.body) throw new Error("No response body from stream endpoint");

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const collectedTokens: string[] = [];
        let buf = "";
        let nextLineIsError = false;
        let streamDone = false;
        let receivedChunk = false;

        timeoutRef.current = setTimeout(() => {
          controller.abort();
          // OpenRouter can finish the generated text before an upstream proxy
          // closes its SSE connection. Keep a completed response rather than
          // showing a false failure after visible output has arrived.
          if (receivedChunk) {
            setStatus("done");
            setError(null);
          } else {
            setStatus("error");
            setError(`Stream timed out after ${STREAM_TIMEOUT_MS / 1000}s.`);
          }
        }, STREAM_TIMEOUT_MS);

        while (true) {
          if (controller.signal.aborted) break;
          if (streamDone) break;

          const { done, value } = await reader.read();
          clearStreamTimeout();
          if (done) break;

          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();

            // Track event type — payload comes on the next data: line
            if (trimmed.startsWith("event: error")) {
              nextLineIsError = true;
              continue;
            }
            if (trimmed.startsWith("event: done")) {
              // Server signals completion — stop re-arming the stall timeout
              streamDone = true;
              clearStreamTimeout();
              continue;
            }
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json || json === "{}") { nextLineIsError = false; continue; }
            try {
              const parsed = JSON.parse(json);
              // Surface server-side errors (e.g. missing API key, provider failure)
              if (nextLineIsError || parsed.error) {
                nextLineIsError = false;
                throw new Error(parsed.error || parsed.chunk || "Provider error");
              }
              nextLineIsError = false;
              if (parsed.chunk) {
                receivedChunk = true;
                collectedTokens.push(parsed.chunk);
                setTokens((prev) => [...prev, parsed.chunk]);
                const m = computeMetrics(collectedTokens, startTime);
                setMetrics(m);
                setLiveTokenCount(m.tokenCount);

                // Only re-arm stall timeout if stream isn't already signalled done
                if (!streamDone) {
                  timeoutRef.current = setTimeout(() => {
                    controller.abort();
                    if (receivedChunk) {
                      setStatus("done");
                      setError(null);
                    } else {
                      setStatus("error");
                      setError("Stream stalled — no data received for 30s.");
                    }
                  }, STREAM_TIMEOUT_MS);
                }
              }
            } catch (parseErr: unknown) {
              if (parseErr instanceof Error && parseErr.message !== "JSON parse error") {
                throw parseErr;
              }
            }
          }
        }

        clearStreamTimeout();

        if (!controller.signal.aborted) {
          setStatus("done");

          // Refresh server-authoritative credit balance so all UI stays in sync
          await refreshUser();

          // Persist session record
          try {
            const finalMetrics = computeMetrics(collectedTokens, startTime);
            fetch(`/api/inference/history`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                sessionId: crypto.randomUUID(),
                provider: request.provider,
                totalTokens: finalMetrics.tokenCount,
                latencyMs: finalMetrics.latencyMs,
              }),
            }).catch((e) => console.error("History sync error:", e));
          } catch {
            // Storage failure must not affect inference result.
          }
        }
      } catch (err: unknown) {
        clearStreamTimeout();
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "An unknown error occurred.";
        setError(message);
        setStatus("error");
      }
    },
    [clearStreamTimeout, refreshUser]
  );

  const rawOutput = tokens.join("");

  // Strip <think>...</think> blocks (DeepSeek-style reasoning tokens)
  const strippedOutput = (() => {
    let s = rawOutput;
    s = s.replace(/<think>[\s\S]*?<\/think>/g, "");
    const openIdx = s.indexOf("<think>");
    if (openIdx !== -1) s = s.substring(0, openIdx);
    return s.trimStart();
  })();

  const displayOutput = strippedOutput;
  const isThinking = status === "streaming" && strippedOutput.length === 0;

  useEffect(() => {
    if (status !== "done" || !displayOutput) return;
    const oldA = session.getOutputA();
    if (oldA && oldA !== displayOutput) {
      session.setOutputB(oldA);
    }
    session.setOutputA(displayOutput);
  }, [status]);

  return {
    output: displayOutput,
    rawOutput,
    tokens,
    status,
    error,
    metrics,
    isThinking,
    liveTokenCount,
    start,
    abort,
    reset,
  };
}
