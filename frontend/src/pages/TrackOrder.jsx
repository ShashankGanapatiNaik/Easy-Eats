import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { trackOrder } from "../api";
import { useOrderSocket } from "../hooks/useOrderSocket";

/* ─── Status config ──────────────────────────────────────────────────────── */
const STATUS_STEPS = [
  { key: "Placed",       icon: "🧾", label: "Order Placed",     desc: "We've received your order",        progress: 20 },
  { key: "Accepted",     icon: "✅", label: "Accepted",          desc: "Kitchen accepted your order",      progress: 40 },
  { key: "Preparing",    icon: "👨‍🍳", label: "Preparing",         desc: "Fresh food being made for you",   progress: 65 },
  { key: "Almost Ready", icon: "🔔", label: "Almost Ready",      desc: "Finishing touches being added",    progress: 85 },
  { key: "Ready",        icon: "🎉", label: "Ready for Pickup!", desc: "Head to the stall now!",           progress: 100 },
];
const STATUS_INDEX = Object.fromEntries(STATUS_STEPS.map((s, i) => [s.key, i]));

const TOAST_BY_STATUS = {
  Accepted:     { emoji: "✅", msg: "Kitchen accepted your order!" },
  Preparing:    { emoji: "🍳", msg: "Kitchen started preparing your food" },
  "Almost Ready": { emoji: "🔔", msg: "Your food is almost ready!" },
  Ready:        { emoji: "🎉", msg: "Your order is ready for pickup!" },
  Collected:    { emoji: "🍔", msg: "Order collected! Enjoy your meal!" },
};

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function fmtCountdown(sec) {
  if (sec <= 0) return "00:00";
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatTime(iso, fallback) {
  if (!iso) return fallback || "--:--";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return fallback || "--:--";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return fallback || "--:--";
  }
}

/* ─── Toast component ────────────────────────────────────────────────────── */
function StatusToast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;
  return (
    <div style={{ animation: "slideDown 0.45s cubic-bezier(0.34,1.56,0.64,1)" }}
      className="fixed top-4 left-0 right-0 z-[200] flex justify-center px-4">
      <style>{`@keyframes slideDown { from { transform: translateY(-120%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div className="flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl max-w-sm w-full"
        style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)", border: "1px solid rgba(99,102,241,0.4)", backdropFilter: "blur(20px)" }}>
        <span className="text-2xl">{toast.emoji}</span>
        <p className="text-white font-semibold text-sm flex-1">{toast.msg}</p>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg">✕</button>
      </div>
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function TrackOrder() {
  const { id }       = useParams();
  const location     = useLocation();
  const navigate     = useNavigate();
  const init         = location.state || {};

  const [order, setOrder] = useState({
    status:               "Placed",
    remaining_min:        init.predicted_prep_min || 0,
    predicted_prep_min:   init.predicted_prep_min || 10,
    estimated_ready_time: init.estimated_ready_time || "--:--",
    estimated_ready_iso:  null,
    pickup_slot:          init.pickup_slot || "",
    stall_name:           init.stall_name  || "",
    total:                init.total       || 0,
    items:                [],
    ai_prediction:        null,
  });
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);
  const [countdown,  setCountdown]  = useState(0);
  const prevStatus   = useRef(null);
  const pollInterval = useRef(null);
  const audioRef     = useRef(null);

  /* ── fetch helper ────────────────────────────────────────────────────── */
  const applyData = useCallback((data) => {
    const newSt  = data.status;
    const oldSt  = prevStatus.current;

    if (oldSt && oldSt !== newSt && TOAST_BY_STATUS[newSt]) {
      setToast(TOAST_BY_STATUS[newSt]);
      if (newSt === "Ready") audioRef.current?.play().catch(() => {});
    }
    prevStatus.current = newSt;

    setOrder(data);
    // Reset countdown from socket/poll payload
    const mins = Number(data.remaining_min) || 0;
    setCountdown(mins * 60);
  }, []);

  const fetchTrack = useCallback(async () => {
    try {
      const res = await trackOrder(id);
      applyData(res.data);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [id, applyData]);

  /* ── initial fetch + polling fallback ───────────────────────────────── */
  useEffect(() => {
    fetchTrack();
    // Polling starts as fallback (socket hook will stop it if connected)
    pollInterval.current = setInterval(fetchTrack, 10000);
    return () => clearInterval(pollInterval.current);
  }, [id]);

  /* ── stop polling when terminal status reached ───────────────────────── */
  useEffect(() => {
    if (["Collected", "Cancelled"].includes(order.status)) {
      clearInterval(pollInterval.current);
    }
  }, [order.status]);

  /* ── auto redirect when collected ───────────────────────────────────── */
  useEffect(() => {
    if (order.status === "Collected") {
      const t = setTimeout(() => {
        navigate("/home");
      }, 4000);
      return () => clearTimeout(t);
    }
  }, [order.status, navigate]);

  /* ── socket hook ────────────────────────────────────────────────────── */
  useOrderSocket(
    id,
    (data) => applyData(data),        // called on socket event
    async () => {                      // fallback fetch for polling
      const res = await trackOrder(id);
      return res.data;
    }
  );

  /* ── countdown ticker ────────────────────────────────────────────────── */
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  /* ── derived values ─────────────────────────────────────────────────── */
  const currentIdx = STATUS_INDEX[order.status] ?? 0;
  const progress   = STATUS_STEPS[currentIdx]?.progress ?? 0;
  const isReady    = order.status === "Ready";
  const isCancelled = order.status === "Cancelled";
  const isCollected = order.status === "Collected";
  const isActive   = !["Collected", "Cancelled"].includes(order.status);

  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const initialSeconds = Math.max(1, order.predicted_prep_min) * 60;
  const progressPercent = Math.min(1, Math.max(0, countdown / initialSeconds));
  const strokeDashoffset = circumference - (progressPercent * circumference);

  /* ── styles ──────────────────────────────────────────────────────────── */
  const pageBg   = "min-h-screen pb-10 font-sans";
  const glassCard = {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: "24px",
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a14" }}>
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
        <p className="text-gray-400 text-sm">Loading your order…</p>
      </div>
    </div>
  );

  return (
    <div className={pageBg} style={{ background: "linear-gradient(135deg, #0a0a14 0%, #0f0f23 50%, #0a0a14 100%)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif; }
        @keyframes pulse-ring { 0%,100%{ transform:scale(1); opacity:.6; } 50%{ transform:scale(1.15); opacity:.3; } }
        @keyframes checkmark { from{ stroke-dashoffset:40 } to{ stroke-dashoffset:0 } }
        @keyframes fadeUp { from{ transform:translateY(16px); opacity:0; } to{ transform:translateY(0); opacity:1; } }
        @keyframes glow { 0%,100%{ box-shadow:0 0 20px rgba(99,102,241,0.4); } 50%{ box-shadow:0 0 40px rgba(99,102,241,0.7); } }
        .step-done { background: linear-gradient(135deg, #22c55e, #16a34a); }
        .step-active { background: linear-gradient(135deg, #6366f1, #8b5cf6); animation: glow 2s ease-in-out infinite; }
        .step-future { background: rgba(255,255,255,0.08); }
        .progress-bar { transition: width 0.9s cubic-bezier(0.4, 0, 0.2, 1); }
      `}</style>

      <audio ref={audioRef} src="/notification.mp3" preload="auto" />
      <StatusToast toast={toast} onClose={() => setToast(null)} />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 px-4 py-4 flex items-center gap-3"
        style={{ background: "rgba(10,10,20,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={() => navigate("/home")}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-all"
          style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="white" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Track Order</h1>
          {order.stall_name && <p className="text-indigo-400 text-xs font-medium">{order.stall_name}</p>}
        </div>
        <span className="ml-auto text-xs font-mono px-3 py-1 rounded-full"
          style={{ background: "rgba(99,102,241,0.15)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
          #{id.slice(-6).toUpperCase()}
        </span>
      </div>

      <div className="px-4 pt-5 space-y-4 max-w-md mx-auto">

        {/* ── Collected / Cancelled ─────────────────────────────────── */}
        {isCollected ? (
          <div className="rounded-3xl p-8 text-center" style={{ ...glassCard, border: "1px solid rgba(34,197,94,0.3)", animation: "fadeUp 0.5s ease" }}>
            <p className="text-5xl mb-3">🍔</p>
            <h2 className="text-2xl font-bold text-green-400">Order Collected!</h2>
            <p className="text-gray-400 text-sm mt-2">Thank you for ordering. Enjoy your meal!</p>
            <button onClick={() => navigate("/home")}
              className="mt-5 px-6 py-3 rounded-2xl font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)" }}>
              Back to Home
            </button>
          </div>
        ) : isCancelled ? (
          <div className="rounded-3xl p-8 text-center" style={{ ...glassCard, border: "1px solid rgba(239,68,68,0.3)" }}>
            <p className="text-5xl mb-3">❌</p>
            <h2 className="text-2xl font-bold text-red-400">Order Cancelled</h2>
            <p className="text-gray-400 text-sm mt-2">This order was cancelled.</p>
            <button onClick={() => navigate("/home")}
              className="mt-5 px-6 py-3 rounded-2xl font-bold text-sm text-white"
              style={{ background: "linear-gradient(135deg, #ef4444, #dc2626)" }}>
              Back to Home
            </button>
          </div>
        ) : (
          <>
            {/* ── Hero status card ──────────────────────────────────── */}
            <div className="rounded-3xl p-6 text-center" style={{ ...glassCard, animation: "fadeUp 0.5s ease" }}>
              {/* Animated icon */}
              <div className="relative inline-flex items-center justify-center mb-4">
                {!isReady && (
                  <div className="absolute inset-0 rounded-full"
                    style={{ background: "rgba(99,102,241,0.15)", animation: "pulse-ring 2s ease-in-out infinite" }} />
                )}
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl"
                  style={{ background: isReady ? "linear-gradient(135deg, #22c55e, #16a34a)" : "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                  {STATUS_STEPS[currentIdx]?.icon}
                </div>
              </div>

              <h2 className="text-2xl font-black text-white">{STATUS_STEPS[currentIdx]?.label}</h2>
              <p className="text-gray-400 text-sm mt-1">{STATUS_STEPS[currentIdx]?.desc}</p>

              {/* Circular Animated ETA Ring & dynamic ETA description */}
              {!isReady && order.remaining_min > 0 && (
                <div className="mt-6 flex flex-col items-center justify-center gap-4 animate-fade-in">
                  <div className="flex items-center justify-center gap-8">
                    {/* SVG Animated ETA Ring */}
                    <div className="relative inline-flex items-center justify-center">
                      <svg className="w-28 h-28 transform -rotate-90">
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          className="stroke-white/5"
                          strokeWidth="6"
                          fill="transparent"
                        />
                        <circle
                          cx="56"
                          cy="56"
                          r={radius}
                          className="stroke-indigo-500 transition-all duration-1000 ease-out"
                          strokeWidth="6"
                          fill="transparent"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          style={{
                            filter: "drop-shadow(0 0 6px rgba(99,102,241,0.5))"
                          }}
                        />
                      </svg>
                      <div className="absolute flex flex-col items-center">
                        <span className="text-xl font-black font-mono text-white tabular-nums tracking-tighter">
                          {countdown > 90 ? `${Math.ceil(countdown / 60)}m` : fmtCountdown(countdown)}
                        </span>
                        <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                          {countdown > 90 ? "approx" : "remaining"}
                        </span>
                      </div>
                    </div>

                    <div className="w-px h-12 bg-white/10" />

                    <div className="text-left">
                      <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Ready By</p>
                      <p className="text-2xl font-black text-white mt-0.5">
                        {formatTime(order.estimated_ready_iso, order.estimated_ready_time)}
                      </p>
                      <p className="text-xs text-indigo-400/80 mt-1 font-medium">
                        Based on live active orders
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isReady && (
                <div className="mt-4">
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold"
                    style={{ background: "rgba(34,197,94,0.2)", border: "1px solid rgba(34,197,94,0.4)", color: "#4ade80" }}>
                    🏃 Head to the stall now!
                  </div>
                </div>
              )}

              {order.pickup_slot && (
                <div className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm"
                  style={{ background: "rgba(255,255,255,0.06)", color: "#a5b4fc", border: "1px solid rgba(255,255,255,0.1)" }}>
                  🕐 Pickup: {order.pickup_slot}
                </div>
              )}
            </div>

            {/* AI Smart Prediction Card */}
            {isActive && !isReady && order.ai_prediction && (
              <div className="rounded-3xl p-5 border text-left space-y-3"
                style={{
                  ...glassCard,
                  borderColor: order.ai_prediction.status_color === "red" 
                    ? "rgba(239,68,68,0.25)" 
                    : order.ai_prediction.status_color === "yellow"
                      ? "rgba(245,158,11,0.25)"
                      : "rgba(16,185,129,0.25)"
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded border border-indigo-500/20">
                      🧠 AI Prediction
                    </span>
                  </div>
                  {/* Smart Label with pulsing dot */}
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-black border
                    ${order.ai_prediction.status_color === "red" ? "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse" : ""}
                    ${order.ai_prediction.status_color === "yellow" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" : ""}
                    ${order.ai_prediction.status_color === "green" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : ""}
                  `}>
                    <span className={`w-1.5 h-1.5 rounded-full
                      ${order.ai_prediction.status_color === "red" ? "bg-red-400 animate-ping" : ""}
                      ${order.ai_prediction.status_color === "yellow" ? "bg-amber-400" : ""}
                      ${order.ai_prediction.status_color === "green" ? "bg-emerald-400" : ""}
                    `} />
                    {order.ai_prediction.status_label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Estimated Window</p>
                    <p className="text-white font-extrabold text-sm mt-0.5">
                      Likely {order.ai_prediction.confidence_range}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Delay Risk</p>
                    <p className={`font-black text-sm mt-0.5 
                      ${order.ai_prediction.delay_risk === "High" ? "text-red-400" : ""}
                      ${order.ai_prediction.delay_risk === "Medium" ? "text-amber-400" : ""}
                      ${order.ai_prediction.delay_risk === "Low" ? "text-emerald-400" : ""}
                    `}>
                      {order.ai_prediction.delay_risk} Risk
                    </p>
                  </div>
                </div>

                {/* ── Smart Pickup Prediction ─────────────────────────────── */}
                {order.ai_prediction.leave_recommendation && (
                  <div className="mt-1 pt-3 border-t space-y-3" style={{ borderColor: "rgba(255,255,255,0.07)" }}>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
                      🎯 Smart Pickup Prediction
                    </p>

                    {/* Journey breakdown */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl py-2 px-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-lg font-black text-white">{order.remaining_min || "--"}</p>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Cook</p>
                        <p className="text-[9px] text-indigo-400 font-medium">min</p>
                      </div>
                      <div className="rounded-xl py-2 px-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-lg font-black text-amber-400">{order.ai_prediction.queue_time_min}</p>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Queue</p>
                        <p className="text-[9px] text-amber-400/70 font-medium">min</p>
                      </div>
                      <div className="rounded-xl py-2 px-1" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                        <p className="text-lg font-black text-blue-400">{order.ai_prediction.walking_time_min}</p>
                        <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">Walk</p>
                        <p className="text-[9px] text-blue-400/70 font-medium">min</p>
                      </div>
                    </div>

                    {/* Leave Recommendation badge */}
                    <div className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-2xl font-black text-sm transition-all
                      ${order.ai_prediction.leave_label === "ready" ? "text-emerald-300" : ""}
                      ${order.ai_prediction.leave_label === "now" ? "text-red-300" : ""}
                      ${order.ai_prediction.leave_label === "soon" ? "text-amber-300" : ""}
                      ${order.ai_prediction.leave_label === "later" ? "text-indigo-300" : ""}
                    `} style={{
                      background: order.ai_prediction.leave_label === "ready" ? "rgba(34,197,94,0.15)"
                        : order.ai_prediction.leave_label === "now" ? "rgba(239,68,68,0.15)"
                        : order.ai_prediction.leave_label === "soon" ? "rgba(245,158,11,0.15)"
                        : "rgba(99,102,241,0.15)",
                      border: `1px solid ${
                        order.ai_prediction.leave_label === "ready" ? "rgba(34,197,94,0.3)"
                        : order.ai_prediction.leave_label === "now" ? "rgba(239,68,68,0.3)"
                        : order.ai_prediction.leave_label === "soon" ? "rgba(245,158,11,0.3)"
                        : "rgba(99,102,241,0.3)"
                      }`
                    }}>
                      <span className="text-base">
                        {order.ai_prediction.leave_label === "ready" ? "🍔" 
                         : order.ai_prediction.leave_label === "now" ? "🏃" 
                         : order.ai_prediction.leave_label === "soon" ? "⏱️" 
                         : "🕐"}
                      </span>
                      {order.ai_prediction.leave_recommendation}
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="pt-2.5 border-t border-white/5 flex justify-between items-center text-[10px] text-gray-400">
                  <span>📈 Kitchen Speed: <b>{order.ai_prediction.avg_completion_speed}/order</b></span>
                  {order.ai_prediction.delay_risk === "High" && (
                    <span className="text-red-400 font-bold animate-pulse">⚠️ Automatic Delay Warning</span>
                  )}
                  {order.ai_prediction.delay_risk === "Low" && (
                    <span className="text-emerald-400 font-bold">🟢 Ideal Time to Order</span>
                  )}
                  {order.ai_prediction.delay_risk === "Medium" && (
                    <span className="text-amber-400 font-bold">🟡 Peak Hours Forecasting</span>
                  )}
                </div>
              </div>
            )}


            {/* ── Progress bar ──────────────────────────────────────── */}
            <div className="rounded-2xl p-4" style={glassCard}>
              <div className="flex justify-between text-xs text-gray-500 mb-2">
                <span>Progress</span>
                <span className="text-indigo-400 font-semibold">{progress}%</span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full progress-bar"
                  style={{ width: `${progress}%`, background: "linear-gradient(90deg, #6366f1, #8b5cf6, #a78bfa)" }} />
              </div>
            </div>

            {/* ── Timeline ──────────────────────────────────────────── */}
            <div className="rounded-3xl p-5" style={glassCard}>
              <h3 className="text-white font-bold text-sm mb-5">Order Timeline</h3>
              <div className="space-y-0">
                {STATUS_STEPS.map((step, i) => {
                  const done    = i < currentIdx;
                  const current = i === currentIdx;
                  const future  = i > currentIdx;
                  return (
                    <div key={step.key} className="flex items-start gap-4">
                      {/* Icon column */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all
                          ${done ? "step-done" : current ? "step-active" : "step-future"}`}>
                          {done ? (
                            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="white" strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" style={{ strokeDasharray: 40, strokeDashoffset: 0, animation: "checkmark 0.4s ease forwards" }} />
                            </svg>
                          ) : (
                            <span>{step.icon}</span>
                          )}
                        </div>
                        {i < STATUS_STEPS.length - 1 && (
                          <div className="w-0.5 h-8 mt-1 transition-all duration-700"
                            style={{ background: done ? "linear-gradient(#22c55e, #6366f1)" : "rgba(255,255,255,0.07)" }} />
                        )}
                      </div>
                      {/* Text */}
                      <div className={`pt-1 pb-8 transition-opacity ${future ? "opacity-35" : "opacity-100"}`}>
                        <p className={`text-sm font-bold ${done || current ? "text-white" : "text-gray-500"}`}>{step.label}</p>
                        {current && <p className="text-xs mt-0.5 text-indigo-400">{step.desc}</p>}
                        {done && <p className="text-xs mt-0.5 text-green-500 font-medium">✓ Completed</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Order summary ─────────────────────────────────────── */}
            {order.items?.length > 0 && (
              <div className="rounded-3xl p-5" style={glassCard}>
                <h3 className="text-white font-bold text-sm mb-4">Your Order</h3>
                <div className="space-y-2">
                  {order.items.map((item, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-300">{item.qty}× {item.name}</span>
                      <span className="text-gray-400">₹{item.subtotal}</span>
                    </div>
                  ))}
                  <div className="border-t mt-3 pt-3 flex justify-between font-bold"
                    style={{ borderColor: "rgba(255,255,255,0.08)" }}>
                    <span className="text-white">Total</span>
                    <span className="text-indigo-400">₹{order.total}</span>
                  </div>
                </div>
              </div>
            )}

            {/* ── CTA ───────────────────────────────────────────────── */}
            {isReady && (
              <button onClick={() => navigate("/home")}
                className="w-full py-4 rounded-2xl font-black text-white text-base transition-all active:scale-[0.97]"
                style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 8px 32px rgba(34,197,94,0.4)" }}>
                🏠 Back to Home
              </button>
            )}

            {isActive && !isReady && (
              <p className="text-center text-xs text-gray-600 pb-2">
                🔴 Live — updates in real-time
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}