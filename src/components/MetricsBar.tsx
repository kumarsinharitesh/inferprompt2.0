import React from "react";
import { formatLatency } from "../utils/metrics";

interface Props {
  tokenCount: number;
  tokensPerSec: number;
  latencyMs: number;
  live?: boolean;
}

const MetricsBar: React.FC<Props> = ({ tokenCount, tokensPerSec, latencyMs, live }) => (
  <div role="region" aria-label="Inference metrics" className="flex gap-3">
    {[
      { label: "Tokens", value: tokenCount > 0 ? tokenCount.toLocaleString() : "—", accent: false },
      { label: "tok/s", value: tokensPerSec > 0 || live ? String(tokensPerSec) : "—", accent: true },
      { label: "Latency", value: latencyMs > 0 ? formatLatency(latencyMs) : "—", accent: false },
    ].map(({ label, value, accent }) => (
      <div
        key={label}
        className={`flex-1 rounded-xl border px-3 py-3 flex flex-col gap-1 transition-colors ${
          accent && live
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-[#1e1e2c] bg-[#0e0e16]"
        }`}
      >
        <div className="flex items-center gap-1.5">
          {live && accent && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
          <span className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</span>
        </div>
        <span className={`font-mono text-lg font-semibold tabular-nums ${accent ? "text-amber-400" : "text-slate-200"}`}>
          {value}
        </span>
      </div>
    ))}
  </div>
);

export default MetricsBar;
