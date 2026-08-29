import type { TransactionData, Provider } from "../types";

export interface ValidationError {
    field: string;
    message: string;
}

/** Validate the core transaction fields. */
export function validateTransactionData(t: Partial<TransactionData>): ValidationError[] {
    const errors: ValidationError[] = [];

    if (t.amount === undefined || t.amount === null || isNaN(t.amount)) {
        errors.push({ field: "amount", message: "Amount is required." });
    } else if (t.amount <= 0) {
        errors.push({ field: "amount", message: "Amount must be greater than 0." });
    } else if (t.amount > 10000000) {
        errors.push({ field: "amount", message: "Amount exceeds maximum logical bound." });
    }

    if (!t.currency) {
        errors.push({ field: "currency", message: "Currency is required." });
    }

    if (!t.country || t.country.trim() === "") {
        errors.push({ field: "country", message: "Country is required." });
    }

    if (!t.merchantName || t.merchantName.trim() === "") {
        errors.push({ field: "merchantName", message: "Merchant name is required." });
    }

    if (t.failedAttempts !== undefined && t.failedAttempts < 0) {
        errors.push({ field: "failedAttempts", message: "Failed attempts cannot be negative." });
    } else if (t.failedAttempts !== undefined && t.failedAttempts > 50) {
        errors.push({ field: "failedAttempts", message: "Failed attempts exceeds realistic bounds." });
    }

    if (t.merchantAge !== undefined && t.merchantAge < 0) {
        errors.push({ field: "merchantAge", message: "Merchant age cannot be negative." });
    } else if (t.merchantAge !== undefined && t.merchantAge > 1200) {
        errors.push({ field: "merchantAge", message: "Merchant age exceeds maximum logical bound (100 years)." });
    }

    if (t.previousTransactionCount !== undefined && t.previousTransactionCount < 0) {
        errors.push({ field: "previousTransactionCount", message: "Previous transaction count cannot be negative." });
    }

    if (t.transactionTimestamp) {
        const txDate = new Date(t.transactionTimestamp);
        if (!isNaN(txDate.getTime()) && txDate > new Date()) {
            errors.push({ field: "transactionTimestamp", message: "Transaction time cannot be in the future." });
        }
    }

    if (t.ipCountry && (t.ipCountry.length < 2 || t.ipCountry.length > 56)) {
        errors.push({ field: "ipCountry", message: "Invalid IP country length." });
    }

    if (t.userCountry && (t.userCountry.length < 2 || t.userCountry.length > 56)) {
        errors.push({ field: "userCountry", message: "Invalid user country length." });
    }

    return errors;
}

/** Validate the full risk analysis request (transaction + model selection). */
export function validateRiskRequest(req: {
    transaction: Partial<TransactionData>;
    selectedModels: Provider[];
}): ValidationError[] {
    const errors = validateTransactionData(req.transaction);

    if (req.selectedModels.length === 0) {
        errors.push({ field: "selectedModels", message: "Select at least one AI model." });
    }

    if (req.selectedModels.length > 4) {
        errors.push({ field: "selectedModels", message: "Maximum 4 models can run simultaneously." });
    }

    return errors;
}
