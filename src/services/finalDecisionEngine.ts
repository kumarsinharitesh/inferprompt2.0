import { ConsensusResult, ModelRiskResult, PlatformRiskResult, RiskLevel, TransactionData } from "../types";
import { CanonicalEvidence } from "./riskEvidence";

export interface DecisionEngineInput {
    transaction: TransactionData;
    canonicalEvidence: CanonicalEvidence;
    platformRisk: PlatformRiskResult;
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

/**
 * Deliberately does not score a transaction again. `calculateRiskScore` is the
 * one authoritative deterministic pipeline; LLM output remains advisory.
 */
export function calculateFinalDecision(input: DecisionEngineInput): FinalDecisionOutput {
    const platform = input.platformRisk;
    const rejectedModelFactors = input.validatedModels
        .flatMap(model => model.riskFactors.filter(factor => !factor.allowedForDecision))
        .map(factor => `Rejected: [${factor.name}] - unsupported by transaction evidence.`);
    const hardStops = platform.hardStops ?? [];
    const supportingFactors = platform.factors.map(factor => factor.name);

    return {
        score: platform.score,
        level: platform.level,
        recommendation: platform.recommendation,
        confidence: platform.confidence ?? 70,
        decisionBasis: [
            ...hardStops,
            ...supportingFactors.slice(0, 3),
            input.consensus
                ? `${input.consensus.successfulModelCount} valid model response(s) were advisory inputs; they did not override deterministic policy.`
                : "AI consensus was unavailable; deterministic policy was used.",
        ],
        hardStops,
        supportingFactors,
        rejectedModelFactors,
    };
}
