import React from "react";
import type { Provider } from "../types";
import { PROVIDER_META } from "../services/providerFactory";
import { local } from "../utils/storage";
import { useProviderAvailability } from "../hooks/useProviderAvailability";

interface Props {
    selected: Provider[];
    onChange: (models: Provider[]) => void;
}

const MAX_MODELS = 4;

const RiskModelSelector: React.FC<Props> = ({ selected, onChange }) => {
    const platformAvailability = useProviderAvailability();
    const toggle = (id: Provider) => {
        if (!selected.includes(id) && selected.length >= MAX_MODELS) return; // cap at 4
        onChange(
            selected.includes(id)
                ? selected.filter((p) => p !== id)
                : [...selected, id]
        );
    };

    const count = selected.length;
    const atMax = count >= MAX_MODELS;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-300">Select AI Models</p>
                <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${count > 0
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-[#1e1e2c] text-slate-500"
                        }`}
                >
                    {count === 0 ? "None selected" : `${count} / ${MAX_MODELS} models selected`}
                </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROVIDER_META.map((meta) => {
                    const isChecked = selected.includes(meta.id);
                    const hasPersonalKey = local.getKey(meta.id).length > 0;
                    const hasPlatformKey = platformAvailability[meta.id];
                    return (
                        <label
                            key={meta.id}
                            htmlFor={`model-${meta.id}`}
                            className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${!isChecked && atMax
                                    ? "border-[#1e1e2c] bg-[#0e0e16] opacity-40 cursor-not-allowed"
                                    : isChecked
                                        ? "border-amber-500/40 bg-amber-500/5 cursor-pointer"
                                        : "border-[#1e1e2c] bg-[#0e0e16] hover:border-[#2a2a38] hover:bg-[#13131a] cursor-pointer"
                                }`}
                        >
                            <div className="mt-0.5 shrink-0">
                                <div
                                    className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isChecked ? "bg-amber-500 border-amber-500" : "border-[#3a3a48] bg-[#12121a]"
                                        }`}
                                >
                                    {isChecked && (
                                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                            <path d="M1 3.5L3.5 6L8 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                </div>
                            </div>
                            <input
                                type="checkbox"
                                id={`model-${meta.id}`}
                                checked={isChecked}
                                onChange={() => toggle(meta.id)}
                                className="sr-only"
                            />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-200 leading-tight">{meta.label}</p>
                                <p className="text-xs text-slate-500 mt-0.5 leading-snug">{meta.description}</p>
                                {meta.requiresKey && (
                                    hasPersonalKey || hasPlatformKey ? (
                                        <p className="flex items-center gap-1 text-[10px] text-emerald-500/80 mt-1 font-medium">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                            {hasPersonalKey ? "Personal API key active" : "Platform key ready"}
                                        </p>
                                    ) : (
                                        <p className="text-[10px] text-amber-600/70 mt-1">Optional: add your own key in Keys</p>
                                    )
                                )}
                            </div>
                        </label>
                    );
                })}
            </div>
        </div>
    );
};

export default RiskModelSelector;
