import React, { useState, useEffect } from "react";
import CreditPurchaseModal from "../components/CreditPurchaseModal";
import { useAuth } from "../context/AuthContext";
import type { PaymentRecord } from "../types";

// Razorpay returns and persists INR amounts in paise. Convert only when
// rendering currency; backend verification must continue using paise.
function formatPaymentAmount(amountPaisa: number): string {
    const amountINR = (Number(amountPaisa) || 0) / 100;
    const hasPaise = Math.abs(amountINR % 1) > Number.EPSILON;
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: hasPaise ? 2 : 0,
        maximumFractionDigits: 2,
    }).format(amountINR);
}

const BillingPage: React.FC = () => {
    const { isAuthenticated, credits, setCredits } = useAuth();
    const [payments, setPayments] = useState<PaymentRecord[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [showModal, setShowModal] = useState(false);

    const [balanceTotals, setBalanceTotals] = useState({ balance: credits, totalPurchased: credits, totalUsed: 0 });

    const loadData = async () => {
        if (!isAuthenticated) return;
        try {
            // Re-sync balance
            const meRes = await fetch(`/api/auth/me`, { credentials: "include" });
            if (meRes.ok) {
                const meData = await meRes.json();
                setCredits(meData.credits);
                setBalanceTotals({ balance: meData.credits, totalPurchased: meData.totalPurchased || 0, totalUsed: meData.totalUsed || 0 });
            }
            // Fetch Payment History
            const historyRes = await fetch(`/api/payments/history`, { credentials: "include" });
            if (historyRes.ok) {
                const historyData = await historyRes.json();
                setPayments(historyData);
            }
            // Fetch Ledger History
            const ledgerRes = await fetch(`/api/auth/ledger`, { credentials: "include" });
            if (ledgerRes.ok) {
                const ledgerData = await ledgerRes.json();
                setTransactions(ledgerData);
            }
        } catch (e) {
            console.error("Failed to load billing mapping natively:", e);
        }
    };

    useEffect(() => {
        loadData();
    }, [isAuthenticated]);

    const handleSuccess = () => {
        setShowModal(false);
        setTimeout(loadData, 1000); // give mongo a second to flush depending on webhooks
    };

    return (
        <div className="flex flex-col gap-8 pb-32">

            <div className="flex justify-between items-end border-b border-[#1e1e2c] pb-6">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white mb-2">Billing & Credits</h1>
                    <p className="text-slate-400">Manage your Risk Analysis credit limits securely mapped over virtual Test transactions.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                <div className="flex flex-col gap-6">
                    <div className="bg-[#12121a] border border-[#1e1e2c] p-6 rounded-2xl flex flex-col items-center gap-4 text-center">
                        <span className="text-[11px] uppercase tracking-widest font-bold text-slate-500">Current Balance</span>
                        <span className="text-5xl sm:text-6xl font-black text-amber-500 tabular-nums">{balanceTotals.balance}</span>
                        <button
                            onClick={() => setShowModal(true)}
                            className="w-full sm:w-auto bg-amber-500 text-black px-8 py-3 rounded-xl font-bold hover:bg-amber-400 transition-colors shadow-[0_0_20px_rgba(47,128,237,0.22)]"
                        >
                            Buy Credits
                        </button>
                    </div>

                    <div className="bg-[#12121a] border border-[#1e1e2c] p-6 rounded-2xl flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Total Used</span>
                            <span className="text-2xl font-bold text-slate-300">{balanceTotals.totalUsed}</span>
                        </div>
                        <div className="flex flex-col gap-1 text-right">
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Purchased</span>
                            <span className="text-2xl font-bold text-slate-300">{balanceTotals.totalPurchased}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-4">
                    <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wider text-sm">Purchase History</h2>
                    {payments.length === 0 ? (
                        <div className="bg-[#12121a] border border-[#1e1e2c] p-6 rounded-2xl text-center text-sm text-slate-500">
                            No payment history recorded yet.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            {payments.map(p => (
                                <div key={(p as any)._id || p.id} className="bg-[#12121a] border border-[#1e1e2c] p-4 rounded-xl flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-300">{p.credits} Credits</span>
                                            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${p.status === "SUCCESS" || p.status === "success" ? "bg-emerald-500/10 text-emerald-400" :
                                                p.status === "FAILED" || p.status === "failed" ? "bg-red-500/10 text-red-500" :
                                                    p.status === "CANCELLED" || p.status === "cancelled" ? "bg-slate-500/10 text-slate-400" :
                                                        "bg-amber-500/10 text-amber-500"
                                                }`}>{p.status}</span>
                                        </div>
                                        <span className="text-[11px] text-slate-500 font-mono">
                                            {new Date((p as any).createdAt || p.timestamp).toLocaleString()} {p.provider ? `| ${p.provider}` : ""}
                                        </span>
                                    </div>
                                    <span className="font-mono text-slate-400 font-semibold">{formatPaymentAmount(p.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>

            <div className="flex flex-col gap-4 pt-6 border-t border-[#1e1e2c]">
                <h2 className="text-lg font-bold text-slate-200 uppercase tracking-wider text-sm">Credit Transaction Ledger</h2>
                {transactions.length === 0 ? (
                    <div className="bg-[#12121a] border border-[#1e1e2c] p-6 rounded-2xl text-center text-sm text-slate-500">
                        No ledger transactions found natively in Database. Run an AI Risk Analysis to deduct credits.
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {transactions.map((t) => (
                            <div key={t._id} className="bg-[#12121a] border border-[#1e1e2c] p-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between rounded-xl">
                                <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-bold ${t.amount < 0 ? 'text-amber-500' : 'text-emerald-400'}`}>
                                            {t.amount > 0 ? "+" : ""}{t.amount} Credits
                                        </span>
                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${t.type === "USAGE" ? "bg-amber-500/10 text-amber-500" :
                                            t.type === "PURCHASE" ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-slate-400"
                                            }`}>{t.type}</span>
                                    </div>
                                    <span className="text-[11px] text-slate-500 font-mono">
                                        {new Date(t.createdAt).toLocaleString()} | {t.description} {t.metadata?.totalTokens ? `(${t.metadata.totalTokens} Tokens)` : ""}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && <CreditPurchaseModal onClose={() => setShowModal(false)} onSuccess={handleSuccess} />}

        </div>
    );
};

export default BillingPage;
