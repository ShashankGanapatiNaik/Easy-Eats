// src/components/dashboard/OrderCard.jsx
// Simplified kitchen order card: Accept (set prep time → Preparing) → Ready for Pickup

import { useState, useEffect } from "react";
import { updateStatus } from "../../api";

const STATUS_STYLE = {
  Placed:         { pill: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",   dot: "bg-blue-500"   },
  Accepted:       { pill: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20", dot: "bg-indigo-500" },
  Preparing:      { pill: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",  dot: "bg-amber-500"  },
  "Almost Ready": { pill: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",dot: "bg-orange-500" },
  Ready:          { pill: "bg-lime-500/10 text-lime-700 dark:text-lime-400 border-lime-500/20",    dot: "bg-lime-500"   },
  Collected:      { pill: "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20",    dot: "bg-zinc-400"   },
  Cancelled:      { pill: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",       dot: "bg-rose-500"    },
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
    const targetMins = Math.max(1, Number(mins) || 10);
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

  // ── Extend Prep Time (Adds minutes to current remaining time) ────────────
  const handleExtendPrepTime = async (addMins) => {
    const currentRem = (hasEta && !countdown.expired) 
      ? Math.ceil(countdown.secs / 60) 
      : (localOrder.remaining_min || 5);
    const newTotalMins = currentRem + Number(addMins);
    await handleUpdatePrepTime(newTotalMins);
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
      <div className={`bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 overflow-hidden shadow-sm transition-all duration-300
        ${isNew     ? "border-lime-500 dark:border-lime-400 ring-2 ring-lime-400/30 shadow-lime-500/10 shadow-lg" : ""}
        ${isOverdue ? "border-rose-400 dark:border-rose-500 ring-1 ring-rose-400/20" : ""}
        ${isReady   ? "border-lime-400 dark:border-lime-400 ring-1 ring-lime-400/30" : ""}
        ${isCollected ? "opacity-75 dark:opacity-60" : ""}
        ${!isNew && !isOverdue && !isReady && !isCollected ? "hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-lg hover:-translate-y-0.5" : ""}
      `}>

        {/* ── Ribbon ── */}
        {isNew && (
          <div className="bg-lime-500 text-zinc-950 text-[11px] font-black text-center py-1 animate-pulse tracking-widest uppercase">
            🔔 NEW ORDER ARRIVED
          </div>
        )}
        {isOverdue && !isNew && (
          <div className="bg-rose-500 text-white text-[11px] font-bold text-center py-1 uppercase tracking-wider">
            ⚠️ OVERDUE — {countdown.mins === 0 && countdown.sec === 0
              ? `${Math.abs(Math.floor((Date.now() - new Date(localOrder.estimated_ready_iso)) / 60000))} min past ETA`
              : "past estimated time"}
          </div>
        )}
        {isPending && !isNew && (
          <div className="bg-blue-500 text-white text-[11px] font-bold text-center py-1 uppercase tracking-wider">
            ⏳ PENDING — Waiting for Acceptance
          </div>
        )}
        {isReady && (
          <div className="bg-lime-500 text-zinc-950 text-[11px] font-black text-center py-1 animate-pulse uppercase tracking-wider">
            ✅ READY FOR PICKUP
          </div>
        )}

        <div className="p-4 sm:p-5">
          {/* ── Header ── */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-black text-zinc-900 dark:text-white text-base">#{code}</p>
                <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${style.pill}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {isPending ? "Pending" : localOrder.status}
                </span>
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">
                Placed {elapsed === 0 ? "just now" : `${elapsed}m ago`}
                {localOrder.customer_name ? ` · ${localOrder.customer_name}` : ""}
              </p>
            </div>

            {/* ETA countdown — only show after order has been accepted */}
            {hasEta && !isReady && (
              <div className={`text-right flex-shrink-0 ${countdown.expired ? "text-rose-500" : "text-zinc-900 dark:text-white"}`}>
                <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">Ready by</p>
                <p className="font-black text-sm tabular-nums">
                  {fmt12(localOrder.estimated_ready_iso)}
                </p>
                {!countdown.expired && (
                  <p className="text-xs font-bold text-lime-600 dark:text-lime-400 tabular-nums">
                    {countdown.mins}m {String(countdown.sec).padStart(2,"0")}s
                  </p>
                )}
                {countdown.expired && (
                  <p className="text-xs font-bold text-rose-500">Overdue</p>
                )}
              </div>
            )}
          </div>

          {/* ── Items List ── */}
          <div className="bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 rounded-2xl p-3 mb-3 space-y-1.5">
            {localOrder.items?.map((item, i) => (
              <div key={i} className="flex justify-between items-start text-xs sm:text-sm">
                <span className="text-zinc-800 dark:text-zinc-200">
                  <span className="font-black text-zinc-900 dark:text-white">{item.qty}×</span> {item.name}
                  {item.customizations?.length > 0 && (
                    <span className="text-[11px] text-zinc-400 block ml-4">
                      {item.customizations.map(c => c.label).join(", ")}
                    </span>
                  )}
                </span>
                <span className="text-zinc-500 dark:text-zinc-400 ml-2 flex-shrink-0 font-bold">₹{item.subtotal}</span>
              </div>
            ))}
          </div>

          {/* ── Special instructions ── */}
          {localOrder.special_instructions && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-3 py-2 mb-3">
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold mb-0.5">📝 Special Request</p>
              <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed font-medium">{localOrder.special_instructions}</p>
            </div>
          )}

          {/* ── Pickup code + total ── */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-zinc-900 dark:bg-zinc-800 border border-zinc-800 text-white px-3 py-1.5 rounded-xl shadow-sm">
                <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Pickup Code</p>
                <p className="font-black text-base tracking-widest text-lime-400">{code}</p>
              </div>
              <div>
                <p className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider">Total Amount</p>
                <p className="font-black text-zinc-900 dark:text-white text-lg">₹{localOrder.total}</p>
              </div>
            </div>
            {localOrder.pickup_slot && (
              <span className="text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 px-3 py-1 rounded-xl font-bold border border-zinc-200 dark:border-zinc-700">
                🕐 {localOrder.pickup_slot}
              </span>
            )}
          </div>

          {/* ── AI Assistant Analytics (Dashboard) ── */}
          {localOrder.ai_prediction && ACTIVE.includes(localOrder.status) && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl px-3.5 py-2.5 mb-3 flex justify-between items-center text-[11px] text-zinc-600 dark:text-zinc-300">
              <div>
                <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">🧠 AI Prep Window</p>
                <p className="font-extrabold text-indigo-950 dark:text-indigo-200 mt-0.5">
                  {localOrder.ai_prediction.confidence_range}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">Delay Risk</p>
                <span className={`inline-block font-black mt-0.5
                  ${localOrder.ai_prediction.delay_risk === "High" ? "text-rose-500 animate-pulse" : ""}
                  ${localOrder.ai_prediction.delay_risk === "Medium" ? "text-amber-500" : ""}
                  ${localOrder.ai_prediction.delay_risk === "Low" ? "text-emerald-500 dark:text-emerald-400" : ""}
                `}>
                  {localOrder.ai_prediction.delay_risk} Risk
                </span>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">Avg Prep Speed</p>
                <p className="font-bold text-indigo-950 dark:text-indigo-200 mt-0.5">
                  {localOrder.ai_prediction.avg_completion_speed}
                </p>
              </div>
            </div>
          )}

          {/* ── Custom Prep Time Picker / Time Adjustment Panel ── */}
          {showTimeModal && (
            <div className="mb-3 p-3.5 bg-zinc-900 border border-zinc-800 text-white rounded-2xl animate-fade-in space-y-2.5 shadow-xl">
              <div className="flex justify-between items-center border-b border-zinc-800 pb-2">
                <p className="text-xs font-bold text-lime-400">⏱️ {isPending ? "Set Order Prep Time" : "Adjust / Extend Order Time"}</p>
                <button onClick={() => setShowTimeModal(false)} className="text-xs text-zinc-400 hover:text-white">✕</button>
              </div>
              
              {/* Quick extend buttons */}
              {isPreparing && (
                <div>
                  <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">Extend Current Remaining Time</p>
                  <div className="flex gap-1.5 flex-wrap">
                    {[5, 10, 15, 20].map((addM) => (
                      <button
                        key={`ext-${addM}`}
                        onClick={() => handleExtendPrepTime(addM)}
                        className="px-2.5 py-1 text-xs font-bold bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-zinc-950 rounded-lg transition-colors border border-amber-500/30"
                      >
                        +{addM}m
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Set Total Time from now */}
              <div>
                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1.5">{isPreparing ? "Or Set Total Time (From Now)" : "Quick Presets (From Now)"}</p>
                <div className="flex gap-1.5 flex-wrap">
                  {[5, 10, 15, 20, 30, 45].map((m) => (
                    <button
                      key={`set-${m}`}
                      onClick={() => { setPrepInput(m); handleUpdatePrepTime(m); }}
                      className="px-2.5 py-1 text-xs font-bold bg-zinc-800 hover:bg-lime-500 hover:text-zinc-950 rounded-lg transition-colors border border-zinc-700"
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom input row */}
              <div className="flex gap-2 pt-1 border-t border-zinc-800/80">
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
                  className="flex-1 bg-lime-500 hover:bg-lime-400 text-zinc-950 text-xs font-bold py-1.5 px-3 rounded-xl transition-all"
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
                  className="flex-1 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95
                    disabled:opacity-50 flex items-center justify-center gap-1.5
                    bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-md shadow-lime-500/20"
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : `✓ Accept (${localOrder.predicted_prep_min || 10}m)`
                  }
                </button>

                <button
                  onClick={() => setShowTimeModal(!showTimeModal)}
                  className="px-3 py-3 rounded-2xl bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-bold text-xs transition-all flex items-center gap-1"
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
                  className="flex-1 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95
                    disabled:opacity-50 flex items-center justify-center gap-2
                    bg-lime-500 hover:bg-lime-400 text-zinc-950 shadow-md shadow-lime-500/20"
                >
                  {loading
                    ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                    : "🍽️ Ready for Pickup"
                  }
                </button>

                <button
                  onClick={() => setShowTimeModal(!showTimeModal)}
                  className="px-3 py-3 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/20 font-bold text-xs transition-all flex items-center gap-1"
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
                className="flex-1 py-3 rounded-2xl font-black text-xs sm:text-sm transition-all active:scale-95
                  disabled:opacity-50 flex items-center justify-center gap-2
                  bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-white"
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
                className="px-3.5 py-3 rounded-2xl bg-zinc-100 hover:bg-rose-500/10 dark:bg-zinc-800 dark:hover:bg-rose-500/20
                           text-zinc-400 hover:text-rose-500 font-bold text-sm transition-all border border-transparent hover:border-rose-500/20"
              >
                ✕
              </button>
            )}

            {/* Delete collected */}
            {isCollected && (
              <button
                onClick={handleDelete}
                className="flex-1 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20
                           text-rose-500 font-bold text-xs sm:text-sm transition-all border border-rose-500/20"
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