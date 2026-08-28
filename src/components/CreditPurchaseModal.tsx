import React, { useState } from "react";
import { CREDIT_PACKS } from "../config/billing";

export const API_BASE = "";

declare global {
    interface Window {
        Razorpay: any;
    }
}

interface Props {
    onClose: () => void;
    onSuccess: () => void;
}

const CreditPurchaseModal: React.FC<Props> = ({ onClose, onSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const paymentConcluded = React.useRef(false);
    const pack = CREDIT_PACKS[0]; // Currently just the 100 bundle

    const handlePurchase = async () => {
        setLoading(true);
        setErrorMsg("");
        paymentConcluded.current = false;

        try {
            // 1. Create order strictly via isolated backend
            const orderReq = await fetch(`${API_BASE}/api/payments/create-order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ packId: pack.id }),
                credentials: "include"
            });

            if (!orderReq.ok) {
                throw new Error("Unable to create order. " + (await orderReq.text()));
            }

            const orderData = await orderReq.json();

            // Ensure SDK wrapper is loaded
            if (!window.Razorpay) {
                throw new Error("Razorpay SDK failed to load. Are you offline?");
            }

            // 2. Open standard Test Checkout
            const options = {
                key: orderData.keyId, // Public tracking key securely fed by isolated backend 
                amount: orderData.amount, // Computed safely on Node explicitly 
                currency: orderData.currency,
                name: "InferPrompt",
                description: pack.label,
                order_id: orderData.orderId,
                handler: async function (response: any) {
                    paymentConcluded.current = true;
                    // 3. Prevent UI hacks - Must Validate on Server
                    try {
                        setLoading(true);
                        const verifyReq = await fetch(`${API_BASE}/api/payments/verify`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                orderId: response.razorpay_order_id,
                                paymentId: response.razorpay_payment_id,
                                signature: response.razorpay_signature,
                                credits: pack.credits,
                                amount: pack.amountINR * 100  // Send in paisa to match backend pack lookup (p.amountINR * 100 === amount)
                            }),
                            credentials: "include"
                        });

                        const verifyRes = await verifyReq.json();

                        if (verifyRes.verified) {
                            onSuccess();
                        } else {
                            setErrorMsg("Verification Failed. " + (verifyRes.error || ""));
                        }
                    } catch (e) {
                        setErrorMsg("An error occurred during verification.");
                    } finally {
                        setLoading(false);
                    }
                },
                prefill: {
                    name: "Test User",
                    email: "test@example.com",
                },
                theme: {
                    color: "#2f80ed" // Primary brand
                },
                modal: {
                    ondismiss: function () {
                        if (!paymentConcluded.current) {
                            paymentConcluded.current = true;
                            setErrorMsg("Payment cancelled.");
                        }
                        setLoading(false);
                    }
                }
            };

            const rzp1 = new window.Razorpay(options);
            rzp1.on("payment.failed", function (response: any) {
                if (!paymentConcluded.current) {
                    paymentConcluded.current = true;
                }
                setErrorMsg(`Payment failed: ${response.error.description}`);
            });

            rzp1.open();

        } catch (e: any) {
            setErrorMsg(e.message || "Failed to initiate payment. Check server connection.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#12121a] border border-[#1e1e2c] p-8 rounded-2xl w-full max-w-sm flex flex-col gap-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                </button>

                <div className="flex flex-col items-center text-center gap-2">
                    <h2 className="text-xl font-bold text-slate-200">Get More Credits</h2>
                    <p className="text-sm text-slate-400">Top up your Risk Analysis credits to run high-volume concurrent LLM transactions natively.</p>
                </div>

                <div className="bg-[#0e0e16] border border-amber-500/20 rounded-xl p-6 flex flex-col items-center gap-3">
                    <span className="text-3xl font-black tracking-tight text-white">{pack.label}</span>
                    <span className="text-xl font-bold text-amber-500">₹{pack.amountINR}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded mt-1">
                        Razorpay Test Mode
                    </span>
                </div>

                {errorMsg && (
                    <div className="text-xs text-red-400 bg-red-400/10 p-3 rounded text-center border border-red-400/20">
                        {errorMsg}
                    </div>
                )}

                <button
                    onClick={handlePurchase}
                    disabled={loading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-slate-800 disabled:text-slate-500 text-black font-bold py-3 px-4 rounded-xl transition-colors focus:ring-4 focus:ring-amber-500/20 flex justify-center items-center gap-2"
                >
                    {loading ? "Processing via Server..." : "Buy with Razorpay"}
                </button>

                <p className="text-[10px] text-slate-600 text-center uppercase tracking-wider leading-relaxed pt-2 border-t border-[#1e1e2c]">
                    Internal Tool Prototype<br />Do not use real credentials.
                </p>
            </div>
        </div>
    );
};

export default CreditPurchaseModal;
