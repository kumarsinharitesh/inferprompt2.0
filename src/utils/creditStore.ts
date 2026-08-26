import type { CreditBalance, CreditTransaction, PaymentRecord } from "../types";
import { FREE_CREDITS } from "../config/billing";

export const BALANCE_KEY = "inferprompt_credit_balance";
export const TRANSACTIONS_KEY = "inferprompt_credit_transactions";
export const PAYMENTS_KEY = "inferprompt_payment_history";

// ---------------------------------------------------------------------------
// Internal accessors
// ---------------------------------------------------------------------------

function _getBalance(): CreditBalance | null {
    try {
        const raw = localStorage.getItem(BALANCE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed.balance !== "number") return null;
        return parsed as CreditBalance;
    } catch (e) {
        return null;
    }
}

function _setBalance(b: CreditBalance) {
    try {
        localStorage.setItem(BALANCE_KEY, JSON.stringify(b));
    } catch (e) {
        console.error("Storage failed", e);
    }
}

function _addTransaction(t: CreditTransaction) {
    try {
        const raw = localStorage.getItem(TRANSACTIONS_KEY);
        const list: CreditTransaction[] = raw ? JSON.parse(raw) : [];
        list.unshift(t);
        localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(list));
    } catch (e) {
        console.error("Storage failed", e);
    }
}

function _addPayment(p: PaymentRecord) {
    try {
        const raw = localStorage.getItem(PAYMENTS_KEY);
        const list: PaymentRecord[] = raw ? JSON.parse(raw) : [];
        list.unshift(p);
        localStorage.setItem(PAYMENTS_KEY, JSON.stringify(list));
    } catch (e) {
        console.error("Storage failed", e);
    }
}

// ---------------------------------------------------------------------------
// Safely Exported Public Credit Store interface 
// ---------------------------------------------------------------------------

/**
 * Initializes free credits if the user has no history of any balance.
 * Defends against arbitrary reloads yielding unlimited credits.
 */
export function initializeCredits(): void {
    if (typeof window === "undefined") return;
    const current = _getBalance();
    if (!current) {
        _setBalance({ balance: FREE_CREDITS, totalPurchased: 0, totalUsed: 0 });
        _addTransaction({
            id: "tr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
            timestamp: new Date().toISOString(),
            type: "FREE",
            credits: FREE_CREDITS,
            description: "Initial free credits granted."
        });
    }
}

export function getCreditBalance(): CreditBalance {
    if (typeof window === "undefined") return { balance: 0, totalPurchased: 0, totalUsed: 0 };
    const current = _getBalance();
    if (current) return current;
    // Failsafe zero (if initializeCredits hasn't run yet)
    return { balance: 0, totalPurchased: 0, totalUsed: 0 };
}

export function getCreditTransactions(): CreditTransaction[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(TRANSACTIONS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

export function getPaymentHistory(): PaymentRecord[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(PAYMENTS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Validates balance and deducts natively.
 * Returns true if successful, false if insufficient bounds.
 */
export function consumeCredit(amount: number, reason: string): boolean {
    if (typeof window === "undefined") return false;

    if (amount <= 0 || isNaN(amount)) return false; // Hardening: Bound strictly away from negative / NaN abuse injections. 

    const current = _getBalance();
    if (!current || current.balance < amount) return false;

    current.balance -= amount;
    current.totalUsed += amount;
    _setBalance(current);

    _addTransaction({
        id: "tr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        type: "USAGE",
        credits: -amount,
        description: reason
    });
    return true;
}

export function addCredits(amount: number, reason: string, refId?: string): void {
    if (typeof window === "undefined") return;

    if (amount <= 0 || isNaN(amount)) return; // Hardening constraints

    // Payment Sandbox ID verification mapped natively
    if (refId) {
        const existing = getCreditTransactions();
        if (existing.some(t => t.referenceId === refId)) {
            console.warn("Hardening block: Duplicate test fulfillment attempt stopped natively.");
            return;
        }
    }

    // Need to ensure initialization hasn't skipped accidentally 
    let current = _getBalance();
    if (!current || typeof current.balance !== "number") {
        current = { balance: 0, totalPurchased: 0, totalUsed: 0 };
    }

    current.balance += amount;
    current.totalPurchased += amount;
    _setBalance(current);

    _addTransaction({
        id: "tr_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
        timestamp: new Date().toISOString(),
        type: "PURCHASE",
        credits: amount,
        description: reason,
        referenceId: refId
    });
}

export function recordPayment(payment: PaymentRecord): void {
    if (typeof window === "undefined") return;
    _addPayment(payment);
}
