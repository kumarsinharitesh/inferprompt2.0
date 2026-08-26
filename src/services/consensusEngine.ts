import type {
    ModelRiskResult,
    PlatformRiskResult,
    ConsensusResult,
    RiskLevel,
    FactorConsensus,
    Provider
} from "../types";

function normalizeFactorName(name: string): string {
    return name.trim().toLowerCase().replace(/[^\w\s]|_/g, "").replace(/\s+/g, " ");
}

export function calculateConsensus(
    models: ModelRiskResult[],
    platform: PlatformRiskResult
): ConsensusResult | null {
    const modelCount = models.length;
    const successfulModels = models.filter((m) => !m.error);
    const failedModelCount = modelCount - successfulModels.length;
    const successfulModelCount = successfulModels.length;

    if (successfulModelCount === 0) {
        return null;
    }

    // 1. Array of successful scores
    const scores = successfulModels.map((m) => m.riskScore);

    // 2. Average Score
    const totalScore = scores.reduce((sum, score) => sum + score, 0);
    // Do simple rounding to 2 decay places if needed or keep raw float. Let's keep precision high, round for UI only later.
    // Actually instructions say: round it consistently. Let's do 2 decimal places.
    const averageModelRiskScore = Math.round((totalScore / successfulModelCount) * 100) / 100;

    // 3. Median Score
    const sortedScores = [...scores].sort((a, b) => a - b);
    let medianModelRiskScore = 0;
    if (successfulModelCount === 1) {
        medianModelRiskScore = scores[0];
    } else if (successfulModelCount % 2 === 0) {
        const mid = successfulModelCount / 2;
        medianModelRiskScore = (sortedScores[mid - 1] + sortedScores[mid]) / 2;
    } else {
        medianModelRiskScore = sortedScores[Math.floor(successfulModelCount / 2)];
    }

    // 4. Model Agreement Percentage
    let modelAgreementPct = 100;
    if (successfulModelCount > 1) {
        const sumAbsDev = scores.reduce((sum, score) => sum + Math.abs(score - averageModelRiskScore), 0);
        const meanAbsDev = sumAbsDev / successfulModelCount;
        modelAgreementPct = Math.max(0, Math.min(100, Math.round((100 - meanAbsDev) * 100) / 100));
    }

    // 5. Consensus Risk Level
    // Tally occurrences
    const levelCounts: Partial<Record<RiskLevel, { count: number; sumAvg: number }>> = {};
    successfulModels.forEach((m) => {
        if (!levelCounts[m.riskLevel]) {
            levelCounts[m.riskLevel] = { count: 0, sumAvg: 0 };
        }
        levelCounts[m.riskLevel]!.count++;
        levelCounts[m.riskLevel]!.sumAvg += m.riskScore;
    });

    let consensusRiskLevel: RiskLevel = "LOW";
    let maxCount = -1;
    let tieBreakerScore = -1;

    for (const [level, data] of Object.entries(levelCounts) as [RiskLevel, { count: number; sumAvg: number }][]) {
        if (data.count > maxCount) {
            maxCount = data.count;
            consensusRiskLevel = level;
            tieBreakerScore = data.sumAvg / data.count;
        } else if (data.count === maxCount) {
            // Tie breaker using average model risk score of that bucket
            const avgForLevel = data.sumAvg / data.count;
            if (avgForLevel > tieBreakerScore) {
                // Technically just defaulting to taking the one with the higher average score
                consensusRiskLevel = level;
                tieBreakerScore = avgForLevel;
            }
        }
    }

    // Recommendation consensus
    const recCounts: Record<string, number> = { ALLOW: 0, REVIEW: 0, BLOCK: 0 };
    successfulModels.forEach((m) => {
        if (m.recommendation && recCounts[m.recommendation] !== undefined) {
            recCounts[m.recommendation]++;
        }
    });

    let consensusRecommendation: import("../types").RiskRecommendation = "REVIEW";
    let maxRecCount = -1;
    for (const [rec, count] of Object.entries(recCounts)) {
        if (count > maxRecCount) {
            maxRecCount = count;
            consensusRecommendation = rec as import("../types").RiskRecommendation;
        }
    }

    // 6. Risk Level Agreement %
    const modelsMatchingConsensus = successfulModels.filter(m => m.riskLevel === consensusRiskLevel).length;
    const riskLevelAgreementPct = Math.round((modelsMatchingConsensus / successfulModelCount) * 100);

    // 7. Factor Agreement (Fuzzy Grouping via Substring & Jaccard)
    interface FactorGroup {
        normalizedNames: string[];
        originalName: string;
        models: Provider[];
    }
    const factorGroups: FactorGroup[] = [];

    const calculateSimilarity = (a: string, b: string) => {
        if (a === b) return true;
        if (a.includes(b) || b.includes(a)) return true;
        // Jaccard string similarity
        const filterWords = (s: string) => new Set(s.split(" ").filter(w => w.length > 2 && w !== "and" && w !== "the"));
        const setA = filterWords(a);
        const setB = filterWords(b);
        if (setA.size === 0 || setB.size === 0) return false;

        let intersection = 0;
        for (const w of setA) if (setB.has(w)) intersection++;
        const jaccard = intersection / (setA.size + setB.size - intersection);
        return jaccard > 0.45; // Minimum 45% conceptual word overlap requires strong multi-word linkages
    };

    successfulModels.forEach((m) => {
        if (m.riskFactors && Array.isArray(m.riskFactors)) {
            m.riskFactors.forEach((factor) => {
                const norm = normalizeFactorName(factor.name);
                if (!norm) return;

                let matchedGroup = factorGroups.find(g =>
                    g.normalizedNames.some(existing => calculateSimilarity(existing, norm))
                );

                if (!matchedGroup) {
                    matchedGroup = { normalizedNames: [], originalName: factor.name, models: [] };
                    factorGroups.push(matchedGroup);
                }

                if (!matchedGroup.normalizedNames.includes(norm)) {
                    matchedGroup.normalizedNames.push(norm);
                }
                // Upgrade descriptive display name if the new one is shorter and punchier
                if (factor.name.length < matchedGroup.originalName.length && factor.name.split(" ").length > 1) {
                    matchedGroup.originalName = factor.name;
                }

                if (!matchedGroup.models.includes(m.provider)) {
                    matchedGroup.models.push(m.provider);
                }
            });
        }
    });

    const common: FactorConsensus[] = [];
    const modelSpecific: FactorConsensus[] = [];

    for (const group of factorGroups) {
        const p = Math.round((group.models.length / successfulModelCount) * 100);
        const fc: FactorConsensus = {
            name: group.originalName,
            modelCount: group.models.length,
            percentage: p,
            models: group.models,
        };
        if (group.models.length > 1) {
            common.push(fc);
        } else {
            modelSpecific.push(fc);
        }
    }

    // 8. Platform vs Model Comparison
    const difference = Math.round((platform.score - averageModelRiskScore) * 100) / 100;

    return {
        modelCount,
        successfulModelCount,
        failedModelCount,
        consensusRiskLevel,
        consensusRecommendation,
        averageModelRiskScore,
        medianModelRiskScore,
        modelAgreementPct,
        riskLevelAgreementPct,
        platformModelDifference: {
            platformScore: platform.score,
            modelAverage: averageModelRiskScore,
            difference,
        },
        factorAgreement: {
            common,
            modelSpecific,
        },
    };
}
