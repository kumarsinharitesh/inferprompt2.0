const MAX_PROMPT_LEN = 4000;
const MAX_SYSTEM_LEN = 1000;
const MAX_TRANSCRIPT_LEN = 2000;
const MAX_KEY_LEN = 256;

export function stripHtml(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/on\w+\s*=/gi, "");
}

export function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}
export function sanitizePrompt(raw: string): string {
  return cap(stripHtml(raw.trim()), MAX_PROMPT_LEN);
}

export function sanitizeSystem(raw: string): string {
  return cap(stripHtml(raw.trim()), MAX_SYSTEM_LEN);
}

export function sanitizeTranscript(raw: string): string {
  return cap(stripHtml(raw.trim()), MAX_TRANSCRIPT_LEN);
}


export function validateApiKey(key: string): { ok: boolean; reason?: string } {
  const trimmed = key.trim();
  if (!trimmed) return { ok: false, reason: "Key cannot be empty." };
  if (trimmed.length > MAX_KEY_LEN) return { ok: false, reason: `Key too long (max ${MAX_KEY_LEN} chars).` };
  if (/\s/.test(trimmed)) return { ok: false, reason: "Key must not contain whitespace." };
  if (!/^[\x21-\x7E]+$/.test(trimmed)) return { ok: false, reason: "Key must contain only printable ASCII characters." };
  return { ok: true };
}


export function redactKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.min(key.length - 8, 12))}${key.slice(-4)}`;
}


export function createRateLimiter(minIntervalMs: number) {
  let last = 0;
  return (): boolean => {
    const now = Date.now();
    if (now - last < minIntervalMs) return false;
    last = now;
    return true;
  };
}
