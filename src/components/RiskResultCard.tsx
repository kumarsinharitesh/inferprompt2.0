import React from "react";
import type { ModelRiskResult, TransactionData } from "../types";
import { PROVIDER_META } from "../services/providerFactory";

interface Props {
    result: ModelRiskResult | { provider: string; status: "analyzing" };
    tx?: TransactionData;
    allResults?: ModelRiskResult[];
}

const RiskResultCard: React.FC<Props> = ({ result, tx, allResults }) => {
    const meta = PROVIDER_META.find((p) => p.id === result.provider);
    const label = meta ? meta.label : result.provider;

    // Loading state
    if ("status" in result && result.status === "analyzing") {
        return (
            <div className="rounded-2xl border border-[#1e1e2c] bg-[#0e0e16] p-5 flex flex-col gap-4 animate-pulse">
                <div className="flex items-center justify-between border-b border-[#1e1e2c] pb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-[#1e1e2c]" />
                        <div className="h-4 w-24 bg-[#1e1e2c] rounded" />
                    </div>
                    <div className="flex items-center gap-2">
                        <svg className="animate-spin h-4 w-4 text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span className="text-xs font-medium text-slate-500">Analyzing...</span>
                    </div>
                </div>
            </div>
        );
    }

    // Loaded result state
    const r = result as ModelRiskResult;
    const isError = !!r.error;

    return (
        <div className={`rounded-2xl border bg-[#0e0e16] p-5 flex flex-col gap-5 transition-colors ${isError ? "border-red-500/30" : "border-[#1e1e2c]"
            }`}>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#1e1e2c] pb-4">
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded flex items-center justify-center font-bold text-sm ${isError ? "bg-red-500/10 text-red-400" : "bg-[#1e1e2c] text-slate-300"}`}>
                        {label.charAt(0)}
                    </div>
                    <h3 className="text-base font-semibold text-slate-200 flex items-center gap-2">
                        {label}
                    </h3>
                </div>
                {r.latencyMs !== undefined && !isError && (
                    <span className="text-xs text-slate-500 font-medium">
                        {r.latencyMs}ms latency
                    </span>
                )}
            </div>

            {isError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex flex-col gap-2">
                    <div className="flex items-center gap-2 text-red-400">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        <span className="text-sm font-semibold">Analysis Failed</span>
                    </div>
                    <p className="text-xs text-red-300/80 leading-relaxed font-mono overflow-auto">{r.error}</p>
                </div>
            ) : (
                <>
                    {/* Key Metrics */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-3 flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Model Risk Score</span>
                            <span className="text-2xl font-bold text-amber-400">{r.riskScore}<span className="text-base text-amber-400/50">/100</span></span>
                        </div>

                        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-3 flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Risk Level</span>
                            <span className={`text-lg font-bold mt-1 ${r.riskLevel === "LOW" ? "text-emerald-400" :
                                r.riskLevel === "MEDIUM" ? "text-yellow-400" :
                                    r.riskLevel === "HIGH" ? "text-orange-400" :
                                        "text-red-500"
                                }`}>{r.riskLevel}</span>
                        </div>

                        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-3 flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Recommendation</span>
                            <span className="text-lg font-bold text-slate-200 mt-1">{r.recommendation}</span>
                        </div>

                        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-3 flex flex-col gap-1">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Confidence</span>
                            <span className="text-lg font-bold text-slate-400 mt-1">{r.confidence}%</span>
                        </div>
                    </div>

                    {/* Reasoning */}
                    <div className="flex flex-col gap-2">
                        <h4 className="text-xs font-semibold text-slate-400">Model Reasoning</h4>
                        <p className="text-sm text-slate-300 leading-relaxed bg-[#12121a] rounded-xl p-3 border border-[#1e1e2c]">
                            {r.reasoning}
                        </p>
                    </div>

                    {/* Risk Factors */}
                    {r.riskFactors && r.riskFactors.length > 0 && (
                        <div className="flex flex-col gap-2">
                            <h4 className="text-xs font-semibold text-slate-400 border-b border-[#1e1e2c] pb-2">Identified Flags</h4>
                            <div className="flex flex-col gap-2 pt-1">
                                {r.riskFactors.map((factor, i) => {
                                    const overlaps = allResults?.filter(other =>
                                        other.provider !== r.provider &&
                                        !other.error &&
                                        other.riskFactors?.some(f =>
                                            f.evidence === factor.evidence ||
                                            (f.fieldRefs && factor.fieldRefs && f.fieldRefs.some(ref => factor.fieldRefs!.includes(ref)))
                                        )
                                    );
                                    const hasConsensus = overlaps && overlaps.length > 0;

                                    return (
                                        <div key={i} className="flex flex-col gap-1 bg-[#12121a] rounded border border-[#1e1e2c] p-3">
                                            <div className="flex items-center gap-2">
                                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${factor.severity === "LOW" ? "bg-emerald-500/10 text-emerald-400" :
                                                    factor.severity === "MEDIUM" ? "bg-yellow-500/10 text-yellow-400" :
                                                        factor.severity === "HIGH" ? "bg-orange-500/10 text-orange-400" :
                                                            "bg-red-500/10 text-red-500"
                                                    }`}>
                                                    {factor.severity}
                                                </span>
                                                <span className="text-sm font-semibold text-slate-200">{factor.name}</span>
                                                {hasConsensus && (
                                                    <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider font-bold ml-auto flex items-center gap-1" title="Another active model cited this exact evidence">
                                                        Consensus <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 leading-snug">{factor.description}</p>
                                            <p className="text-xs text-amber-500/70 font-mono mt-1 pt-1 border-t border-[#1e1e2c]/50 truncate">
                                                Evidence: {factor.evidence}
                                            </p>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )}
                    {/* Payment Context Visuals */}
                    {tx && tx.merchantName && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-[#1e1e2c]">
                            <h4 className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Transaction Highlights</h4>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[#12121a] p-3 rounded-lg border border-[#1e1e2c]">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-slate-500">Merchant</span>
                                    <span className="text-xs font-medium text-slate-300">{tx.merchantName}</span>
                                </div>
                                {tx.merchantVerification && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500">Verification</span>
                                        <span className={`text-xs font-bold ${tx.merchantVerification === "VERIFIED" ? "text-emerald-400" : tx.merchantVerification === "UNVERIFIED" ? "text-amber-400" : "text-slate-400"}`}>{tx.merchantVerification}</span>
                                    </div>
                                )}
                                {tx.mccCode && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500">MCC</span>
                                        <span className="text-xs font-mono text-slate-300">{tx.mccCode}</span>
                                    </div>
                                )}
                                {tx.paymentMethod && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500">Payment</span>
                                        <span className="text-xs font-medium text-slate-300">{tx.paymentMethod}</span>
                                    </div>
                                )}
                                {tx.paymentMethod === "CARD" && tx.cardDetails?.threeDS && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500">3DS</span>
                                        <span className={`text-xs font-bold ${tx.cardDetails.threeDS === "VERIFIED" ? "text-emerald-400" : tx.cardDetails.threeDS === "FAILED" ? "text-red-400" : "text-slate-400"}`}>{tx.cardDetails.threeDS}</span>
                                    </div>
                                )}
                                {tx.paymentVerification && (
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500">Payment Verification</span>
                                        <span className={`text-xs font-bold ${tx.paymentVerification === "VERIFIED" ? "text-emerald-400" : tx.paymentVerification === "FAILED" ? "text-red-400" : "text-slate-400"}`}>{tx.paymentVerification}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default RiskResultCard;
