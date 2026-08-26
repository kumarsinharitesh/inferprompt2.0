import type { RiskAnalysisResult, ModelReasoningComparison } from "../types";

export const RISK_HISTORY_KEY = "inferprompt_risk_history";
export const MAX_RISK_ANALYSES = 50;

/**
 * Bounds the reasoning payload specifically modifying reasoningComparisons arrays
 * safely before committing directly to localStorage so it doesn't inflate uncontrollably.
 */
function sanitizeForStorage(result: RiskAnalysisResult): RiskAnalysisResult {
    const sanitizedComparisons: ModelReasoningComparison[] = result.reasoningComparisons.map(rc => ({
        providerA: rc.providerA,
        providerB: rc.providerB,
        // Create a shallow copy without diffTokens, as they bloat localStorage significantly 
        // yet are only required for the real-time visual DiffView rendering, not later aggregated metrics
        resultA: rc.resultA,
        resultB: rc.resultB,
        similarityPct: rc.similarityPct,
    }));

    return {
        ...result,
        reasoningComparisons: sanitizedComparisons
    };
}

export function getRiskHistory(): RiskAnalysisResult[] {
    if (typeof window === "undefined") return [];
    try {
        const data = localStorage.getItem(RISK_HISTORY_KEY);
        if (!data) return [];
        return JSON.parse(data) as RiskAnalysisResult[];
    } catch (error) {
        console.error("Failed to parse risk history from localStorage.", error);
        return [];
    }
}

export function saveRiskAnalysis(result: RiskAnalysisResult): void {
    if (typeof window === "undefined") return;
    try {
        const historical = getRiskHistory();
        const safeData = sanitizeForStorage(result);
        historical.unshift(safeData);

        const boundedHistory = historical.slice(0, MAX_RISK_ANALYSES);
        localStorage.setItem(RISK_HISTORY_KEY, JSON.stringify(boundedHistory));
    } catch (error) {
        console.error("Failed to save risk analysis. LocalStorage quota exceeded or unavailable.", error);
    }
}

export function clearRiskHistory(): void {
    if (typeof window === "undefined") return;
    try {
        localStorage.removeItem(RISK_HISTORY_KEY);
    } catch (error) {
        console.error("Failed to clear risk history.", error);
    }
}
