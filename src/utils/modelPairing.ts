import type { ModelRiskResult, ModelReasoningComparison } from "../types";
import { runABTD } from "./diff";

/**
 * Pure utility to generate N * (N - 1) / 2 unique pairs from an array of successful models,
 * running the ABTD algorithm iteratively on each pair's reasoning text. 
 */
export function generateModelPairs(models: ModelRiskResult[]): ModelReasoningComparison[] {
    const successfulModels = models.filter(m => !m.error);
    const pairs: ModelReasoningComparison[] = [];

    for (let i = 0; i < successfulModels.length; i++) {
        for (let j = i + 1; j < successfulModels.length; j++) {
            const modelA = successfulModels[i];
            const modelB = successfulModels[j];

            const diffResponse = runABTD(modelA.reasoning, modelB.reasoning);

            pairs.push({
                providerA: modelA.provider,
                providerB: modelB.provider,
                resultA: modelA,
                resultB: modelB,
                similarityPct: diffResponse.stats.similarityPct,
                diffTokensA: diffResponse.tokensA,
                diffTokensB: diffResponse.tokensB,
            });
        }
    }

    return pairs;
}
