import React, { useState } from "react";
import type { ModelRiskResult, ModelReasoningComparison, Provider } from "../types";
import { generateModelPairs } from "../utils/modelPairing";
import { PROVIDER_META } from "../services/providerFactory";

interface Props {
    successfulModels: ModelRiskResult[];
    precalculatedPairs?: ModelReasoningComparison[];
}

const tokenClass = {
    equal: "text-slate-300",
    insert: "bg-emerald-900/40 text-emerald-300 rounded px-0.5",
    delete: "bg-red-900/40 text-red-400 rounded px-0.5 line-through",
} as const;

const DiffPanel: React.FC<{ label: string; tokens: ModelReasoningComparison["diffTokensA"] }> = ({ label, tokens }) => (
    <div className="flex flex-col gap-2 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
        <div
            className="min-h-[220px] max-h-[400px] overflow-y-auto rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4
                 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words"
        >
            {(tokens || []).map((t, i) => (
                <span key={i} className={tokenClass[t.type]}>{t.text} </span>
            ))}
        </div>
    </div>
);

const RiskABTDComparison: React.FC<Props> = ({ successfulModels, precalculatedPairs }) => {
    const providers = successfulModels.map(m => m.provider);

    // Use precalculated pairs if provided, else fallback silently (prevents duplicates).
    const pairs = precalculatedPairs || generateModelPairs(successfulModels);

    const [activePairKey, setActivePairKey] = useState<string | null>(pairs.length > 0 ? `${pairs[0].providerA}-${pairs[0].providerB}` : null);

    if (successfulModels.length === 0) {
        return (
            <div className="bg-[#0e0e16] border border-[#1e1e2c] p-6 rounded-2xl text-center">
                <p className="text-sm font-medium text-slate-400">No model reasoning available.</p>
            </div>
        );
    }

    if (successfulModels.length === 1) {
        return (
            <div className="bg-[#0e0e16] border border-[#1e1e2c] p-6 rounded-2xl text-center">
                <p className="text-sm font-medium text-slate-400">At least two successful models are required for ABTD comparison.</p>
            </div>
        );
    }

    // Create Matrix structure
    const getSim = (a: Provider, b: Provider) => {
        if (a === b) return "—";
        const pair = pairs.find(p => (p.providerA === a && p.providerB === b) || (p.providerA === b && p.providerB === a));
        return pair ? `${pair.similarityPct}%` : "N/A";
    };

    const getProviderLabel = (id: Provider) => PROVIDER_META.find(p => p.id === id)?.label || id;
    const activePair = pairs.find(p => `${p.providerA}-${p.providerB}` === activePairKey);

    return (
        <div className="flex flex-col gap-6 bg-[#0e0e16] border border-[#1e1e2c] p-6 rounded-2xl">

            {/* 1. Matrix Overview */}
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-300">Similarity Matrix</h3>
                <div className="overflow-x-auto rounded-xl border border-[#1e1e2c] bg-[#12121a]">
                    <table className="w-full text-center border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-[#1e1e2c] bg-[#0e0e16]">
                                <th className="py-2.5 px-3 border-r border-[#1e1e2c]"></th>
                                {providers.map(p => (
                                    <th key={p} className="py-2.5 px-3 font-semibold text-slate-400">{getProviderLabel(p)}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e2c]/50">
                            {providers.map(p1 => (
                                <tr key={p1} className="text-slate-300">
                                    <td className="py-2.5 px-3 font-semibold text-slate-400 border-r border-[#1e1e2c] text-left">{getProviderLabel(p1)}</td>
                                    {providers.map(p2 => (
                                        <td key={p2} className="py-2.5 px-3 font-medium text-amber-500">{getSim(p1, p2)}</td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* 2. Side-By-Side Selector */}
            {pairs.length > 0 && activePair && (
                <div className="flex flex-col gap-4 mt-4 pt-4 border-t border-[#1e1e2c]">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-slate-300">Detailed Reasoning Comparison</h3>
                        <select
                            className="bg-[#12121a] border border-[#1e1e2c] rounded px-3 py-1.5 text-sm font-medium text-slate-300 outline-none"
                            value={activePairKey!}
                            onChange={(e) => setActivePairKey(e.target.value)}
                        >
                            {pairs.map(p => (
                                <option key={`${p.providerA}-${p.providerB}`} value={`${p.providerA}-${p.providerB}`}>
                                    {getProviderLabel(p.providerA)} vs {getProviderLabel(p.providerB)}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-center justify-center p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                        <span className="text-sm font-medium text-indigo-300">
                            Similarity: <span className="font-bold text-white">{activePair.similarityPct}%</span>
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <DiffPanel label={getProviderLabel(activePair.providerA)} tokens={activePair.diffTokensA} />
                        <DiffPanel label={getProviderLabel(activePair.providerB)} tokens={activePair.diffTokensB} />
                    </div>
                </div>
            )}

        </div>
    );
};

export default RiskABTDComparison;
