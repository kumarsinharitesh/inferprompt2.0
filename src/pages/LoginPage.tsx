import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import toast from "react-hot-toast";

type ViewState = "login" | "forgot_email" | "forgot_reset";

const LoginPage: React.FC = () => {
    // Shared state
    const [view, setView] = useState<ViewState>("login");
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);

    // Login state
    const [password, setPassword] = useState("");

    // Reset state
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");

    const { login } = useAuth();
    const navigate = useNavigate();

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
                credentials: "include"
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Successfully logged in!");
                try {
                    const meRes = await fetch(`/api/auth/me`, {
                        credentials: "include"
                    });
                    const meData = await meRes.json();
                    login(meData.user, meData.credits);
                    navigate("/risk");
                } catch (e) {
                    navigate("/");
                }
            } else {
                toast.error(data.error || "Login failed");
            }
        } catch (err) {
            toast.error("Network error during login");
        } finally {
            setLoading(false);
        }
    };

    const handleForgotEmailSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`/api/auth/forgot-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(data.message || "OTP sent successfully!");
                setView("forgot_reset");
            } else {
                toast.error(data.error || "Failed to send reset email");
            }
        } catch (err) {
            toast.error("Network error requesting password reset");
        } finally {
            setLoading(false);
        }
    };

    const handleResetPasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await fetch(`/api/auth/reset-password`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, code: otp, newPassword })
            });
            const data = await res.json();
            if (res.ok) {
                toast.success("Password reset securely! You can now log in.");
                setPassword("");
                setOtp("");
                setNewPassword("");
                setView("login");
            } else {
                toast.error(data.error || "Failed to reset password");
            }
        } catch (err) {
            toast.error("Network error during reset");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative min-h-[calc(100vh-3.5rem)] overflow-hidden px-4 py-8 sm:py-12 flex items-center justify-center">
            <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_38%,rgba(47,128,237,0.16),transparent_26%),radial-gradient(circle_at_82%_70%,rgba(89,116,219,0.13),transparent_24%)]" />
            <div className="relative grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1fr_430px] lg:gap-16">
                <section className="hidden lg:flex flex-col gap-6 max-w-lg">
                    <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Secure AI risk workspace
                    </div>
                    <div>
                        <p className="text-4xl font-bold leading-tight text-white">Make every model decision easier to understand.</p>
                        <p className="mt-4 max-w-md text-base leading-relaxed text-slate-400">Run prompts, compare model reasoning, and review payment-risk signals in one focused workspace.</p>
                    </div>
                    <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-[#22324c] bg-[#0d1526]/80">
                        {[['Live', 'streaming'], ['Multi', 'model view'], ['Clear', 'risk signals']].map(([value, label]) => (
                            <div key={value} className="border-r border-[#22324c] last:border-0 px-4 py-4 text-center">
                                <p className="text-sm font-bold text-amber-300">{value}</p>
                                <p className="mt-1 text-[11px] text-slate-500">{label}</p>
                            </div>
                        ))}
                    </div>
                </section>

                <div className="w-full max-w-md justify-self-center lg:justify-self-end bg-[#0e1422]/95 border border-[#273755] p-6 sm:p-8 rounded-2xl flex flex-col gap-6 shadow-2xl shadow-black/25">

                {/* ---------------- LOGIN VIEW ---------------- */}
                {view === "login" && (
                    <>
                        <div className="flex flex-col items-center text-center">
                            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10 text-amber-300">
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12h16M12 4l8 8-8 8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            </div>
                            <h2 className="text-2xl font-bold text-slate-100">Welcome Back</h2>
                            <p className="text-sm text-slate-400 mt-2">Sign in to your InferPrompt workspace</p>
                        </div>
                        <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">Email</label>
                                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                    className="bg-[#12121a] border border-[#2a2a38] text-slate-300 rounded-lg px-4 py-2 w-full focus:border-amber-500/50 focus:outline-none" />
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="block text-xs font-bold tracking-wider text-slate-400 uppercase">Password</label>
                                    <button type="button" onClick={() => setView("forgot_email")} className="text-xs text-amber-500 hover:underline">
                                        Forgot Password?
                                    </button>
                                </div>
                                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                                    className="bg-[#12121a] border border-[#2a2a38] text-slate-300 rounded-lg px-4 py-2 w-full focus:border-amber-500/50 focus:outline-none" />
                            </div>
                            <button type="submit" disabled={loading}
                                className="mt-2 w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-lg transition-colors">
                                {loading ? "Signing in..." : "Sign In"}
                            </button>
                        </form>
                        <div className="text-center text-sm text-slate-400 mt-2">
                            Don't have an account? <Link to="/register" className="text-amber-500 hover:underline">Create Account</Link>
                        </div>
                    </>
                )}

                {/* ---------------- FORGOT GET EMAIL VIEW ---------------- */}
                {view === "forgot_email" && (
                    <>
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold text-slate-100">Reset Password</h2>
                            <p className="text-sm text-slate-400 mt-2 text-center">Enter your registered email to receive a secure recovery code.</p>
                        </div>
                        <form onSubmit={handleForgotEmailSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">Email</label>
                                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                    className="bg-[#12121a] border border-[#2a2a38] text-slate-300 rounded-lg px-4 py-2 w-full focus:border-amber-500/50 focus:outline-none" />
                            </div>
                            <button type="submit" disabled={loading}
                                className="mt-2 w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-lg transition-colors">
                                {loading ? "Sending..." : "Send Reset Code"}
                            </button>
                        </form>
                        <div className="text-center text-sm text-slate-400 mt-2">
                            <button onClick={() => setView("login")} className="text-slate-500 hover:text-slate-300 transition-colors">
                                &larr; Back to Login
                            </button>
                        </div>
                    </>
                )}

                {/* ---------------- RESET PASSWORD VIEW ---------------- */}
                {view === "forgot_reset" && (
                    <>
                        <div className="flex flex-col items-center">
                            <h2 className="text-2xl font-bold text-slate-100">Secure Reset</h2>
                            <p className="text-sm text-slate-400 mt-2 text-center">Check your inbox and enter the 6-digit recovery code.</p>
                        </div>
                        <form onSubmit={handleResetPasswordSubmit} className="flex flex-col gap-4">
                            <div>
                                <label className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">Recovery Code</label>
                                <input type="text" required value={otp} onChange={e => setOtp(e.target.value)} maxLength={6} placeholder="######"
                                    className="bg-[#12121a] border border-[#2a2a38] text-amber-500 text-center font-mono font-bold tracking-widest rounded-lg px-4 py-2 w-full focus:border-amber-500/50 focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold tracking-wider text-slate-400 uppercase mb-2">New Password <span className="text-slate-600 font-normal lowercase tracking-normal">(min 8 chars)</span></label>
                                <input type="password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={8}
                                    className="bg-[#12121a] border border-[#2a2a38] text-slate-300 rounded-lg px-4 py-2 w-full focus:border-amber-500/50 focus:outline-none" />
                            </div>
                            <button type="submit" disabled={loading}
                                className="mt-2 w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-2.5 rounded-lg transition-colors">
                                {loading ? "Verifying..." : "Set New Password"}
                            </button>
                        </form>
                        <div className="text-center text-sm text-slate-400 mt-2">
                            <button onClick={() => setView("forgot_email")} className="text-slate-500 hover:text-slate-300 transition-colors">
                                &larr; Did not receive code?
                            </button>
                        </div>
                    </>
                )}
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
