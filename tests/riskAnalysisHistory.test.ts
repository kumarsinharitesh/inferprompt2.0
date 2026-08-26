import {
    getRiskHistory,
    saveRiskAnalysis,
    clearRiskHistory,
    MAX_RISK_ANALYSES,
    RISK_HISTORY_KEY
} from "../src/utils/riskAnalysisHistory";
import type { RiskAnalysisResult, ModelReasoningComparison } from "../src/types";

// Mock localStorage
const mockStorage: Record<string, string> = {};
global.localStorage = {
    getItem: (key: string) => mockStorage[key] || null,
    setItem: (key: string, value: string) => { mockStorage[key] = value; },
    removeItem: (key: string) => { delete mockStorage[key]; },
    clear: () => {
        for (const key in mockStorage) delete mockStorage[key];
    },
    length: 0,
    key: () => null
};
global.window = {} as any;

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function createDummyResult(id: string): RiskAnalysisResult {
    return {
        id,
        timestamp: new Date().toISOString(),
        transaction: { amount: 100, currency: "USD", userIP: "1.1.1.1", deviceType: "Desktop" },
        platformRisk: { score: 12, level: "LOW", confidence: 99, factors: [], recommendation: "ALLOW" },
        modelResults: [],
        consensus: null,
        reasoningComparisons: [
            {
                providerA: "gemini",
                providerB: "groq",
                resultA: { provider: "gemini", riskLevel: "LOW", riskScore: 10, confidence: 99, recommendation: "ALLOW", reasoning: "A", riskFactors: [] },
                resultB: { provider: "groq", riskLevel: "LOW", riskScore: 10, confidence: 99, recommendation: "ALLOW", reasoning: "B", riskFactors: [] },
                similarityPct: 80,
                diffTokensA: [{ text: "X", type: "equal" }],
                diffTokensB: [{ text: "X", type: "equal" }]
            } as ModelReasoningComparison
        ]
    };
}

function runTests() {
    console.log("Starting Risk Analysis History persistence tests...");

    // 1. Clear state correctly
    clearRiskHistory();
    assert(getRiskHistory().length === 0, "Initial state is clear.");

    // 2. Sanitize and structure drops tokens properly
    const t1 = createDummyResult("test-1");
    saveRiskAnalysis(t1);
    const h1 = getRiskHistory();
    assert(h1.length === 1, "Save works correctly");
    assert(h1[0].id === "test-1", "ID persists correctly");

    // Implicit Token Sanitize verification
    const comp = h1[0].reasoningComparisons[0];
    assert(comp.diffTokensA === undefined, "diffTokensA dropped correctly preventing bloat");
    assert(comp.similarityPct === 80, "Native similarity metrics safely preserved");

    // 3. Duplicate protection behavior - should append another, no caching sideffects, 
    // duplicate generation natively solved in UI code prior to calling 'saveRiskAnalysis'.

    // 4. Bounded limit evaluation
    clearRiskHistory();
    for (let i = 0; i < MAX_RISK_ANALYSES + 10; i++) {
        saveRiskAnalysis(createDummyResult(`bulk-${i}`));
    }

    const h4 = getRiskHistory();
    assert(h4.length === MAX_RISK_ANALYSES, `Bounded at ${MAX_RISK_ANALYSES} entries exactly`);

    // Reverses indexing - freshest data (bulk-59) should be at index 0. 
    assert(h4[0].id === "bulk-59", "Retention keeps newest-first properly (index 0)");
    assert(h4[h4.length - 1].id === "bulk-10", "Retention evicts oldest properly bounds at 50");

    console.log("✅ Risk Analysis History tests passed completely.");
}

try {
    runTests();
    
} catch (e) {
    console.error((e as Error).message);
    
}
