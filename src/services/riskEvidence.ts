import { TransactionData } from "../types";
import { getMccCategory } from "../utils/mcc";

export interface TimestampValidation {
    present: boolean;
    valid: boolean;
    hour?: number;
    reason?: string;
    isNightTime?: boolean;
}

export function validateTransactionTimestamp(timestamp?: string): TimestampValidation {
    if (!timestamp) {
        return { present: false, valid: false, reason: "Timestamp missing" };
    }
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) {
        return { present: true, valid: false, reason: "Invalid date format" };
    }
    const now = new Date();
    if (d > now) {
        return { present: true, valid: false, reason: "Timestamp is in the future" };
    }

    const hour = d.getHours();
    // Deterministic night time bounding natively (example: 12 AM to 5 AM natively)
    const isNightTime = hour >= 0 && hour <= 5;

    return {
        present: true,
        valid: true,
        hour,
        isNightTime
    };
}

export interface CanonicalEvidence {
    amount: number;
    currency: string;
    merchantName: string;
    merchantVerification: string;
    merchantAge: number | null;
    mccCode: string;
    mccCategory: string;
    paymentMethod: string;
    paymentVerification: string;
    kycStatus: string;
    deviceType: string;
    isNewDevice: boolean | null;
    failedAttempts: number | null;
    previousTransactionCount: number | null;
    ipCountry: string;
    userCountry: string;
    locationMatch: boolean;
    timestampValid: boolean;
    timestampHour?: number;
    isNightTime?: boolean;
    offerPresent: boolean;
}

export function buildTransactionEvidence(tx: TransactionData): CanonicalEvidence {
    const timestampData = validateTransactionTimestamp(tx.transactionTimestamp);
    const locationMatch = tx.ipCountry && tx.userCountry ? tx.ipCountry.toLowerCase() === tx.userCountry.toLowerCase() : false;

    // Natively fetch from MCC lookup cleanly ignoring LLM 
    const mccCategory = getMccCategory(tx.mccCode);

    return {
        amount: tx.amount,
        currency: tx.currency,
        merchantName: tx.merchantName,
        merchantVerification: tx.merchantVerification || "UNKNOWN",
        merchantAge: typeof tx.merchantAge === "number" ? tx.merchantAge : null,
        mccCode: tx.mccCode || "UNKNOWN",
        mccCategory,
        paymentMethod: tx.paymentMethod || "UNKNOWN",
        paymentVerification: tx.paymentVerification || "UNKNOWN",
        kycStatus: tx.walletDetails?.kycStatus || "UNKNOWN",
        deviceType: tx.deviceType || "UNKNOWN",
        isNewDevice: typeof tx.isNewDevice === "boolean" ? tx.isNewDevice : null,
        failedAttempts: typeof tx.failedAttempts === "number" ? tx.failedAttempts : null,
        previousTransactionCount: typeof tx.previousTransactionCount === "number" ? tx.previousTransactionCount : null,
        ipCountry: tx.ipCountry || "UNKNOWN",
        userCountry: tx.userCountry || tx.country || "UNKNOWN",
        locationMatch,
        timestampValid: timestampData.valid,
        timestampHour: timestampData.hour,
        isNightTime: timestampData.isNightTime,
        offerPresent: !!tx.offer?.offerPresent
    };
}
