import { calculateFinalDecision } from "../src/services/finalDecisionEngine";
import { TransactionData, ModelRiskResult, ConsensusResult } from "../src/types";
import { CanonicalEvidence } from "../src/services/riskEvidence";

const tx: TransactionData = {
    amount: 15000,
    currency: "INR",
    merchantName: "Fake Merchant",
    merchantVerification: "UNKNOWN",
    mccCode: "5999",
    merchantAge: 0,
    paymentMethod: "CARD",
    paymentVerification: "VERIFIED",
    cardDetails: { threeDS: "FAILED", avsStatus: "MISMATCH" },
    failedAttempts: 3,
    isNewDevice: true,
    country: "India",
    ipCountry: "Unknown",
    userCountry: "India"
};

const canonical: CanonicalEvidence = {
    amount: 15000,
    currency: "INR",
    merchantName: "Fake Merchant",
    merchantVerification: "UNKNOWN",
    merchantAge: 0,
    mccCode: "5999",
    mccCategory: "Misc",
    paymentMethod: "CARD",
    paymentVerification: "FAILED", // Emulating failure upstream dynamically
    kycStatus: "UNKNOWN",
    deviceType: "UNKNOWN",
    isNewDevice: true,
    failedAttempts: 3,
    previousTransactionCount: 0,
    ipCountry: "Unknown",
    userCountry: "India",
    locationMatch: false,
    timestampValid: true,
    offerPresent: false
};

const models: ModelRiskResult[] = [
    {
        riskScore: 20, // Model thinks it's super safe
        riskLevel: "LOW",
        recommendation: "ALLOW",
        confidence: 90,
        reasoning: "Looks fine.",
        riskFactors: [{ name: "Safe", severity: "LOW", description: "Safe", allowedForDecision: true }],
        metadata: { provider: "mock", modelName: "mock" }
    }
];

const consensus: ConsensusResult = {
    averageModelRiskScore: 20,
    modelAgreementPct: 100,
    modelCount: 1
} as any;

const result = calculateFinalDecision({
    transaction: tx,
    canonicalEvidence: canonical,
    platformRisk: null,
    validatedModels: models,
    consensus
});

console.log("");
console.log("=== Final Decision Engine Tests ===");
let passed = true;

if (result.hardStops.length > 0 && result.recommendation === "BLOCK" && result.level === "CRITICAL") {
    console.log("✅ Passed: Platform Hard Stops successfully overrode the LLMs 20% safe score!");
} else {
    console.log("❌ Failed: Platform Hard Stops failed to assert structural Priority override.", result);
    passed = false;
}

if (passed) {
    console.log("All finalDecisionEngine tests passed securely.");
    
} else {
    console.log("finalDecisionEngine tests failed.");
    
}
