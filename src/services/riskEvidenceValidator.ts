import { TransactionData, ModelRiskResult, RiskFactor } from "../types";
import { buildTransactionEvidence } from "./riskEvidence";

export function validateModelFactors(
    transaction: TransactionData,
    model: ModelRiskResult
): RiskFactor[] {
    const canonical = buildTransactionEvidence(transaction);

    return model.riskFactors.map(factor => {
        let supported = true;
        let supportType: RiskFactor["supportType"] = "DIRECT_FIELD";
        let allowedForDecision = true;

        const factorLower = (factor.name + " " + factor.description).toLowerCase();

        // 1. MCC Lookup constraints
        if (factorLower.includes("mcc") || factorLower.includes("category") || factorLower.includes("industry")) {
            // Check if the LLM hallucinated a completely different category
            const canonicalLower = canonical.mccCategory.toLowerCase();
            const rawCategoryOverride = factorLower.includes("tobacco") && !canonicalLower.includes("tobacco");
            const rawSecondOverride = factorLower.includes("gambling") && !canonicalLower.includes("gambling");

            if (rawCategoryOverride || rawSecondOverride) {
                supported = false;
                supportType = "MCC_LOOKUP";
                allowedForDecision = false;
            } else {
                supportType = "MCC_LOOKUP";
            }
        }

        // 2. Merchant Name Inference Constraints (LLM shouldn't invent authorization)
        if (factorLower.includes("authorized") || factorLower.includes("unverified merchant") || factorLower.includes("trusted")) {
            // Did LLM invent authorization without reading merchantVerification?
            if (canonical.merchantVerification === "UNKNOWN" && factorLower.includes("unverified")) {
                supported = false; // UNKNOWN != UNVERIFIED natively
                allowedForDecision = false;
                supportType = "UNSUPPORTED";
            } else if (canonical.merchantVerification !== "VERIFIED" && (factorLower.includes("authorized") || factorLower.includes("trusted"))) {
                supported = false;
                allowedForDecision = false;
                supportType = "UNSUPPORTED";
            }
        }

        // 3. Country Invention/Location Constraints
        if (factorLower.includes("location mismatch") || factorLower.includes("ip mismatch")) {
            if (!canonical.locationMatch && (canonical.ipCountry === "UNKNOWN" || canonical.userCountry === "UNKNOWN")) {
                // LLM invented a mismatch but data is actually just missing
                supported = false;
                allowedForDecision = false;
                supportType = "UNSUPPORTED";
            } else {
                supportType = "CROSS_FIELD";
            }
        }

        // 4. Timestamp invention
        if (factorLower.includes("invalid timestamp") || factorLower.includes("impossible date") || factorLower.includes("future date")) {
            if (canonical.timestampValid) {
                supported = false;
                allowedForDecision = false;
                supportType = "UNSUPPORTED";
            }
        }

        return {
            ...factor,
            supported,
            supportType,
            allowedForDecision,
            evidence: factor.evidence || "Derived internally by validation"
        };
    });
}
