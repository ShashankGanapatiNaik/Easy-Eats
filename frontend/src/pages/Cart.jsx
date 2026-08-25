import { useNavigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { useCart } from "../context/CartContext";
import { placeOrder } from "../api";
import api, { getRecommendations, trackRecommendationClick, getStall } from "../api";

// Load Razorpay script dynamically
function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/* ── Veg / Non-veg indicator ─────────────────────────────────────────────── */
function VegDot({ isVeg }) {
  return (
    <span className={`inline-flex w-3.5 h-3.5 rounded-sm border-2 items-center justify-center flex-shrink-0 ${isVeg ? "border-emerald-500" : "border-rose-500"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-emerald-500" : "bg-rose-500"}`} />
    </span>
  );
}

/* ── Recommendation Card ─────────────────────────────────────────────────── */
function RecommendationCard({ item, stallId, onAdd }) {
  const [adding, setAdding] = useState(false);
  const handleAdd = async () => {
    setAdding(true);
    try { await trackRecommendationClick(stallId, item.id); } catch {}
    onAdd(item);
    setTimeout(() => setAdding(false), 600);
  };
  const price = item.discounted_price || item.price;
  return (
    <div className="flex-shrink-0 w-36 bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-100 dark:border-zinc-800 shadow-sm">
      <div className="relative w-full h-20 bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        {item.image_url
          ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
        }
        {item.is_popular && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-amber-400 text-zinc-900">
            ★ HIT
          </span>
        )}
      </div>
      <div className="p-2.5 space-y-1.5">
        <p className="text-xs font-bold text-zinc-900 dark:text-white leading-tight line-clamp-2">{item.name}</p>
        <div className="flex items-center justify-between">
          <span className="text-sm font-black text-lime-600">₹{price}</span>
          <button
            onClick={handleAdd}
            disabled={adding}
            className={`w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all active:scale-90 ${adding ? "bg-emerald-500" : "bg-lime-500 hover:bg-lime-400"}`}
          >
            {adding ? "✓" : "+"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Cart() {
  const navigate = useNavigate();
  const { cart, increaseQty, decreaseQty, clearCart, cartTotal, stallId, addItem } = useCart();
  const [instructions, setInstructions] = useState("");
  const [paying,  setPaying]  = useState(false);
  const [error,   setError]   = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [stall, setStall] = useState(null);

  useEffect(() => {
    if (!stallId) return;
    getStall(stallId).then(r => setStall(r.data)).catch(() => {});
  }, [stallId]);

  const fetchRecs = useCallback(async () => {
    if (!stallId || cart.length === 0 || (stall && !stall.is_open)) { setRecommendations([]); return; }
    setRecsLoading(true);
    try {
      const { data } = await getRecommendations(stallId, cart.map(i => i.id));
      setRecommendations(data || []);
    } catch { setRecommendations([]); }
    finally { setRecsLoading(false); }
  }, [cart, stallId, stall]);

  useEffect(() => { fetchRecs(); }, [fetchRecs]);

  const handleAddRecommended = (item) => {
    addItem({ id: item.id, name: item.name, price: item.price,
      discounted_price: item.discounted_price, image_url: item.image_url,
      stall_id: stallId, qty: 1, is_recommended: true, selectedCustomizations: [] });
  };

  const handlePayAndOrder = async () => {
    if (cart.length === 0) return;
    setError(null);
    setPaying(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) { setError("Razorpay failed to load. Check your internet connection."); setPaying(false); return; }

      const { data: rzp } = await api.post("/payments/create-order", { amount: Math.round(cartTotal) });
      const userData = JSON.parse(localStorage.getItem("user_data") || "{}");

      await new Promise((resolve, reject) => {
        const options = {
          key: rzp.key, amount: rzp.amount, currency: "INR",
          name: "Easy Eats", description: "Campus Food Order",
          order_id: rzp.razorpay_order_id,
          prefill: { name: userData.name || "", email: userData.email || "" },
          theme: { color: "#84cc16" },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
          handler: async (response) => {
            try {
              await api.post("/payments/verify", {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              resolve(response);
            } catch { reject(new Error("Payment verification failed")); }
          },
        };
        new window.Razorpay(options).open();
      });

      const { data } = await placeOrder({
        stall_id: stallId,
        items: cart.map(item => ({ menu_item_id: item.id, qty: item.qty,
          customizations: item.selectedCustomizations || [], is_recommended: item.is_recommended || false })),
        special_instructions: instructions || null,
        payment_method: "razorpay", payment_status: "paid",
      });
      clearCart();
      navigate(`/track/${data.order_id}`, {
        state: { predicted_prep_min: data.predicted_prep_min, estimated_ready_time: data.estimated_ready_time,
          pickup_slot: data.pickup_slot, total: data.total, stall_name: cart[0]?.stall_name || "" },
      });
    } catch (e) {
      setError(e.message === "Payment cancelled"
        ? "Payment was cancelled. Your cart is safe — try again."
        : e.response?.data?.detail || e.message || "Something went wrong.");
    } finally { setPaying(false); }
  };

  const itemCount = cart.reduce((s, i) => s + i.qty, 0);
  const stallName = cart[0]?.stall_name || "Your Order";

  // ── Empty state ────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center px-6">
        <div className="text-center">
          <div className="w-24 h-24 bg-zinc-100 dark:bg-zinc-900 rounded-full flex items-center justify-center text-5xl mx-auto mb-6 shadow-sm">
            🛒
          </div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white mb-2">Your cart is empty</h2>
          <p className="text-zinc-400 dark:text-zinc-500 text-sm mb-8 font-medium">Add delicious items from a stall to get started.</p>
          <button onClick={() => navigate("/home")}
            className="bg-lime-500 hover:bg-lime-400 text-zinc-950 px-8 py-3.5 rounded-2xl font-black text-sm shadow-lg shadow-lime-500/25 transition-all active:scale-95">
            Browse Stalls →
          </button>
        </div>
      </div>
    );
  }

  // ── Cart ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-40">

      {/* ── Hero Header ─────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 dark:bg-zinc-900 px-5 pt-12 pb-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-lime-500/10 via-transparent to-emerald-500/5" />
        <button onClick={() => navigate(-1)}
          className="absolute top-5 left-4 w-9 h-9 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/20 transition-all z-10">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="relative z-10">
          <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-1">🛒 Your Order</p>
          <h1 className="text-2xl font-black text-white truncate">{stallName}</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="bg-lime-500 text-zinc-950 text-xs font-black px-2.5 py-1 rounded-full">
              {itemCount} item{itemCount !== 1 ? "s" : ""}
            </span>
            <span className="text-zinc-400 text-xs font-medium">·</span>
            <span className="text-zinc-300 text-xs font-bold">₹{cartTotal.toFixed(0)} total</span>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">

        {/* ── Stall Closed Warning ──────────────────────────────────────────── */}
        {stall && !stall.is_open && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 flex items-start gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-black text-rose-700 dark:text-rose-400 text-sm">Restaurant Closed</p>
              <p className="text-rose-500 text-xs mt-0.5 font-medium">"{stall.name}" is not accepting orders right now.</p>
            </div>
          </div>
        )}

        {/* ── Cart Items ────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800 flex items-center justify-between">
            <h2 className="font-black text-zinc-900 dark:text-white text-sm">Cart Items</h2>
            <button onClick={clearCart}
              className="text-[11px] text-rose-500 font-bold hover:text-rose-600 transition-colors">
              Clear all
            </button>
          </div>

          <div className="divide-y divide-zinc-50 dark:divide-zinc-800">
            {cart.map((item) => (
              <div key={item.id} className="flex items-center gap-3.5 px-4 py-3.5">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-100 dark:bg-zinc-800 flex-shrink-0 relative">
                  {item.image_url
                    ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
                  }
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {item.is_veg !== undefined && <VegDot isVeg={item.is_veg} />}
                    <p className="font-bold text-zinc-900 dark:text-white text-sm truncate">{item.name}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-lime-600">
                      ₹{(item.discounted_price || item.price) * item.qty}
                    </p>
                    {item.qty > 1 && (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                        ₹{item.discounted_price || item.price} each
                      </span>
                    )}
                    {item.is_recommended && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-lime-500/10 text-lime-600 dark:text-lime-400 border border-lime-500/20">
                        ✨ Picked for you
                      </span>
                    )}
                  </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center bg-zinc-900 dark:bg-zinc-800 rounded-2xl px-1 py-1 gap-0.5 flex-shrink-0">
                  <button onClick={() => decreaseQty(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-xl text-rose-400 hover:bg-white/10 font-black text-lg leading-none transition-all active:scale-90">
                    −
                  </button>
                  <span className="w-6 text-center font-black text-sm text-white">{item.qty}</span>
                  <button
                    disabled={stall && !stall.is_open}
                    onClick={() => increaseQty(item.id)}
                    className={`w-7 h-7 flex items-center justify-center rounded-xl font-black text-lg leading-none transition-all active:scale-90 ${
                      stall && !stall.is_open ? "text-zinc-600 cursor-not-allowed" : "text-lime-400 hover:bg-white/10"
                    }`}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── You May Also Like ─────────────────────────────────────────────── */}
        {(recsLoading || recommendations.length > 0) && (
          <div className="bg-zinc-900 rounded-3xl overflow-hidden border border-zinc-800">
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-white font-black text-sm">✨ You May Also Like</h3>
                <p className="text-zinc-500 text-[10px] font-medium mt-0.5">AI-powered suggestions just for you</p>
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-lime-500/10 text-lime-400 border border-lime-500/20">
                🧠 Smart Pick
              </span>
            </div>
            <div className="px-4 pb-4">
              {recsLoading ? (
                <div className="flex gap-3">
                  {[1, 2, 3].map(k => (
                    <div key={k} className="flex-shrink-0 w-36 h-36 rounded-2xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {recommendations.map(item => (
                    <RecommendationCard key={item.id} item={item} stallId={stallId} onAdd={handleAddRecommended} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}



        {/* ── Special Instructions ──────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 p-4 shadow-sm">
          <label className="block text-sm font-black text-zinc-900 dark:text-white mb-2">
            📝 Special Instructions
            <span className="font-normal text-zinc-400 dark:text-zinc-500 ml-1">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. No onions, extra sauce, less spicy…"
            rows={2}
            className="w-full border border-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white rounded-xl px-3 py-2.5 text-sm outline-none focus:border-lime-500 dark:focus:border-lime-400 resize-none transition-all placeholder:text-zinc-300 dark:placeholder:text-zinc-600"
          />
        </div>

        {/* ── Bill Summary ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800">
            <h2 className="font-black text-zinc-900 dark:text-white text-sm">🧾 Bill Summary</h2>
          </div>
          <div className="px-5 py-4 space-y-2.5">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-sm">
                <span className="text-zinc-500 dark:text-zinc-400 font-medium truncate max-w-[70%]">
                  {item.name} <span className="text-zinc-400">×{item.qty}</span>
                </span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">
                  ₹{(item.discounted_price || item.price) * item.qty}
                </span>
              </div>
            ))}
            <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-between items-center">
              <span className="font-black text-zinc-900 dark:text-white">Total</span>
              <span className="font-black text-xl text-zinc-900 dark:text-white">₹{cartTotal.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* ── Security badge ────────────────────────────────────────────────── */}
        <div className="flex items-center justify-center gap-2 text-xs text-zinc-400 dark:text-zinc-600 py-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#528FF0"/>
          </svg>
          Secured by Razorpay · UPI · Cards · Netbanking
        </div>

        {/* ── Error ─────────────────────────────────────────────────────────── */}
        {error && (
          <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl p-4 text-sm text-rose-600 dark:text-rose-400 font-medium">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* ── Sticky Pay Button ─────────────────────────────────────────────────── */}
      <div className="fixed bottom-20 left-0 right-0 z-30 pointer-events-none px-4">
        <div className="max-w-md mx-auto pointer-events-auto">
          <div className="bg-zinc-900/90 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-3xl p-3 shadow-2xl transition-all duration-200">
            <button
              onClick={handlePayAndOrder}
              disabled={paying || (stall && !stall.is_open)}
              className={`w-full py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                stall && !stall.is_open
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700"
                  : "bg-lime-500 hover:bg-lime-400 active:scale-[0.98] disabled:opacity-60 text-zinc-950 shadow-lg shadow-lime-500/25"
              }`}
            >
              {paying ? (
                <>
                  <div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" />
                  Processing…
                </>
              ) : stall && !stall.is_open ? (
                <>🔒 Restaurant Closed</>
              ) : (
                <>💳 Pay ₹{cartTotal.toFixed(0)} &amp; Order</>
              )}
            </button>
            <p className="text-center text-[10px] text-zinc-400 mt-1 font-semibold">
              {stall && !stall.is_open
                ? "Restaurant not accepting orders"
                : `${itemCount} item${itemCount !== 1 ? "s" : ""} · Secured via Razorpay`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Cart;