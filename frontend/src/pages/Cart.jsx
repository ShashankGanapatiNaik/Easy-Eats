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

/* ─── Recommendation Card ──────────────────────────────────────────────────── */
function RecommendationCard({ item, stallId, onAdd }) {
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    setAdding(true);
    // Track click event (fire-and-forget)
    try { await trackRecommendationClick(stallId, item.id); } catch {}
    onAdd(item);
    setTimeout(() => setAdding(false), 600);
  };

  const price = item.discounted_price || item.price;

  return (
    <div
      className="flex-shrink-0 w-40 rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "linear-gradient(135deg, rgba(255,255,255,0.97) 0%, rgba(250,250,255,0.97) 100%)",
        border: "1px solid rgba(132,204,22,0.15)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.07)",
      }}
    >
      {/* Image */}
      <div className="relative w-full h-24 bg-gradient-to-br from-lime-50 to-emerald-50 overflow-hidden">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">🍽️</div>
        )}
        {item.is_popular && (
          <span className="absolute top-1.5 left-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff", letterSpacing: "0.03em" }}>
            ⭐ POPULAR
          </span>
        )}
        {item.discounted_price && (
          <span className="absolute top-1.5 right-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white">
            SALE
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p className="text-xs font-bold text-zinc-900 leading-tight line-clamp-2">{item.name}</p>
        <div className="flex items-center gap-1">
          {item.is_veg ? (
            <span className="w-3 h-3 rounded-sm border border-green-600 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-green-600" />
            </span>
          ) : (
            <span className="w-3 h-3 rounded-sm border border-red-500 flex items-center justify-center">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
            </span>
          )}
          <span className="text-[10px] text-gray-400 font-medium">{item.prep_time_min}m</span>
        </div>
        <div className="flex items-center justify-between mt-auto">
          <div>
            <span className="text-sm font-black text-lime-600">₹{price}</span>
            {item.discounted_price && (
              <span className="text-[10px] text-gray-400 line-through ml-1">₹{item.price}</span>
            )}
          </div>
          <button
            onClick={handleAdd}
            disabled={adding}
            className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-sm transition-all active:scale-90"
            style={{
              background: adding
                ? "linear-gradient(135deg,#22c55e,#16a34a)"
                : "linear-gradient(135deg,#84cc16,#65a30d)",
              boxShadow: "0 2px 8px rgba(132,204,22,0.35)",
            }}
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
  const [stallLoading, setStallLoading] = useState(false);

  useEffect(() => {
    if (!stallId) return;
    const fetchStallStatus = async () => {
      setStallLoading(true);
      try {
        const res = await getStall(stallId);
        setStall(res.data);
      } catch (err) {
        console.error("Failed to fetch stall status in cart:", err);
      } finally {
        setStallLoading(false);
      }
    };
    fetchStallStatus();
  }, [stallId]);

  /* ── Fetch recommendations whenever cart changes ─────────────────────── */
  const fetchRecs = useCallback(async () => {
    if (!stallId || cart.length === 0 || (stall && !stall.is_open)) { setRecommendations([]); return; }
    setRecsLoading(true);
    try {
      const cartIds = cart.map((i) => i.id);
      const { data } = await getRecommendations(stallId, cartIds);
      setRecommendations(data || []);
    } catch {
      setRecommendations([]);
    } finally {
      setRecsLoading(false);
    }
  }, [cart, stallId]);

  useEffect(() => {
    fetchRecs();
  }, [fetchRecs]);

  /* ── Add recommended item to cart ───────────────────────────────────── */
  const handleAddRecommended = (item) => {
    addItem({
      id:           item.id,
      name:         item.name,
      price:        item.price,
      discounted_price: item.discounted_price,
      image_url:    item.image_url,
      stall_id:     stallId,
      qty:          1,
      is_recommended: true,
      selectedCustomizations: [],
    });
  };


  // ── Pay with Razorpay → then place order ──────────────────────────────────
  const handlePayAndOrder = async () => {
    if (cart.length === 0) return;
    setError(null);
    setPaying(true);

    try {
      // 1️⃣ Load Razorpay SDK
      const loaded = await loadRazorpay();
      if (!loaded) {
        setError("Razorpay failed to load. Check your internet connection.");
        setPaying(false);
        return;
      }

      // 2️⃣ Create Razorpay order on backend → get order_id
      const { data: rzp } = await api.post("/payments/create-order", {
        amount: Math.round(cartTotal),   // backend expects ₹ (converts to paise)
      });

      // 3️⃣ Open Razorpay checkout
      const userData = JSON.parse(localStorage.getItem("user_data") || "{}");

      await new Promise((resolve, reject) => {
        const options = {
          key:         rzp.key,             // Razorpay Key ID from backend
          amount:      rzp.amount,          // in paise
          currency:    "INR",
          name:        "Easy Eats",
          description: "Campus Food Order",
          order_id:    rzp.razorpay_order_id,
          prefill: {
            name:  userData.name  || "",
            email: userData.email || "",
          },
          theme: { color: "#84cc16" },
          modal: {
            ondismiss: () => reject(new Error("Payment cancelled")),
          },
          handler: async (response) => {
            try {
              // 4️⃣ Verify payment on backend
              await api.post("/payments/verify", {
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              });
              resolve(response);
            } catch (err) {
              reject(new Error("Payment verification failed"));
            }
          },
        };

        const rzpInstance = new window.Razorpay(options);
        rzpInstance.open();
      });

      // 5️⃣ Payment verified → place the order (include is_recommended flags)
      const orderBody = {
        stall_id: stallId,
        items: cart.map((item) => ({
          menu_item_id:   item.id,
          qty:            item.qty,
          customizations: item.selectedCustomizations || [],
          is_recommended: item.is_recommended || false,
        })),
        special_instructions: instructions || null,
        payment_method: "razorpay",
        payment_status: "paid",
      };

      const { data } = await placeOrder(orderBody);
      clearCart();

      navigate(`/track/${data.order_id}`, {
        state: {
          predicted_prep_min:   data.predicted_prep_min,
          estimated_ready_time: data.estimated_ready_time,
          pickup_slot:          data.pickup_slot,
          total:                data.total,
          stall_name:           cart[0]?.stall_name || "",
        },
      });

    } catch (e) {
      if (e.message === "Payment cancelled") {
        setError("Payment was cancelled. Your cart is safe — try again.");
      } else {
        setError(e.response?.data?.detail || e.message || "Something went wrong.");
      }
    } finally {
      setPaying(false);
    }
  };

  // ── Empty cart ────────────────────────────────────────────────────────────
  if (cart.length === 0) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4">
        <div className="text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Cart is empty</h2>
          <p className="text-gray-400 mb-8">Add items from a stall to get started.</p>
          <button
            onClick={() => navigate("/home")}
            className="bg-lime-500 text-zinc-900 px-8 py-3 rounded-full font-bold hover:bg-lime-600 shadow-md transition-all"
          >
            Browse Stalls
          </button>
        </div>
      </div>
    );
  }

  // ── Cart ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto min-h-screen bg-zinc-50 pb-36">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-4 sticky top-0 z-20">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center hover:bg-gray-200 active:scale-95 transition-all"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-zinc-900">Your Cart</h1>
        <span className="ml-auto text-sm text-gray-400">
          {cart.reduce((s, i) => s + i.qty, 0)} items
        </span>
      </div>

      <div className="px-4 mt-5 space-y-4">

        {/* Items */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          {cart.map((item, index) => (
            <div
              key={item.id}
              className={`flex items-center gap-3 p-4 ${index < cart.length - 1 ? "border-b border-gray-50" : ""}`}
            >
              {item.image_url && (
                <img src={item.image_url} alt={item.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-zinc-900 text-sm truncate">{item.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-sm font-bold text-lime-600">
                    ₹{(item.discounted_price || item.price) * item.qty}
                  </p>
                  {item.is_recommended && (
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(132,204,22,0.12)", color: "#65a30d", border: "1px solid rgba(132,204,22,0.25)" }}>
                      ✨ Recommended
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 bg-zinc-900 text-white px-3 py-2 rounded-full flex-shrink-0">
                <button onClick={() => decreaseQty(item.id)} className="w-5 h-5 flex items-center justify-center font-bold text-base active:scale-90">−</button>
                <span className="w-5 text-center font-bold text-sm">{item.qty}</span>
                <button 
                  disabled={stall && !stall.is_open}
                  onClick={() => increaseQty(item.id)} 
                  className={`w-5 h-5 flex items-center justify-center font-bold text-base active:scale-90 ${
                    stall && !stall.is_open ? "opacity-30 cursor-not-allowed text-gray-400 font-bold" : "text-lime-400"
                  }`}
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── You May Also Like ───────────────────────────────────────────── */}
        {(recsLoading || recommendations.length > 0) && (
          <div className="rounded-3xl overflow-hidden" style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)",
            border: "1px solid rgba(99,102,241,0.2)",
            boxShadow: "0 8px 32px rgba(99,102,241,0.1)",
          }}>
            {/* Header */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">✨</span>
                <div>
                  <h3 className="text-white font-black text-sm">You May Also Like</h3>
                  <p className="text-indigo-400/70 text-[10px] font-medium">AI-powered suggestions just for you</p>
                </div>
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                style={{ background: "rgba(99,102,241,0.2)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.3)" }}>
                🧠 Smart Pick
              </span>
            </div>

            {/* Horizontal scroll */}
            <div className="px-4 pb-4">
              {recsLoading ? (
                <div className="flex gap-3 pb-1">
                  {[1,2,3].map((k) => (
                    <div key={k} className="flex-shrink-0 w-40 h-44 rounded-2xl animate-pulse"
                      style={{ background: "rgba(255,255,255,0.06)" }} />
                  ))}
                </div>
              ) : (
                <div className="flex gap-3 overflow-x-auto pb-1 scrollbar-hide">
                  {recommendations.map((item) => (
                    <RecommendationCard
                      key={item.id}
                      item={item}
                      stallId={stallId}
                      onAdd={handleAddRecommended}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stall Closed Warning */}
        {stall && !stall.is_open && (
          <div className="bg-red-50 border border-red-200 rounded-3xl p-5 text-sm text-red-700 font-semibold flex items-start gap-3 shadow-sm">
            <span className="text-xl">⚠️</span>
            <div>
              <p className="font-bold text-base mb-1">Restaurant is Closed</p>
              <p className="font-normal text-red-500 text-xs">
                "{stall.name}" is currently closed and not accepting new orders. Please remove these items or try again later.
              </p>
            </div>
          </div>
        )}

        {/* Special instructions */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-4">
          <label className="block text-sm font-bold text-zinc-900 mb-2">
            Special Instructions <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. No onions, extra sauce…"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-lime-500 resize-none transition-all"
          />
        </div>

        {/* Bill summary */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-bold text-zinc-900 mb-3">Bill Summary</h3>
          <div className="space-y-1.5">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between text-sm text-gray-600">
                <span>{item.name} × {item.qty}</span>
                <span>₹{(item.discounted_price || item.price) * item.qty}</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-3 mt-2 flex justify-between font-bold text-zinc-900">
              <span>Total</span>
              <span>₹{cartTotal.toFixed(0)}</span>
            </div>
          </div>
        </div>

        {/* Razorpay badge */}
        <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" fill="#528FF0"/>
          </svg>
          Secured by Razorpay · UPI · Cards · Netbanking
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-600 font-medium">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Sticky pay button */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-xl border-t border-gray-100 p-4">
        <div className="max-w-md mx-auto">
          <button
            onClick={handlePayAndOrder}
            disabled={paying || (stall && !stall.is_open)}
            className={`w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-3 ${
              stall && !stall.is_open
                ? "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                : "bg-lime-500 hover:bg-lime-600 active:scale-[0.98] disabled:opacity-60 text-zinc-900 shadow-xl shadow-lime-500/20"
            }`}
          >
            {paying ? (
              <>
                <div className="w-5 h-5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                Processing…
              </>
            ) : stall && !stall.is_open ? (
              <>
                🔒 Restaurant Closed
              </>
            ) : (
              <>
                💳 Pay ₹{cartTotal.toFixed(0)} &amp; Place Order
              </>
            )}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            {stall && !stall.is_open ? "This restaurant is not accepting orders" : "You'll be redirected to Razorpay to complete payment"}
          </p>
        </div>
      </div>
    </div>
  );
}

export default Cart;