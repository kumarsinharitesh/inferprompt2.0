import { validateModelFactors } from "../src/services/riskEvidenceValidator";
import { TransactionData, ModelRiskResult } from "../src/types";

const tx: TransactionData = {
    amount: 18,
    currency: "INR",
    merchantName: "Bidi",
    merchantVerification: "UNKNOWN",
    mccCode: "5814",
    merchantAge: 0,
    paymentMethod: "WALLET",
    paymentVerification: "VERIFIED",
    walletDetails: { kycStatus: "VERIFIED" },
    failedAttempts: 0,
    isNewDevice: false,
    country: "India",
    ipCountry: "India",
    userCountry: "India"
};

const model: ModelRiskResult = {
    riskScore: 75,
    riskLevel: "HIGH",
    recommendation: "BLOCK",
    confidence: 80,
    reasoning: "Suspicious merchant",
    riskFactors: [
        {
            name: "Tobacco-Related Business",
            severity: "HIGH",
            description: "Merchant sells tobacco based on MCC 5814 and name Bidi."
        },
        {
            name: "Unverified Merchant",
            severity: "HIGH",
            description: "Merchant Bidi is unverified."
        }
    ],
    metadata: { provider: "mock", modelName: "mock" }
};

const validated = validateModelFactors(tx, model);

console.log("");
console.log("=== Evidence Validator Tests ===");

let passed = true;

const factor1 = validated.find(f => f.name === "Tobacco-Related Business");
if (factor1 && factor1.supported === false && factor1.supportType === "MCC_LOOKUP") {
    console.log("✅ Passed: Tobacco-related hallucination rejected (MCC_LOOKUP constraint).");
} else {
    console.log("❌ Failed: Tobacco hallucination not correctly rejected.", factor1);
    passed = false;
}

const factor2 = validated.find(f => f.name === "Unverified Merchant");
if (factor2 && factor2.supported === false && factor2.supportType === "UNSUPPORTED") {
    console.log("✅ Passed: Merchant verification hallucination rejected (UNSUPPORTED constraint).");
} else {
    console.log("❌ Failed: Unverified hallucination not correctly rejected.", factor2);
    passed = false;
}

if (passed) {
    console.log("All riskEvidenceValidator tests passed securely.");
    
} else {
    console.log("riskEvidenceValidator tests failed.");
    
}
