import { useState, useRef, useCallback } from "react";

export interface AudioRecorderState {
  isRecording: boolean;
  audioBlob: Blob | null;
  transcript: string;
  durationSec: number;
  error: string | null;
  supportsTranscription: boolean;
  start: () => Promise<void>;
  stop: () => void;
  clear: () => void;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
}
type SpeechRecognitionCtor = new () => ISpeechRecognition;

const SpeechRecognitionAPI: SpeechRecognitionCtor | null =
  (typeof window !== "undefined" &&
    ((window as unknown as { SpeechRecognition?: SpeechRecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition)) ||
  null;

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcript, setTranscript] = useState("");
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const recognition = useRef<ISpeechRecognition | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const secs = useRef(0);

  
  const finalizedText = useRef("");

  const supportsTranscription = SpeechRecognitionAPI !== null;

  const start = useCallback(async () => {
    setError(null);
    setAudioBlob(null);
    setTranscript("");
    setDurationSec(0);
    secs.current = 0;
    chunks.current = [];
    finalizedText.current = "";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "";

      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      mediaRecorder.current = rec;

      rec.ondataavailable = e => { if (e.data.size > 0) chunks.current.push(e.data); };
      rec.onstop = () => {
        setAudioBlob(new Blob(chunks.current, { type: rec.mimeType || "audio/webm" }));
        stream.getTracks().forEach(t => t.stop());
      };

      rec.start(100);
      setIsRecording(true);

      timer.current = setInterval(() => {
        secs.current += 1;
        setDurationSec(secs.current);
      }, 1000);

      if (SpeechRecognitionAPI) {
        const sr = new SpeechRecognitionAPI();
        sr.continuous = true;
        sr.interimResults = true;
        sr.lang = "en-IN";
        recognition.current = sr;

        sr.onresult = (e: SpeechRecognitionEvent) => {
          // Only process newly-arrived results using resultIndex.
          // Collect new final segments and append once to our accumulated ref.
          let newFinal = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
              newFinal += e.results[i][0].transcript + " ";
            }
          }
          if (newFinal) {
            finalizedText.current += newFinal;
          }

          // Build live display: finalized sentences + current interim word(s)
          let interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            if (!e.results[i].isFinal) {
              interim += e.results[i][0].transcript;
            }
          }

          setTranscript((finalizedText.current + interim).trim());
        };

        sr.onerror = () => { /* non-fatal — recording keeps going */ };
        sr.start();
      }
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
    recognition.current?.stop();
    mediaRecorder.current?.stop();
    setIsRecording(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    setAudioBlob(null);
    setTranscript("");
    setDurationSec(0);
    setError(null);
    chunks.current = [];
    finalizedText.current = "";
  }, [stop]);

  return { isRecording, audioBlob, transcript, durationSec, error, supportsTranscription, start, stop, clear };
}
