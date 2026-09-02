import React, { useState } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import type { ChartType, SessionRecord } from "../types";
import { local } from "../utils/storage";
import type { RiskAnalysisResult } from "../types";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";
// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartRow {
  name: string;
  provider: string;
  tokens: number;
  tps: number;
  latency: number; // seconds
}

const LIVE_PROVIDERS = new Set(["sarvam", "openrouter", "gemini", "groq"]);

/** Convert an API field into a usable positive measurement, never a placeholder. */
function positiveNumber(value: unknown): number | null {
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

/**
 * Analytics owns this boundary: only a complete, persisted Playground stream
 * can become a chart row. This prevents legacy/partial data from Diff or Risk
 * Analysis being interpreted as inference throughput.
 */
function mapCompletedPlaygroundSessions(data: unknown): SessionRecord[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((item): SessionRecord[] => {
    if (!item || typeof item !== "object") return [];
    const session = item as Record<string, unknown>;
    const provider = typeof session.provider === "string" ? session.provider : "";
    const id = typeof session._id === "string"
      ? session._id
      : typeof session.sessionId === "string" ? session.sessionId : "";
    const tokenCount = positiveNumber(session.totalTokens);
    const latencyMs = positiveNumber(session.latencyMs);
    const timestamp = typeof session.createdAt === "string" ? Date.parse(session.createdAt) : NaN;

    if (!LIVE_PROVIDERS.has(provider) || !id || tokenCount === null || latencyMs === null || !Number.isFinite(timestamp)) {
      return [];
    }

    return [{
      id,
      timestamp,
      prompt: "",
      provider: provider as SessionRecord["provider"],
      tokenCount,
      // Derive speed from the canonical stored values rather than trusting a
      // stale, client-calculated field from an older record.
      tokensPerSec: Math.round((tokenCount / (latencyMs / 1000)) * 10) / 10,
      latencyMs,
    }];
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map stored sessions (newest-first) to chart rows (oldest-first for charts).
 * Each row gets a short label: #1, #2, …
 */
function toChartRows(sessions: SessionRecord[]): ChartRow[] {
  return [...sessions]
    .reverse()
    .map((s, i) => ({
      name: `#${i + 1}`,
      provider: s.provider || "Unknown",
      tokens: s.tokenCount ?? 0,
      tps: Math.round((s.tokensPerSec ?? 0) * 10) / 10,
      latency: s.latencyMs ? Math.round((s.latencyMs / 1000) * 100) / 100 : 0,
    }));
}

// ---------------------------------------------------------------------------
// Chart sub-components
// ---------------------------------------------------------------------------

const PIE_COLORS = ["#2f80ed", "#38bdf8", "#22a66d", "#829cff", "#df5555"];

const tooltipStyle = {
  contentStyle: { background: "#12121a", border: "1px solid #2a2a38", borderRadius: 10, fontSize: 12 },
  labelStyle: { color: "#f1f5f9", fontWeight: 600 },
  itemStyle: { color: "#94a3b8" },
};

const axisProps = { tick: { fill: "#64748b", fontSize: 11 } };

const BarView: React.FC<{ data: ChartRow[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={300}>
    <BarChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2c" />
      <XAxis dataKey="name" {...axisProps} />
      <YAxis {...axisProps} />
      <Tooltip {...tooltipStyle} />
      <Legend wrapperStyle={{ color: "#64748b", fontSize: 12 }} />
      <Bar dataKey="tokens" fill="#2f80ed" name="Tokens generated" radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

const LineView: React.FC<{ data: ChartRow[] }> = ({ data }) => (
  <ResponsiveContainer width="100%" height={300}>
    <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2c" />
      <XAxis dataKey="name" {...axisProps} />
      <YAxis {...axisProps} />
      <Tooltip {...tooltipStyle} />
      <Legend wrapperStyle={{ color: "#64748b", fontSize: 12 }} />
      <Line type="monotone" dataKey="tps" stroke="#22d3ee" strokeWidth={2} dot={{ r: 3 }} name="Response speed (tok/s)" />
      <Line type="monotone" dataKey="latency" stroke="#829cff" strokeWidth={2} dot={{ r: 3 }} name="Latency (seconds)" />
    </LineChart>
  </ResponsiveContainer>
);

const RADIAN = Math.PI / 180;

interface PieLabelProps {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number;
  percent: number; name: string;
}

const renderPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: PieLabelProps) => {
  if (percent < 0.05) return null; // skip tiny slices — prevents pile-up
  const radius = innerRadius + (outerRadius - innerRadius) * 0.6;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {name} {(percent * 100).toFixed(0)}%
    </text>
  );
};

const PieView: React.FC<{ data: ChartRow[] }> = ({ data }) => {
  const totalsByProvider = data.reduce<Record<string, number>>((totals, row) => {
    totals[row.provider] = (totals[row.provider] ?? 0) + row.tokens;
    return totals;
  }, {});
  const pieData = Object.entries(totalsByProvider).map(([name, value]) => ({ name, value }));
  const hasValues = pieData.length > 0;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        {hasValues ? (
          <Pie
            data={pieData}
            cx="50%" cy="50%" outerRadius={110}
            dataKey="value"
            labelLine={false}
            label={renderPieLabel as any}
          >
            {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
          </Pie>
        ) : (
          <Pie data={[{ name: "No data", value: 1 }]} cx="50%" cy="50%" outerRadius={110} dataKey="value" fill="#1e1e2c" label={false} />
        )}
        <Tooltip {...tooltipStyle} formatter={(v: number) => [`${v.toLocaleString()} tokens`, "Token share"]} />
        <Legend wrapperStyle={{ color: "#64748b", fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
};

const TableView: React.FC<{ data: ChartRow[] }> = ({ data }) => (
  <div className="overflow-x-auto rounded-xl border border-[#1e1e2c]">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-[#1e1e2c] bg-[#0e0e16]">
          {["Session", "Provider", "Tokens", "tok/s", "Latency (s)"].map(h => (
            <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={row.name} className={`border-b border-[#1e1e2c] hover:bg-[#16161e] transition-colors ${i % 2 === 0 ? "bg-[#0e0e16]" : "bg-[#12121a]"}`}>
            <td className="px-4 py-3 font-medium text-slate-300">{row.name}</td>
            <td className="px-4 py-3 capitalize text-slate-400">{row.provider}</td>
            <td className="px-4 py-3 font-mono text-amber-400">{row.tokens}</td>
            <td className="px-4 py-3 font-mono text-cyan-400">{row.tps}</td>
            <td className="px-4 py-3 font-mono text-slate-300">{row.latency}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

// ---------------------------------------------------------------------------
// Chart type selector tabs
// ---------------------------------------------------------------------------

const chartViews: { id: ChartType; label: string }[] = [
  { id: "bar", label: "Token use" },
  { id: "line", label: "Speed" },
  { id: "pie", label: "By provider" },
  { id: "table", label: "Session table" },
];

// ---------------------------------------------------------------------------
// Payment Risk Analytics Components
// ---------------------------------------------------------------------------

const RiskEmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-700">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
    <p className="text-slate-400 text-sm font-medium">No payment risk analyses yet.</p>
  </div>
);

// ---------------------------------------------------------------------------
// Empty state (Inference)
// ---------------------------------------------------------------------------

const EmptyState: React.FC = () => (
  <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" className="text-slate-700">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
    <p className="text-slate-400 text-sm font-medium">No inference sessions yet.</p>
    <p className="text-slate-600 text-xs max-w-xs">
      Run a prompt in the Playground to see live analytics here.
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

const AnalyticsDashboard: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [isLoading, setIsLoading] = React.useState(true);

  // Inference Analytics
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [chart, setChart] = useState<ChartType>(local.getChart());

  // Risk Analytics
  const [riskAnalyses, setRiskAnalyses] = useState<RiskAnalysisResult[]>([]);

  const fetchAnalytics = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const [inferenceResult, riskResult] = await Promise.allSettled([
        fetch(`/api/inference/history`, { credentials: 'include' }),
        fetch(`/api/risk/history`, { credentials: 'include' })
      ]);

      if (inferenceResult.status === "fulfilled" && inferenceResult.value.ok) {
        const infData = await inferenceResult.value.json();

        setSessions(mapCompletedPlaygroundSessions(infData));
      } else {
        toast.error("Inference history could not be refreshed.");
      }

      if (riskResult.status === "fulfilled" && riskResult.value.ok) {
        const riskData = await riskResult.value.json();
        setRiskAnalyses(Array.isArray(riskData) ? riskData : []);
      } else {
        toast.error("Risk analytics could not be refreshed.");
      }
    } catch (err) {
      console.error("Failed to load analytics natively:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;
    if (isAuthenticated) {
      fetchAnalytics().then(() => {
        if (!active) return;
      });
    } else {
      setIsLoading(false);
    }

    // Re-fetch whenever the user navigates back to this tab
    const onVisible = () => {
      if (document.visibilityState === "visible" && isAuthenticated) {
        fetchAnalytics();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAuthenticated, fetchAnalytics]);

  const pick = (c: ChartType) => { setChart(c); local.setChart(c); };

  if (!isAuthenticated) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-slate-400 text-sm font-medium">Please sign in to view analytics.</p>
    </div>
  );
  if (isLoading) return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <p className="text-slate-400 text-sm font-medium">Loading historical analytics...</p>
    </div>
  );

  const data = toChartRows(sessions);
  const hasData = sessions.length > 0;
  const chartDescription: Record<ChartType, string> = {
    bar: "Tokens generated by each completed Playground session.",
    line: "Response speed and latency over completed Playground sessions.",
    pie: "How your total generated tokens are distributed across providers.",
    table: "The raw metrics behind each completed Playground session.",
  };

  const measuredSessions = sessions.filter(s => (s.latencyMs ?? 0) > 0);
  const totalMeasuredTokens = measuredSessions.reduce((sum, session) => sum + (session.tokenCount ?? 0), 0);
  const totalMeasuredLatencyMs = measuredSessions.reduce((sum, session) => sum + (session.latencyMs ?? 0), 0);
  const overallTokensPerSecond = totalMeasuredLatencyMs > 0
    ? Math.round(totalMeasuredTokens / (totalMeasuredLatencyMs / 1000))
    : 0;

  const totals = hasData
    ? [
      { label: "Total Tokens", value: sessions.reduce((a, s) => a + (s.tokenCount ?? 0), 0).toLocaleString(), color: "text-amber-400" },
      { label: "Avg tok/s", value: overallTokensPerSecond > 0 ? String(overallTokensPerSecond) : "—", color: "text-cyan-400" },
      { label: "Avg Latency", value: measuredSessions.length > 0 ? `${(totalMeasuredLatencyMs / measuredSessions.length / 1000).toFixed(2)}s` : "—", color: "text-slate-300" },
      { label: "Sessions", value: String(sessions.length), color: "text-purple-400" },
    ]
    : [
      { label: "Total Tokens", value: "—", color: "text-slate-600" },
      { label: "Avg tok/s", value: "—", color: "text-slate-600" },
      { label: "Avg Latency", value: "—", color: "text-slate-600" },
      { label: "Sessions", value: "0", color: "text-slate-600" },
    ];

  // --- Payment Risk Calculations ---
  const hasRisk = riskAnalyses.length > 0;

  // Distribution counters
  const riskDist = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const recDist = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
  let sumPlatformScore = 0;
  let sumModelScore = 0;
  let validModelScores = 0;
  let sumAgreement = 0;
  let validAgreements = 0;
  let totalModelRuns = 0;
  let totalModelFailures = 0;
  const factorCounts: Record<string, number> = {};

  // Payment Method Phase 12 Analytics
  const payMethodScores: Record<string, { sum: number; count: number }> = {};
  const payVerifyDist: Record<string, number> = { VERIFIED: 0, FAILED: 0, NOT_VERIFIED: 0 };

  if (hasRisk) {
    riskAnalyses.forEach(r => {
      // Platform distributions
      if (r.platformRisk) {
        if (r.platformRisk.level) riskDist[r.platformRisk.level]++;
        if (r.platformRisk.recommendation) recDist[r.platformRisk.recommendation]++;
        sumPlatformScore += r.platformRisk.score || 0;

        // Platform factors
        r.platformRisk.factors?.forEach(f => {
          factorCounts[f.name] = (factorCounts[f.name] || 0) + 1;
        });
      }

      if (r.consensus) {
        sumModelScore += r.consensus.averageModelRiskScore;
        validModelScores++;
        sumAgreement += r.consensus.modelAgreementPct;
        validAgreements++;
      }

      // Safe access for legacy data arrays
      if (r.modelResults && Array.isArray(r.modelResults)) {
        totalModelRuns += r.modelResults.length;
        totalModelFailures += r.modelResults.filter((m: any) => m && m.error).length;
      }

      // Phase 12 tracking
      if (r.transaction?.paymentMethod) {
        const method = r.transaction.paymentMethod;
        if (!payMethodScores[method]) payMethodScores[method] = { sum: 0, count: 0 };
        payMethodScores[method].sum += r.platformRisk?.score || 0;
        payMethodScores[method].count += 1;
      }

      const pVerify = r.transaction?.paymentVerification;
      if (pVerify && payVerifyDist[pVerify] !== undefined) {
        payVerifyDist[pVerify]++;
      }
    });
  }

  const avgPlatformScore = hasRisk ? Math.round(sumPlatformScore / riskAnalyses.length) : 0;
  const avgModelScore = validModelScores > 0 ? Math.round(sumModelScore / validModelScores) : 0;
  const avgAgreement = validAgreements > 0 ? Math.round(sumAgreement / validAgreements) : 0;
  const failureRate = totalModelRuns > 0 ? Math.round((totalModelFailures / totalModelRuns) * 100) : 0;

  const topFactors = Object.entries(factorCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <div className="flex flex-col gap-10">

      {/* ------------------------------------------------------------- */}
      {/* INFERENCE ANALYTICS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-slate-200">Inference Analytics</h2>
          <button
            onClick={() => fetchAnalytics()}
            disabled={isLoading}
            className="flex items-center gap-2 bg-[#1e1e2c] hover:bg-[#2a2a38] text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-slate-700/50 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? "animate-spin" : ""}>
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v6h6"></path>
            </svg>
            {isLoading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {totals.map(t => (
            <div key={t.label} className="rounded-xl border border-[#1e1e2c] bg-[#12121a] px-4 py-4">
              <p className={`font-mono text-2xl font-bold tabular-nums ${t.color}`}>{t.value}</p>
              <p className="text-[11px] uppercase tracking-wider text-slate-600 mt-1">{t.label}</p>
            </div>
          ))}
        </div>

        {/* Chart type selector + clear button */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5" role="group" aria-label="Chart type">
            {chartViews.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => pick(id)}
                aria-pressed={chart === id}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/40 ${chart === id
                  ? "bg-amber-500 text-black"
                  : "text-slate-500 hover:text-slate-200 border border-[#2a2a38] hover:border-[#3a3a48] bg-[#12121a]"
                  }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chart area */}
        <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-3 sm:p-5">
          <p className="text-sm font-medium text-slate-300">{chart === "bar" ? "Token usage" : chart === "line" ? "Performance over time" : chart === "pie" ? "Token share by provider" : "Session details"}</p>
          <p className="mb-4 mt-1 text-xs text-slate-500">{chartDescription[chart]}</p>
          {!hasData ? (
            <EmptyState />
          ) : (
            <>
              {chart === "bar" && <BarView data={data} />}
              {chart === "line" && <LineView data={data} />}
              {chart === "pie" && <PieView data={data} />}
              {chart === "table" && <TableView data={data} />}
            </>
          )}
        </div>

        {hasData && (
          <p className="text-xs text-slate-500 leading-relaxed">
            Showing {sessions.length} completed inference session{sessions.length !== 1 ? "s" : ""}. Similarity percentage is intentionally not shown here: it measures the comparison between two outputs in the Diff view, while each Playground session has only one output.
          </p>
        )}
      </div>

      <div className="h-px bg-slate-800/50 w-full" />

      {/* ------------------------------------------------------------- */}
      {/* PAYMENT RISK ANALYTICS */}
      {/* ------------------------------------------------------------- */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl font-bold text-slate-200 uppercase tracking-widest text-emerald-400/90">Payment Risk Analytics</h2>
          <button
            onClick={() => fetchAnalytics()}
            disabled={isLoading}
            className="flex items-center gap-2 bg-[#1e1e2c] hover:bg-[#2a2a38] text-slate-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-slate-700/50 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? "animate-spin" : ""}>
              <path d="M21 2v6h-6"></path>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
              <path d="M3 3v6h6"></path>
            </svg>
            {isLoading ? "Refreshing..." : "Refresh Data"}
          </button>
        </div>

        {!hasRisk ? (
          <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5">
            <RiskEmptyState />
          </div>
        ) : (
          <>
            {/* Key Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Total Analyses</span>
                <span className="text-2xl font-bold text-slate-200 mt-1">{riskAnalyses.length}</span>
              </div>
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Avg Platform Score</span>
                <span className="text-2xl font-bold text-indigo-400 mt-1">{avgPlatformScore}</span>
              </div>
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Avg Model Score</span>
                <span className="text-2xl font-bold text-amber-400 mt-1">{avgModelScore}</span>
              </div>
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-4 flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Avg Model Agreement</span>
                <span className="text-2xl font-bold text-emerald-400 mt-1">{avgAgreement}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

              {/* Risk & Recommendation Distributions */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Risk Distribution</h3>
                  <div className="flex flex-col gap-3">
                    {Object.entries(riskDist).map(([level, count]) => {
                      const pct = riskAnalyses.length > 0 ? Math.round((count / riskAnalyses.length) * 100) : 0;
                      const color = level === "LOW" ? "bg-emerald-500" : level === "MEDIUM" ? "bg-yellow-500" : level === "HIGH" ? "bg-orange-500" : "bg-red-500";
                      return (
                        <div key={level} className="flex items-center gap-3">
                          <div className="w-[70px] text-xs font-semibold text-slate-400">{level}</div>
                          <div className="flex-1 h-2 bg-[#1e1e2c] rounded-full overflow-hidden">
                            <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-8 text-right text-xs font-mono text-slate-300">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5">
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Recommendations</h3>
                  <div className="flex flex-col gap-3">
                    {Object.entries(recDist).map(([rec, count]) => {
                      const pct = riskAnalyses.length > 0 ? Math.round((count / riskAnalyses.length) * 100) : 0;
                      const color = rec === "ALLOW" ? "bg-emerald-500" : rec === "REVIEW" ? "bg-amber-500" : "bg-red-500";
                      return (
                        <div key={rec} className="flex items-center gap-3">
                          <div className="w-[60px] text-xs font-semibold text-slate-400">{rec}</div>
                          <div className="flex-1 h-2 bg-[#1e1e2c] rounded-full overflow-hidden">
                            <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-8 text-right text-xs font-mono text-slate-300">{count}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Factors & Failures */}
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5 flex flex-col gap-6">
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-1">Model Failure Rate</h3>
                  <div className="flex items-end gap-2 mt-2">
                    <span className={`text-2xl font-bold ${failureRate > 0 ? "text-red-400" : "text-emerald-400"}`}>{failureRate}%</span>
                    <span className="text-xs text-slate-500 mb-1">({totalModelFailures}/{totalModelRuns} models)</span>
                  </div>
                </div>

                <div>
                  <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-3">Top Risk Factors</h3>
                  {topFactors.length === 0 ? (
                    <p className="text-xs text-slate-500">No elevated risk factors tracked yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {topFactors.map(([name, count]) => (
                        <li key={name} className="flex justify-between items-center bg-[#181824] px-3 py-2 rounded">
                          <span className="text-xs font-medium text-slate-300 truncate pr-2">{name}</span>
                          <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">{count}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Payment Method Details Data */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5">
                <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Risk by Payment Method</h3>
                <div className="flex flex-col gap-3">
                  {["CARD", "UPI", "NET_BANKING", "POS", "WALLET", "BANK_TRANSFER", "OTHER"].map(method => {
                    const data = payMethodScores[method];
                    if (!data) return (
                      <div key={method} className="flex items-center justify-between py-1 border-b border-[#1e1e2c]/50">
                        <span className="text-sm font-semibold text-slate-400">{method}</span>
                        <span className="text-xs font-mono text-slate-600">No data</span>
                      </div>
                    );

                    const avgR = Math.round(data.sum / data.count);
                    const colorClass = avgR < 25 ? "text-emerald-400" : avgR < 50 ? "text-yellow-400" : avgR < 75 ? "text-orange-400" : "text-red-500";
                    return (
                      <div key={method} className="flex items-center justify-between py-1 border-b border-[#1e1e2c]">
                        <span className="text-sm font-medium text-slate-200">{method}</span>
                        <span className="text-xs font-mono text-slate-400 flex items-center gap-2">
                          Avg Risk: <span className={`text-sm font-bold ${colorClass}`}>{avgR}</span>
                          <span className="text-slate-600 ml-1">({data.count}x)</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#1e1e2c] bg-[#12121a] p-5">
                <h3 className="text-xs uppercase tracking-wider text-slate-400 font-bold mb-4">Payment Verification Outcomes</h3>
                <div className="flex flex-col gap-3">
                  {Object.entries(payVerifyDist).map(([status, count]) => {
                    const pct = riskAnalyses.length > 0 ? Math.round((count / riskAnalyses.length) * 100) : 0;
                    const color = status === "VERIFIED" ? "bg-emerald-500" : status === "FAILED" ? "bg-red-500" : "bg-slate-600";
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <div className="w-[85px] text-xs font-semibold text-slate-400">{status}</div>
                        <div className="flex-1 h-2 bg-[#1e1e2c] rounded-full overflow-hidden">
                          <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                        <div className="w-8 text-right text-xs font-mono text-slate-300">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-700 mt-2">
              Showing data for the newest {riskAnalyses.length} risk analys{riskAnalyses.length !== 1 ? "es" : "is"} stored securely on the backend servers explicitly.
            </p>
          </>
        )}
      </div>

    </div>
  );
};

export default AnalyticsDashboard;
