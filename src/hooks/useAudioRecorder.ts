import { useState, useRef, useCallback } from "react";

export interface AudioRecorderState {
  isRecording: boolean;
  isTranscribing: boolean;
  audioBlob: Blob | null;
  transcript: string;
  durationSec: number;
  error: string | null;
  supportsTranscription: boolean;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

/**
 * Sends the recorded audio blob to the server-side Sarvam Saras v3 STT proxy.
 * The proxy (/api/sarvam/stt) calls api.sarvam.ai/speech-to-text with the API key
 * server-side, keeping it off the client.
 */
async function transcribeWithSaras(blob: Blob, mimeType: string): Promise<string> {
  const form = new FormData();
  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : mimeType.includes("wav") ? "wav" : "webm";
  form.append("file", blob, `recording.${ext}`);
  form.append("model", "saaras:v3");
  form.append("language_code", "unknown"); // auto-detect (22 Indian languages)

  const res = await fetch("/api/sarvam/stt", {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Sarvam STT failed (${res.status})`);
  }

  const data = await res.json();
  // Sarvam v3 returns { transcript: "..." } or { transcripts: [{transcript:"..."}] }
  const transcript = (data.transcript || data.transcripts?.[0]?.transcript || "").trim();
  if (!transcript) throw new Error("Sarvam could not detect speech in this recording. Please try again.");
  return transcript;
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secs = useRef(0);
  const maxDurationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sarvam Saras works via REST — always available (no browser API needed)
  const supportsTranscription = true;

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setTranscript("");
    setDurationSec(0);
    secs.current = 0;
    chunks.current = [];

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Audio recording is not supported by this browser.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "";

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorder.current = rec;

      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };

      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (timer.current) { clearInterval(timer.current); timer.current = null; }
        if (maxDurationTimer.current) { clearTimeout(maxDurationTimer.current); maxDurationTimer.current = null; }
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        if (!blob.size) {
          setError("No audio was captured. Check your microphone and try again.");
          return;
        }
        setAudioBlob(blob);

        // Transcribe with Sarvam Saras v3 via server proxy
        setIsTranscribing(true);
        try {
          const text = await transcribeWithSaras(blob, rec.mimeType || "audio/webm");
          setTranscript(text);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Transcription failed.";
          setError(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      rec.start(100);
      setIsRecording(true);

      // Sarvam's synchronous Saaras v3 endpoint accepts audio up to 30s.
      maxDurationTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
        setIsRecording(false);
      }, 28_000);

      timer.current = setInterval(() => {
        secs.current += 1;
        setDurationSec(secs.current);
      }, 1000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not access microphone.";
      setError(
        msg.toLowerCase().includes("permission")
          ? "Microphone permission denied. Allow access in browser settings."
          : `Recording error: ${msg}`
      );
    }
  }, []);

  const stop = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (maxDurationTimer.current) { clearTimeout(maxDurationTimer.current); maxDurationTimer.current = null; }
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setAudioBlob(null);
    setTranscript("");
    setDurationSec(0);
    setError(null);
    setIsTranscribing(false);
    chunks.current = [];
  }, [stop]);

  return { isRecording, isTranscribing, audioBlob, transcript, durationSec, error, supportsTranscription, start, stop, clear };
}
