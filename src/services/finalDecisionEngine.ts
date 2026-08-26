import { TransactionData, ModelRiskResult, ConsensusResult, RiskLevel } from "../types";
import { CanonicalEvidence } from "./riskEvidence";
import { validateModelFactors } from "./riskEvidenceValidator";

export interface DecisionEngineInput {
    transaction: TransactionData;
    canonicalEvidence: CanonicalEvidence;
    platformRisk: any;
    validatedModels: ModelRiskResult[];
    consensus: ConsensusResult | null;
}

export interface FinalDecisionOutput {
    score: number;
    level: RiskLevel;
    recommendation: "ALLOW" | "REVIEW" | "BLOCK";
    confidence: number;
    decisionBasis: string[];
    hardStops: string[];
    supportingFactors: string[];
    rejectedModelFactors: string[];
}

export function calculateFinalDecision(input: DecisionEngineInput): FinalDecisionOutput {
    const { canonicalEvidence, validatedModels } = input;

    let hardStopTriggered = false;
    let baseScore = 0;
    const hardStops: string[] = [];
    const supportingFactors: string[] = [];
    const decisionBasis: string[] = [];

    // PRIORITY 1: Deterministic Hard Rules
    if (canonicalEvidence.paymentVerification === "FAILED") {
        hardStopTriggered = true;
        hardStops.push("Payment Verification Failed explicitly.");
        baseScore += 80;
    }

    if (input.transaction.cardDetails?.threeDS === "FAILED") {
        hardStopTriggered = true;
        hardStops.push("3DS Authentication Failed natively.");
        baseScore += 90;
    }

    if (input.transaction.cardDetails?.avsStatus === "MISMATCH") {
        supportingFactors.push("AVS Address Mismatch recorded.");
        baseScore += 40;
    }

    // Interaction Rules
    if (canonicalEvidence.isNewDevice && canonicalEvidence.failedAttempts >= 2) {
        supportingFactors.push("Multiple failed attempts detected on a distinctly new device.");
        baseScore += 50;
    } else if (canonicalEvidence.isNewDevice) {
        supportingFactors.push("New device logged.");
        baseScore += 15;
    }

    if (canonicalEvidence.merchantAge === 0) {
        supportingFactors.push("Merchant age is under 1 month natively.");
        baseScore += 20;
    }

    if (!canonicalEvidence.timestampValid) {
        supportingFactors.push("Invalid timestamp sequence identified natively.");
        baseScore += 30;
    }

    // Process Validated Model Findings
    let llmScoreAggregate = 0;
    let validFactorsCount = 0;
    let rejectedCount = 0;
    const finalRejected: string[] = [];

    validatedModels.forEach(model => {
        model.riskFactors.forEach(factor => {
            if (factor.allowedForDecision) {
                validFactorsCount++;
                llmScoreAggregate += (factor.severity === "CRITICAL" ? 30 : factor.severity === "HIGH" ? 20 : factor.severity === "MEDIUM" ? 10 : 0);
            } else {
                rejectedCount++;
                finalRejected.push(`Rejected: [${factor.name}] - Reason: ${factor.supportType}`);
            }
        });
    });

    const averageLlmContribution = validFactorsCount > 0 ? (llmScoreAggregate / validatedModels.length) : 0;

    // Priority Resolution
    let finalScore = Math.min(100, baseScore + averageLlmContribution);

    // Confidence penalty for models hallucinating
    let confidence = 100;
    if (rejectedCount > 0) {
        confidence -= (rejectedCount * 10);
    }
    confidence = Math.max(0, confidence);

    // Final Outputs
    let level: RiskLevel = "LOW";
    let recommendation: "ALLOW" | "REVIEW" | "BLOCK" = "ALLOW";

    if (finalScore >= 80 || hardStopTriggered) {
        level = "CRITICAL";
        recommendation = "BLOCK";
    } else if (finalScore >= 60) {
        level = "HIGH";
        recommendation = "REVIEW";
    } else if (finalScore >= 30) {
        level = "MEDIUM";
        recommendation = "REVIEW";
    }

    // Construct basis array
    hardStops.forEach(st => decisionBasis.push(st));
    if (!hardStopTriggered) {
        supportingFactors.slice(0, 3).forEach(f => decisionBasis.push(f));
        if (validFactorsCount > 0) {
            decisionBasis.push(`${validFactorsCount} model inferences validated strictly against payloads.`);
        }
    }

    return {
        score: Math.round(finalScore),
        level,
        recommendation,
        confidence,
        decisionBasis,
        hardStops,
        supportingFactors,
        rejectedModelFactors: finalRejected
    };
}
