import { calculateRiskScore } from "../src/services/riskEngine";
import type { TransactionData } from "../src/types";

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
};

const base = (patch: Partial<TransactionData> = {}): TransactionData => ({
  amount: 500,
  currency: "INR",
  country: "India",
  merchantName: "Known Store",
  merchantVerification: "VERIFIED",
  merchantAge: 24,
  paymentMethod: "UPI",
  paymentVerification: "VERIFIED",
  upiDetails: { upiVerification: "VERIFIED" },
  isNewDevice: false,
  previousTransactionCount: 30,
  failedAttempts: 0,
  transactionTimestamp: "2026-08-20T12:00:00.000Z",
  ...patch,
});

const normal = calculateRiskScore(base());
assert(normal.score === 0 && normal.level === "LOW" && normal.recommendation === "ALLOW", "normal transaction is low risk");

// Regression: related authentication, merchant, and device evidence is capped.
const currentCase = calculateRiskScore(base({
  amount: 20,
  merchantName: "yg",
  merchantVerification: "ANONYMOUS",
  merchantAge: 0,
  paymentVerification: "FAILED",
  upiDetails: { upiVerification: "FAILED" },
  isNewDevice: true,
  previousTransactionCount: 0,
}));
assert(currentCase.score === 73, `₹20 regression expected calibrated 73, got ${currentCase.score}`);
assert(currentCase.level === "HIGH" && currentCase.recommendation === "BLOCK", "authentication hard stop blocks without score saturation");
assert((currentCase.groupContributions?.authentication ?? 0) === 42, "authentication group cap is applied");
assert((currentCase.groupContributions?.merchantTrust ?? 0) === 22, "merchant group cap is applied");
assert((currentCase.groupContributions?.deviceHistory ?? 0) === 12, "device group cap is applied");
assert(currentCase.modifiers?.some(m => m.effect === -3), "low amount is a contextual modifier");

const scenarios: Array<[string, Partial<TransactionData>, (result: ReturnType<typeof calculateRiskScore>) => boolean]> = [
  ["₹1 safe", { amount: 1 }, r => r.score === 0],
  ["₹10 failed payment", { amount: 10, paymentVerification: "FAILED" }, r => r.score === 31 && r.recommendation === "REVIEW"],
  ["₹50 failed UPI", { amount: 50, upiDetails: { upiVerification: "FAILED" } }, r => r.score === 27],
  ["₹100 known device", { amount: 100 }, r => r.score === 0],
  ["₹500 new device", { amount: 500, isNewDevice: true }, r => r.score === 9],
  ["₹1,000 anonymous merchant", { amount: 1000, merchantVerification: "ANONYMOUS", merchantAge: 0 }, r => r.score === 22],
  ["₹10,000 verified known device", { amount: 10000 }, r => r.score === 6],
  ["₹100,000 verified known device", { amount: 100000 }, r => r.score === 14],
  ["high amount with payment failure", { amount: 100000, paymentVerification: "FAILED" }, r => r.score === 48],
  ["new merchant alone", { merchantAge: 0 }, r => r.score === 8],
  ["repeated failed attempts", { failedAttempts: 5 }, r => r.score === 20],
  ["location mismatch", { ipCountry: "India", userCountry: "Canada" }, r => r.score === 18],
  ["unknown data", { merchantVerification: undefined, paymentMethod: undefined, paymentVerification: undefined, upiDetails: undefined, isNewDevice: undefined, previousTransactionCount: undefined }, r => r.score === 0 && (r.confidence ?? 0) < 90],
  ["UPI details missing", { upiDetails: undefined }, r => r.score === 0 && (r.dataQuality?.length ?? 0) > 0],
  ["card details missing", { paymentMethod: "CARD", cardDetails: undefined, upiDetails: undefined }, r => r.score === 0 && (r.dataQuality?.length ?? 0) > 0],
  ["contradictory verified UPI", { paymentVerification: "VERIFIED", upiDetails: { upiVerification: "FAILED" } }, r => r.score === 30 && (r.dataQuality?.length ?? 0) > 0],
  ["verified merchant age zero", { merchantAge: 0 }, r => r.score === 8 && (r.dataQuality?.length ?? 0) > 0],
  ["known device zero history", { previousTransactionCount: 0 }, r => r.score === 0 && (r.dataQuality?.length ?? 0) > 0],
  ["card 3DS failure", { paymentMethod: "CARD", paymentVerification: "VERIFIED", cardDetails: { threeDS: "FAILED" }, upiDetails: undefined }, r => r.score === 42 && r.recommendation === "BLOCK"],
  ["unsupported payment method", { paymentMethod: "OTHER", upiDetails: undefined }, r => r.score === 0],
];

for (const [name, patch, predicate] of scenarios) {
  const result = calculateRiskScore(base(patch));
  assert(Number.isFinite(result.score) && result.score >= 0 && result.score <= 100, `${name}: score must be bounded`);
  assert(predicate(result), `${name}: expected calibrated outcome, received ${result.score}`);
}

console.log(`✅ ${scenarios.length + 2} deterministic risk-engine scenarios passed.`);
