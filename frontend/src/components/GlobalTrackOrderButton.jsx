/**
 * GlobalTrackOrderButton
 *
 * Floating circular "Track Order" button — appears globally whenever the user
 * has an active order (not Collected / Cancelled).
 *
 * Positioning: bottom-40 right-4 — sits directly above the AI chatbot button.
 * Hidden automatically on /track/* routes.
 *
 * Real-time: polls myOrders every 5 s + uses Socket.IO (useOrderSocket) for
 * instant status updates once an order is detected.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { myOrders, trackOrder } from "../api";
import { useOrderSocket } from "../hooks/useOrderSocket";

/* ─── Status config ─────────────────────────────────────────────────────── */
const STATUS_META = {
  Placed:        { icon: "🧾", color: "#6366f1", label: "Order Placed" },
  Accepted:      { icon: "✅", color: "#22c55e", label: "Accepted" },
  Preparing:     { icon: "👨‍🍳", color: "#f59e0b", label: "Preparing" },
  "Almost Ready":{ icon: "🔔", color: "#f97316", label: "Almost Ready" },
  Ready:         { icon: "🎉", color: "#22c55e", label: "Ready!" },
};

const ACTIVE_STATUSES = new Set(["Placed", "Accepted", "Preparing", "Almost Ready", "Ready"]);

export default function GlobalTrackOrderButton() {
  const navigate  = useNavigate();
  const location  = useLocation();

  const [order,   setOrder]   = useState(null);   // active order summary
  const [detail,  setDetail]  = useState(null);   // /track data with remaining_min
  const [visible, setVisible] = useState(false);  // animate-in trigger
  const [pulse,   setPulse]   = useState(false);  // pulse ring (Ready)
  const [modalData, setModalData] = useState(null); // popup status modal data
  const prevStatus = useRef(null);

  /* ── Hide on tracker page & kitchen/admin ─────────────────────────────── */
  const isTrackerPage = location.pathname.startsWith("/track");
  const isKitchenPage = location.pathname.startsWith("/kitchen") || location.pathname.startsWith("/admin");
  const isLoginPage   = location.pathname === "/";
  const shouldHide    = isTrackerPage || isKitchenPage || isLoginPage;

  /* ── Poll myOrders every 5s ───────────────────────────────────────────── */
  const fetchActive = useCallback(async () => {
    if (shouldHide) return;
    try {
      const res = await myOrders();
      const active = res.data.find((o) => ACTIVE_STATUSES.has(o.status));
      if (active) {
        setOrder(active);
        // if status changed to Ready, trigger pulse
        if (prevStatus.current && prevStatus.current !== "Ready" && active.status === "Ready") {
          setPulse(true);
        }
        prevStatus.current = active.status;
      } else {
        setOrder(null);
        setDetail(null);
        prevStatus.current = null;
      }
    } catch { /* silent */ }
  }, [shouldHide]);

  useEffect(() => {
    fetchActive();
    const iv = setInterval(fetchActive, 5000);
    return () => clearInterval(iv);
  }, [fetchActive]);

  /* ── Fetch detailed tracking info (ETA) when order found ─────────────── */
  useEffect(() => {
    if (!order?.id) { setDetail(null); return; }
    trackOrder(order.id)
      .then((r) => setDetail(r.data))
      .catch(() => {});
  }, [order?.id]);

  /* ── Animate in/out ───────────────────────────────────────────────────── */
  useEffect(() => {
    setVisible(!!order && !shouldHide);
  }, [order, shouldHide]);

  /* ── Socket.IO — live updates for the active order ────────────────────── */
  useOrderSocket(
    order?.id || null,
    (data) => {
      // Update detail with socket payload
      setDetail((prev) => ({ ...(prev || {}), ...data }));

      // Show popup dialogue if status changed
      if (prevStatus.current && prevStatus.current !== data.status) {
        setModalData({
          orderId: data.order_id || order?.id,
          status: data.status,
          stallName: data.stall_name || order?.stall_name || "Restaurant",
          pickupCode: (data.order_id || order?.id || "").slice(-4).toUpperCase(),
          remainingMin: data.remaining_min
        });
      }

      // Check if order became non-active
      if (!ACTIVE_STATUSES.has(data.status)) {
        setOrder(null);
        setDetail(null);
      } else {
        setOrder((prev) => prev ? { ...prev, status: data.status } : prev);
        if (prevStatus.current !== "Ready" && data.status === "Ready") {
          setPulse(true);
        }
        prevStatus.current = data.status;
      }
    },
    async () => {
      // fallback polling fetch
      if (!order?.id) return null;
      const r = await trackOrder(order.id);
      return r.data;
    }
  );

  /* ── Auto-clear pulse after 6s ────────────────────────────────────────── */
  useEffect(() => {
    if (!pulse) return;
    const t = setTimeout(() => setPulse(false), 6000);
    return () => clearTimeout(t);
  }, [pulse]);

  const renderStatusModal = () => {
    if (!modalData) return null;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm modal-overlay-anim">
        <div className="bg-white dark:bg-zinc-900 w-full max-w-md mx-4 rounded-3xl shadow-2xl p-6 border border-gray-100 dark:border-zinc-800 modal-card-anim text-zinc-900 dark:text-white">
          <div className="text-center">
            <span className="text-5xl block mb-4">
              {modalData.status === "Ready" ? "🎉" 
                : modalData.status === "Almost Ready" ? "🔔"
                : modalData.status === "Preparing" ? "👨‍🍳"
                : modalData.status === "Accepted" ? "✅"
                : "🧾"}
            </span>
            <h3 className="text-xl font-extrabold tracking-tight">
              {modalData.status === "Ready" ? "Your Food is Ready!" 
                : modalData.status === "Almost Ready" ? "Almost Ready!"
                : `Order Status: ${modalData.status}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-zinc-400 mt-2">
              Stall: <span className="font-bold text-zinc-900 dark:text-white">{modalData.stallName}</span>
            </p>

            {modalData.status === "Ready" ? (
              <div className="my-6 bg-lime-50 dark:bg-lime-950/30 border-2 border-dashed border-lime-500 rounded-2xl p-4">
                <p className="text-[10px] text-lime-600 dark:text-lime-400 font-bold uppercase tracking-wider">Pickup Pass Code</p>
                <p className="text-4xl font-black text-lime-600 dark:text-lime-400 mt-1 tracking-widest">{modalData.pickupCode}</p>
                <p className="text-[11px] text-gray-500 dark:text-zinc-400 mt-2">Show this code at the counter to collect your food.</p>
              </div>
            ) : (
              <div className="my-6 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-4">
                <p className="text-xs text-gray-500 dark:text-zinc-400 font-semibold">Estimated Preparation Time</p>
                <p className="text-3xl font-black mt-1 text-zinc-800 dark:text-white">
                  {modalData.remainingMin != null ? `${modalData.remainingMin} mins` : "Calculating..."}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setModalData(null)}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 rounded-2xl font-bold text-sm transition-all text-zinc-800 dark:text-zinc-200"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  const orderId = modalData.orderId;
                  setModalData(null);
                  navigate(`/track/${orderId}`);
                }}
                className="flex-1 py-3 bg-lime-500 hover:bg-lime-600 text-zinc-950 rounded-2xl font-bold text-sm shadow-md shadow-lime-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                Track Live 📍
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!visible || !order) return renderStatusModal();

  const meta      = STATUS_META[order.status] || STATUS_META["Placed"];
  const isReady   = order.status === "Ready";
  const etaMin    = detail?.remaining_min ?? order?.predicted_prep_min ?? null;
  const showEta   = etaMin != null && etaMin > 0 && !isReady;
  const leaveRec  = detail?.ai_prediction?.leave_recommendation ?? null;
  const leaveLabel= detail?.ai_prediction?.leave_label ?? null;

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; backdrop-filter: blur(0px); }
          to   { opacity: 1; backdrop-filter: blur(8px); }
        }
        @keyframes modalScaleUp {
          from { transform: scale(0.9); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
        .modal-overlay-anim { animation: modalFadeIn 0.25s ease forwards; }
        .modal-card-anim { animation: modalScaleUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }

        @keyframes trackPulse {
          0%,100% { transform: scale(1); opacity: 0.6; }
          50%      { transform: scale(1.5); opacity: 0; }
        }
        @keyframes trackBounce {
          0%,100% { transform: scale(1) translateY(0); }
          50%      { transform: scale(1.04) translateY(-3px); }
        }
        @keyframes trackSlideIn {
          from { transform: translateY(20px) scale(0.8); opacity: 0; }
          to   { transform: translateY(0)    scale(1);   opacity: 1; }
        }
        @keyframes etaPulse {
          0%,100% { transform: scale(1); }
          50%      { transform: scale(1.08); }
        }
        .track-btn-enter { animation: trackSlideIn 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards; }
        .track-btn-idle  { animation: trackBounce 3s ease-in-out infinite; }
        .track-pulse-ring { animation: trackPulse 1.2s ease-in-out infinite; }
        .track-eta-badge  { animation: etaPulse 2s ease-in-out infinite; }
        .track-btn:hover  { transform: scale(1.12) !important; }
      `}</style>

      {/* Wrapper — stack: ETA badge on top, button below */}
      <div
        className="fixed right-4 z-[60] flex flex-col items-center gap-1.5"
        style={{ bottom: "10.5rem" }}  /* sits above AI button at bottom-24 */
      >
        {/* ── Leave Recommendation hint ───────────────────────────── */}
        {!isReady && leaveRec && (
          <div
            className="text-[9px] font-black px-2 py-0.5 rounded-full shadow select-none whitespace-nowrap text-center max-w-[80px] leading-tight"
            style={{
              background: leaveLabel === "now" ? "rgba(239,68,68,0.85)"
                : leaveLabel === "soon" ? "rgba(245,158,11,0.85)"
                : leaveLabel === "ready" ? "rgba(34,197,94,0.85)"
                : "rgba(99,102,241,0.75)",
              backdropFilter: "blur(8px)",
              color: "#fff",
            }}
          >
            {leaveLabel === "now" ? "🏃 Leave Now"
              : leaveLabel === "soon" ? `⏱ ${leaveRec.split(" ").slice(0, 3).join(" ")}`
              : leaveLabel === "ready" ? "🍔 Collect!"
              : `🕐 ${leaveRec.replace("Leave at ", "")}`
            }
          </div>
        )}

        {/* ── ETA / Status badge ─────────────────────────────────────── */}
        {showEta ? (
          <div
            className="track-eta-badge text-white text-[10px] font-black px-2.5 py-1 rounded-full shadow-lg select-none"
            style={{
              background: meta.color,
              boxShadow: `0 4px 12px ${meta.color}66`,
              letterSpacing: "0.02em",
            }}
          >
            {etaMin} min
          </div>
        ) : (
          <div
            className="text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-lg select-none whitespace-nowrap"
            style={{
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: meta.color,
            }}
          >
            {isReady ? "Ready 🎉" : order.status}
          </div>
        )}

        {/* ── Main floating button ───────────────────────────────────── */}
        <div className="relative track-btn-enter">

          {/* Pulse ring — always on for Ready, subtle for others */}
          <div
            className="absolute inset-0 rounded-full track-pulse-ring pointer-events-none"
            style={{
              background: meta.color,
              opacity: isReady || pulse ? 0.5 : 0.2,
              animationDuration: isReady ? "1s" : "2.5s",
            }}
          />

          {/* Second outer ring for Ready state */}
          {(isReady || pulse) && (
            <div
              className="absolute -inset-2 rounded-full track-pulse-ring pointer-events-none"
              style={{ background: meta.color, animationDelay: "0.4s", opacity: 0.25 }}
            />
          )}

          {/* Button itself */}
          <button
            id="global-track-order-btn"
            onClick={() => navigate(`/track/${order.id}`)}
            className="track-btn-idle relative w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-transform duration-200 select-none focus:outline-none"
            aria-label="Track your active order"
            style={{
              background: `linear-gradient(135deg, ${meta.color}dd, ${meta.color}99)`,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)",
              boxShadow: `0 8px 32px ${meta.color}55, 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)`,
              border: `1.5px solid ${meta.color}88`,
            }}
          >
            {/* Icon */}
            <span className="text-2xl leading-none" role="img" aria-hidden="true">
              {meta.icon}
            </span>

            {/* Live dot — bottom-right of button */}
            <div
              className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2 border-white"
              style={{ background: isReady ? "#22c55e" : "#ef4444" }}
            />
          </button>
        </div>

        {/* ── "Track" label ─────────────────────────────────────────── */}
        <div
          className="text-[9px] font-bold select-none"
          style={{ color: "rgba(255,255,255,0.6)", letterSpacing: "0.05em" }}
        >
          TRACK
        </div>
      </div>
      {renderStatusModal()}
    </>
  );
}
