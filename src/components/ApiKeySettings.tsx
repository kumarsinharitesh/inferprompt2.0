import React, { useState } from "react";
import { local } from "../utils/storage";
import { PROVIDER_META } from "../services/providerFactory";
import { validateApiKey, redactKey } from "../utils/security";
import toast from "react-hot-toast";
import { useProviderAvailability } from "../hooks/useProviderAvailability";
import type { Provider } from "../types";

interface Props {
  onClose: () => void;
}

const KeyRow: React.FC<{ id: Provider; label: string; hint: string; platformKeyReady: boolean }> = ({
  id, label, hint, platformKeyReady,
}) => {
  const stored = local.getKey(id) || "";
  const [val, setVal] = useState("");
  const [show, setShow] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validErr, setValidErr] = useState<string | null>(null);

  const hasPersonalKey = stored.length > 0;
  const isActive = hasPersonalKey || platformKeyReady;

  const save = () => {
    if (val.trim()) {
      const check = validateApiKey(val);
      if (!check.ok) { setValidErr(check.reason ?? "Invalid key."); return; }
      local.saveKey(id, val.trim());
      toast.success(`${label} Key saved successfully`);
    } else {
      local.clearKey(id);
      toast.success(`${label} Key removed`);
    }
    setValidErr(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const clear = () => {
    local.clearKey(id);
    setVal("");
    setValidErr(null);
    toast.success(`${label} Key removed`);
  };

  return (
    <div className="flex flex-col gap-2 py-4 border-b border-[#1e1e2c] last:border-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-[#3a3a4a]"}`} />
          <span className="text-sm font-semibold text-slate-200">{label}</span>
        </div>
        {platformKeyReady && !hasPersonalKey && (
          <span className="text-[10px] bg-[#1a2a1a] text-emerald-400 border border-emerald-900 px-2 py-0.5 rounded-md">
            platform key ready
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{hint}</p>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={show ? "text" : "password"}
            value={val}
            onChange={e => { setVal(e.target.value); setValidErr(null); }}
            placeholder={stored ? redactKey(stored) : (platformKeyReady ? "Optional personal override…" : "Paste your API key…")}
            onKeyDown={e => e.key === "Enter" && save()}
            className={`w-full bg-[#0e0e16] border rounded-lg px-3 py-2 text-sm
                       text-slate-200 placeholder-slate-600 font-mono
                       focus:ring-1 transition-all ${validErr
                ? "border-red-600 focus:border-red-500 focus:ring-red-500/30"
                : "border-[#2a2a38] focus:border-amber-500/60 focus:ring-amber-500/30"
              }`}
          />
          <button
            type="button"
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
            aria-label={show ? "Hide key" : "Show key"}
          >
            {show ? "hide" : "show"}
          </button>
        </div>
        <button
          onClick={save}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${saved
            ? "bg-emerald-900/40 text-emerald-400 border border-emerald-800"
            : "bg-amber-500 hover:bg-amber-400 text-black"
            }`}
        >
          {saved ? "✓" : "Save"}
        </button>
        {stored && (
          <button
            onClick={clear}
            className="px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 border border-[#2a2a38] hover:border-red-900 transition-all"
          >
            Clear
          </button>
        )}
      </div>
      {validErr && (
        <p role="alert" className="text-xs text-red-400 px-0.5">{validErr}</p>
      )}
    </div>
  );
};

const ApiKeySettings: React.FC<Props> = ({ onClose }) => {
  const keyed = PROVIDER_META.filter(p => p.requiresKey);
  const platformAvailability = useProviderAvailability();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="API Key Settings"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-[#12121a] border border-[#2a2a38] rounded-2xl shadow-2xl animate-modal">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2c]">
          <div>
            <h2 className="text-base font-semibold text-slate-100">API Keys</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Platform keys are configured securely on the server. Add a personal key only when you want to override one.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 text-xl leading-none transition-colors"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="px-6 max-h-[70vh] overflow-y-auto">
          {keyed.map(p => (
            <KeyRow
              key={p.id}
              id={p.id}
              label={p.label}
              hint={p.description}
              platformKeyReady={platformAvailability[p.id]}
            />
          ))}
        </div>
        <div className="px-6 py-4 border-t border-[#1e1e2c]">
          <p className="text-[11px] text-slate-600">
            Personal keys stay in browser storage and override the platform key only for your requests.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiKeySettings;
