import { generateModelPairs } from "../src/utils/modelPairing";
import type { ModelRiskResult } from "../src/types/index";

function assert(condition: boolean, message: string) {
    if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function runTests() {
    console.log("Starting ABTD Pairwise generation tests...");

    const base: ModelRiskResult = {
        provider: "mock", riskLevel: "LOW", riskScore: 0, confidence: 100,
        riskFactors: [], recommendation: "ALLOW", reasoning: "this is generic reasoning."
    };

    // 1. Two successful models
    const twoModels = [
        { ...base, provider: "gemini", reasoning: "A B" } as ModelRiskResult,
        { ...base, provider: "groq", reasoning: "A C" } as ModelRiskResult
    ];
    const t1 = generateModelPairs(twoModels);
    assert(t1.length === 1, "Test 1: 2 models -> 1 pair");
    assert(t1[0].providerA === "gemini" && t1[0].providerB === "groq", "Test 1: Correct pair mapping");
    assert(t1[0].similarityPct > 0, "Test 1: Similarity scored natively");

    // 2. Three successful models
    const threeModels = [
        { ...base, provider: "gemini" } as ModelRiskResult,
        { ...base, provider: "groq" } as ModelRiskResult,
        { ...base, provider: "sarvam" } as ModelRiskResult,
    ];
    const t2 = generateModelPairs(threeModels);
    assert(t2.length === 3, "Test 2: 3 models -> 3 pairs");

    // 3. Identical reasoning
    const t3 = generateModelPairs([
        { ...base, provider: "gemini", reasoning: "exact same text" } as ModelRiskResult,
        { ...base, provider: "sarvam", reasoning: "exact same text" } as ModelRiskResult
    ]);
    assert(t3[0].similarityPct === 100, "Test 3: identical mapping correctly yields 100%");

    // 4. Completely different reasoning
    const t4 = generateModelPairs([
        { ...base, provider: "m1", reasoning: "apples oranges bananas" } as ModelRiskResult,
        { ...base, provider: "m2", reasoning: "vehicles cars trucks" } as ModelRiskResult
    ]);
    assert(t4[0].similarityPct < 50, "Test 4: different reasoning mapping yields lower percentage");

    // 5. One failed provider
    const mixedModels = [
        { ...base, provider: "gemini" } as ModelRiskResult,
        { ...base, provider: "groq" } as ModelRiskResult,
        { ...base, provider: "sarvam", error: "failed api." } as ModelRiskResult
    ];
    const t5 = generateModelPairs(mixedModels);
    assert(t5.length === 1, "Test 5: error dropped correctly");

    // 6. Zero successful models
    const t6 = generateModelPairs([
        { ...base, provider: "gemini", error: "timeout" },
        { ...base, provider: "groq", error: "timeout" }
    ]);
    assert(t6.length === 0, "Test 6: 0 pairs for all errored");

    // 7. Exactly one successful model
    const t7 = generateModelPairs([{ ...base, provider: "gemini" }]);
    assert(t7.length === 0, "Test 7: 1 model yields 0 pairs");

    console.log("✅ All ABTD Pairwise generation tests passed deterministicly.");
}

try {
    runTests();
    
} catch (e) {
    console.error((e as Error).message);
    
}
