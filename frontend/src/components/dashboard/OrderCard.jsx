// src/components/dashboard/OrderCard.jsx
// Simplified kitchen order card: Accept (set prep time → Preparing) → Ready for Pickup

import { useState, useEffect } from "react";
import { updateStatus } from "../../api";

const STATUS_STYLE = {
  Placed:         { pill: "bg-blue-100 text-blue-700 border-blue-200",   dot: "bg-blue-500"   },
  Accepted:       { pill: "bg-indigo-100 text-indigo-700 border-indigo-200", dot: "bg-indigo-500" },
  Preparing:      { pill: "bg-amber-100 text-amber-700 border-amber-200",  dot: "bg-amber-500"  },
  "Almost Ready": { pill: "bg-orange-100 text-orange-700 border-orange-200",dot: "bg-orange-500" },
  Ready:          { pill: "bg-lime-100 text-lime-800 border-lime-300",    dot: "bg-lime-500"   },
  Collected:      { pill: "bg-zinc-100 text-zinc-600 border-zinc-200",    dot: "bg-zinc-400"   },
  Cancelled:      { pill: "bg-red-100 text-red-600 border-red-200",       dot: "bg-red-400"    },
};

const ACTIVE = ["Placed", "Accepted", "Preparing", "Almost Ready", "Ready"];

// Generate a short human-readable pickup code from order id
function pickupCode(orderId) {
  return orderId.slice(-4).toUpperCase();
}

function parseIsoToMs(isoStr) {
  if (!isoStr) return null;
  let s = String(isoStr).trim();
  if (!s.endsWith("Z") && !s.includes("+") && !s.includes("-", 10)) {
    s += "Z";
  }
  const ms = new Date(s).getTime();
  return isNaN(ms) ? null : ms;
}

function fmt12(iso) {
  if (!iso) return "--:--";
  const ms = parseIsoToMs(iso);
  if (!ms) return "--:--";
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Live countdown hook — counts down seconds from a target ISO datetime
function useCountdown(targetIso) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!targetIso) return;
    const update = () => {
      const targetMs = parseIsoToMs(targetIso);
      const diff = targetMs ? Math.max(0, Math.floor((targetMs - Date.now()) / 1000)) : 0;
      setSecs(diff);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [targetIso]);

  const mins = Math.floor(secs / 60);
  const sec  = secs % 60;
  return { mins, sec, secs, expired: secs === 0 };
}

// ── Main OrderCard ────────────────────────────────────────────────────────────
export default function OrderCard({ order, isNew, onUpdated, onDeleted }) {
  const [loading,       setLoading]       = useState(false);
  const [localOrder,    setLocalOrder]    = useState(order);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [prepInput,     setPrepInput]     = useState(order.predicted_prep_min || 10);

  // sync if parent refreshes
  useEffect(() => setLocalOrder(order), [order]);

  const countdown = useCountdown(localOrder.estimated_ready_iso);
  const elapsed   = Math.floor((Date.now() - new Date(localOrder.placed_at)) / 60000);
  // Overdue: only if ETA has been set (order was accepted) and countdown expired
  const hasEta    = !!localOrder.estimated_ready_iso && ACTIVE.includes(localOrder.status) && localOrder.status !== "Placed";
  const isOverdue = hasEta && countdown.expired && localOrder.status !== "Ready";
  const isReady   = localOrder.status === "Ready";
  const isCollected = localOrder.status === "Collected";
  const isPending = localOrder.status === "Placed";
  const isPreparing = ["Preparing", "Accepted", "Almost Ready"].includes(localOrder.status);
  const style     = STATUS_STYLE[localOrder.status] || STATUS_STYLE.Placed;
  const code       = pickupCode(localOrder.id);

  // ── Update or Set Prep Time ───────────────────────────────────────────────
  const handleUpdatePrepTime = async (mins) => {
    setLoading(true);
    setShowTimeModal(false);
    const targetMins = Number(mins) || 10;
    const readyIso = new Date(Date.now() + targetMins * 60000).toISOString();
    const targetStatus = isPending ? "Preparing" : localOrder.status;

    const updated = { 
      ...localOrder, 
      status: targetStatus, 
      estimated_ready_iso: readyIso,
      predicted_prep_min: targetMins
    };
    setLocalOrder(updated);

    try {
      const res = await updateStatus(localOrder.id, targetStatus, targetMins);
      const serverData = res.data;
      const merged = {
        ...updated,
        estimated_ready_time: serverData.estimated_ready_time,
        estimated_ready_iso:  serverData.estimated_ready_iso,
        remaining_min:        serverData.remaining_min,
        ai_prediction:        serverData.ai_prediction,
      };
      setLocalOrder(merged);
      onUpdated?.(merged);
    } catch {
      setLocalOrder(order); // revert
    } finally {
      setLoading(false);
    }
  };

  // ── Accept Order directly with default AI time ────────────────────────────
  const handleAcceptOrder = async () => {
    const defaultMins = localOrder.predicted_prep_min || 10;
    await handleUpdatePrepTime(defaultMins);
  };

  // ── Ready for Pickup ──────────────────────────────────────────────────────
  const handleReadyForPickup = async () => {
    setLoading(true);
    const updated = { ...localOrder, status: "Ready" };
    setLocalOrder(updated);

    try {
      const res = await updateStatus(localOrder.id, "Ready");
      const serverData = res.data;
      setLocalOrder({ ...updated, ...serverData });
      onUpdated?.({ ...updated, ...serverData });
    } catch {
      setLocalOrder(localOrder); // revert
    } finally {
      setLoading(false);
    }
  };

  // ── Mark Collected ────────────────────────────────────────────────────────
  const handleCollected = async () => {
    setLoading(true);
    const updated = { ...localOrder, status: "Collected" };
    setLocalOrder(updated);

    try {
      await updateStatus(localOrder.id, "Collected");
      onUpdated?.(updated);
    } catch {
      setLocalOrder(localOrder);
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = async () => {
    setLoading(true);
    try {
      await updateStatus(localOrder.id, "Cancelled");
      const updated = { ...localOrder, status: "Cancelled" };
      setLocalOrder(updated);
      onUpdated?.(updated);
    } catch {
      // revert
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Remove this collected order from the board?")) return;
    onDeleted?.(localOrder.id);
  };

  return (
    <>
      <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all duration-300
        ${isNew     ? "border-lime-400 ring-2 ring-lime-400/30 shadow-lime-100 shadow-md" : ""}
        ${isOverdue ? "border-red-300" : ""}
        ${isReady   ? "border-lime-300 ring-1 ring-lime-300/40" : ""}
        ${isCollected ? "opacity-70" : ""}
        ${!isNew && !isOverdue && !isReady && !isCollected ? "border-gray-100 hover:shadow-md hover:-translate-y-0.5" : ""}
      `}>

        {/* ── Ribbon ── */}
        {isNew && (
          <div className="bg-lime-500 text-zinc-900 text-xs font-black text-center py-1 animate-pulse tracking-widest">
            🔔 NEW ORDER
          </div>
        )}
        {isOverdue && !isNew && (
          <div className="bg-red-500 text-white text-xs font-bold text-center py-1">
            ⚠️ OVERDUE — {countdown.mins === 0 && countdown.sec === 0
              ? `${Math.abs(Math.floor((Date.now() - new Date(localOrder.estimated_ready_iso)) / 60000))} min past ETA`
              : "past estimated time"}
          </div>
        )}
        {isPending && !isNew && (
          <div className="bg-blue-500 text-white text-xs font-bold text-center py-1">
            ⏳ PENDING — waiting for acceptance
          </div>
        )}
        {isReady && (
          <div className="bg-lime-500 text-zinc-900 text-xs font-black text-center py-1 animate-pulse">
            ✅ READY FOR PICKUP
          </div>
        )}

        <div className="p-4">
          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-black text-zinc-900 text-base">#{code}</p>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${style.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {isPending ? "Pending" : localOrder.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Placed {elapsed === 0 ? "just now" : `${elapsed}m ago`}
                {localOrder.customer_name ? ` · ${localOrder.customer_name}` : ""}
              </p>
            </div>

            {/* ETA countdown — only show after order has been accepted */}
            {hasEta && !isReady && (
              <div className={`text-right flex-shrink-0 ${countdown.expired ? "text-red-500" : "text-zinc-900"}`}>
                <p className="text-xs text-gray-400">Ready by</p>
                <p className="font-black text-sm tabular-nums">
                  {fmt12(localOrder.estimated_ready_iso)}
                </p>
                {!countdown.expired && (
                  <p className="text-xs font-bold text-lime-600 tabular-nums">
                    {countdown.mins}m {String(countdown.sec).padStart(2,"0")}s
                  </p>
                )}
                {countdown.expired && (
                  <p className="text-xs font-bold text-red-500">Overdue</p>
                )}
              </div>
            )}
          </div>

          {/* ── Items ── */}
          <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1.5">
            {localOrder.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-start text-sm">
                <span className="text-zinc-700">
                  <span className="font-bold text-zinc-900">{item.qty}×</span> {item.name}
                  {item.customizations?.length > 0 && (
                    <span className="text-xs text-gray-400 block ml-4">
                      {item.customizations.map(c => c.label).join(", ")}
                    </span>
                  )}
                </span>
                <span className="text-gray-500 ml-2 flex-shrink-0 font-medium">₹{item.subtotal}</span>
              </div>
            ))}
          </div>

          {/* ── Special instructions ── */}
          {localOrder.special_instructions && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              <p className="text-xs text-amber-600 font-bold mb-0.5">📝 Customer Note</p>
              <p className="text-xs text-amber-800 leading-relaxed">{localOrder.special_instructions}</p>
            </div>
          )}

          {/* ── Pickup code + total ── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-zinc-900 text-white px-3 py-1.5 rounded-xl">
                <p className="text-xs text-zinc-400">Pickup</p>
                <p className="font-black text-base tracking-widest">{code}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Total</p>
                <p className="font-black text-zinc-900 text-lg">₹{localOrder.total}</p>
              </div>
            </div>
            {localOrder.pickup_slot && (
              <span className="text-xs bg-gray-100 text-gray-500 px-2.5 py-1 rounded-lg font-medium">
                🕐 {localOrder.pickup_slot}
              </span>
            )}
          </div>

          {/* ── AI Assistant Analytics (Dashboard) ── */}
          {localOrder.ai_prediction && ACTIVE.includes(localOrder.status) && (
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 mb-3 flex justify-between items-center text-[11px] text-zinc-600">
              <div>
                <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider">🧠 AI ETA Window</p>
                <p className="font-extrabold text-indigo-950 mt-0.5">
                  {localOrder.ai_prediction.confidence_range}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider">Delay Risk</p>
                <span className={`inline-block font-black mt-0.5
                  ${localOrder.ai_prediction.delay_risk === "High" ? "text-red-600 animate-pulse" : ""}
                  ${localOrder.ai_prediction.delay_risk === "Medium" ? "text-amber-600" : ""}
                  ${localOrder.ai_prediction.delay_risk === "Low" ? "text-emerald-600" : ""}
                `}>
                  {localOrder.ai_prediction.delay_risk} Risk
                </span>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-indigo-500 font-bold uppercase tracking-wider">Stall Avg Speed</p>
                <p className="font-bold text-indigo-950 mt-0.5">
                  {localOrder.ai_prediction.avg_completion_speed}
                </p>
              </div>
            </div>
          )}

          {/* ── Custom Prep Time Picker / Time Adjustment Panel ── */}
          {showTimeModal && (
            <div className="mb-3 p-3 bg-zinc-900 text-white rounded-2xl animate-fade-in space-y-2">
              <div className="flex justify-between items-center">
                <p className="text-xs font-bold text-lime-400">⏱️ {isPending ? "Set Prep Time" : "Extend / Update Prep Time"}</p>
                <button onClick={() => setShowTimeModal(false)} className="text-xs text-gray-400 hover:text-white">✕</button>
              </div>
              
              {/* Quick minute pills */}
              <div className="flex gap-1.5 flex-wrap">
                {[5, 10, 15, 20, 30, 45].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setPrepInput(m); handleUpdatePrepTime(m); }}
                    className="px-2.5 py-1 text-xs font-bold bg-zinc-800 hover:bg-lime-500 hover:text-zinc-900 rounded-lg transition-colors border border-zinc-700"
                  >
                    {m}m
                  </button>
                ))}
              </div>

              {/* Custom input row */}
              <div className="flex gap-2 pt-1">
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={prepInput}
                  onChange={(e) => setPrepInput(e.target.value)}
                  placeholder="Mins"
                  className="w-20 bg-zinc-800 border border-zinc-700 text-white rounded-xl px-2.5 py-1 text-xs font-bold outline-none focus:border-lime-500"
                />
                <button
                  onClick={() => handleUpdatePrepTime(prepInput)}
                  className="flex-1 bg-lime-500 hover:bg-lime-600 text-zinc-900 text-xs font-bold py-1 px-3 rounded-xl transition-all"
                >
                  Set {prepInput} Mins
                </button>
              </div>
            </div>
          )}

          {/* ── Action buttons ── */}
          <div className="flex gap-2 flex-wrap">
            {/* Pending → Accept Order */}
            {isPending && (
              <>
                <button
                  onClick={handleAcceptOrder}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95
                    disabled:opacity-50 flex items-center justify-center gap-1.5
                    bg-lime-500 hover:bg-lime-600 text-zinc-900 shadow-md shadow-lime-500/20"
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : `✓ Accept (${localOrder.predicted_prep_min || 10}m)`
                  }
                </button>

                <button
                  onClick={() => setShowTimeModal(!showTimeModal)}
                  className="px-3 py-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold text-xs transition-all flex items-center gap-1"
                  title="Choose custom preparation time"
                >
                  ⏱️ Custom
                </button>
              </>
            )}

            {/* Preparing / Almost Ready → Ready for Pickup + Extend Time option */}
            {isPreparing && (
              <>
                <button
                  onClick={handleReadyForPickup}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95
                    disabled:opacity-50 flex items-center justify-center gap-2
                    bg-lime-500 hover:bg-lime-600 text-zinc-900 shadow-md shadow-lime-500/20"
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : "🍽️ Ready for Pickup"
                  }
                </button>

                <button
                  onClick={() => setShowTimeModal(!showTimeModal)}
                  className="px-3 py-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-xs transition-all flex items-center gap-1"
                  title="Adjust or extend prep time"
                >
                  ⏱️ Extend Time
                </button>
              </>
            )}

            {/* Ready → Mark Collected */}
            {isReady && (
              <button
                onClick={handleCollected}
                disabled={loading}
                className="flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95
                  disabled:opacity-50 flex items-center justify-center gap-2
                  bg-zinc-800 hover:bg-zinc-700 text-white"
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  : "✓ Mark Collected"
                }
              </button>
            )}

            {/* Cancel (active non-ready orders) */}
            {ACTIVE.includes(localOrder.status) && !isReady && (
              <button
                onClick={handleCancel}
                disabled={loading}
                className="px-3.5 py-3 rounded-xl bg-gray-100 hover:bg-red-100
                           text-gray-400 hover:text-red-500 font-bold text-sm transition-all"
              >
                ✕
              </button>
            )}

            {/* Delete collected */}
            {isCollected && (
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-xl bg-red-50 hover:bg-red-100
                           text-red-500 font-bold text-sm transition-all border border-red-200"
              >
                🗑 Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}