import type { Provider, ChartType } from "../types";

function get<T>(store: Storage, key: string, fallback: T): T {
  try {
    const v = store.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

function put<T>(store: Storage, key: string, val: T) {
  try { store.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}

function drop(store: Storage, key: string) {
  try { store.removeItem(key); } catch { /* ignore */ }
}

export const local = {
  getProvider: (): Provider => {
    const saved = get<unknown>(localStorage, "dip:provider", "openrouter");
    return ["sarvam", "openrouter", "gemini", "groq"].includes(String(saved))
      ? saved as Provider
      : "openrouter";
  },
  setProvider: (p: Provider) => put(localStorage, "dip:provider", p),
  getChart: () => get<any>(localStorage, "dip:chart", "bar"),
  setChart: (c: any) => put(localStorage, "dip:chart", c),
  getSystem: () => get<string>(localStorage, "dip:system", ""),
  setSystem: (s: string) => put(localStorage, "dip:system", s),
  saveKey: (provider: string, value: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(`llm_key_${provider}`, value);
    }
  },
  getKey: (provider: string): string => {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem(`llm_key_${provider}`) || "";
    }
    return "";
  },
  clearKey: (provider: string) => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(`llm_key_${provider}`);
    }
  },
};

export const session = {
  getPrompt: () => get<string>(sessionStorage, "dip:prompt", ""),
  setPrompt: (p: string) => put(sessionStorage, "dip:prompt", p),

  getOutputA: () => get<string>(sessionStorage, "dip:outA", ""),
  setOutputA: (v: string) => put(sessionStorage, "dip:outA", v),

  getOutputB: () => get<string>(sessionStorage, "dip:outB", ""),
  setOutputB: (v: string) => put(sessionStorage, "dip:outB", v),
};
