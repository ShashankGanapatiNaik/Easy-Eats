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

    // SEND OTP
    const sendOtp = async () => {

        if (!email) {
            alert("Enter email");
            return;
        }

        try {

            setLoading(true);

            await api.post("/auth/forgot-password/send", {
                email,
            });

            alert("OTP sent to your Gmail");

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

        setStep(3);
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

        <div className="min-h-screen flex items-center justify-center bg-zinc-100 p-6">

            <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8">

                <h1 className="text-3xl font-black text-center mb-2">
                    Reset Password
                </h1>

                <p className="text-zinc-500 text-center mb-8">
                    Recover your Easy Eats account
                </p>

                {/* STEP 1 */}

                {step === 1 && (

                    <div className="space-y-4">

                        <input
                            type="email"
                            placeholder="Enter your Gmail"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-zinc-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
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
                            className="w-full border border-zinc-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
                        />

                        <button
                            onClick={verifyOtp}
                            className="w-full bg-lime-500 hover:bg-lime-600 text-white font-bold py-3 rounded-2xl transition-all"
                        >
                            Verify OTP
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
                            className="w-full border border-zinc-300 rounded-2xl px-4 py-3 outline-none focus:ring-2 focus:ring-lime-500"
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