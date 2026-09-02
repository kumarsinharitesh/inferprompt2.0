import React, { useState, useRef } from "react";
import type { TransactionData, Provider, RiskAnalysisRequest, ModelRiskResult, PlatformRiskResult } from "../types";
import RiskTransactionForm from "../components/RiskTransactionForm";
import RiskModelSelector from "../components/RiskModelSelector";
import RiskResultCard from "../components/RiskResultCard";
import { validateRiskRequest } from "../utils/riskValidation";
import RiskConsensusDashboard from "../components/RiskConsensusDashboard";
import RiskABTDComparison from "../components/RiskABTDComparison";
import type { ConsensusResult, ModelReasoningComparison } from "../types";
import { useAuth } from "../context/AuthContext";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { local } from "../utils/storage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AnalyzeState = "idle" | "running" | "invalid";

type PendingResult = { provider: Provider; status: "analyzing" };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RiskAnalyzerPage: React.FC = () => {
    const isEvaluatingRef = useRef(false);
    const activeRunId = useRef<number>(0);

    const { credits, setCredits, isAuthenticated } = useAuth();

    const [transaction, setTransaction] = useState<Partial<TransactionData>>({
        amount: 14500,
        currency: "INR",
        country: "India",
        merchantName: "Example Merchant",
        mccCode: "5411",
        deviceType: "Mobile",
        isNewDevice: false,
        failedAttempts: 0,
        previousTransactionCount: 0,
    });
    const [selectedModels, setSelectedModels] = useState<Provider[]>(["sarvam", "openrouter"]);
    const [analyzeState, setAnalyzeState] = useState<AnalyzeState>("idle");
    const [errors, setErrors] = useState<Array<{ field: string; message: string }>>([]);

    // Store results sequentially as they complete, and tracking active ones.
    const [results, setResults] = useState<Record<Provider, ModelRiskResult | PendingResult>>({} as Record<Provider, ModelRiskResult | PendingResult>);

    // Platform risk state computed instantly
    const [platformResult, setPlatformResult] = useState<PlatformRiskResult | null>(null);

    // Multi-LLM Consensus computed when analysis finishes
    const [consensusResult, setConsensusResult] = useState<ConsensusResult | null>(null);

    // Multi-LLM ABTD comparisons
    const [reasoningComparisons, setReasoningComparisons] = useState<ModelReasoningComparison[]>([]);

    const handleAnalyze = async () => {
        if (isEvaluatingRef.current) return;

        const req: RiskAnalysisRequest = { transaction: transaction as TransactionData, selectedModels };
        const validationErrors = validateRiskRequest(req);

        if (validationErrors.length > 0) {
            setErrors(validationErrors);
            setAnalyzeState("invalid");
            return;
        }

        isEvaluatingRef.current = true;
        const currentRunId = Date.now();
        activeRunId.current = currentRunId;
        const idempotencyKey = crypto.randomUUID();

        let loadingToastId: string | undefined;

        try {
            if (!isAuthenticated) {
                toast.error("Please sign in to run Risk Analysis.");
                return;
            }

            loadingToastId = toast.loading("Executing Evidence-Grounded Analysis Engine...");

            setErrors([]);
            setAnalyzeState("running");
            setPlatformResult(null);
            setConsensusResult(null);
            setReasoningComparisons([]);

            const initialResults = {} as Record<Provider, PendingResult>;
            selectedModels.forEach(p => initialResults[p] = { provider: p, status: "analyzing" });
            setResults(initialResults);

            const apiUrl = "";

            const customKeys: Record<string, string> = {};
            selectedModels.forEach(provider => {
                const k = local.getKey(provider);
                if (k) customKeys[provider] = k;
            });

            const response = await fetch(`${apiUrl}/api/risk/analyze`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                    transaction: req.transaction,
                    selectedModels: req.selectedModels,
                    idempotencyKey,
                    customKeys
                })
            });

            if (!response.ok) {
                const errJson = await response.json().catch(() => ({}));
                toast.error(`Analysis declined: ${errJson.error || "Unknown Error"}`, { id: loadingToastId });
                setAnalyzeState("invalid");
                return;
            }

            // Deduct locally visually on successful submission lock!
            setCredits(Math.max(0, credits - 1));

            // Stream Reader
            const reader = response.body?.getReader();
            if (!reader) throw new Error("Stream not supported.");

            const decoder = new TextDecoder();
            let buffer = "";
            let _platformResult: PlatformRiskResult | null = null;
            const _modelResults: Record<string, any> = {};
            let _consensusResult: ConsensusResult | null = null;
            let _reasoningComparisons: ModelReasoningComparison[] = [];

            const processSseBlock = (block: string) => {
                const eventMatch = block.match(/^event:\s*(.+)$/m);
                const dataLines = block.match(/^data:\s?(.*)$/gm);
                if (!eventMatch || !dataLines) return;

                let dataValue: any;
                try {
                    dataValue = JSON.parse(dataLines.map(line => line.replace(/^data:\s?/, "")).join("\n"));
                } catch {
                    throw new Error("Received a malformed response from the analysis service.");
                }

                const eventName = eventMatch[1].trim();
                if (eventName === "platform_result") {
                    _platformResult = dataValue;
                    setPlatformResult(dataValue);
                } else if (eventName === "model_started") {
                    setResults(prev => ({ ...prev, [dataValue.provider]: { provider: dataValue.provider, status: "analyzing" } }));
                } else if (eventName === "model_completed") {
                    _modelResults[dataValue.provider] = dataValue.result;
                    setResults(prev => ({ ...prev, [dataValue.provider]: dataValue.result }));
                } else if (eventName === "model_failed") {
                    _modelResults[dataValue.provider] = { provider: dataValue.provider, error: dataValue.error };
                    setResults(prev => ({ ...prev, [dataValue.provider]: { provider: dataValue.provider, error: dataValue.error } }));
                } else if (eventName === "insufficient_models") {
                    // Quorum gate fired — credit was refunded server-side, restore UI credit and clear all results
                    setCredits(credits); // Restore the optimistic deduction (credit was refunded server-side)
                    setResults({} as Record<Provider, ModelRiskResult | PendingResult>);
                    setPlatformResult(null);
                    setConsensusResult(null);
                    toast.error(dataValue.message || "Insufficient model responses. Credit refunded.", { id: loadingToastId, duration: 8000 });
                } else if (eventName === "consensus_unavailable") {
                    toast(dataValue.message || "AI consensus is unavailable; the platform decision remains available.", { id: loadingToastId, icon: "info", duration: 7000 });
                } else if (eventName === "consensus") {
                    _consensusResult = dataValue;
                    setConsensusResult(dataValue);
                } else if (eventName === "abtd") {
                    _reasoningComparisons = dataValue.reasoningComparisons;
                    setReasoningComparisons(dataValue.reasoningComparisons);
                } else if (eventName === "analysis_complete") {
                    toast.success("Risk analysis complete!", { id: loadingToastId });
                } else if (eventName === "error") {
                    throw new Error(dataValue.message || "Analysis service failed.");
                }
            };

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
                const blocks = buffer.split("\n\n");
                buffer = blocks.pop() || "";
                blocks.forEach(processSseBlock);
            }

            buffer += decoder.decode().replace(/\r\n/g, "\n");
            if (buffer.trim()) processSseBlock(buffer);

            setAnalyzeState("idle");
        } catch (e) {
            const message = e instanceof Error ? e.message : "Analysis encountered an error.";
            toast.error(message, { id: loadingToastId });
        } finally {
            if (activeRunId.current === currentRunId) {
                isEvaluatingRef.current = false;
                setAnalyzeState("idle");
            }
        }
    };

    const handleTransactionChange = (data: Partial<TransactionData>) => {
        setTransaction(data);
        if (analyzeState === "invalid") {
            setAnalyzeState("idle");
            setErrors([]);
        }
        if (platformResult) {
            setPlatformResult(null);
            setConsensusResult(null);
            setReasoningComparisons([]);
        }
    };

    const activeResults = Object.values(results);

    return (
        <div className="w-full max-w-[1700px] mx-auto grid grid-cols-1 xl:grid-cols-12 gap-5 sm:gap-6 lg:gap-10 pb-20">

            {/* ------------------------------------------------------------- */}
            {/* LEFT COLUMN: Inputs & Controls (Sticky on Desktop)            */}
            {/* ------------------------------------------------------------- */}
            <div className="xl:col-span-4 flex flex-col gap-6 xl:sticky xl:top-[6rem] xl:h-[calc(100vh-8rem)] xl:overflow-y-auto pr-1 custom-scrollbar">

                {/* Header */}
                <div className="pb-2 border-b border-[#1e1e2c]">
                    <h1 className="text-3xl font-black text-slate-100 tracking-tight">Risk Analyzer</h1>
                    <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                        Assess transaction risk dynamically by orchestrating deterministic engine rules alongside multi-LLM consensus pipelines.
                    </p>
                </div>

                {/* Transaction form card */}
                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">Target Payload</span>
                    </div>
                    <div className="rounded-2xl border border-[#1e1e2c] bg-[#12121a] p-5 shadow-lg shadow-black/20">
                        <RiskTransactionForm onChange={handleTransactionChange} />
                    </div>
                </div>

                {/* Model selector card */}
                <div className="flex flex-col gap-3 mt-2">
                    <span className="text-sm font-bold text-slate-200 uppercase tracking-wider">Consensus Engine</span>
                    <div className="rounded-2xl border border-[#1e1e2c] bg-[#12121a] p-5 shadow-lg shadow-black/20">
                        <RiskModelSelector selected={selectedModels} onChange={setSelectedModels} />
                    </div>
                </div>

                {/* Validation errors */}
                {analyzeState === "invalid" && errors.length > 0 && (
                    <div
                        role="alert"
                        className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-4 flex flex-col gap-2 mt-2 shadow-xl shadow-red-900/10"
                    >
                        <p className="text-sm font-bold text-red-500 uppercase tracking-wider">Please fix the following:</p>
                        <ul className="list-disc list-inside space-y-1.5 pl-1">
                            {errors.map((e) => (
                                <li key={e.field} className="text-xs text-red-400 font-medium">{e.message}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Analyze button / Credit Gate */}
                <div className="mt-4 pb-12 xl:pb-4">
                    {credits > 0 ? (
                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={handleAnalyze}
                                disabled={analyzeState === "running"}
                                className={`flex items-center justify-center gap-3 w-full
                                   px-6 py-4 rounded-xl font-black text-lg transition-all focus:outline-none focus:ring-4 focus:ring-amber-500/20 shadow-xl
                                   ${analyzeState === "running"
                                        ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                                        : "bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black shadow-amber-500/20 shadow-[0_0_20px_rgba(47,128,237,0.22)]"
                                    }`}
                            >
                                {analyzeState === "running" ? (
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-slate-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                ) : (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                    </svg>
                                )}
                                {analyzeState === "running" ? "Running Analysis..." : "Execute Global Analysis"}
                            </button>
                            {analyzeState !== "running" && (
                                <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider px-2">
                                    <span className="text-slate-500">Available Credits</span>
                                    <span className="text-amber-500">{credits}</span>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-4 w-full p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-center shadow-lg">
                            <span className="text-sm font-bold text-red-500">You've completely depleted your Risk Analysis credits.</span>
                            <Link
                                to="/billing"
                                className="bg-amber-500 hover:bg-amber-400 text-black font-black px-8 py-3 rounded-xl text-sm transition-all focus:ring-4 focus:ring-amber-500/20 shadow-[0_0_20px_rgba(47,128,237,0.22)]">
                                Buy Credits
                            </Link>
                        </div>
                    )}
                </div>
            </div>

            {/* ------------------------------------------------------------- */}
            {/* RIGHT COLUMN: Dashboard & Insights                            */}
            {/* ------------------------------------------------------------- */}
            <div className="xl:col-span-8 flex flex-col gap-10">

                {!platformResult && analyzeState !== "running" && (
                    <div className="flex flex-col items-center justify-center text-center h-full min-h-[280px] sm:min-h-[420px] border-2 border-dashed border-[#1e1e2c] bg-[#12121a]/30 rounded-3xl p-5 sm:p-10">
                        <div className="p-4 bg-[#1e1e2c]/50 rounded-2xl mb-6">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-400">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                                <path d="M12 8v4" />
                                <path d="M12 16h.01" />
                            </svg>
                        </div>
                        <h3 className="text-xl font-bold text-slate-200 mb-2">Awaiting Target Parameters</h3>
                        <p className="text-slate-500 max-w-sm text-sm leading-relaxed">
                            Configure your transaction payload and spin up one or more AI providers on the left. Press Execute Global Analysis to natively fuse insights into this dashboard.
                        </p>
                    </div>
                )}

                {(platformResult || analyzeState === "running") && (
                    <>
                        {/* 1. Master Risk Score Panel (Deterministic or Synthesized) */}
                        <div className="flex flex-col gap-3">
                            <h2 className="text-xl font-black text-slate-100 flex items-center gap-3 uppercase tracking-widest pl-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                Platform Decision Score
                            </h2>
                            <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-[#0e0e16] to-[#12121a] p-8 shadow-2xl shadow-indigo-900/10">

                                {/* Top Metrics Row */}
                                <div className="flex flex-wrap items-center justify-between gap-10">
                                    <div className="flex items-center gap-10">
                                        <div className="flex flex-col">
                                            <span className="text-xs uppercase font-black tracking-widest text-indigo-400/80 mb-2">Risk Score</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-6xl font-black text-indigo-400 tracking-tighter">
                                                    {analyzeState === "running" ? "--" : platformResult?.score}
                                                </span>
                                                <span className="text-xl font-bold text-indigo-400/30">/ 100</span>
                                            </div>
                                        </div>

                                        <div className="h-20 w-px bg-indigo-500/10 hidden md:block"></div>

                                        <div className="flex flex-col">
                                            <span className="text-xs uppercase font-black tracking-widest text-slate-500 mb-2">Categorical Risk</span>
                                            {analyzeState === "running" ? (
                                                <span className="text-3xl font-black mt-1 text-slate-600 animate-pulse">ANALYZING</span>
                                            ) : (
                                                <span className={`text-4xl font-black tracking-tight ${(consensusResult ? consensusResult.consensusRiskLevel : platformResult?.level) === "LOW" ? "text-emerald-400" :
                                                    (consensusResult ? consensusResult.consensusRiskLevel : platformResult?.level) === "MEDIUM" ? "text-yellow-400" :
                                                        (consensusResult ? consensusResult.consensusRiskLevel : platformResult?.level) === "HIGH" ? "text-orange-400" :
                                                            "text-red-500"
                                                    }`}>
                                                    {platformResult?.level}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex flex-col md:items-end flex-grow">
                                        <span className="text-xs uppercase font-black tracking-widest text-slate-500 mb-2 md:text-right">Platform Action</span>
                                        {analyzeState === "running" ? (
                                            <span className="text-2xl font-black mt-1 text-slate-600 animate-pulse">EVALUATING</span>
                                        ) : (
                                            <span className={`text-2xl font-black mt-1 tracking-wider px-6 py-2 rounded-xl ${platformResult?.recommendation === "ALLOW" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                                platformResult?.recommendation === "BLOCK" ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                                                    "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                                }`}>
                                                {platformResult?.recommendation === "REVIEW" ? "MANUAL REVIEW" : platformResult?.recommendation}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Risk Factors Breakdown */}
                                {platformResult && platformResult.factors.length > 0 && analyzeState !== "running" ? (
                                    <div className="flex flex-col gap-4 pt-8 mt-8 border-t border-indigo-500/10">
                                        <span className="text-xs uppercase font-black tracking-widest text-slate-400 pl-1">Identified Deterministic Flags</span>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {platformResult.factors.map((f, i) => (
                                                <div key={i} className="flex flex-col gap-2 p-4 rounded-xl border border-indigo-500/10 bg-[#0a0a0f] shadow-inner shadow-black/40">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-bold text-slate-200">{f.name}</span>
                                                        <div className="flex items-center gap-2">
                                                          {typeof f.contribution === "number" && <span className="text-[10px] font-mono text-slate-500">+{f.contribution}</span>}
                                                        <span className={`text-[10px] uppercase font-black px-2 py-1 rounded ${f.severity === "LOW" ? "bg-emerald-500/10 text-emerald-400" :
                                                            f.severity === "MEDIUM" ? "bg-yellow-500/10 text-yellow-400" :
                                                                f.severity === "HIGH" ? "bg-orange-500/10 text-orange-400" :
                                                                    "bg-red-500/10 text-red-500"
                                                            }`}>
                                                            {f.severity}
                                                        </span>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-slate-400 leading-relaxed font-medium">{f.description}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : platformResult && platformResult.factors.length === 0 && analyzeState !== "running" ? (
                                    <div className="flex flex-col gap-4 pt-8 mt-8 border-t border-indigo-500/10 text-emerald-500/70 text-sm font-medium">
                                        Passes all deterministic threshold checks flawlessly. No legacy risk boundaries triggered natively.
                                    </div>
                                ) : null}

                                {platformResult && analyzeState !== "running" && ((platformResult.modifiers?.length ?? 0) > 0 || (platformResult.dataQuality?.length ?? 0) > 0) && (
                                    <div className="pt-5 mt-5 border-t border-indigo-500/10 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-[11px] uppercase font-black tracking-widest text-slate-500">Score context</span>
                                            <div className="mt-2 flex flex-col gap-1.5">
                                                {(platformResult.modifiers ?? []).map(modifier => (
                                                    <p key={modifier.name} className="text-xs text-slate-400">
                                                        <span className="font-mono text-emerald-400">{modifier.effect > 0 ? "+" : ""}{modifier.effect}</span> {modifier.reason}
                                                    </p>
                                                ))}
                                                {(platformResult.modifiers?.length ?? 0) === 0 && <p className="text-xs text-slate-500">No contextual score modifiers applied.</p>}
                                            </div>
                                        </div>
                                        <div>
                                            <span className="text-[11px] uppercase font-black tracking-widest text-slate-500">Data quality</span>
                                            <div className="mt-2 flex flex-col gap-1.5">
                                                {(platformResult.dataQuality ?? []).slice(0, 3).map(note => <p key={note} className="text-xs text-slate-400">{note}</p>)}
                                                {(platformResult.dataQuality?.length ?? 0) === 0 && <p className="text-xs text-emerald-400/80">Evidence is internally consistent.</p>}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Consensus Dashboard */}
                        {consensusResult && activeResults.length > 0 && (
                            <div className="flex flex-col gap-3 mt-4">
                                <h2 className="text-xl font-black text-slate-100 flex items-center gap-3 uppercase tracking-widest pl-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    Consensus Analytics
                                </h2>
                                <div className="bg-[#0e0e16] border border-[#1e1e2c] p-1 rounded-3xl shadow-xl">
                                    <RiskConsensusDashboard consensus={consensusResult} models={activeResults as ModelRiskResult[]} />
                                </div>
                            </div>
                        )}

                        {!consensusResult && activeResults.length > 0 && analyzeState === "idle" && (
                            <div className="flex flex-col gap-3 mt-4">
                                <h2 className="text-xl font-black text-slate-100 flex items-center gap-3 uppercase tracking-widest pl-2">
                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                    Consensus Analytics
                                </h2>
                                <div className="bg-[#0e0e16] border border-red-500/20 p-8 rounded-3xl text-center shadow-xl">
                                    <p className="text-sm font-bold text-amber-400">AI consensus is unavailable, so this run is showing the deterministic platform decision. Provider statuses remain available below.</p>
                                </div>
                            </div>
                        )}

                        {/* 3. Grid of Raw Model Feeds */}
                        {activeResults.length > 0 && (
                            <div className="flex flex-col gap-3 mt-4">
                                <h2 className="text-xl font-black text-slate-100 flex items-center gap-3 uppercase tracking-widest pl-2">
                                    <div className="w-2 h-2 rounded-full bg-slate-500"></div>
                                    LLM Execution Streams
                                </h2>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
                                    {activeResults.map((res) => (
                                        <RiskResultCard key={res.provider} result={res} tx={transaction as TransactionData} allResults={activeResults as ModelRiskResult[]} />
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 4. ABTD Reasoning */}
                        {analyzeState === "idle" && activeResults.length > 1 && (
                            <div className="flex flex-col gap-3 mt-4 mb-20">
                                <h2 className="text-xl font-black text-slate-100 flex items-center gap-3 uppercase tracking-widest pl-2">
                                    <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                                    ABTD Comparison Synthesis
                                </h2>
                                <div className="bg-[#0e0e16] border border-[#1e1e2c] p-6 rounded-3xl shadow-xl">
                                    <RiskABTDComparison successfulModels={activeResults.filter(r => !(r as ModelRiskResult).error) as ModelRiskResult[]} precalculatedPairs={reasoningComparisons} />
                                </div>
                            </div>
                        )}
                    </>
                )}

            </div>
        </div>
    );
};

export default RiskAnalyzerPage;
