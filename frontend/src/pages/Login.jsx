import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { login, register, sendOtp } from "../api";
import logo from "../assets/logo.svg";
import OTPModal from "../components/OTPModal";

const ALIAS = { owner: "stall_owner", kitchen: "stall_owner" };
const ROLE_REDIRECT = {
  student: "/home",
  stall_owner: "/admin",
  owner: "/admin",
  kitchen: "/admin",
  admin: "/admin",
};

function Toast({ message, type }) {
  if (!message) return null;
  return (
    <div className={`mb-4 border px-4 py-3 rounded-2xl text-sm font-medium flex items-start gap-2
      ${type === "success" ? "bg-lime-50 border-lime-300 text-lime-800" : "bg-red-50 border-red-300 text-red-700"}`}>
      <span className="flex-shrink-0">{type === "success" ? "✅" : "⚠️"}</span>
      <span>{message}</span>
    </div>
  );
}

function Input({ label, type = "text", value, onChange, placeholder, required, minLength }) {
  return (
    <div>
      <label className="block text-sm font-bold text-gray-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        required={required} minLength={minLength}
        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none
                   focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all
                   placeholder:text-gray-400 bg-gray-50 focus:bg-white"/>
    </div>
  );
}

function SubmitBtn({ loading, label }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full bg-lime-500 hover:bg-lime-600 active:scale-[0.98] disabled:opacity-60
                 text-zinc-900 py-3.5 rounded-xl font-bold shadow-lg shadow-lime-500/25
                 transition-all flex items-center justify-center gap-2 mt-2">
      {loading
        ? <><div className="w-5 h-5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />Processing…</>
        : label}
    </button>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const [role, setRole] = useState("student"); // student, stall_owner, admin
  const [authMode, setAuthMode] = useState("signin"); // signin, register

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) return;

    try {
      const u = JSON.parse(localStorage.getItem("user_data") || "{}");

      const userRole = ALIAS[u.role] || u.role;

      if (userRole === "admin") {
        navigate("/admin");

      } else if (userRole === "stall_owner") {

        if (u.stall_id) {
          navigate(`/kitchen/${u.stall_id}`);
        } else {
          localStorage.clear();
        }

      } else if (userRole === "student") {
        navigate("/home");

      } else {
        localStorage.clear();
      }

    } catch (e) {
      localStorage.clear();
    }
  }, [navigate]);

  // Form states
  const [siEmail, setSiEmail] = useState("");
  const [siPassword, setSiPassword] = useState("");

  const [stName, setStName] = useState("");
  const [stEmail, setStEmail] = useState("");
  const [stPhone, setStPhone] = useState("");
  const [stCountryCode, setStCountryCode] = useState("+91");
  const [stPassword, setStPassword] = useState("");
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);

  const [soStallName, setSoStallName] = useState("");
  const [soOwnerName, setSoOwnerName] = useState("");
  const [soEmail, setSoEmail] = useState("");
  const [soPhone, setSoPhone] = useState("");
  const [soPassword, setSoPassword] = useState("");

  const showToast = (message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const doLogin = async (email, password) => {
    setLoading(true);
    setToast(null);
    try {
      const { data } = await login({ email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user_data", JSON.stringify(data.user));
      const userRole = ALIAS[data.user.role] || data.user.role;

      if (userRole === "admin") {
        navigate("/admin");
      } else if (userRole === "stall_owner") {
        if (data.user.stall_id) {
          navigate(`/kitchen/${data.user.stall_id}`);
        } else {
          navigate("/admin");
        }
      } else {
        navigate(ROLE_REDIRECT[userRole] || "/home");
      }
    } catch (err) {
      const status = err.response?.status;
      const detail = err.response?.data?.detail;
      if (status === 404) {
        showToast("Cannot reach backend — make sure uvicorn is running on port 8000.", "error");
      } else if (status === 400) {
        showToast(detail || "Invalid email or password.", "error");
      } else {
        showToast(detail || err.message || "Login failed. Try again.", "error");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    await doLogin(siEmail, siPassword);
  };

  const handleStudentRegister = async (e) => {
    e.preventDefault();
    const clean = stPhone.replace(/\D/g, "");
    if (clean.length !== 10) {
      showToast("Please enter a valid 10-digit mobile number.", "error");
      return;
    }
    // Let the OTP Modal handle OTP generation/sending automatically upon opening
    setIsOtpModalOpen(true);
  };

  const handleOtpVerified = async (idToken) => {
    setIsOtpModalOpen(false);
    setLoading(true);
    setToast(null);
    const clean = stPhone.replace(/\D/g, "");
    const fullPhone = `${stCountryCode}${clean}`;
    try {
      await register({
        name: stName,
        email: stEmail,
        phone: fullPhone,
        password: stPassword,
        role: "student",
        firebase_token: idToken
      });
      await doLogin(stEmail, stPassword);
    } catch (err) {
      showToast(err.response?.data?.detail || "Registration failed.", "error");
      setLoading(false);
    }
  };

  const handleStallRegister = async (e) => {
    e.preventDefault();
    // Stall registration is disabled from login page
  };

  const isRegister = authMode === "register";

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col md:flex-row">
      {/* Left Branding Panel */}
      <div className="hidden md:flex md:w-5/12 lg:w-1/2 bg-zinc-900 text-white p-12 flex-col justify-between relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 bg-lime-500 rounded-xl flex items-center justify-center">
              <img src={logo} alt="Easy Eats" className="w-8 h-8 filter brightness-0" />
            </div>
            <h1 className="text-3xl font-black tracking-tight text-white">Easy Eats</h1>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold leading-tight mb-4">
            {role === "student" && "Craving something good?"}
            {role === "stall_owner" && "Grow your food business."}
            {role === "admin" && "Manage operations seamlessly."}
          </h2>
          <p className="text-zinc-400 text-lg max-w-md">
            {role === "student" && "Skip the queue. Order ahead and pick up fresh food from campus stalls."}
            {role === "stall_owner" && "Join Easy Eats to manage orders, menus, and reach more students on campus."}
            {role === "admin" && "Access the centralized dashboard to oversee the entire campus food ecosystem."}
          </p>
        </div>

        <div className="relative z-10 text-sm text-zinc-500 font-medium">
          © {new Date().getFullYear()} Easy Eats. All rights reserved.
        </div>

        {/* Decorative elements */}
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-lime-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-40"></div>
        <div className="absolute top-1/4 -left-32 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-[128px] opacity-20"></div>
      </div>

      {/* Right Auth Panel */}
      <div className="flex-1 flex flex-col justify-center px-6 py-12 lg:px-20 bg-white relative">
        <div className="w-full max-w-md mx-auto">

          {/* Mobile Header */}
          <div className="md:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 bg-lime-500 rounded-xl flex items-center justify-center shadow-lg">
              <img src={logo} alt="Easy Eats" className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-zinc-900">Easy Eats</h1>
          </div>

          <div className="mb-8">
            <h2 className="text-3xl font-black text-zinc-900 mb-2">
              {isRegister ? "Create Account" : "Welcome Back"}
            </h2>
            <p className="text-gray-500">
              {isRegister
                ? "Sign up to get started with Easy Eats."
                : "Enter your credentials to access your account."}
            </p>
          </div>

          {/* Role Toggle Tabs */}
          <div className="flex bg-gray-100 p-1.5 rounded-2xl mb-8 relative">
            <div
              className="absolute inset-y-1.5 bg-white rounded-xl shadow-sm transition-all duration-300 ease-out"
              style={{
                width: "calc(33.333% - 4px)",
                left: role === "student" ? "6px" : role === "stall_owner" ? "calc(33.333% + 2px)" : "calc(66.666% - 2px)"
              }}
            />
            {[
              { id: "student", label: "Student", icon: "🎓" },
              { id: "stall_owner", label: "Stall Owner", icon: "🏪" },
              { id: "admin", label: "Admin", icon: "🛡️" }
            ].map(r => (
              <button
                key={r.id}
                onClick={() => {
                  setRole(r.id);
                  setToast(null);
                  if (r.id !== "student") setAuthMode("signin");
                }}
                className={`flex-1 py-2.5 text-sm font-bold flex flex-col md:flex-row items-center justify-center gap-1.5 relative z-10 transition-colors ${role === r.id ? "text-zinc-900" : "text-gray-500 hover:text-gray-700"
                  }`}
              >
                <span className="text-lg leading-none">{r.icon}</span>
                <span>{r.label}</span>
              </button>
            ))}
          </div>

          <Toast {...toast} />

          {/* Form Content */}
          <div className="animate-fade-in-up">
            {!isRegister ? (
              /* Sign In Form (Shared for all roles conceptually, but we can pre-fill or guide) */
              <form onSubmit={handleSignIn} className="space-y-4">
                <Input label="Email Address" type="email" value={siEmail}
                  onChange={e => setSiEmail(e.target.value)} placeholder="you@example.com" required />
                <Input label="Password" type="password" value={siPassword}
                  onChange={e => setSiPassword(e.target.value)} placeholder="••••••••" required />

                <button
                  type="button"
                  onClick={() => navigate("/forgot-password")}
                  className="text-sm font-bold text-lime-600 hover:text-lime-700"
                >
                  Forgot password?
                </button>

                <SubmitBtn loading={loading} label="Sign In" />
              </form>
            ) : (
              /* Register Forms */
              role === "student" ? (
                <form onSubmit={handleStudentRegister} className="space-y-4">
                  <Input label="Full Name" value={stName} onChange={e => setStName(e.target.value)} placeholder="e.g. Arjun Kumar" required />
                  <Input label="College Email" type="email" value={stEmail} onChange={e => setStEmail(e.target.value)} placeholder="student@college.edu" required />

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1.5">Phone Number</label>
                    <div className="flex gap-2">
                      <select
                        value={stCountryCode}
                        onChange={e => setStCountryCode(e.target.value)}
                        className="border border-gray-200 rounded-xl px-2 py-3 text-sm outline-none bg-gray-50 font-bold focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all cursor-pointer"
                      >
                        <option value="+91">🇮🇳 +91</option>
                        <option value="+1">🇺🇸 +1</option>
                        <option value="+44">🇬🇧 +44</option>
                        <option value="+971">🇦🇪 +971</option>
                      </select>
                      <input
                        type="tel"
                        value={stPhone}
                        onChange={e => setStPhone(e.target.value)}
                        placeholder="98765 43210"
                        required
                        className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all placeholder:text-gray-400 bg-gray-50 focus:bg-white font-medium"
                      />
                    </div>
                  </div>

                  <Input label="Create Password" type="password" value={stPassword} onChange={e => setStPassword(e.target.value)} placeholder="Min 6 characters" required minLength={6} />
                  <SubmitBtn loading={loading} label="Create Student Account" />
                </form>
              ) : null
            )}
          </div>

          {/* Mode Toggle & Demo Login */}
          <div className="mt-8 text-center space-y-6">
            {role === "student" && (
              <p className="text-sm text-gray-500 font-medium">
                {isRegister ? "Already have an account? " : "New to Easy Eats? "}
                <button
                  onClick={() => { setAuthMode(isRegister ? "signin" : "register"); setToast(null); }}
                  className="text-lime-600 font-bold hover:underline"
                >
                  {isRegister ? "Sign In" : "Create Account"}
                </button>
              </p>
            )}

            <div className="relative pt-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-4 text-gray-400 font-bold tracking-widest">Demo Login</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                // { label: "🎓 Student", email: "student@demo.com", role: "student" },
                { label: "🏪 Campus Cafe", email: "cafe@demo.com", role: "stall_owner" },
                { label: "🍔 Burger Hub", email: "burger@demo.com", role: "stall_owner" },
                { label: "☕ Coffee Corner", email: "coffee@demo.com", role: "stall_owner" },
                { label: "🛡️ Super Admin", email: "admin@demo.com", role: "admin" },
              ].filter(d => role === "admin" ? d.role === "admin" : true).map((d) => (
                <button key={d.label} type="button"
                  onClick={() => {
                    setRole(d.role);
                    setAuthMode("signin");
                    setSiEmail(d.email);
                    setSiPassword("demo1234");
                    doLogin(d.email, "demo1234");
                  }}
                  className={`text-xs border border-gray-200 text-gray-600 py-3 px-3 rounded-xl
                             hover:border-lime-500 hover:bg-lime-50 hover:text-lime-700 font-bold transition-all
                             ${role === "admin" ? "col-span-2 max-w-xs mx-auto w-full" : ""}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      <OTPModal
        isOpen={isOtpModalOpen}
        phone={`${stCountryCode}${stPhone.replace(/\D/g, "")}`}
        onVerify={handleOtpVerified}
        onClose={() => setIsOtpModalOpen(false)}
      />

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}

