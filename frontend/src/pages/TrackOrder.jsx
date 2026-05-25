import { useParams, useLocation, useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { trackOrder } from "../api";

const STATUS_STEPS = [
  { key: "Placed",       icon: "🧾", label: "Order Placed",    desc: "Your order is confirmed" },
  { key: "Accepted",     icon: "✅", label: "Accepted",         desc: "Stall is preparing your order" },
  { key: "Preparing",    icon: "👨‍🍳", label: "Preparing",        desc: "Fresh food in the making" },
  { key: "Almost Ready", icon: "🔔", label: "Almost Ready",     desc: "Ready to be packed" },
  { key: "Ready",        icon: "🎉", label: "Ready for Pickup", desc: "Head to the stall now!" },
];

const STATUS_INDEX = Object.fromEntries(STATUS_STEPS.map((s, i) => [s.key, i]));

function ReadyToast({ show, pickup_slot, onClose }) {
  useEffect(() => {
    if (!show) return;
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [show]);

  if (!show) return null;

  return (
    <div className="fixed top-4 left-0 right-0 z-[100] flex justify-center px-4"
         style={{ animation: "slideDown 0.4s cubic-bezier(0.34,1.56,0.64,1)" }}>
      <style>{`@keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
      <div className="bg-lime-500 text-zinc-900 rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3 max-w-sm w-full">
        <span className="text-2xl flex-shrink-0">🎉</span>
        <div className="flex-1">
          <p className="font-black text-base leading-tight">Your food is READY!</p>
          <p className="text-sm font-medium mt-0.5 text-zinc-700">
            Head to the counter now{pickup_slot ? ` · Slot: ${pickup_slot}` : ""}.
          </p>
          <p className="text-xs text-zinc-600 mt-1">📱 SMS sent to your phone</p>
        </div>
        <button onClick={onClose} className="text-zinc-700 hover:text-zinc-900 font-bold text-lg flex-shrink-0">✕</button>
      </div>
    </div>
  );
}

function TrackOrder() {
  const { id }     = useParams();
  const location   = useLocation();
  const navigate   = useNavigate();
  const init       = location.state || {};

  const [orderData, setOrderData] = useState({
    status: "Placed",
    remaining_min: init.predicted_prep_min || 0,
    estimated_ready_time: init.estimated_ready_time || "--:--",
    pickup_slot: init.pickup_slot || "",
    total: init.total || 0,
    items: [],
  });
  const [loading,   setLoading]   = useState(true);
  const [showToast, setShowToast] = useState(false);
  const prevStatus  = useRef(null);
  const intervalRef = useRef(null);
  const audioRef    = useRef(null);

  const fetchTrack = async () => {
    try {
      const res   = await trackOrder(id);
      const data  = res.data;
      const oldSt = prevStatus.current;
      const newSt = data.status;

      // Show toast + sound when status changes TO Ready
      if (oldSt && oldSt !== "Ready" && newSt === "Ready") {
        setShowToast(true);
        audioRef.current?.play().catch(() => {});
      }
      prevStatus.current = newSt;
      setOrderData(data);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchTrack();
    intervalRef.current = setInterval(fetchTrack, 10000);
    return () => clearInterval(intervalRef.current);
  }, [id]);

  useEffect(() => {
    if (["Collected","Cancelled"].includes(orderData.status)) {
      clearInterval(intervalRef.current);
    }
  }, [orderData.status]);

  const currentStep = STATUS_INDEX[orderData.status] ?? 0;
  const isReady     = orderData.status === "Ready";
  const isCancelled = orderData.status === "Cancelled";

  return (
    <div className="max-w-md mx-auto min-h-screen bg-zinc-50 pb-10">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      <ReadyToast
        show={showToast}
        pickup_slot={orderData.pickup_slot}
        onClose={() => setShowToast(false)}
      />

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={() => navigate("/home")}
          className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"/>
          </svg>
        </button>
        <h1 className="text-xl font-bold text-zinc-900">Track Order</h1>
        <span className="ml-auto text-xs text-gray-400 font-mono">#{id.slice(-6).toUpperCase()}</span>
      </div>

      <div className="px-4 pt-6 space-y-5">

        {isCancelled ? (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-6 text-center">
            <p className="text-4xl mb-2">❌</p>
            <h2 className="text-xl font-bold text-red-600">Order Cancelled</h2>
            <button onClick={() => navigate("/home")} className="mt-4 bg-red-500 text-white px-6 py-2 rounded-full font-bold text-sm">
              Back to Home
            </button>
          </div>
        ) : (
          <div className={`rounded-3xl p-6 text-center shadow-md transition-all ${isReady ? "bg-lime-500" : "bg-zinc-900"}`}>
            <p className="text-5xl mb-3">{STATUS_STEPS[currentStep]?.icon}</p>
            <h2 className={`text-2xl font-bold ${isReady ? "text-zinc-900" : "text-white"}`}>
              {STATUS_STEPS[currentStep]?.label}
            </h2>
            <p className={`text-sm mt-1 ${isReady ? "text-zinc-700" : "text-zinc-300"}`}>
              {STATUS_STEPS[currentStep]?.desc}
            </p>
            {!isReady && (
              <div className="mt-5 flex items-center justify-center gap-2">
                <div className="text-5xl font-black font-mono text-lime-400">{orderData.remaining_min}</div>
                <div className="text-left text-zinc-400">
                  <p className="text-sm font-bold">min</p>
                  <p className="text-xs">remaining</p>
                </div>
              </div>
            )}
            {orderData.pickup_slot && (
              <div className={`mt-4 inline-block px-4 py-2 rounded-full text-sm font-bold ${isReady ? "bg-zinc-900 text-white" : "bg-white/10 text-white"}`}>
                🕐 Pickup: {orderData.pickup_slot}
              </div>
            )}
          </div>
        )}

        {/* Progress stepper */}
        {!isCancelled && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-bold text-zinc-900 mb-4 text-sm">Order Progress</h3>
            <div className="space-y-0">
              {STATUS_STEPS.map((step, i) => {
                const done    = i < currentStep;
                const current = i === currentStep;
                return (
                  <div key={step.key} className="flex items-start gap-3">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                        done    ? "bg-lime-500 text-zinc-900"
                        : current ? "bg-zinc-900 text-white ring-4 ring-zinc-900/20"
                        : "bg-gray-100 text-gray-400"
                      }`}>
                        {done ? "✓" : step.icon}
                      </div>
                      {i < STATUS_STEPS.length - 1 && (
                        <div className={`w-0.5 h-8 mt-1 transition-all ${done ? "bg-lime-500" : "bg-gray-100"}`}/>
                      )}
                    </div>
                    <div className="pt-1 pb-8">
                      <p className={`text-sm font-bold transition-colors ${done || current ? "text-zinc-900" : "text-gray-400"}`}>
                        {step.label}
                      </p>
                      {current && <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Order summary */}
        {orderData.items?.length > 0 && (
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100">
            <h3 className="font-bold text-zinc-900 mb-3 text-sm">Order Summary</h3>
            <div className="space-y-2">
              {orderData.items.map((item, i) => (
                <div key={i} className="flex justify-between text-sm text-gray-600">
                  <span>{item.qty}× {item.name}</span>
                  <span>₹{item.subtotal}</span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-zinc-900">
                <span>Total</span>
                <span>₹{orderData.total}</span>
              </div>
            </div>
          </div>
        )}

        {isReady && (
          <button onClick={() => navigate("/home")}
            className="w-full bg-zinc-900 text-white py-4 rounded-2xl font-bold text-base hover:bg-zinc-800 active:scale-[0.98] transition-all">
            Back to Home 🏠
          </button>
        )}

        {!isCancelled && !isReady && (
          <p className="text-center text-xs text-gray-400">Auto-refreshing every 10 seconds…</p>
        )}
      </div>
    </div>
  );
}

export default TrackOrder;