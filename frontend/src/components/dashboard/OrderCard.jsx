// src/components/dashboard/OrderCard.jsx
// Rich order card with ETA countdown, prep time input modal, status actions

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

const STATUS_NEXT = {
  Placed:         "Accepted",
  Accepted:       "Preparing",
  Preparing:      "Almost Ready",
  "Almost Ready": "Ready",
  Ready:          "Collected",
};

const PREP_PRESETS = [5, 10, 15, 20, 30];
const ACTIVE = ["Placed", "Accepted", "Preparing", "Almost Ready", "Ready"];

// Generate a short human-readable pickup code from order id
function pickupCode(orderId) {
  return orderId.slice(-4).toUpperCase();
}

function fmt12(iso) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Live countdown hook — counts down seconds from a target ISO datetime
function useCountdown(targetIso) {
  const [secs, setSecs] = useState(0);

  useEffect(() => {
    if (!targetIso) return;
    const update = () => {
      const diff = Math.max(0, Math.floor((new Date(targetIso) - Date.now()) / 1000));
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

// ── Prep Time Modal ───────────────────────────────────────────────────────────
function PrepModal({ onConfirm, onCancel }) {
  const [selected, setSelected] = useState(10);
  const [custom,   setCustom]   = useState("");

  const finalTime = custom ? parseInt(custom) : selected;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs p-6 animate-slide-up">
        <h3 className="font-black text-zinc-900 text-lg mb-1">Set Prep Time</h3>
        <p className="text-gray-400 text-sm mb-5">
          How long will this order take?
        </p>

        {/* Preset buttons */}
        <div className="flex gap-2 flex-wrap mb-4">
          {PREP_PRESETS.map(min => (
            <button
              key={min}
              onClick={() => { setSelected(min); setCustom(""); }}
              className={`px-4 py-2 rounded-full text-sm font-bold border transition-all ${
                selected === min && !custom
                  ? "bg-zinc-900 text-white border-zinc-900"
                  : "border-gray-200 text-gray-600 hover:border-lime-500"
              }`}
            >
              {min} min
            </button>
          ))}
        </div>

        {/* Custom input */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-gray-500 mb-1.5 block">
            Custom (minutes)
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={custom}
            onChange={e => { setCustom(e.target.value); }}
            placeholder="e.g. 12"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm
                       outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500"
          />
        </div>

        {/* Preview */}
        <div className="bg-lime-50 border border-lime-200 rounded-xl px-4 py-2.5 mb-5 text-center">
          <p className="text-xs text-lime-600 font-semibold">Ready by</p>
          <p className="text-xl font-black text-lime-700">
            {new Date(Date.now() + finalTime * 60000)
              .toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-lime-500 mt-0.5">{finalTime} min from now</p>
        </div>

        <div className="flex gap-3">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500 font-bold text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={() => onConfirm(finalTime)}
            className="flex-1 py-3 rounded-xl bg-lime-500 text-zinc-900 font-bold text-sm hover:bg-lime-600 shadow-md">
            Confirm →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main OrderCard ────────────────────────────────────────────────────────────
export default function OrderCard({ order, isNew, onUpdated, onDeleted }) {
  const [loading,      setLoading]      = useState(false);
  const [showPrepModal,setShowPrepModal]= useState(false);
  const [pendingStatus,setPendingStatus]= useState(null);
  const [localOrder,   setLocalOrder]   = useState(order);

  // sync if parent refreshes
  useEffect(() => setLocalOrder(order), [order]);

  const countdown = useCountdown(localOrder.estimated_ready_iso);
  const elapsed   = Math.floor((Date.now() - new Date(localOrder.placed_at)) / 60000);
  const isLate    = elapsed > 14 && ACTIVE.includes(localOrder.status);
  const isReady   = localOrder.status === "Ready";
  const isCollected = localOrder.status === "Collected";
  const style     = STATUS_STYLE[localOrder.status] || STATUS_STYLE.Placed;
  const nextStatus = STATUS_NEXT[localOrder.status];
  const code       = pickupCode(localOrder.id);

  const handleAdvance = () => {
    if (!nextStatus) return;
    const needsPrep = localOrder.status === "Placed" || localOrder.status === "Accepted";
    if (needsPrep) {
      setPendingStatus(nextStatus);
      setShowPrepModal(true);
    } else {
      doAdvance(nextStatus, null);
    }
  };

  const doAdvance = async (status, prepMins) => {
    setLoading(true);
    setShowPrepModal(false);

    let readyIso = localOrder.estimated_ready_iso;
    if (prepMins) {
      readyIso = new Date(Date.now() + prepMins * 60000).toISOString();
    }

    const updated = { ...localOrder, status, estimated_ready_iso: readyIso };
    setLocalOrder(updated);

    try {
      await updateStatus(localOrder.id, status);
      onUpdated?.({ ...updated });
    } catch {
      setLocalOrder(localOrder); // revert
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
      {showPrepModal && (
        <PrepModal
          onConfirm={(mins) => doAdvance(pendingStatus, mins)}
          onCancel={() => setShowPrepModal(false)}
        />
      )}

      <div className={`bg-white rounded-2xl border overflow-hidden shadow-sm transition-all duration-300
        ${isNew     ? "border-lime-400 ring-2 ring-lime-400/30 shadow-lime-100 shadow-md" : ""}
        ${isLate    ? "border-red-300" : ""}
        ${isReady   ? "border-lime-300 ring-1 ring-lime-300/40" : ""}
        ${isCollected ? "opacity-70" : ""}
        ${!isNew && !isLate && !isReady && !isCollected ? "border-gray-100 hover:shadow-md hover:-translate-y-0.5" : ""}
      `}>

        {/* ── Ribbon ── */}
        {isNew && (
          <div className="bg-lime-500 text-zinc-900 text-xs font-black text-center py-1 animate-pulse tracking-widest">
            🔔 NEW ORDER
          </div>
        )}
        {isLate && !isNew && (
          <div className="bg-red-500 text-white text-xs font-bold text-center py-1">
            ⚠️ DELAYED — {elapsed} min ago
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
                  {localOrder.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                Placed {elapsed === 0 ? "just now" : `${elapsed}m ago`}
                {localOrder.customer_name ? ` · ${localOrder.customer_name}` : ""}
              </p>
            </div>

            {/* ETA countdown */}
            {ACTIVE.includes(localOrder.status) && !isReady && (
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

          {/* ── Action buttons ── */}
          <div className="flex gap-2">
            {nextStatus && !isCollected && (
              <button
                onClick={handleAdvance}
                disabled={loading}
                className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all active:scale-95
                  disabled:opacity-50 flex items-center justify-center gap-2
                  ${isReady
                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                    : "bg-lime-500 hover:bg-lime-600 text-zinc-900 shadow-md shadow-lime-500/20"
                  }`}
              >
                {loading
                  ? <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                  : isReady ? "✓ Mark Collected" : `→ ${nextStatus}`
                }
              </button>
            )}

            {/* Cancel (active non-ready orders) */}
            {ACTIVE.includes(localOrder.status) && !isReady && (
              <button
                onClick={() => doAdvance("Cancelled", null)}
                disabled={loading}
                className="px-4 py-3 rounded-xl bg-gray-100 hover:bg-red-100
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