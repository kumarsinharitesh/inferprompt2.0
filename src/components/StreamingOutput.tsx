import React, { useEffect, useRef, useState } from "react";
import type { StreamingStatus } from "../types";

interface Props {
  output: string;
  isThinking?: boolean;
  status: StreamingStatus;
  error: string | null;
  liveTokenCount?: number;
  onRetry?: () => void;
  onAbort?: () => void;
}

const StreamingOutput: React.FC<Props> = ({
  output,
  isThinking,
  status,
  error,
  liveTokenCount = 0,
  onRetry,
  onAbort,
}) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Typewriter: track how many characters of `output` are displayed
  const [displayedLen, setDisplayedLen] = useState(0);
  const typeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // When output grows (new chunk arrived), schedule revealing the new characters
  useEffect(() => {
    if (output.length === 0) {
      setDisplayedLen(0);
      return;
    }
    // Jump directly to end if status became done/aborted/error (no lag on finish)
    if (status !== "streaming") {
      setDisplayedLen(output.length);
      return;
    }

    // Typewriter: reveal characters up to output.length incrementally
    const revealNext = () => {
      setDisplayedLen((prev) => {
        if (prev >= output.length) return prev;
        // Reveal chars in small bursts (4 chars per tick at ~16ms = ~250 chars/s)
        return Math.min(prev + 4, output.length);
      });
    };

    // If we're behind, keep ticking
    setDisplayedLen((prev) => {
      if (prev < output.length) {
        if (typeTimerRef.current) clearInterval(typeTimerRef.current);
        typeTimerRef.current = setInterval(revealNext, 16);
      }
      return prev;
    });

    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    };
  }, [output, status]);

  // Stop the interval once we've caught up
  useEffect(() => {
    if (displayedLen >= output.length && typeTimerRef.current) {
      clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
  }, [displayedLen, output.length]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typeTimerRef.current) clearInterval(typeTimerRef.current);
    };
  }, []);

  // Auto-scroll as new chars appear
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [displayedLen]);

  const displayedText = output.slice(0, displayedLen);
  const empty = displayedText.length === 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Output</span>
        <div className="flex items-center gap-3">
          {/* Live token counter during streaming */}
          {status === "streaming" && liveTokenCount > 0 && (
            <span className="text-[11px] font-mono text-amber-400/80 tabular-nums animate-pulse">
              {liveTokenCount} tokens
            </span>
          )}
          {status === "done" && (
            <span className="text-[11px] text-emerald-400 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              Complete
            </span>
          )}
          {status === "streaming" && onAbort && (
            <button
              onClick={onAbort}
              className="text-[11px] text-slate-500 hover:text-red-400 flex items-center gap-1 transition-colors"
              aria-label="Stop generation"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="3" width="18" height="18" rx="2" />
              </svg>
              Stop
            </button>
          )}
        </div>
      </div>

      <div
        role="log"
        aria-live="polite"
        aria-atomic="false"
        aria-label="Model output"
        className={`min-h-[200px] rounded-xl border font-mono text-sm leading-relaxed p-4 transition-colors ${status === "error"
            ? "border-red-900/60 bg-[#100a0a]"
            : "border-[#1e1e2c] bg-[#0e0e16]"
          }`}
      >
        {empty && status === "idle" && (
          <p className="text-slate-600 text-sm italic">Output will stream here…</p>
        )}
        {empty && status === "streaming" && !isThinking && (
          <span className="inline-block w-1.5 h-4 bg-amber-400 animate-pulse rounded-sm" />
        )}

        {isThinking && (
          <div className="flex items-center gap-2 text-slate-500 text-sm italic mb-2">
            <svg
              className="animate-spin text-slate-600"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Model is thinking...
          </div>
        )}

        {/* Typewriter text — only shows up to displayedLen characters */}
        <span className="text-slate-200 whitespace-pre-wrap break-words">
          {displayedText}
        </span>

        {/* Blinking cursor — shown while streaming OR while typewriter is still catching up */}
        {(status === "streaming" || displayedLen < output.length) && !empty && (
          <span className="inline-block w-1 h-4 ml-0.5 bg-amber-400 animate-pulse align-middle rounded-sm" />
        )}

        <div ref={bottomRef} />
      </div>

      {status === "error" && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-900/50 bg-[#100a0a] p-3">
          <svg
            className="shrink-0 mt-0.5 text-red-400"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-red-400">Stream failed</p>
            <p className="text-xs text-slate-500 mt-0.5 break-words">{error}</p>
            {output.length > 0 && (
              <p className="text-xs text-slate-600 mt-1 italic">Partial output preserved above.</p>
            )}
          </div>
          {onRetry && (
            <button
              onClick={onRetry}
              className="shrink-0 px-2.5 py-1 text-xs font-medium bg-[#1e0e0e] border border-red-900 text-red-400
                         hover:bg-red-900/30 rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {status === "aborted" && output.length > 0 && (
        <p role="status" className="text-xs text-slate-600 italic px-1">
          Stopped. Partial output preserved.
        </p>
      )}
    </div>
  );
};

export default StreamingOutput;
