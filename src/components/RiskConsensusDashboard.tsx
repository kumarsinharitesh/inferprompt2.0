import React from "react";
import type { ConsensusResult, ModelRiskResult } from "../types";
import { PROVIDER_META } from "../services/providerFactory";

interface Props {
    consensus: ConsensusResult;
    models: ModelRiskResult[];
}

const RiskConsensusDashboard: React.FC<Props> = ({ consensus, models }) => {
    return (
        <div className="flex flex-col gap-6">

            {/* High Level Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Model Consensus</span>
                    <span className={`text-xl font-bold mt-1 ${consensus.consensusRiskLevel === "LOW" ? "text-emerald-400" :
                            consensus.consensusRiskLevel === "MEDIUM" ? "text-yellow-400" :
                                consensus.consensusRiskLevel === "HIGH" ? "text-orange-400" :
                                    "text-red-500"
                        }`}>{consensus.consensusRiskLevel}</span>
                </div>

                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Avg Model Risk</span>
                    <span className="text-xl font-bold text-amber-400 mt-1">{consensus.averageModelRiskScore}</span>
                </div>

                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 hover:text-slate-400 transition-colors" title="Mean absolute deviation from average score normalized to 100">Score Agreement</span>
                    <span className="text-xl font-bold text-slate-200 mt-1">{consensus.modelAgreementPct}%</span>
                </div>

                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Level Agreement</span>
                    <span className="text-xl font-bold text-slate-200 mt-1">{consensus.riskLevelAgreementPct}%</span>
                </div>
            </div>

            {/* Platform vs Model Difference */}
            <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5 flex items-center justify-between">
                <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-slate-300">Platform vs Model Average</h3>
                    <p className="text-xs text-slate-500">Comparing InferPrompt deterministic score to AI consensus.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Platform</span>
                        <span className="text-lg font-bold text-indigo-400">{consensus.platformModelDifference.platformScore}</span>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Model Avg</span>
                        <span className="text-lg font-bold text-amber-400">{consensus.platformModelDifference.modelAverage}</span>
                    </div>
                    <div className="h-8 w-px bg-[#1e1e2c]"></div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Difference</span>
                        <span className={`text-lg font-bold ${consensus.platformModelDifference.difference > 0 ? "text-indigo-400" :
                                consensus.platformModelDifference.difference < 0 ? "text-amber-400" :
                                    "text-slate-400"
                            }`}>
                            {(consensus.platformModelDifference.difference > 0 ? "+" : "") + consensus.platformModelDifference.difference}
                        </span>
                    </div>
                </div>
            </div>

            {/* Comparison Table */}
            <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-slate-300">Model Comparison</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                        <thead>
                            <tr className="border-b border-[#1e1e2c]">
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Model</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Risk Score</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Risk Level</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Confidence</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Recommendation</th>
                                <th className="py-2.5 px-3 font-semibold text-slate-400">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#1e1e2c]/50">
                            {models.map(m => {
                                const mMeta = PROVIDER_META.find(p => p.id === m.provider);
                                const label = mMeta ? mMeta.label : m.provider;
                                return (
                                    <tr key={m.provider} className="text-slate-300 hover:bg-[#1e1e2c]/20 transition-colors">
                                        <td className="py-3 px-3 font-medium">{label}</td>
                                        {m.error ? (
                                            <>
                                                <td className="py-3 px-3 text-slate-600">—</td>
                                                <td className="py-3 px-3 text-slate-600">—</td>
                                                <td className="py-3 px-3 text-slate-600">—</td>
                                                <td className="py-3 px-3 text-slate-600">—</td>
                                                <td className="py-3 px-3 text-red-500 font-semibold text-xs tracking-wide">ERROR</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="py-3 px-3 text-amber-500 font-bold">{m.riskScore}</td>
                                                <td className={`py-3 px-3 font-bold ${m.riskLevel === "LOW" ? "text-emerald-400" :
                                                        m.riskLevel === "MEDIUM" ? "text-yellow-400" :
                                                            m.riskLevel === "HIGH" ? "text-orange-400" :
                                                                "text-red-500"
                                                    }`}>{m.riskLevel}</td>
                                                <td className="py-3 px-3">{m.confidence}%</td>
                                                <td className="py-3 px-3">{m.recommendation}</td>
                                                <td className="py-3 px-3">
                                                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400">
                                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                                                    </span>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Factor Agreement UI */}
            <div className="flex flex-col gap-4 pt-4 border-t border-[#1e1e2c]">
                <h3 className="text-sm font-semibold text-slate-300">Factor Agreement</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="flex flex-col gap-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Common Risk Factors</h4>
                        {consensus.factorAgreement.common.length === 0 ? (
                            <p className="text-xs text-slate-500 bg-[#12121a] p-3 rounded-lg border border-[#1e1e2c]">No overlapping factors found across models.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {consensus.factorAgreement.common.map((fc, i) => (
                                    <li key={i} className="bg-[#12121a] p-3 rounded-lg border border-[#1e1e2c] flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <svg className="text-emerald-500" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                                            <span className="text-sm text-slate-200 font-medium">{fc.name}</span>
                                        </div>
                                        <span className="text-xs text-slate-400 font-medium">{fc.modelCount}/{consensus.successfulModelCount} models</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="flex flex-col gap-3">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Model-Specific</h4>
                        {consensus.factorAgreement.modelSpecific.length === 0 ? (
                            <p className="text-xs text-slate-500 bg-[#12121a] p-3 rounded-lg border border-[#1e1e2c]">No model-specific outlier factors.</p>
                        ) : (
                            <ul className="flex flex-col gap-2">
                                {consensus.factorAgreement.modelSpecific.map((fc, i) => (
                                    <li key={i} className="bg-[#12121a] p-3 rounded-lg border border-[#1e1e2c] flex flex-col gap-1.5">
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm text-slate-300 font-medium">{fc.name}</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {fc.models.map(pid => {
                                                const modelName = PROVIDER_META.find(p => p.id === pid)?.label || pid;
                                                return (
                                                    <span key={pid} className="text-[10px] font-bold bg-[#1e1e2c] text-slate-400 px-1.5 py-0.5 rounded">
                                                        {modelName}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default RiskConsensusDashboard;
