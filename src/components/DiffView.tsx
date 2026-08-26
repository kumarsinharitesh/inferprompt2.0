import React, { useState, useCallback, useEffect } from "react";
import type { DiffResult } from "../types";
import { runABTD } from "../utils/diff";
import { session } from "../utils/storage";

const tokenClass = {
  equal: "text-slate-300",
  insert: "bg-emerald-900/40 text-emerald-300 rounded px-0.5",
  delete: "bg-red-900/40 text-red-400 rounded px-0.5 line-through",
} as const;

const DiffPanel: React.FC<{ label: string; tokens: DiffResult["tokensA"] }> = ({ label, tokens }) => (
  <div className="flex flex-col gap-2 min-w-0">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
    <div
      className="min-h-[220px] max-h-[400px] overflow-y-auto rounded-xl border border-[#1e1e2c] bg-[#0e0e16] p-4
                 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words"
      aria-label={`${label} diff result`}
    >
      {tokens.map((t, i) => (
        <span key={i} className={tokenClass[t.type]}>{t.text}{" "}</span>
      ))}
    </div>
  </div>
);

const DiffView: React.FC = () => {
  const [textA, setTextA] = useState(session.getOutputA());
  const [textB, setTextB] = useState(session.getOutputB());
  const [result, setResult] = useState<DiffResult | null>(null);
  const [running, setRunning] = useState(false);

  // Re-read from sessionStorage every time this page mounts so
  // navigating from Playground -> Diff always shows the latest outputs.
  useEffect(() => {
    const a = session.getOutputA();
    const b = session.getOutputB();
    if (a) setTextA(a);
    if (b) setTextB(b);
    setResult(null);
  }, []);

  const canCompare = textA.trim().length > 0 && textB.trim().length > 0;

  const compare = useCallback(() => {
    if (!canCompare) return;
    setRunning(true);
    setTimeout(() => {
      setResult(runABTD(textA, textB));
      session.setOutputA(textA);
      session.setOutputB(textB);
      setRunning(false);
    }, 0);
  }, [textA, textB, canCompare]);

  const reset = () => {
    setTextA("");
    setTextB("");
    setResult(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-slate-200">Output Comparison</h2>
          <p className="text-xs text-slate-500 mt-0.5">Powered by ABTD — anchor-based token-level diff</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-900/60 border border-emerald-800" /> Inserted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-red-900/60 border border-red-800" /> Deleted
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-[#1e1e2c] border border-[#2a2a38]" /> Unchanged
          </span>
        </div>
      </div>

      {/* Input section — always visible */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[
          { label: "Output A", val: textA, set: setTextA, id: "output-a", hint: "Paste or type model output A…" },
          { label: "Output B", val: textB, set: setTextB, id: "output-b", hint: "Paste or type model output B…" },
        ].map(({ label, val, set, id, hint }) => (
          <div key={id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor={id} className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {label}
              </label>
              {val.trim() && (
                <span className="text-[10px] text-slate-600 font-mono">
                  {val.trim().split(/\s+/).filter(Boolean).length} words
                </span>
              )}
            </div>
            <textarea
              id={id}
              value={val}
              onChange={e => { set(e.target.value); setResult(null); }}
              onKeyDown={e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) compare(); }}
              placeholder={hint}
              rows={10}
              className="w-full resize-y rounded-xl border border-[#2a2a38] bg-[#0e0e16]
                         px-4 py-3 font-mono text-sm text-slate-200 placeholder-slate-700
                         focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30
                         transition-all outline-none leading-relaxed"
              aria-label={label}
            />
          </div>
        ))}
      </div>

      {/* Prompt when one side is empty */}
      {!canCompare && (textA.trim() || textB.trim()) && (
        <p className="text-xs text-slate-600 -mt-2">
          {!textA.trim() ? "← Paste text into Output A to compare." : "Paste text into Output B to compare. →"}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          id="compare-btn"
          onClick={compare}
          disabled={!canCompare || running}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400
                     text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed
                     transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 3H5a2 2 0 0 0-2 2v4M9 3h6M9 3v18m6-18h4a2 2 0 0 1 2 2v4M15 3v18M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4" />
          </svg>
          {running ? "Computing…" : "Compare"}
        </button>
        <button
          onClick={reset}
          className="text-xs text-slate-600 hover:text-slate-300 transition-colors px-2 py-1"
        >
          Clear
        </button>
        {!canCompare && (
          <span className="text-[11px] text-slate-700 ml-1">Ctrl+Enter to compare</span>
        )}
        {canCompare && !result && (
          <span className="text-[11px] text-slate-600 ml-1">Both fields filled — ready to compare</span>
        )}
      </div>

      {/* Diff result */}
      {result && (
        <div className="flex flex-col gap-4">
          {/* Stats bar */}
          <div className="flex flex-wrap gap-2 text-xs">
            {[
              { label: "added", val: result.stats.added, cls: "text-emerald-400 bg-emerald-900/20 border-emerald-900" },
              { label: "removed", val: result.stats.removed, cls: "text-red-400 bg-red-900/20 border-red-900" },
              { label: "unchanged", val: result.stats.unchanged, cls: "text-slate-400 bg-[#1e1e2c] border-[#2a2a38]" },
              { label: "similarity", val: `${result.stats.similarityPct}%`, cls: "text-amber-400 bg-amber-900/20 border-amber-900" },
            ].map(({ label, val, cls }) => (
              <span key={label} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-medium ${cls}`}>
                {val} {label}
              </span>
            ))}
          </div>

          {/* Diff panels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DiffPanel label="Output A" tokens={result.tokensA} />
            <DiffPanel label="Output B" tokens={result.tokensB} />
          </div>
        </div>
      )}
    </div>
  );
};

export default DiffView;
