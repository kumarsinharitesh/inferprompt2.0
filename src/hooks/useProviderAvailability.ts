import { useEffect, useState } from "react";
import type { Provider } from "../types";

export type ProviderAvailability = Record<Provider, boolean>;

const unavailable: ProviderAvailability = {
  sarvam: false,
  openrouter: false,
  gemini: false,
  groq: false,
};

/** Reads only boolean availability flags; API-key values never leave the server. */
export function useProviderAvailability(): ProviderAvailability {
  const [availability, setAvailability] = useState<ProviderAvailability>(unavailable);

  useEffect(() => {
    let active = true;
    fetch("/api/inference/providers", { credentials: "include" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (active && data?.providers) {
          setAvailability({ ...unavailable, ...data.providers });
        }
      })
      .catch(() => { /* Keep the UI usable if the availability check is offline. */ });
    return () => { active = false; };
  }, []);

  return availability;
}
