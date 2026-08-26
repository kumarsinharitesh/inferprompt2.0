import { calculateConsensus } from "../src/services/consensusEngine";
import type { ModelRiskResult, PlatformRiskResult } from "../src/types/index";

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTests() {
    console.log("Starting consensusEngine testing...");

    const mockPlatform: PlatformRiskResult = { score: 50, level: "MEDIUM", recommendation: "REVIEW", factors: [] };

    const baseModel: ModelRiskResult = {
        provider: "mock", riskLevel: "LOW", riskScore: 0, confidence: 100,
        riskFactors: [], recommendation: "ALLOW", reasoning: ""
    };

    // 1. All models agree HIGH
    const t1 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskLevel: "HIGH", riskScore: 80 },
        { ...baseModel, provider: "groq", riskLevel: "HIGH", riskScore: 85 },
        { ...baseModel, provider: "openrouter", riskLevel: "HIGH", riskScore: 90 },
    ], mockPlatform);
    assert(t1 !== null && t1.consensusRiskLevel === "HIGH", "Test 1: Consensus should be HIGH");
    assert(t1!.riskLevelAgreementPct === 100, "Test 1: Level Agreement should be 100%");

    // 2. All models agree LOW
    const t2 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskLevel: "LOW", riskScore: 10 },
        { ...baseModel, provider: "groq", riskLevel: "LOW", riskScore: 10 },
    ], mockPlatform);
    assert(t2 !== null && t2.consensusRiskLevel === "LOW", "Test 2: Consensus should be LOW");
    assert(t2!.modelAgreementPct === 100, "Test 2: Identical scores should yield 100% agreement");

    // 3. Mixed risk levels (mode finding) (3 HIGH, 1 MEDIUM)
    const t3 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskLevel: "HIGH", riskScore: 80 },
        { ...baseModel, provider: "groq", riskLevel: "HIGH", riskScore: 85 },
        { ...baseModel, provider: "openrouter", riskLevel: "HIGH", riskScore: 90 },
        { ...baseModel, provider: "mock", riskLevel: "MEDIUM", riskScore: 60 },
    ], mockPlatform);
    assert(t3 !== null && t3.consensusRiskLevel === "HIGH", "Test 3: Mode should be HIGH");
    assert(t3!.riskLevelAgreementPct === 75, "Test 3: Level agreement should be 75% exactly");

    // 4. Tie in risk levels (2 HIGH, 2 CRITICAL)
    // HIGH avg = (70+70) / 2 = 70. CRITICAL avg = (80+80) / 2 = 80.
    // The tiebreaker rule specified defaults to the higher average score bucket.
    const t4 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskLevel: "HIGH", riskScore: 70 },
        { ...baseModel, provider: "groq", riskLevel: "CRITICAL", riskScore: 80 },
        { ...baseModel, provider: "openrouter", riskLevel: "CRITICAL", riskScore: 80 },
        { ...baseModel, provider: "mock", riskLevel: "HIGH", riskScore: 70 },
    ], mockPlatform);
    assert(t4 !== null && t4.consensusRiskLevel === "CRITICAL", `Test 4: Tie should break to higher bucket CRITICAL, got ${t4?.consensusRiskLevel}`);

    // 5. Identical scores
    const t5 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskScore: 50 },
        { ...baseModel, provider: "groq", riskScore: 50 },
    ], mockPlatform);
    assert(t5 !== null && t5.averageModelRiskScore === 50, "Test 5: Avg should be 50");
    assert(t5!.modelAgreementPct === 100, "Test 5: Deviation is 0, agreement 100%");

    // 6. Very different scores
    // Scores 0 and 100. Avg = 50. Deviations = 50, 50. Mean abs dev = 50. Agreement = 100 - 50 = 50%.
    const t6 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskScore: 0 },
        { ...baseModel, provider: "groq", riskScore: 100 },
    ], mockPlatform);
    assert(t6 !== null && t6.averageModelRiskScore === 50, "Test 6: average score");
    assert(t6!.modelAgreementPct === 50, "Test 6: Score agreement for 0 and 100 should be 50%");

    // 7. One successful model
    const t7 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskScore: 82, riskLevel: "HIGH" },
    ], mockPlatform);
    assert(t7 !== null && t7.successfulModelCount === 1, "Test 7: 1 model");
    assert(t7!.averageModelRiskScore === 82 && t7!.medianModelRiskScore === 82, "Test 7: Average and Median = 82");
    assert(t7!.modelAgreementPct === 100, "Test 7: Agreement 100%");

    // 8. No successful models
    const t8 = calculateConsensus([
        { ...baseModel, provider: "sarvam", error: "Failed" },
    ], mockPlatform);
    assert(t8 === null, "Test 8: Null expected");

    // 9. Failed provider excluded
    const t9 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskScore: 50 },
        { ...baseModel, provider: "groq", error: "API down" },
    ], mockPlatform);
    assert(t9 !== null && t9.successfulModelCount === 1, "Test 9: 1 success");
    assert(t9!.failedModelCount === 1, "Test 9: 1 failed");

    // 10. Factor agreement
    const t10 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskFactors: [{ name: "New Device ", severity: "MEDIUM", description: "", evidence: "" }] },
        { ...baseModel, provider: "groq", riskFactors: [{ name: "NEW Device!!", severity: "HIGH", description: "", evidence: "" }, { name: "Location", severity: "HIGH", description: "", evidence: "" }] },
    ], mockPlatform);
    assert(t10 !== null, "Test 10");
    assert(t10!.factorAgreement.common.length === 1, "Test 10: 1 common factor after normalization");
    assert(t10!.factorAgreement.modelSpecific.length === 1, "Test 10: 1 specific factor");

    // 11. Platform/model difference
    // Platform: 50. Model average: (50+55)/2 = 52.5. platform - average = -2.5.
    const t11 = calculateConsensus([
        { ...baseModel, provider: "sarvam", riskScore: 50 },
        { ...baseModel, provider: "groq", riskScore: 55 },
    ], mockPlatform);
    assert(t11 !== null && t11.platformModelDifference.difference === -2.5, "Test 11: Difference is -2.5");

    // 12. Deterministic repeated
    const t12_a = calculateConsensus([{ ...baseModel, provider: "sarvam", riskScore: 60 }], mockPlatform);
    const t12_b = calculateConsensus([{ ...baseModel, provider: "sarvam", riskScore: 60 }], mockPlatform);
    assert(JSON.stringify(t12_a) === JSON.stringify(t12_b), "Test 12: Outputs must be identical");

    console.log("✅ All 12 deterministic consensus tests passed.");
}

try {
    runTests();
    
} catch (e) {
    console.error((e as Error).message);
    
}
