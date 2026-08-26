import type { TransactionData, PlatformRiskResult, RiskFactor, RiskLevel, RiskRecommendation } from "../types";

// ---------------------------------------------------------------------------
// Configuration / Risk Weights
// ---------------------------------------------------------------------------

export const RISK_THRESHOLDS = {
    // Score to Level mapping
    level: {
        LOW: { min: 0, max: 24, label: "LOW" as RiskLevel },
        MEDIUM: { min: 25, max: 49, label: "MEDIUM" as RiskLevel },
        HIGH: { min: 50, max: 74, label: "HIGH" as RiskLevel },
        CRITICAL: { min: 75, max: 100, label: "CRITICAL" as RiskLevel },
    },
};

export const RECOMMENDATION_MAP: Record<RiskLevel, RiskRecommendation> = {
    LOW: "ALLOW",
    MEDIUM: "REVIEW",
    HIGH: "REVIEW",
    CRITICAL: "BLOCK",
};

export const CONFIGURABLE_WEIGHTS = {
    newDevice: 20,
    failedAttempts: {
        moderateThreshold: 2, // 2-3
        moderateWeight: 15,
        highThreshold: 4,     // 4+
        highWeight: 30,
    },
    merchantAge: {
        newThreshold: 1,      // < 1 month
        newWeight: 20,
        youngThreshold: 6,    // < 6 months (and >= 1)
        youngWeight: 5,
    },
    locationMismatch: 25,
    nightTime: {
        startHour: 0,
        endHour: 5, // 00:00 to 04:59
        weight: 15,
    },
    // Prototype/configurable demonstration heuristic for high amounts
    demoAmountAnomaly: {
        veryHighThreshold: 50000,
        veryHighWeight: 20,
        highThreshold: 10000,
        highWeight: 10,
    },
    // Phase 12 Payment Context Heuristics
    paymentContext: {
        paymentVerificationFailed: 25, // Explicit prototype signal overriding safe behavior safely
        threeDSFailed: 30,
        avsMismatch: 15,
        upiVerificationFailed: 25,
        bankVerificationFailed: 25,
        posTerminalUnverified: 15,
        merchantAnonymous: 20,
        merchantUnverified: 10,
    }
};

// ---------------------------------------------------------------------------
// Pure Deterministic Evaluation Functions
// ---------------------------------------------------------------------------
// Undefined optional properties always contribute 0 risk.

export function calculateRiskScore(tx: TransactionData): PlatformRiskResult {
    const factors: RiskFactor[] = [];
    let score = 0;

    // A. Transaction amount (Demo purely static heuristic)
    if (tx.amount >= CONFIGURABLE_WEIGHTS.demoAmountAnomaly.veryHighThreshold) {
        factors.push({
            name: "Very High Amount",
            severity: "HIGH",
            description: "Transaction amount exceeds very high anomaly threshold (prototype heuristic).",
            evidence: `Amount: ${tx.amount} ${tx.currency}`
        });
        score += CONFIGURABLE_WEIGHTS.demoAmountAnomaly.veryHighWeight;
    } else if (tx.amount >= CONFIGURABLE_WEIGHTS.demoAmountAnomaly.highThreshold) {
        factors.push({
            name: "High Amount",
            severity: "MEDIUM",
            description: "Transaction amount exceeds high anomaly threshold (prototype heuristic).",
            evidence: `Amount: ${tx.amount} ${tx.currency}`
        });
        score += CONFIGURABLE_WEIGHTS.demoAmountAnomaly.highWeight;
    }

    // B. New Device
    if (tx.isNewDevice === true) {
        factors.push({
            name: "New Device",
            severity: "MEDIUM",
            description: "Transaction originates from a device not historically associated with the user.",
            evidence: "isNewDevice = true"
        });
        score += CONFIGURABLE_WEIGHTS.newDevice;
    }

    // C. Failed Attempts
    if (tx.failedAttempts !== undefined) {
        if (tx.failedAttempts >= CONFIGURABLE_WEIGHTS.failedAttempts.highThreshold) {
            factors.push({
                name: "Many Failed Attempts",
                severity: "HIGH",
                description: "Multiple transaction failures detected recently.",
                evidence: `failedAttempts: ${tx.failedAttempts}`
            });
            score += CONFIGURABLE_WEIGHTS.failedAttempts.highWeight;
        } else if (tx.failedAttempts >= CONFIGURABLE_WEIGHTS.failedAttempts.moderateThreshold) {
            factors.push({
                name: "Failed Attempts",
                severity: "MEDIUM",
                description: "Some recent failed attempts detected.",
                evidence: `failedAttempts: ${tx.failedAttempts}`
            });
            score += CONFIGURABLE_WEIGHTS.failedAttempts.moderateWeight;
        }
    }

    // D. Merchant Age
    if (tx.merchantAge !== undefined) {
        if (tx.merchantAge < CONFIGURABLE_WEIGHTS.merchantAge.newThreshold) {
            factors.push({
                name: "New Merchant",
                severity: "HIGH",
                description: "The merchant account was created very recently.",
                evidence: `merchantAge: ${tx.merchantAge} month(s)`
            });
            score += CONFIGURABLE_WEIGHTS.merchantAge.newWeight;
        } else if (tx.merchantAge < CONFIGURABLE_WEIGHTS.merchantAge.youngThreshold) {
            factors.push({
                name: "Young Merchant",
                severity: "MEDIUM",
                description: "The merchant account has limited historical volume.",
                evidence: `merchantAge: ${tx.merchantAge} month(s)`
            });
            score += CONFIGURABLE_WEIGHTS.merchantAge.youngWeight;
        }
    }

    // E. Location Mismatch
    if (tx.ipCountry && tx.userCountry) {
        if (tx.ipCountry.trim().toLowerCase() !== tx.userCountry.trim().toLowerCase()) {
            factors.push({
                name: "Location Mismatch",
                severity: "HIGH",
                description: "IP address origin country differs from registered user country.",
                evidence: `IP: ${tx.ipCountry}, User: ${tx.userCountry}`
            });
            score += CONFIGURABLE_WEIGHTS.locationMismatch;
        }
    }

    // F. Transaction Time Anomaly
    if (tx.transactionTimestamp) {
        const d = new Date(tx.transactionTimestamp);
        if (!isNaN(d.getTime())) {
            const h = d.getHours();
            // If it falls in the night time window (e.g. 0 to 4 inclusive when endHour is 5)
            if (h >= CONFIGURABLE_WEIGHTS.nightTime.startHour && h < CONFIGURABLE_WEIGHTS.nightTime.endHour) {
                factors.push({
                    name: "Unusual Time",
                    severity: "MEDIUM",
                    description: "Transaction occurred during statistically low-volume late night hours.",
                    evidence: `Local hour: ${h}`
                });
                score += CONFIGURABLE_WEIGHTS.nightTime.weight;
            }
        }
    }

    // G. Merchant Verification Status
    if (tx.merchantVerification) {
        if (tx.merchantVerification === "ANONYMOUS") {
            factors.push({
                name: "Anonymous Merchant",
                severity: "MEDIUM",
                description: "Merchant identity is entirely anonymous or hidden.",
                evidence: "merchantVerification: ANONYMOUS"
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.merchantAnonymous;
        } else if (tx.merchantVerification === "UNVERIFIED") {
            factors.push({
                name: "Unverified Merchant",
                severity: "LOW",
                description: "Merchant identity has not been explicitly verified.",
                evidence: "merchantVerification: UNVERIFIED"
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.merchantUnverified;
        }
    }

    // H. Payment Verification Source
    if (tx.paymentVerification === "FAILED") {
        factors.push({
            name: "Payment Verification Failed",
            severity: "HIGH",
            description: "The underlying payment context authorization reported a failure.",
            evidence: "paymentVerification: FAILED"
        });
        score += CONFIGURABLE_WEIGHTS.paymentContext.paymentVerificationFailed;
    }

    // I. Method-Specific Verification
    if (tx.paymentMethod === "CARD" && tx.cardDetails) {
        if (tx.cardDetails.threeDS === "FAILED") {
            factors.push({
                name: "3DS Failed",
                severity: "HIGH",
                description: "3D Secure authentication failed.",
                evidence: `Card Network: ${tx.cardDetails.cardNetwork || "Unknown"}`
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.threeDSFailed;
        }
        if (tx.cardDetails.avsStatus === "MISMATCH") {
            factors.push({
                name: "AVS Mismatch",
                severity: "MEDIUM",
                description: "Card Address Verification System returned a full mismatch.",
                evidence: "avsStatus: MISMATCH"
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.avsMismatch;
        }
    } else if (tx.paymentMethod === "UPI" && tx.upiDetails) {
        if (tx.upiDetails.upiVerification === "FAILED") {
            factors.push({
                name: "UPI Verification Failed",
                severity: "HIGH",
                description: "UPI handle or application context failed verification.",
                evidence: `App: ${tx.upiDetails.upiApp || "Unknown"}`
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.upiVerificationFailed;
        }
    } else if ((tx.paymentMethod === "NET_BANKING" && tx.netBankingDetails?.bankVerification === "FAILED") ||
        (tx.paymentMethod === "BANK_TRANSFER" && tx.bankTransferDetails?.bankVerification === "FAILED")) {
        factors.push({
            name: "Bank Verification Failed",
            severity: "HIGH",
            description: "Direct bank authorization context reported a failure.",
            evidence: "bankVerification: FAILED"
        });
        score += CONFIGURABLE_WEIGHTS.paymentContext.bankVerificationFailed;
    } else if (tx.posDetails) {
        if (tx.posDetails.terminalVerified === false) {
            factors.push({
                name: "Unverified POS Terminal",
                severity: "MEDIUM",
                description: "Physical point of sale terminal is unverified or untrusted.",
                evidence: "terminalVerified: false"
            });
            score += CONFIGURABLE_WEIGHTS.paymentContext.posTerminalUnverified;
        }
    }

    // Final deterministic score and enum derivations
    const finalScore = Math.max(0, Math.min(100, score)); // Clamp 0-100

    let finalLevel = RISK_THRESHOLDS.level.LOW.label;
    if (finalScore >= RISK_THRESHOLDS.level.CRITICAL.min) finalLevel = RISK_THRESHOLDS.level.CRITICAL.label;
    else if (finalScore >= RISK_THRESHOLDS.level.HIGH.min) finalLevel = RISK_THRESHOLDS.level.HIGH.label;
    else if (finalScore >= RISK_THRESHOLDS.level.MEDIUM.min) finalLevel = RISK_THRESHOLDS.level.MEDIUM.label;

    const finalRecommendation = RECOMMENDATION_MAP[finalLevel];

    return {
        score: finalScore,
        level: finalLevel,
        recommendation: finalRecommendation,
        factors,
    };
}
