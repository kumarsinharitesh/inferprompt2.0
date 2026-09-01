import type { PlatformRiskResult, RiskFactor, RiskLevel, RiskRecommendation, TransactionData } from "../types";

/**
 * The deterministic risk engine is the source of truth for platform decisions.
 * Scores are grouped so correlated evidence cannot be counted repeatedly.
 */
export const RISK_THRESHOLDS = {
    LOW: 0,
    MEDIUM: 25,
    HIGH: 50,
    CRITICAL: 75,
} as const;

export const RISK_GROUP_CAPS = {
    authentication: 42,
    merchantTrust: 22,
    deviceHistory: 12,
    velocity: 20,
    amount: 14,
    location: 18,
    timing: 6,
} as const;

type GroupName = keyof typeof RISK_GROUP_CAPS;

interface ScoringState {
    factors: RiskFactor[];
    groups: Record<GroupName, number>;
    modifiers: Array<{ name: string; effect: number; reason: string }>;
    dataQuality: string[];
    hardStops: string[];
}

const isMeaningful = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value !== "string") return true;
    const normalized = value.trim().toUpperCase();
    return normalized !== "" && normalized !== "UNKNOWN" && normalized !== "NOT_PROVIDED" && normalized !== "N/A";
};

function addGroupedFactor(
    state: ScoringState,
    group: GroupName,
    requestedContribution: number,
    factor: Omit<RiskFactor, "contribution" | "group">
) {
    const available = Math.max(0, RISK_GROUP_CAPS[group] - state.groups[group]);
    const contribution = Math.min(requestedContribution, available);
    if (contribution <= 0) return;

    state.groups[group] += contribution;
    state.factors.push({ ...factor, contribution, group });
}

function levelFor(score: number): RiskLevel {
    if (score >= RISK_THRESHOLDS.CRITICAL) return "CRITICAL";
    if (score >= RISK_THRESHOLDS.HIGH) return "HIGH";
    if (score >= RISK_THRESHOLDS.MEDIUM) return "MEDIUM";
    return "LOW";
}

function severityFor(contribution: number): RiskLevel {
    if (contribution >= 30) return "CRITICAL";
    if (contribution >= 18) return "HIGH";
    if (contribution >= 8) return "MEDIUM";
    return "LOW";
}

function addDataQualityWarnings(tx: TransactionData, state: ScoringState) {
    if (!isMeaningful(tx.merchantVerification)) state.dataQuality.push("Merchant verification is unknown; it was not treated as a risk signal.");
    if (!isMeaningful(tx.paymentMethod)) state.dataQuality.push("Payment method is unknown; method-specific checks were skipped.");
    if (!isMeaningful(tx.paymentVerification)) state.dataQuality.push("Payment verification is unknown; it was not treated as failed.");
    if (tx.isNewDevice === undefined) state.dataQuality.push("Device history is unavailable; new-device risk was not assumed.");
    if (tx.previousTransactionCount === undefined) state.dataQuality.push("Transaction history is unavailable; amount behaviour could not be compared to a baseline.");

    if (tx.paymentMethod === "UPI" && !tx.upiDetails) {
        state.dataQuality.push("UPI payment selected without UPI verification details.");
    }
    if (tx.paymentMethod === "CARD" && !tx.cardDetails) {
        state.dataQuality.push("Card payment selected without card authentication details.");
    }
    if (tx.merchantVerification === "VERIFIED" && tx.merchantAge === 0) {
        state.dataQuality.push("Merchant is marked verified but has an age of zero months.");
    }
    if (tx.isNewDevice === false && tx.previousTransactionCount === 0) {
        state.dataQuality.push("Known device conflicts with zero recorded previous transactions.");
    }
    if (tx.paymentVerification === "VERIFIED" && tx.paymentMethod === "UPI" && tx.upiDetails?.upiVerification === "FAILED") {
        state.dataQuality.push("Payment verification conflicts with failed UPI verification.");
    }
}

export function calculateRiskScore(tx: TransactionData): PlatformRiskResult {
    const state: ScoringState = {
        factors: [],
        groups: { authentication: 0, merchantTrust: 0, deviceHistory: 0, velocity: 0, amount: 0, location: 0, timing: 0 },
        modifiers: [],
        dataQuality: [],
        hardStops: [],
    };

    addDataQualityWarnings(tx, state);

    // Authentication group: payment and instrument failures often describe the same event.
    const methodFailure =
        (tx.paymentMethod === "UPI" && tx.upiDetails?.upiVerification === "FAILED") ||
        (tx.paymentMethod === "CARD" && tx.cardDetails?.threeDS === "FAILED") ||
        ((tx.paymentMethod === "NET_BANKING" || tx.paymentMethod === "BANK_TRANSFER") &&
            (tx.netBankingDetails?.bankVerification === "FAILED" || tx.bankTransferDetails?.bankVerification === "FAILED"));

    if (tx.paymentVerification === "FAILED") {
        addGroupedFactor(state, "authentication", 34, {
            name: "Payment Verification Failed",
            severity: "CRITICAL",
            description: "The payment authorisation check explicitly failed.",
            evidence: "paymentVerification: FAILED",
            fieldRefs: ["paymentVerification"],
        });
    }

    if (tx.paymentMethod === "CARD" && tx.cardDetails?.threeDS === "FAILED") {
        addGroupedFactor(state, "authentication", tx.paymentVerification === "FAILED" ? 8 : 42, {
            name: "3DS Authentication Failed",
            severity: "CRITICAL",
            description: "Card 3D Secure authentication failed. It is capped with any payment-verification failure to avoid double counting.",
            evidence: "cardDetails.threeDS: FAILED",
            fieldRefs: ["paymentMethod", "cardDetails.threeDS"],
        });
        state.hardStops.push("Card 3D Secure authentication failed.");
    } else if (tx.paymentMethod === "UPI" && tx.upiDetails?.upiVerification === "FAILED") {
        addGroupedFactor(state, "authentication", tx.paymentVerification === "FAILED" ? 8 : 30, {
            name: "UPI Verification Failed",
            severity: "HIGH",
            description: "UPI verification failed. Its contribution shares the authentication group cap with the payment check.",
            evidence: "upiDetails.upiVerification: FAILED",
            fieldRefs: ["paymentMethod", "upiDetails.upiVerification"],
        });
    } else if ((tx.paymentMethod === "NET_BANKING" || tx.paymentMethod === "BANK_TRANSFER") && methodFailure) {
        addGroupedFactor(state, "authentication", tx.paymentVerification === "FAILED" ? 8 : 30, {
            name: "Bank Verification Failed",
            severity: "HIGH",
            description: "Bank verification failed and is grouped with payment authentication evidence.",
            evidence: "bankVerification: FAILED",
            fieldRefs: ["paymentMethod"],
        });
    }
    if (tx.paymentVerification === "FAILED" && methodFailure) {
        state.hardStops.push("Payment and method-specific verification both failed.");
    }
    if (tx.paymentMethod === "CARD" && tx.cardDetails?.avsStatus === "MISMATCH") {
        addGroupedFactor(state, "authentication", 8, {
            name: "Address Verification Mismatch",
            severity: "MEDIUM",
            description: "Address verification did not match; contribution is capped with authentication evidence.",
            evidence: "cardDetails.avsStatus: MISMATCH",
            fieldRefs: ["cardDetails.avsStatus"],
        });
    }

    // Merchant trust group: anonymous status and zero merchant age are correlated.
    if (tx.merchantVerification === "ANONYMOUS") {
        addGroupedFactor(state, "merchantTrust", 18, {
            name: "Anonymous Merchant",
            severity: "HIGH",
            description: "Merchant identity is explicitly anonymous.",
            evidence: "merchantVerification: ANONYMOUS",
            fieldRefs: ["merchantVerification"],
        });
    } else if (tx.merchantVerification === "UNVERIFIED") {
        addGroupedFactor(state, "merchantTrust", 10, {
            name: "Unverified Merchant",
            severity: "MEDIUM",
            description: "Merchant identity has not been verified.",
            evidence: "merchantVerification: UNVERIFIED",
            fieldRefs: ["merchantVerification"],
        });
    }
    if (typeof tx.merchantAge === "number" && Number.isFinite(tx.merchantAge)) {
        if (tx.merchantAge === 0) {
            addGroupedFactor(state, "merchantTrust", 8, {
                name: "New Merchant",
                severity: "MEDIUM",
                description: "The merchant age is zero months; this is capped with merchant identity status.",
                evidence: "merchantAge: 0 months",
                fieldRefs: ["merchantAge"],
            });
        } else if (tx.merchantAge < 6) {
            addGroupedFactor(state, "merchantTrust", 5, {
                name: "Young Merchant",
                severity: "LOW",
                description: "The merchant has limited operating history.",
                evidence: `merchantAge: ${tx.merchantAge} months`,
                fieldRefs: ["merchantAge"],
            });
        }
    }

    // Device history group: a new device and no history must not be treated as two independent events.
    if (tx.isNewDevice === true) {
        addGroupedFactor(state, "deviceHistory", 9, {
            name: "New Device",
            severity: "MEDIUM",
            description: "The device is not associated with prior user activity.",
            evidence: "isNewDevice: true",
            fieldRefs: ["isNewDevice"],
        });
        if (tx.previousTransactionCount === 0) {
            addGroupedFactor(state, "deviceHistory", 3, {
                name: "Limited Device History",
                severity: "LOW",
                description: "No previous transactions are available for this new device; contribution is capped with the device signal.",
                evidence: "previousTransactionCount: 0",
                fieldRefs: ["previousTransactionCount"],
            });
        }
    }

    if (typeof tx.failedAttempts === "number" && Number.isFinite(tx.failedAttempts)) {
        if (tx.failedAttempts >= 4) {
            addGroupedFactor(state, "velocity", 20, {
                name: "Repeated Failed Attempts",
                severity: "HIGH",
                description: "Four or more recent failed attempts indicate a velocity anomaly.",
                evidence: `failedAttempts: ${tx.failedAttempts}`,
                fieldRefs: ["failedAttempts"],
            });
        } else if (tx.failedAttempts >= 2) {
            addGroupedFactor(state, "velocity", 10, {
                name: "Recent Failed Attempts",
                severity: "MEDIUM",
                description: "Two or three recent failures indicate elevated retry behaviour.",
                evidence: `failedAttempts: ${tx.failedAttempts}`,
                fieldRefs: ["failedAttempts"],
            });
        }
    }

    if (isMeaningful(tx.ipCountry) && isMeaningful(tx.userCountry) && tx.ipCountry!.trim().toLowerCase() !== tx.userCountry!.trim().toLowerCase()) {
        addGroupedFactor(state, "location", 18, {
            name: "Location Mismatch",
            severity: "HIGH",
            description: "The IP origin differs from the registered user country.",
            evidence: `IP: ${tx.ipCountry}, user: ${tx.userCountry}`,
            fieldRefs: ["ipCountry", "userCountry"],
        });
    }

    if (tx.transactionTimestamp) {
        const date = new Date(tx.transactionTimestamp);
        if (Number.isFinite(date.getTime()) && date.getHours() >= 0 && date.getHours() < 5) {
            addGroupedFactor(state, "timing", 6, {
                name: "Unusual Transaction Time",
                severity: "LOW",
                description: "The transaction occurred during low-volume overnight hours.",
                evidence: `Local hour: ${date.getHours()}`,
                fieldRefs: ["transactionTimestamp"],
            });
        }
    }

    // Amount is only contextual. Without a personal baseline, conservative absolute bands are used.
    if (Number.isFinite(tx.amount)) {
        if (tx.amount < 100) {
            state.modifiers.push({ name: "Low-value amount context", effect: -3, reason: "A very low amount slightly reduces exposure; it does not override verification failures." });
        } else if (tx.amount >= 50_000) {
            addGroupedFactor(state, "amount", 14, {
                name: "Very High Amount Context",
                severity: "MEDIUM",
                description: "Amount is high in the absence of a user-specific historical baseline.",
                evidence: `amount: ${tx.amount} ${tx.currency}`,
                fieldRefs: ["amount", "currency"],
            });
        } else if (tx.amount >= 10_000) {
            addGroupedFactor(state, "amount", 6, {
                name: "High Amount Context",
                severity: "LOW",
                description: "Amount receives a conservative contextual adjustment because no user baseline was supplied.",
                evidence: `amount: ${tx.amount} ${tx.currency}`,
                fieldRefs: ["amount", "currency"],
            });
        }
    }

    // MCC is intentionally not scored alone. It is contextual evidence for models and investigation.
    const positiveContributions = Object.values(state.groups).reduce((sum, value) => sum + value, 0);
    const modifierTotal = state.modifiers.reduce((sum, modifier) => sum + modifier.effect, 0);
    const score = Math.max(0, Math.min(100, Math.round(positiveContributions + modifierTotal)));
    const level = levelFor(score);
    const recommendation: RiskRecommendation = state.hardStops.length > 0 || level === "CRITICAL"
        ? "BLOCK"
        : level === "HIGH" || level === "MEDIUM"
            ? "REVIEW"
            : "ALLOW";

    const confidence = Math.max(35, Math.min(95, 90 - state.dataQuality.length * 6));

    return {
        score,
        level,
        recommendation,
        confidence,
        factors: state.factors.map(factor => ({ ...factor, severity: severityFor(factor.contribution ?? 0) })),
        modifiers: state.modifiers,
        groupContributions: state.groups,
        dataQuality: state.dataQuality,
        hardStops: state.hardStops,
    };
}
