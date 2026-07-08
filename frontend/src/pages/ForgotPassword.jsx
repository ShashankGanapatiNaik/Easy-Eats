import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";

export default function ForgotPassword() {

    const navigate = useNavigate();

    const [step, setStep] = useState(1);
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [devOtp, setDevOtp] = useState(null); // shown when email delivery fails

    // SEND OTP
    const sendOtp = async () => {

        if (!email) {
            alert("Enter email");
            return;
        }

        try {

            setLoading(true);
            setDevOtp(null);

            const res = await api.post("/auth/forgot-password/send", { email });

            // Backend always returns the OTP; show it on-page if email wasn't sent
            if (res.data?.otp) {
                setDevOtp(res.data.otp);
            }

            setStep(2);

        } catch (err) {

            alert(
                err?.response?.data?.detail ||
                "Failed to send OTP"
            );

        } finally {

            setLoading(false);
        }
    };

    // VERIFY OTP
    const verifyOtp = async () => {

        if (!otp) {
            alert("Enter OTP");
            return;
        }

        try {

            setLoading(true);

            await api.post("/auth/forgot-password/check-otp", {
                email,
                otp,
            });

            setStep(3);

        } catch (err) {

            alert(
                err?.response?.data?.detail ||
                "Invalid or expired OTP"
            );

        } finally {

            setLoading(false);
        }
    };

    // RESET PASSWORD
    const resetPassword = async () => {

        if (!newPassword) {
            alert("Enter new password");
            return;
        }

        try {

            setLoading(true);

            await api.post("/auth/forgot-password/verify", {
                email,
                otp,
                new_password: newPassword,
            });

            alert("Password reset successful");

            navigate("/");

        } catch (err) {

            alert(
                err?.response?.data?.detail ||
                "Password reset failed"
            );

        } finally {

            setLoading(false);
        }
    };

    return (

        <div className="min-h-screen flex items-center justify-center bg-zinc-100 dark:bg-zinc-950 p-6 transition-colors duration-200">

            <div className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-3xl shadow-2xl p-8 border dark:border-zinc-800">

                <h1 className="text-3xl font-black text-center mb-2 text-zinc-900 dark:text-white">
                    Reset Password
                </h1>

                <p className="text-zinc-500 dark:text-zinc-400 text-center mb-8">
                    Recover your Easy Eats account
                </p>

                {/* DEV MODE: OTP display box — stays visible on steps 2 and 3 */}
                {devOtp && step >= 2 && (
                    <div className="mb-6 border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/20 rounded-2xl p-4">
                        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-2">
                            ⚠️ Test Mode — Email not sent
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">
                            SMTP is not configured. Your OTP is shown below — copy it into the field.
                        </p>
                        <div
                            className="text-center text-3xl font-black tracking-[0.3em] text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950 rounded-xl py-3 cursor-pointer select-all"
                            onClick={() => setOtp(devOtp)}
                            title="Click to auto-fill OTP"
                        >
                            {devOtp}
                        </div>
                        <p className="text-xs text-center text-amber-500 mt-2">
                            {step === 2 ? "Click the code to auto-fill ↑" : "Your verified OTP — keep for reference"}
                        </p>
                    </div>
                )}

                {/* STEP 1 */}

                {step === 1 && (

                    <div className="space-y-4">

                        <input
                            type="email"
                            placeholder="Enter your Gmail"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
                        />

                        <button
                            onClick={sendOtp}
                            disabled={loading}
                            className="w-full bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 rounded-2xl transition-all"
                        >
                            {loading ? "Sending OTP..." : "Send OTP"}
                        </button>

                    </div>
                )}

                {/* STEP 2 */}

                {step === 2 && (

                    <div className="space-y-4">

                        <input
                            type="text"
                            placeholder="Enter OTP"
                            value={otp}
                            onChange={(e) => setOtp(e.target.value)}
                            className="w-full border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
                        />

                        <button
                            onClick={verifyOtp}
                            disabled={loading}
                            className="w-full bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 rounded-2xl transition-all"
                        >
                            {loading ? "Verifying..." : "Verify OTP"}
                        </button>

                    </div>
                )}

                {/* STEP 3 */}

                {step === 3 && (

                    <div className="space-y-4">

                        <input
                            type="password"
                            placeholder="Enter New Password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full border border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
                        />

                        <button
                            onClick={resetPassword}
                            disabled={loading}
                            className="w-full bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 rounded-2xl transition-all"
                        >
                            {loading ? "Resetting..." : "Reset Password"}
                        </button>

                    </div>
                )}

            </div>
        </div>
    );
}