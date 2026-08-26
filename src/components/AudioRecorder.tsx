import React, { useEffect, useRef } from "react";
import { useAudioRecorder } from "../hooks/useAudioRecorder";

interface Props {
  onReady: (blob: Blob, transcript: string) => void;
}

const fmt = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

const AudioRecorder: React.FC<Props> = ({ onReady }) => {
  const rec = useAudioRecorder();
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    if (rec.audioBlob) {
      onReady(rec.audioBlob, rec.transcript);
    }
  }, [rec.audioBlob, rec.transcript, onReady]);

  useEffect(() => {
    if (rec.audioBlob) {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = URL.createObjectURL(rec.audioBlob);
    }
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); };
  }, [rec.audioBlob]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        {rec.isRecording ? (
          <button
            id="audio-stop-btn"
            onClick={rec.stop}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-400
                       text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-400"
            aria-label="Stop recording"
          >
            <span className="w-2.5 h-2.5 bg-white rounded-sm" />
            Stop — {fmt(rec.durationSec)}
          </button>
        ) : (
          <button
            id="audio-record-btn"
            onClick={() => void rec.start()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1e1e2c] hover:bg-[#262636]
                       border border-[#2a2a38] hover:border-amber-500/40 text-slate-200 text-sm font-medium
                       transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            aria-label="Start recording"
          >
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            Record
          </button>
        )}
        {rec.audioBlob && !rec.isRecording && (
          <button
            onClick={rec.clear}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {rec.isRecording && (
        <div aria-hidden className="flex items-end gap-0.5 h-8">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="w-1 rounded-full bg-amber-500"
              style={{ animation: `waveBar 0.5s ease-in-out ${(i * 0.05).toFixed(2)}s infinite alternate` }}
            />
          ))}
        </div>
      )}

      {(rec.transcript || rec.isRecording) && (
        <div className="rounded-xl border border-[#1e1e2c] bg-[#0e0e16] p-3">
          <p className="text-[10px] uppercase tracking-wider text-slate-600 mb-1.5">
            {rec.supportsTranscription ? "Live transcript" : "Transcription unavailable in this browser"}
          </p>
          <p className="text-sm text-slate-300 italic min-h-[1.25rem]">
            {rec.transcript || (rec.isRecording ? "Listening…" : "")}
          </p>
        </div>
      )}

      {rec.audioBlob && urlRef.current && !rec.isRecording && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-slate-600">Playback</span>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio controls src={urlRef.current} className="w-full h-9 rounded-lg" />
        </div>
      )}

      {rec.error && (
        <p role="alert" className="text-xs text-red-400 bg-red-950/20 border border-red-900/40 rounded-lg px-3 py-2">
          {rec.error}
        </p>
      )}
    </div>
  );
};

export default AudioRecorder;
