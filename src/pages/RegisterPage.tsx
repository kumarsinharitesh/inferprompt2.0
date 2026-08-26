import React, { useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";

const API = "";

const RegisterPage: React.FC = () => {
    const navigate = useNavigate();

    // Step 1 — Credentials
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");

    // Step 2 — OTP
    const [step, setStep] = useState<1 | 2>(1);
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const [loading, setLoading] = useState(false);

    // -------- Step 1: Send OTP --------
    const handleSendOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            toast.error("Password must be at least 8 characters.");
            return;
        }
        if (password !== confirmPassword) {
            toast.error("Passwords do not match.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/auth/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "Failed to send OTP.");
                return;
            }
            toast.success(`Verification code sent to ${email}!`);
            setStep(2);
        } catch {
            toast.error("Server unreachable. Make sure the backend is running.");
        } finally {
            setLoading(false);
        }
    };

    // -------- OTP digit input handler --------
    const handleOtpChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return;
        const next = [...otp];
        next[index] = value.slice(-1);
        setOtp(next);
        if (value && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    // -------- Step 2: Verify OTP --------
    const handleVerifyOTP = async (e: React.FormEvent) => {
        e.preventDefault();
        const code = otp.join("");
        if (code.length !== 6) {
            toast.error("Please enter the full 6-digit OTP.");
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/auth/verify-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password, code }),
            });
            const data = await res.json();
            if (!res.ok) {
                toast.error(data.error || "OTP verification failed.");
                return;
            }
            toast.success("🎉 Account created successfully! Please log in.", { duration: 4000 });
            navigate("/login");
        } catch {
            toast.error("Server unreachable.");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setOtp(["", "", "", "", "", ""]);
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/auth/send-otp`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, email, password }),
            });
            const data = await res.json();
            if (res.ok) toast.success("New OTP sent!");
            else toast.error(data.error || "Failed to resend.");
        } catch {
            toast.error("Server unreachable.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#080810] flex items-center justify-center px-4">
            <div className="w-full max-w-md flex flex-col gap-8">

                {/* Logo */}
                <div className="text-center">
                    <span className="text-3xl font-black text-amber-500 tracking-tight">InferPrompt</span>
                    <p className="text-slate-500 text-sm mt-1.5">
                        {step === 1 ? "Create your account" : "Verify your email"}
                    </p>
                </div>

                <div className="bg-[#0e0e18] border border-[#1e1e2c] rounded-2xl p-8 flex flex-col gap-6 shadow-2xl">

                    {/* Step indicator */}
                    <div className="flex items-center gap-3">
                        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${step >= 1 ? "bg-amber-500 text-black" : "bg-[#1e1e2c] text-slate-500"}`}>1</div>
                        <div className={`flex-1 h-px transition-colors ${step >= 2 ? "bg-amber-500" : "bg-[#1e1e2c]"}`} />
                        <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-colors ${step >= 2 ? "bg-amber-500 text-black" : "bg-[#1e1e2c] text-slate-500"}`}>2</div>
                    </div>

                    {/* ---- STEP 1: Register Form ---- */}
                    {step === 1 && (
                        <form onSubmit={handleSendOTP} className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Full Name</label>
                                <input
                                    type="text"
                                    autoFocus
                                    required
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="Ritesh Sinha"
                                    className="bg-[#12121a] border border-[#1e1e2c] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</label>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="you@example.com"
                                    className="bg-[#12121a] border border-[#1e1e2c] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password</label>
                                <input
                                    type="password"
                                    required
                                    minLength={8}
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="Minimum 8 characters"
                                    className="bg-[#12121a] border border-[#1e1e2c] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
                                />
                            </div>
                            <div className="flex flex-col gap-1.5">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Confirm Password</label>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Re-enter your password"
                                    className={`bg-[#12121a] border rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none transition-colors ${confirmPassword && password !== confirmPassword
                                            ? "border-red-500 focus:border-red-500"
                                            : confirmPassword && password === confirmPassword
                                                ? "border-emerald-500 focus:border-emerald-500"
                                                : "border-[#1e1e2c] focus:border-amber-500"
                                        }`}
                                />
                                {confirmPassword && password !== confirmPassword && (
                                    <p className="text-xs text-red-400 mt-0.5">Passwords do not match</p>
                                )}
                                {confirmPassword && password === confirmPassword && (
                                    <p className="text-xs text-emerald-400 mt-0.5">✓ Passwords match</p>
                                )}
                            </div>

                            {/* Free credits notice */}
                            <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                                <span className="text-amber-400 text-lg">🎁</span>
                                <p className="text-xs text-amber-300">Get <strong>5 free credits</strong> on sign-up. Includes access to <strong>Sarvam AI</strong> &amp; <strong>OpenRouter</strong> out of the box.</p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || (confirmPassword.length > 0 && password !== confirmPassword)}
                                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors mt-2 flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Sending OTP...</>
                                ) : "Send Verification Code →"}
                            </button>
                        </form>
                    )}

                    {/* ---- STEP 2: OTP Input ---- */}
                    {step === 2 && (
                        <form onSubmit={handleVerifyOTP} className="flex flex-col gap-6">
                            <div className="text-center">
                                <p className="text-sm text-slate-400">
                                    We sent a 6-digit code to<br />
                                    <span className="text-amber-400 font-semibold">{email}</span>
                                </p>
                            </div>

                            {/* OTP digit boxes */}
                            <div className="flex justify-center gap-3">
                                {otp.map((digit, i) => (
                                    <input
                                        key={i}
                                        ref={el => { inputRefs.current[i] = el; }}
                                        type="text"
                                        inputMode="numeric"
                                        maxLength={1}
                                        value={digit}
                                        onChange={e => handleOtpChange(i, e.target.value)}
                                        onKeyDown={e => handleOtpKeyDown(i, e)}
                                        autoFocus={i === 0}
                                        className="w-12 h-14 text-center text-2xl font-bold bg-[#12121a] border-2 border-[#1e1e2c] rounded-xl text-white focus:outline-none focus:border-amber-500 transition-colors caret-amber-500"
                                    />
                                ))}
                            </div>

                            <button
                                type="submit"
                                disabled={loading || otp.join("").length !== 6}
                                className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> Verifying...</>
                                ) : "Verify & Create Account ✓"}
                            </button>

                            <div className="flex items-center justify-between text-xs text-slate-500">
                                <button type="button" onClick={() => setStep(1)} className="hover:text-slate-300 transition-colors">← Edit details</button>
                                <button type="button" onClick={handleResend} disabled={loading} className="hover:text-amber-400 transition-colors">Resend OTP</button>
                            </div>
                        </form>
                    )}
                </div>

                <p className="text-center text-sm text-slate-500">
                    Already have an account?{" "}
                    <Link to="/login" className="text-amber-400 hover:text-amber-300 font-semibold transition-colors">Sign in</Link>
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;
