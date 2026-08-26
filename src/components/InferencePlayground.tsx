import React, { useState, useCallback } from "react";
import type { Provider, InferenceRequest } from "../types";
import { useStreaming } from "../hooks/useStreaming";
import { local, session } from "../utils/storage";
import { sanitizePrompt, sanitizeSystem, sanitizeTranscript, createRateLimiter } from "../utils/security";
import ProviderSelector from "./ProviderSelector";
import StreamingOutput from "./StreamingOutput";
import MetricsBar from "./MetricsBar";
import AudioRecorder from "./AudioRecorder";

type Mode = "text" | "audio";

const examples = [
  "Explain transformer attention in simple terms.",
  "What's the difference between RLHF and RLAIF?",
  "How does speculative decoding speed up inference?",
];


const rateLimit = createRateLimiter(2000);

const InferencePlayground: React.FC = () => {
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState(session.getPrompt());
  const [provider, setProvider] = useState<Provider>(local.getProvider());
  const [recording, setRecording] = useState<{ blob: Blob; transcript: string } | null>(null);
  const [editedNote, setEditedNote] = useState("");
  const [systemMsg, setSystemMsg] = useState(local.getSystem());
  const [showSystem, setShowSystem] = useState(false);

  const stream = useStreaming();

  const submit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (stream.status === "streaming") return;
    if (!rateLimit()) return; 

    const safePrompt = sanitizePrompt(prompt);
    const safeSystem = sanitizeSystem(systemMsg);
    const safeNote   = sanitizeTranscript(editedNote);

    const req: InferenceRequest = mode === "text"
      ? { mode: "text", text: safePrompt || examples[0], provider, systemPrompt: safeSystem }
      : {
          mode: "audio",
          audioBlob: recording?.blob,
          text: safeNote || sanitizeTranscript(recording?.transcript ?? ""),
          provider,
          systemPrompt: safeSystem,
        };

    await stream.start(req);
  }, [mode, prompt, provider, recording, editedNote, systemMsg, stream]);

  const onRecorded = useCallback((blob: Blob, transcript: string) => {
    setRecording({ blob, transcript });
    setEditedNote(transcript);
  }, []);

  const saveSystem = (v: string) => {
    setSystemMsg(v);
    local.setSystem(v);
  };

  const canRun = stream.status !== "streaming" && (
    mode === "text" ? prompt.trim().length > 0
      : recording !== null && (editedNote.trim().length > 0 || (recording.transcript?.length ?? 0) > 0)
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4">
          <ProviderSelector value={provider} onChange={p => { local.setProvider(p); setProvider(p); }} />
        </div>

        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4">
          <button
            type="button"
            onClick={() => setShowSystem(s => !s)}
            className="flex w-full items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-300 transition-colors"
            aria-expanded={showSystem}
          >
            System Prompt
            <span className="text-slate-600">{showSystem ? "▲" : "▼"}</span>
          </button>
          {showSystem && (
            <textarea
              id="system-prompt"
              value={systemMsg}
              onChange={e => saveSystem(e.target.value)}
              placeholder="You are a helpful assistant…"
              rows={3}
              className="mt-3 w-full resize-none rounded-lg border border-[#2a2a38] bg-[#0e0e16]
                         px-3 py-2 text-xs text-slate-200 placeholder-slate-600
                         focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
              aria-label="System prompt"
            />
          )}
        </div>

        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Metrics</p>
          <MetricsBar
            tokenCount={stream.metrics.tokenCount}
            tokensPerSec={stream.metrics.tokensPerSec}
            latencyMs={stream.metrics.latencyMs}
            live={stream.status === "streaming"}
          />
        </div>
      </aside>

      <main className="flex flex-col gap-4">
        <div role="tablist" aria-label="Input mode" className="flex gap-1 p-1 bg-[#12121a] border border-[#1e1e2c] rounded-xl w-fit">
          {(["text", "audio"] as Mode[]).map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              id={`tab-${m}`}
              aria-controls={`panel-${m}`}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${
                mode === m ? "bg-amber-500 text-black" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {m === "text" ? "Text" : "Audio"}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${mode}`}
          aria-labelledby={`tab-${mode}`}
          className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4"
        >
          {mode === "text" ? (
            <form onSubmit={e => void submit(e)} className="flex flex-col gap-3">
              <label htmlFor="prompt-input" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Prompt
              </label>
              <textarea
                id="prompt-input"
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="Ask anything…"
                rows={5}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
                className="w-full resize-none rounded-lg border border-[#2a2a38] bg-[#0e0e16]
                           px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600
                           focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
                aria-label="Prompt"
              />
              <div className="flex flex-wrap gap-1.5">
                {examples.map(ex => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setPrompt(ex)}
                    className="text-[11px] text-slate-500 hover:text-amber-400 border border-[#2a2a38]
                               hover:border-amber-500/40 px-2 py-1 rounded-lg transition-all"
                  >
                    {ex.slice(0, 38)}…
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-3">
                <button
                  id="submit-btn"
                  type="submit"
                  disabled={!canRun}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400
                             text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed
                             transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                  {stream.status === "streaming" ? "Running…" : "Run"}
                </button>
                {stream.status !== "idle" && (
                  <button type="button" onClick={stream.reset} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                    Reset
                  </button>
                )}
                <span className="ml-auto text-[11px] text-slate-700">Ctrl+Enter to run</span>
              </div>
            </form>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Audio Input</p>
              <AudioRecorder onReady={onRecorded} />

              {recording && (
                <div className="flex flex-col gap-2">
                  <label htmlFor="transcript-edit" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                    Transcript
                    <span className="text-amber-500/70 normal-case tracking-normal text-[10px] font-normal">— edit before running</span>
                  </label>
                  <textarea
                    id="transcript-edit"
                    value={editedNote}
                    onChange={e => setEditedNote(e.target.value)}
                    placeholder="Transcript appears here — edit it if needed…"
                    rows={3}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit(); }}
                    className="w-full resize-none rounded-lg border border-amber-500/20 bg-[#0e0e16]
                               px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600
                               focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                    aria-label="Editable transcript"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      id="audio-submit-btn"
                      onClick={() => void submit()}
                      disabled={!canRun}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400
                                 text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed
                                 transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M5 12h14M12 5l7 7-7 7" />
                      </svg>
                      {stream.status === "streaming" ? "Running…" : "Run"}
                    </button>
                    {stream.status !== "idle" && (
                      <button type="button" onClick={stream.reset} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                        Reset
                      </button>
                    )}
                    <span className="ml-auto text-[11px] text-slate-700">Ctrl+Enter to run</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <StreamingOutput
          output={stream.output}
          isThinking={stream.isThinking}
          status={stream.status}
          error={stream.error}
          onRetry={() => void submit()}
          onAbort={stream.abort}
        />
      </main>
    </div>
  );
};

export default InferencePlayground;
