import { useState, useEffect, useRef, useCallback } from "react";
import { sendOtp, verifyOtp } from "../api";

export default function OTPModal({ isOpen, phone, email, onVerify, onClose }) {
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [timer, setTimer] = useState(60); // Modern 60 second cooldown
  const [resending, setResending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [generatedOtp, setGeneratedOtp] = useState("");

  const inputRefs = useRef([]);
  const otpSentRef = useRef(false);

  // ── Define handleSendOtp BEFORE the useEffect that calls it ──────────────────
  // (const is not hoisted; defining it after caused it to be undefined on mount)
  const handleSendOtp = useCallback(async (isResend = false) => {
    if (isResend) setResending(true);

    setError("");
    setSuccess("");

    try {
      const res = await sendOtp(phone, email);

      setGeneratedOtp(res.data.otp);
      setSuccess("OTP generated successfully!");
      setTimer(60);
      setOtp(["", "", "", "", "", ""]);

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);

    } catch (err) {
      setError(
        err.response?.data?.detail ||
        "Failed to send verification OTP."
      );
    } finally {
      setResending(false);
    }
  }, [phone, email]);

  // Trigger send on open
  useEffect(() => {
    if (isOpen && !otpSentRef.current) {
      otpSentRef.current = true;

      setOtp(["", "", "", "", "", ""]);
      setGeneratedOtp("");
      setTimer(60);
      setError("");
      setSuccess("");

      setTimeout(() => {
        inputRefs.current[0]?.focus();
      }, 100);

      handleSendOtp(false);
    }

    if (!isOpen) {
      otpSentRef.current = false;
    }
  }, [isOpen, handleSendOtp]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || timer <= 0) return;
    const interval = setInterval(() => {
      setTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, timer]);

  if (!isOpen) return null;

  const formatTimer = () => {
    const mins = Math.floor(timer / 60);
    const secs = timer % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const handleOtpChange = (value, index) => {
    if (!/^\d*$/.test(value)) return; // Allow only numbers

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only keep the last character typed
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    // Backspace handles clearing and focuses previous box
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const maskPhone = (ph) => {
    if (!ph) return "";
    const clean = ph.replace(/\s+/g, "");
    if (clean.length < 4) return ph;
    return `${clean.slice(0, 3)} ****** ${clean.slice(-4)}`;
  };

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits of the OTP.");
      return;
    }

    setVerifying(true);
    setError("");
    setSuccess("");

    // Pure Backend Local OTP Verification
    try {
      await verifyOtp(phone, code);
      setSuccess("Mobile number verified successfully!");
      setTimeout(() => {
        onVerify(null); // Passes null as no firebase token is needed
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired OTP code.");
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="relative bg-white/95 backdrop-blur-md border border-white/20 shadow-2xl rounded-3xl p-6 max-w-sm w-full animate-slide-up text-center"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100/80 hover:bg-gray-200 text-gray-500 font-bold flex items-center justify-center transition-all"
        >
          ✕
        </button>

        <div className="w-16 h-16 bg-lime-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">📱</span>
        </div>

        <h3 className="text-2xl font-black text-zinc-900 mb-1">Verify Phone Number</h3>
        <p className="text-sm text-gray-500 mb-6">
          OTP sent to <span className="font-semibold text-zinc-700">{maskPhone(phone)}</span>
        </p>

        {generatedOtp && (
          <div className="mb-4 bg-amber-50 border-2 border-amber-400 text-amber-900 px-4 py-3 rounded-xl text-left">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-600 mb-1">⚠️ Test Mode — Email not sent</p>
            <p className="text-sm mb-1">Your OTP is:</p>
            <button
              type="button"
              onClick={() => {
                const digits = generatedOtp.split("");
                setOtp(digits);
                setTimeout(() => inputRefs.current[5]?.focus(), 50);
              }}
              className="text-2xl font-black tracking-widest text-amber-800 hover:text-amber-600 cursor-pointer underline decoration-dotted transition-colors"
              title="Click to auto-fill"
            >
              {generatedOtp}
            </button>
            {/* <p className="text-xs text-amber-600 mt-1">👆 Click to auto-fill</p> */}
          </div>
        )}

        {/* OTP Input Boxes */}
        <div className="flex justify-between gap-2 mb-6">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              type="text"
              pattern="[0-9]*"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleOtpChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="w-12 h-12 text-center text-xl font-bold border border-gray-200 rounded-xl outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 bg-gray-50/50 focus:bg-white transition-all shadow-inner"
            />
          ))}
        </div>

        {/* Error / Success message */}
        {error && (
          <div className="mb-4 bg-red-50 text-red-700 border border-red-200 text-xs px-3 py-2 rounded-xl font-medium text-left">
            ⚠️ {error}
          </div>
        )}
        {success && (
          <div className="mb-4 bg-lime-50 text-lime-800 border border-lime-200 text-xs px-3 py-2 rounded-xl font-medium animate-pulse text-left">
            ✅ {success}
          </div>
        )}

        {/* Inbox Tip */}
        <div className="mb-4 text-xs text-lime-800 bg-lime-50/80 border border-lime-200/50 rounded-2xl p-3 text-left leading-relaxed flex gap-2">
          <span className="text-base flex-shrink-0">✉️</span>
          <span>
            <strong>Verification Note:</strong> A one-time verification code has been sent to your email. Please check your <strong>Inbox</strong> or <strong>Spam folder</strong>.
          </span>
        </div>

        {/* Timer / Resend */}
        <div className="flex items-center justify-between text-sm mb-6 px-1">
          <div className="text-gray-400 font-medium">
            {timer > 0 ? (
              <>Expires in <span className="text-zinc-700 font-mono font-bold">{formatTimer()}</span></>
            ) : (
              <span className="text-red-500 font-bold">Code expired</span>
            )}
          </div>

          <button
            onClick={() => handleSendOtp(true)}
            disabled={timer > 0 || resending}
            className={`font-bold hover:underline transition-colors ${timer > 0
              ? "text-gray-300 cursor-not-allowed"
              : "text-lime-600 hover:text-lime-700"
              }`}
          >
            {resending ? "Resending..." : timer > 0 ? `Resend (${timer}s)` : "Resend OTP"}
          </button>
        </div>

        {/* Submit */}
        <button
          onClick={handleVerify}
          disabled={verifying || otp.some(d => !d)}
          className="w-full bg-lime-500 hover:bg-lime-600 disabled:opacity-50 active:scale-[0.98] text-zinc-900 py-3.5 rounded-2xl font-bold shadow-lg shadow-lime-500/25 transition-all flex items-center justify-center gap-2"
        >
          {verifying ? (
            <>
              <div className="w-5 h-5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
              Verifying…
            </>
          ) : (
            "Verify & Proceed"
          )}
        </button>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        .animate-slide-up {
          animation: slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
      `}</style>
    </div>
  );
}
