import React from "react";
import type { Provider } from "../types";
import { PROVIDER_META } from "../services/providerFactory";
import { local } from "../utils/storage";
import { useProviderAvailability } from "../hooks/useProviderAvailability";

interface Props {
  value: Provider;
  onChange: (p: Provider) => void;
}

const ProviderSelector: React.FC<Props> = ({ value, onChange }) => {
  const platformAvailability = useProviderAvailability();

  const keyStatus = (providerId: Provider) => {
    if (local.getKey(providerId).length > 0) return "personal";
    return platformAvailability[providerId] ? "platform" : "missing";
  };

  const pick = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const p = e.target.value as Provider;
    local.setProvider(p);
    onChange(p);
  };

  const current = PROVIDER_META.find(m => m.id === value);

  return (
    <div className="flex flex-col gap-3">
      <label htmlFor="provider-select" className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        Provider
      </label>
      <div className="relative">
        <select
          id="provider-select"
          value={value}
          onChange={pick}
          className="w-full appearance-none bg-[#0e0e16] border border-[#2a2a38] rounded-xl
                     px-3 py-2.5 pr-8 text-sm text-slate-200 cursor-pointer
                     focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 transition-all"
        >
          {PROVIDER_META.map(p => (
            <option key={p.id} value={p.id}>
              {p.label}
              {p.requiresKey && keyStatus(p.id) === "missing" ? " (add key)" : ""}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500"
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>

      {current && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          {current.requiresKey && <span className={`w-1.5 h-1.5 rounded-full ${keyStatus(current.id) === "missing" ? "bg-slate-600" : "bg-emerald-400"}`} />}
          <span>{current.description} {current.requiresKey && (keyStatus(current.id) === "platform" ? "• Platform key ready" : keyStatus(current.id) === "personal" ? "• Personal key active" : "• Add a personal key in Keys")}</span>
        </div>
      )}
    </div>
  );
};

export default ProviderSelector;
