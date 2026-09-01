import { calculateFinalDecision } from "../src/services/finalDecisionEngine";
import { calculateRiskScore } from "../src/services/riskEngine";
import { buildTransactionEvidence } from "../src/services/riskEvidence";
import type { TransactionData } from "../src/types";

const tx: TransactionData = {
  amount: 20, currency: "INR", country: "India", merchantName: "yg",
  merchantVerification: "ANONYMOUS", merchantAge: 0, paymentMethod: "UPI",
  paymentVerification: "FAILED", upiDetails: { upiVerification: "FAILED" },
  isNewDevice: true, previousTransactionCount: 0, failedAttempts: 0,
};
const platformRisk = calculateRiskScore(tx);
const result = calculateFinalDecision({ transaction: tx, canonicalEvidence: buildTransactionEvidence(tx), platformRisk, validatedModels: [], consensus: null });

if (result.score !== platformRisk.score || result.recommendation !== "BLOCK" || result.hardStops.length === 0) {
  throw new Error("Final decision must preserve the authoritative deterministic score and policy action.");
}
console.log("✅ Final decision uses the single authoritative deterministic pipeline.");
