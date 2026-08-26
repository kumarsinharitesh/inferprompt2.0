import React, { useState } from "react";
import type { TransactionData, Currency, DeviceType } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CURRENCIES: Currency[] = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "AUD"];
const DEVICE_TYPES: DeviceType[] = ["Mobile", "Desktop", "Tablet", "Unknown"];

export const COMMON_MCC_CODES: Record<string, string> = {
    "3000": "United Airlines", "3005": "British Airways", "3007": "Air France", "3009": "Air Canada", "3030": "Aerolineas Argentinas",
    "3112": "Windward Island", "3502": "Best Western Hotels & Resorts", "3509": "Marriott Hotels", "3570": "Grand Met Forum Hotels",
    "4011": "Railway", "4111": "Passenger transportation", "4121": "Taxi", "4131": "Transportation. Bus", "4215": "Delivery service",
    "4225": "Storage", "4511": "Air Carriers, Airlines", "4722": "Tourism", "4812": "Telecommunication equipment",
    "4815": "Telephone services", "4816": "Information Services", "4829": "Money transfer", "4899": "The television",
    "4900": "Utilities", "5021": "Furniture", "5094": "Jewelry", "5137": "Clothing", "5172": "Petroleum", "5200": "Household products",
    "5211": "Building materials", "5251": "Hardware Stores", "5261": "Garden accessories", "5297": "Retail stores",
    "5300": "Wholesalers", "5310": "Discounters", "5311": "Department stores", "5331": "Variety stores", "5399": "Merchandise stores",
    "5411": "Grocery", "5441": "Sweets", "5499": "Food stores", "5511": "Car dealerships", "5532": "Tires", "5533": "Auto shops",
    "5541": "Service Stations", "5542": "Gas station", "5552": "Charging stations", "5571": "Car dealerships", "5599": "Car dealerships",
    "5631": "Clothing stores", "5651": "Clothes", "5661": "Shoes", "5699": "Accessories", "5712": "Furniture",
    "5722": "Household appliance", "5732": "Household appliance", "5734": "Computer Software", "5811": "Caterers",
    "5812": "Cafe. Restaurants", "5813": "Bars", "5814": "Fast Food", "5816": "Games", "5818": "Digital Goods",
    "5912": "Drug Stores", "5921": "Alcohol", "5941": "Sports goods", "5942": "Book Stores", "5943": "Stationery",
    "5960": "Direct Marketing Insurance", "5968": "Subscriptions", "5975": "Hearing Aids", "5977": "Cosmetics",
    "5983": "Fuel", "5993": "Tobacco products", "5995": "Pet supplies", "5999": "Miscellaneous", "6012": "Financial services",
    "6300": "Insurance", "7011": "Hotels and resorts", "7032": "Recreation", "7298": "Health and beauty", "7338": "Copy centers",
    "7523": "Parking", "7531": "Auto repair", "7538": "Maintenance stations", "7542": "Car Washes", "7832": "Cinemas",
    "7922": "Tickets", "7991": "Tourism", "7994": "Videogames", "7996": "Entertainment", "7997": "Entertainment and sport",
    "8011": "Medicine", "8062": "Hospitals", "8099": "Medical services", "8220": "Education. University", "8299": "Education",
    "8398": "Charity", "8661": "Organizations, Religious", "8734": "Testing laboratories", "9399": "Government Services"
};

const DEFAULTS: Partial<TransactionData> = {
    amount: 14500,
    currency: "INR",
    country: "India",
    merchantName: "Example Merchant",
    mccCode: "5411",
    deviceType: "Mobile",
    isNewDevice: false,
    failedAttempts: 0,
    previousTransactionCount: 0,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Mode = "form" | "json";

interface Props {
    onChange: (data: Partial<TransactionData>) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function labelCls(hasError: boolean) {
    return `block text-xs font-medium mb-1 ${hasError ? "text-red-400" : "text-slate-400"}`;
}

const inputCls =
    "w-full bg-[#0e0e16] border border-[#2a2a38] rounded-lg px-3 py-2 text-sm text-slate-100 " +
    "placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 " +
    "focus:ring-amber-500/20 transition-colors";

const inputErrCls =
    "w-full bg-[#0e0e16] border border-red-500/40 rounded-lg px-3 py-2 text-sm text-slate-100 " +
    "placeholder:text-slate-600 focus:outline-none focus:border-red-500/60 focus:ring-1 " +
    "focus:ring-red-500/20 transition-colors";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const RiskTransactionForm: React.FC<Props> = ({ onChange }) => {
    const [mode, setMode] = useState<Mode>("form");

    // Last known valid TransactionData — updated only on successful parse (JSON mode)
    // or on any form field change. This is what gets passed to the parent via onChange.
    const [tx, setTx] = useState<Partial<TransactionData>>(DEFAULTS);

    // Raw textarea content in JSON mode — maintained independently so that
    // typing invalid JSON never corrupts `tx`.
    const [jsonText, setJsonText] = useState<string>(() =>
        JSON.stringify(DEFAULTS, null, 2)
    );
    const [jsonError, setJsonError] = useState<string | null>(null);

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    const update = (patch: Partial<TransactionData>) => {
        const next = { ...tx, ...patch };
        setTx(next);
        onChange(next);
        // Keep jsonText in sync when editing via form so switching to JSON
        // mode shows the current form state.
        setJsonText(JSON.stringify(next, null, 2));
    };

    const handleJsonChange = (raw: string) => {
        setJsonText(raw);
        try {
            const parsed: unknown = JSON.parse(raw);
            if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
                setJsonError("Value must be a JSON object.");
                return;
            }
            // Valid object — apply exactly as typed to allow deleting fields.
            const nextTx = parsed as Partial<TransactionData>;
            setTx(nextTx);
            onChange(nextTx);
            setJsonError(null);
        } catch {
            setJsonError("Invalid JSON — fix the syntax to apply changes.");
            // tx is intentionally NOT updated here, preserving last valid state.
        }
    };

    const switchMode = (m: Mode) => {
        if (m === "json") {
            // Entering JSON mode: sync textarea to latest valid tx.
            setJsonText(JSON.stringify(tx, null, 2));
            setJsonError(null);
        }
        // Switching back to form: tx already holds the latest valid state — no sync needed.
        setMode(m);
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div className="flex flex-col gap-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-1.5" role="group" aria-label="Input mode">
                {(["form", "json"] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        aria-pressed={mode === m}
                        className={`px-3 py-1 rounded-lg text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-amber-500/40 capitalize ${mode === m
                            ? "bg-amber-500 text-black"
                            : "text-slate-500 hover:text-slate-200 border border-[#2a2a38] bg-[#12121a] hover:border-[#3a3a48]"
                            }`}
                    >
                        {m === "json" ? "JSON" : "Form"}
                    </button>
                ))}
            </div>

            {/* ------------------------------------------------------------------ */}
            {/* JSON MODE                                                            */}
            {/* ------------------------------------------------------------------ */}
            {mode === "json" && (
                <div className="flex flex-col gap-2">
                    <label htmlFor="risk-json-input" className="text-xs font-medium text-slate-400">
                        Paste transaction JSON
                    </label>
                    <textarea
                        id="risk-json-input"
                        value={jsonText}
                        onChange={(e) => handleJsonChange(e.target.value)}
                        rows={18}
                        spellCheck={false}
                        className={`font-mono text-sm ${jsonError ? inputErrCls : inputCls} resize-y`}
                        placeholder='{ "amount": 85000, "currency": "INR", ... }'
                        aria-describedby={jsonError ? "risk-json-error" : undefined}
                    />
                    {jsonError && (
                        <p id="risk-json-error" role="alert" className="text-xs text-red-400 flex items-center gap-1.5">
                            <span aria-hidden>⚠</span> {jsonError}
                        </p>
                    )}
                    {!jsonError && (
                        <p className="text-xs text-emerald-500/70 flex items-center gap-1.5">
                            <span aria-hidden>✓</span> Valid JSON — transaction state updated.
                        </p>
                    )}
                </div>
            )}

            {/* ------------------------------------------------------------------ */}
            {/* FORM MODE                                                            */}
            {/* ------------------------------------------------------------------ */}
            {mode === "form" && (
                <>
                    {/* 1. Transaction Details */}
                    <fieldset className="flex flex-col gap-3">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            1. Transaction Details
                        </legend>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-amount" className={labelCls(false)}>Amount</label>
                                <input id="tx-amount" type="number" min={0} step="any"
                                    value={tx.amount ?? ""}
                                    onChange={(e) => {
                                        let v = parseFloat(e.target.value);
                                        if (v < 0) v = 0;
                                        update({ amount: isNaN(v) ? undefined : v });
                                    }}
                                    placeholder="85000" className={inputCls} />
                            </div>
                            <div>
                                <label htmlFor="tx-currency" className={labelCls(false)}>Currency</label>
                                <select id="tx-currency" value={tx.currency ?? "INR"}
                                    onChange={(e) => update({ currency: e.target.value as Currency })}
                                    className={inputCls}>
                                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-country" className={labelCls(false)}>Country</label>
                                <input id="tx-country" type="text"
                                    value={tx.country ?? ""} onChange={(e) => update({ country: e.target.value })}
                                    placeholder="India" className={inputCls} />
                            </div>
                            <div>
                                <label htmlFor="tx-timestamp" className={labelCls(false)}>Transaction Time</label>
                                <input id="tx-timestamp" type="datetime-local" max="9999-12-31T23:59"
                                    value={tx.transactionTimestamp ?? ""}
                                    onChange={(e) => update({ transactionTimestamp: e.target.value })}
                                    style={{ colorScheme: 'dark' }}
                                    className={`${inputCls} text-slate-300`} />
                            </div>
                        </div>
                    </fieldset>

                    {/* 2. Merchant Information */}
                    <fieldset className="flex flex-col gap-3 mt-2 border-t border-[#1e1e2c] pt-4">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-1">
                            2. Merchant Information
                        </legend>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-merchant" className={labelCls(false)}>Merchant Name</label>
                                <input id="tx-merchant" type="text" value={tx.merchantName ?? ""}
                                    onChange={(e) => update({ merchantName: e.target.value })}
                                    placeholder="Example Merchant" className={inputCls} />
                            </div>
                            <div>
                                <label htmlFor="tx-merchant-verif" className={labelCls(false)}>Verification Status</label>
                                <select id="tx-merchant-verif" value={tx.merchantVerification ?? ""}
                                    onChange={(e) => update({ merchantVerification: e.target.value || undefined } as any)}
                                    className={inputCls}>
                                    <option value="">(None)</option>
                                    <option value="VERIFIED">Verified</option>
                                    <option value="UNVERIFIED">Unverified</option>
                                    <option value="ANONYMOUS">Anonymous</option>
                                </select>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-mcc" className={labelCls(tx.mccCode && !COMMON_MCC_CODES[tx.mccCode] ? true : false)}>
                                    MCC Code {tx.mccCode && COMMON_MCC_CODES[tx.mccCode] && <span className="text-emerald-400 ml-1">({COMMON_MCC_CODES[tx.mccCode]})</span>}
                                </label>
                                <input id="tx-mcc" type="text" list="mcc-list" maxLength={4}
                                    value={tx.mccCode ?? ""} onChange={(e) => update({ mccCode: e.target.value })}
                                    placeholder="e.g. 5411" className={tx.mccCode && !COMMON_MCC_CODES[tx.mccCode] ? inputErrCls : inputCls} />
                                <datalist id="mcc-list">
                                    {Object.entries(COMMON_MCC_CODES).map(([code, name]) => (
                                        <option key={code} value={code}>{name}</option>
                                    ))}
                                </datalist>
                                {tx.mccCode && !COMMON_MCC_CODES[tx.mccCode] && (
                                    <p className="mt-1 text-[10px] text-red-500">Invalid or unknown MCC code.</p>
                                )}
                            </div>
                            <div>
                                <label htmlFor="tx-merchant-age" className={labelCls(false)}>Merchant Age (months)</label>
                                <input id="tx-merchant-age" type="number" min={0}
                                    value={tx.merchantAge ?? ""}
                                    onChange={(e) => {
                                        let v = parseInt(e.target.value, 10);
                                        if (v < 0) v = 0;
                                        update({ merchantAge: isNaN(v) ? undefined : v });
                                    }}
                                    placeholder="30" className={inputCls} />
                            </div>
                        </div>
                    </fieldset>

                    {/* 3. Payment Method */}
                    <fieldset className="flex flex-col gap-3 mt-2 border-t border-[#1e1e2c] pt-4">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-1">
                            3. Payment Method
                        </legend>
                        <div>
                            <select id="tx-pay-method" value={tx.paymentMethod ?? ""}
                                onChange={(e) => update({ paymentMethod: e.target.value || undefined } as any)}
                                className={inputCls}>
                                <option value="">(Select Method)</option>
                                <option value="CARD">Card</option>
                                <option value="UPI">UPI</option>
                                <option value="NET_BANKING">Net Banking</option>
                                <option value="WALLET">Wallet</option>
                                <option value="BANK_TRANSFER">Bank Transfer</option>
                                <option value="OTHER">Other</option>
                            </select>
                        </div>

                        {/* Progressive Card Context */}
                        {tx.paymentMethod === "CARD" && (
                            <div className="p-3 bg-[#12121a] border border-[#2a2a38] rounded-lg grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls(false)}>Transaction Mode</label>
                                    <select value={tx.cardDetails?.transactionMode ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, transactionMode: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline (POS)</option>
                                    </select>
                                </div>
                                {tx.cardDetails?.transactionMode === "OFFLINE" && (
                                    <div>
                                        <label className={labelCls(false)}>POS Type</label>
                                        <select value={tx.cardDetails?.posType ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, posType: e.target.value || undefined } as any })} className={inputCls}>
                                            <option value="">(None)</option><option value="SWIPE">Swipe</option><option value="TAP">Tap / Contactless</option><option value="CHIP">Chip</option>
                                        </select>
                                    </div>
                                )}
                                <div>
                                    <label className={labelCls(false)}>Card Type</label>
                                    <select value={tx.cardDetails?.cardType ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, cardType: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="CREDIT">Credit</option><option value="DEBIT">Debit</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls(false)}>Network</label>
                                    <select value={tx.cardDetails?.cardNetwork ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, cardNetwork: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="VISA">Visa</option><option value="MASTERCARD">Mastercard</option><option value="RUPAY">RuPay</option><option value="AMEX">Amex</option><option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls(false)}>3DS Verification</label>
                                    <select value={tx.cardDetails?.threeDS ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, threeDS: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="VERIFIED">Verified</option><option value="FAILED">Failed</option><option value="NOT_AVAILABLE">Not Available</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls(false)}>AVS Status</label>
                                    <select value={tx.cardDetails?.avsStatus ?? ""} onChange={e => update({ cardDetails: { ...tx.cardDetails, avsStatus: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="MATCH">Match</option><option value="PARTIAL">Partial</option><option value="MISMATCH">Mismatch</option><option value="NOT_AVAILABLE">Not Available</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                                        <input type="checkbox" checked={tx.cardDetails?.internationalCard ?? false} onChange={e => update({ cardDetails: { ...tx.cardDetails, internationalCard: e.target.checked } })} className="rounded border-slate-600 bg-slate-900" />
                                        <span className="text-xs text-slate-400">International Card</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Progressive UPI Context */}
                        {tx.paymentMethod === "UPI" && (
                            <div className="p-3 bg-[#12121a] border border-[#2a2a38] rounded-lg grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls(false)}>UPI App</label>
                                    <select value={tx.upiDetails?.upiApp ?? ""} onChange={e => update({ upiDetails: { ...tx.upiDetails, upiApp: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="GOOGLE_PAY">Google Pay</option><option value="PHONEPE">PhonePe</option><option value="PAYTM">Paytm</option><option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls(false)}>UPI Verification</label>
                                    <select value={tx.upiDetails?.upiVerification ?? ""} onChange={e => update({ upiDetails: { ...tx.upiDetails, upiVerification: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="VERIFIED">Verified</option><option value="FAILED">Failed</option><option value="NOT_VERIFIED">Not Verified</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                    <label className="flex items-center gap-2 cursor-pointer mt-1">
                                        <input type="checkbox" checked={tx.upiDetails?.collectRequest ?? false} onChange={e => update({ upiDetails: { ...tx.upiDetails, collectRequest: e.target.checked } })} className="rounded border-slate-600 bg-slate-900" />
                                        <span className="text-xs text-slate-400">Is Collect Request</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {/* Progressive Net Banking / Bank Transfer */}
                        {(tx.paymentMethod === "NET_BANKING" || tx.paymentMethod === "BANK_TRANSFER") && (
                            <div className="p-3 bg-[#12121a] border border-[#2a2a38] rounded-lg grid grid-cols-1 gap-3">
                                <div>
                                    <label className={labelCls(false)}>Bank Verification</label>
                                    <select
                                        value={tx.paymentMethod === "NET_BANKING" ? (tx.netBankingDetails?.bankVerification ?? "") : (tx.bankTransferDetails?.bankVerification ?? "")}
                                        onChange={e => tx.paymentMethod === "NET_BANKING" ?
                                            update({ netBankingDetails: { ...tx.netBankingDetails, bankVerification: e.target.value || undefined } as any }) :
                                            update({ bankTransferDetails: { ...tx.bankTransferDetails, bankVerification: e.target.value || undefined } as any })
                                        }
                                        className={inputCls}
                                    >
                                        <option value="">(None)</option><option value="VERIFIED">Verified</option><option value="FAILED">Failed</option><option value="NOT_VERIFIED">Not Verified</option>
                                    </select>
                                </div>
                            </div>
                        )}



                        {/* Progressive Wallet */}
                        {tx.paymentMethod === "WALLET" && (
                            <div className="p-3 bg-[#12121a] border border-[#2a2a38] rounded-lg grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls(false)}>Wallet Provider</label>
                                    <select value={tx.walletDetails?.walletProvider ?? ""} onChange={e => update({ walletDetails: { ...tx.walletDetails, walletProvider: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="PAYTM">Paytm</option><option value="PHONEPE">PhonePe</option><option value="GOOGLE_PAY">Google Pay</option><option value="OTHER">Other</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls(false)}>KYC Status</label>
                                    <select value={tx.walletDetails?.kycStatus ?? ""} onChange={e => update({ walletDetails: { ...tx.walletDetails, kycStatus: e.target.value || undefined } as any })} className={inputCls}>
                                        <option value="">(None)</option><option value="VERIFIED">Verified</option><option value="NOT_VERIFIED">Not Verified</option><option value="UNKNOWN">Unknown</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </fieldset>

                    {/* 4. Payment Verification */}
                    <fieldset className="flex flex-col gap-3 mt-2 border-t border-[#1e1e2c] pt-4">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-1">
                            4. Payment Verification Status
                        </legend>
                        <div>
                            <select id="tx-pay-verif" value={tx.paymentVerification ?? ""}
                                onChange={(e) => update({ paymentVerification: e.target.value || undefined } as any)}
                                className={inputCls}>
                                <option value="">(None)</option>
                                <option value="VERIFIED">Verified</option>
                                <option value="FAILED">Failed</option>
                                <option value="NOT_VERIFIED">Not Verified</option>
                            </select>
                        </div>
                    </fieldset>

                    {/* 5. Offer Information */}
                    <fieldset className="flex flex-col gap-3 mt-2 border-t border-[#1e1e2c] pt-4">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-amber-500/80 mb-1">
                            5. Offer Information
                        </legend>
                        <div className="p-3 bg-[#12121a] border border-[#2a2a38] rounded-lg flex flex-col gap-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={tx.offer?.offerPresent ?? false} onChange={e => update({ offer: { ...tx.offer, offerPresent: e.target.checked } } as any)} className="rounded border-slate-600 bg-slate-900" />
                                <span className="text-xs text-slate-400 font-medium">Offer Present on Transaction</span>
                            </label>

                            {tx.offer?.offerPresent && (
                                <div className="grid grid-cols-2 gap-3 mt-1 pt-3 border-t border-[#2a2a38]">
                                    <div>
                                        <label className={labelCls(false)}>Offer Type</label>
                                        <select value={tx.offer?.offerType ?? ""} onChange={e => update({ offer: { ...tx.offer, offerType: e.target.value || undefined } as any })} className={inputCls}>
                                            <option value="">(None)</option><option value="DISCOUNT">Discount</option><option value="CASHBACK">Cashback</option><option value="COUPON">Coupon</option><option value="LIMITED_TIME">Limited Time</option><option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls(false)}>Discount %</label>
                                        <input type="number" min="0" max="100" value={tx.offer?.discountPercentage ?? ""} onChange={e => update({ offer: { ...tx.offer, discountPercentage: parseInt(e.target.value, 10) } as any })} className={inputCls} placeholder="e.g. 10" />
                                    </div>
                                    <div className="col-span-2">
                                        <label className={labelCls(false)}>Offer Verification Status</label>
                                        <select value={tx.offer?.offerVerification ?? ""} onChange={e => update({ offer: { ...tx.offer, offerVerification: e.target.value || undefined } as any })} className={inputCls}>
                                            <option value="">(None)</option><option value="VERIFIED">Verified</option><option value="UNVERIFIED">Unverified</option><option value="NOT_APPLICABLE">Not Applicable</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>
                    </fieldset>

                    {/* Advanced Details */}
                    <fieldset className="flex flex-col gap-3">
                        <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                            Advanced Details
                        </legend>

                        {/* Device Type + New Device */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-device" className={labelCls(false)}>Device Type</label>
                                <select
                                    id="tx-device"
                                    value={tx.deviceType ?? "Mobile"}
                                    onChange={(e) => update({ deviceType: e.target.value as DeviceType })}
                                    className={inputCls}
                                >
                                    {DEVICE_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
                                </select>
                            </div>
                            <div className="flex flex-col justify-end pb-0.5">
                                <label
                                    htmlFor="tx-new-device"
                                    className="flex items-center gap-2.5 cursor-pointer group"
                                >
                                    <div
                                        className={`w-4 h-4 rounded border flex items-center justify-center transition-colors shrink-0 ${tx.isNewDevice
                                            ? "bg-amber-500 border-amber-500"
                                            : "border-[#3a3a48] bg-[#12121a] group-hover:border-[#4a4a58]"
                                            }`}
                                    >
                                        {tx.isNewDevice && (
                                            <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                                <path d="M1 3.5L3.5 6L8 1" stroke="black" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                        )}
                                    </div>
                                    <input
                                        id="tx-new-device"
                                        type="checkbox"
                                        checked={tx.isNewDevice ?? false}
                                        onChange={(e) => update({ isNewDevice: e.target.checked })}
                                        className="sr-only"
                                    />
                                    <span className="text-sm text-slate-400">New Device</span>
                                </label>
                            </div>
                        </div>

                        {/* Failed Attempts + Prev Transactions */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-failed" className={labelCls(false)}>Failed Attempts</label>
                                <input
                                    id="tx-failed"
                                    type="number"
                                    min={0}
                                    value={tx.failedAttempts ?? ""}
                                    onChange={(e) => {
                                        let v = parseInt(e.target.value, 10);
                                        if (v < 0) v = 0;
                                        update({ failedAttempts: isNaN(v) ? undefined : v });
                                    }}
                                    placeholder="0"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="tx-prev" className={labelCls(false)}>Prev. Transactions</label>
                                <input
                                    id="tx-prev"
                                    type="number"
                                    min={0}
                                    value={tx.previousTransactionCount ?? ""}
                                    onChange={(e) => {
                                        let v = parseInt(e.target.value, 10);
                                        if (v < 0) v = 0;
                                        update({ previousTransactionCount: isNaN(v) ? undefined : v });
                                    }}
                                    placeholder="0"
                                    className={inputCls}
                                />
                            </div>
                        </div>

                        {/* IP Country + User Country */}
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label htmlFor="tx-ip-country" className={labelCls(false)}>IP Country</label>
                                <input
                                    id="tx-ip-country"
                                    type="text"
                                    value={tx.ipCountry ?? ""}
                                    onChange={(e) => update({ ipCountry: e.target.value })}
                                    placeholder="India"
                                    className={inputCls}
                                />
                            </div>
                            <div>
                                <label htmlFor="tx-user-country" className={labelCls(false)}>User&apos;s Country</label>
                                <input
                                    id="tx-user-country"
                                    type="text"
                                    value={tx.userCountry ?? ""}
                                    onChange={(e) => update({ userCountry: e.target.value })}
                                    placeholder="India"
                                    className={inputCls}
                                />
                            </div>
                        </div>
                    </fieldset>
                </>
            )}
        </div>
    );
};

export default RiskTransactionForm;
