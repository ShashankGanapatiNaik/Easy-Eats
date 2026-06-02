// src/components/ai/AIAssistant.jsx
// ─────────────────────────────────────────────────────────────────────────────
// EatsBot — Production-Level AI Food Ordering Assistant
// Features: Hotel/Item Search, Voice Ordering, Smart Recommendations,
//           Order Tracking, Wallet Payment, Low Balance Flow, Rich Cards
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSpeechToText, useTextToSpeech } from "../../hooks/useVoice";
import api from "../../api";

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchBalance  = ()     => api.get("/wallet/balance");
const deductWallet  = (body) => api.post("/wallet/deduct", body);
const topUpWallet   = (body) => api.post("/wallet/topup", body);
const placeOrderAPI = (data) => api.post("/orders/place", data);

// ── Constants ─────────────────────────────────────────────────────────────────
const CUISINE_EMOJI = {
  burgers: "🍔", pizza: "🍕", coffee: "☕", snacks: "🍟",
  indian: "🍛", chinese: "🍜", beverages: "🥤",
  sandwiches: "🥪", pasta: "🍝", other: "🍽️",
};
const STATUS_META = {
  placed:       { label: "Order Placed",      emoji: "📋", cls: "bg-blue-100 text-blue-800" },
  accepted:     { label: "Accepted",           emoji: "✅", cls: "bg-purple-100 text-purple-800" },
  preparing:    { label: "Preparing",          emoji: "🔥", cls: "bg-orange-100 text-orange-800" },
  almost_ready: { label: "Almost Ready!",      emoji: "⚡", cls: "bg-yellow-100 text-yellow-800" },
  ready:        { label: "Ready for Pickup!",  emoji: "🎉", cls: "bg-green-100 text-green-800" },
  collected:    { label: "Collected",          emoji: "✅", cls: "bg-gray-100 text-gray-700" },
  cancelled:    { label: "Cancelled",          emoji: "❌", cls: "bg-red-100 text-red-800" },
};

function cuisineEmoji(type) { return CUISINE_EMOJI[type] || "🍽️"; }
function shortSpeech(t) {
  if (!t) return "";
  return t.replace(/[^\w\s₹.]/g, "").split(".")[0].slice(0, 120);
}

// ── Sub-components ────────────────────────────────────────────────────────────

/* Animated voice wave */
function VoiceWave({ active }) {
  return (
    <div className={`flex items-end gap-px h-4 ${active ? "opacity-100" : "opacity-25"}`}>
      {[2, 4, 6, 4, 2].map((h, i) => (
        <div
          key={i}
          className="w-0.5 bg-lime-400 rounded-full"
          style={{
            height: `${h * 2}px`,
            animation: active ? `eatsBotWave ${0.4 + i * 0.1}s ease-in-out infinite alternate` : "none",
          }}
        />
      ))}
      <style>{`
        @keyframes eatsBotWave {
          from { transform: scaleY(0.4); }
          to   { transform: scaleY(1.6); }
        }
        @keyframes eatsBotDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40%            { transform: scale(1.0); opacity: 1.0; }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

/* Typing indicator */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-4 py-3 bg-gray-100 rounded-2xl rounded-tl-sm w-fit">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 bg-gray-400 rounded-full"
          style={{ animation: `eatsBotDot 1.2s ease-in-out ${i * 0.2}s infinite` }}
        />
      ))}
    </div>
  );
}

/* Veg / Non-veg dot indicator */
function VegDot({ isVeg }) {
  return (
    <span className={`inline-flex items-center justify-center w-3.5 h-3.5 flex-shrink-0 rounded-sm border-2 ${isVeg ? "border-green-600" : "border-red-600"}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isVeg ? "bg-green-600" : "bg-red-600"}`} />
    </span>
  );
}

/* ── Stall List Card ──────────────────────────────────────────────────────── */
function StallListCard({ stalls, onBrowse }) {
  if (!stalls?.length) return <p className="mt-2 text-xs text-gray-400 italic">No stalls found.</p>;
  return (
    <div className="mt-2 space-y-2">
      {stalls.map(s => (
        <div key={s.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-50 to-orange-100 flex items-center justify-center text-xl flex-shrink-0">
            {cuisineEmoji(s.cuisine_type)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-sm text-gray-900 truncate">{s.name}</span>
              <span className={`ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${s.is_open ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                {s.is_open ? "● Open" : "● Closed"}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
              {s.avg_rating > 0 && <span>⭐ {s.avg_rating.toFixed(1)}</span>}
              <span>·</span>
              <span>⏱ {s.estimated_pickup_min} min</span>
              {s.location_label && <><span>·</span><span className="truncate">📍 {s.location_label}</span></>}
            </div>
          </div>
          <button
            onClick={() => onBrowse(s)}
            className="text-xs text-lime-700 font-semibold bg-lime-50 hover:bg-lime-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            Browse →
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Item List Card ───────────────────────────────────────────────────────── */
function ItemListCard({ items, onOrder }) {
  if (!items?.length) return <p className="mt-2 text-xs text-gray-400 italic">No items found.</p>;
  return (
    <div className="mt-2 space-y-2">
      {items.map(item => (
        <div
          key={item.id}
          className={`bg-white rounded-xl border shadow-sm p-3 flex items-center gap-3 ${!item.is_available ? "opacity-55 border-gray-100" : "border-gray-100"}`}
        >
          <div className="w-11 h-11 rounded-xl overflow-hidden bg-gray-100 flex-shrink-0">
            {item.image_url
              ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-xl">{cuisineEmoji(item.category?.toLowerCase())}</div>
            }
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <VegDot isVeg={item.is_veg} />
              <span className="font-semibold text-sm text-gray-900 truncate">{item.name}</span>
              {item.is_popular && (
                <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">★ Popular</span>
              )}
            </div>
            {item.stall_name && <p className="text-xs text-gray-400 mt-0.5 truncate">🏪 {item.stall_name}</p>}
            <div className="mt-1 flex items-center gap-2">
              <span className="font-bold text-sm text-gray-900">₹{item.price}</span>
              {item.original_price > item.price && (
                <span className="text-xs text-gray-400 line-through">₹{item.original_price}</span>
              )}
              <span className="text-xs text-gray-400">· ⏱ {item.prep_time_min}m</span>
            </div>
          </div>
          {item.is_available && onOrder ? (
            <button
              onClick={() => onOrder(item)}
              className="text-xs font-bold bg-lime-500 hover:bg-lime-600 text-white px-3 py-2 rounded-lg transition-colors flex-shrink-0"
            >
              + Order
            </button>
          ) : !item.is_available ? (
            <span className="text-xs text-gray-400 flex-shrink-0">Sold out</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ── Order Summary Card ───────────────────────────────────────────────────── */
function OrderSummaryCard({ orderData, walletBalance, onConfirm, onCancel, confirmed }) {
  if (!orderData || confirmed) return null;
  const sufficient = walletBalance >= orderData.total;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-lime-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-lime-50 to-green-50 px-4 py-2.5 border-b border-lime-100 flex items-center gap-2">
        <span>🧾</span>
        <span className="font-bold text-sm text-gray-800">Order Summary</span>
      </div>
      <div className="px-4 py-3">
        {/* Stall */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm">📍</span>
          <span className="text-sm font-semibold text-gray-700">{orderData.stall_name}</span>
        </div>
        {/* Items */}
        <div className="space-y-1.5 mb-3">
          {orderData.items?.map((item, i) => (
            <div key={i} className="flex justify-between items-center text-sm">
              <span className="text-gray-700">{item.qty}× {item.name}</span>
              <span className="font-medium text-gray-900">₹{(item.price * item.qty).toFixed(0)}</span>
            </div>
          ))}
        </div>
        {/* Total */}
        <div className="border-t border-gray-100 pt-2.5 flex justify-between font-bold text-sm mb-3">
          <span className="text-gray-800">Total</span>
          <span className="text-gray-900">₹{Number(orderData.total).toFixed(0)}</span>
        </div>
        {/* Wallet status */}
        <div className={`text-xs rounded-xl px-3 py-2 mb-3 flex items-center gap-2 ${sufficient ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          <span>{sufficient ? "✅" : "❌"}</span>
          <span>
            Wallet: ₹{Number(walletBalance).toFixed(0)}
            {sufficient ? " — sufficient balance" : ` — need ₹${(orderData.total - walletBalance).toFixed(0)} more`}
          </span>
        </div>
        {sufficient && (
          <div className="flex gap-2">
            <button
              onClick={onConfirm}
              className="flex-1 bg-lime-500 hover:bg-lime-600 text-white py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm"
            >
              ✓ Confirm & Pay
            </button>
            <button
              onClick={onCancel}
              className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Low Balance Card ─────────────────────────────────────────────────────── */
function LowBalanceCard({ required, available, shortfall, onAddMoney, confirmed }) {
  if (confirmed) return null;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-red-200 shadow-sm overflow-hidden">
      <div className="bg-red-50 px-4 py-2.5 border-b border-red-100 flex items-center gap-2">
        <span>❌</span>
        <span className="font-bold text-sm text-red-800">Insufficient Balance</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Required</span>
          <span className="font-semibold text-gray-900">₹{Number(required).toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Available</span>
          <span className="font-semibold text-gray-900">₹{Number(available).toFixed(0)}</span>
        </div>
        <div className="flex justify-between text-sm border-t border-gray-100 pt-2">
          <span className="text-red-600 font-semibold">Short by</span>
          <span className="font-bold text-red-600">₹{Number(shortfall).toFixed(0)}</span>
        </div>
        <button
          onClick={onAddMoney}
          className="w-full mt-1 bg-lime-500 hover:bg-lime-600 text-white py-2.5 rounded-xl font-bold text-sm transition-colors"
        >
          + Add Money to Wallet
        </button>
      </div>
    </div>
  );
}

/* ── Order Tracking Card ──────────────────────────────────────────────────── */
function TrackingCard({ orderData, onViewFull }) {
  if (!orderData) return null;
  const meta  = STATUS_META[orderData.status] || { label: orderData.status, emoji: "📋", cls: "bg-gray-100 text-gray-700" };
  const pCode = orderData.pickup_code || orderData.order_id?.slice(-4).toUpperCase() || "----";
  return (
    <div className="mt-3 bg-white rounded-2xl border border-blue-200 shadow-sm overflow-hidden">
      <div className="bg-blue-50 px-4 py-2.5 border-b border-blue-100 flex items-center gap-2">
        <span>📍</span>
        <span className="font-bold text-sm text-gray-800">Your Order</span>
        <span className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-full ${meta.cls}`}>
          {meta.emoji} {meta.label}
        </span>
      </div>
      <div className="px-4 py-3 space-y-3">
        {orderData.stall_name && (
          <p className="text-xs text-gray-500">From <span className="font-semibold text-gray-700">{orderData.stall_name}</span></p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">ETA</p>
            <p className="font-bold text-sm text-gray-900">
              {orderData.estimated_ready_time || `~${orderData.predicted_prep_min} min`}
            </p>
          </div>
          <div className="bg-lime-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Pickup Code</p>
            <p className="font-black text-xl text-lime-600 tracking-widest">{pCode}</p>
          </div>
        </div>
        {orderData.items?.length > 0 && (
          <div className="text-xs text-gray-500 space-y-0.5">
            {orderData.items.slice(0, 3).map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.qty}× {item.name}</span>
                <span>₹{(item.price * item.qty).toFixed(0)}</span>
              </div>
            ))}
            {orderData.items.length > 3 && <span className="text-gray-400">+{orderData.items.length - 3} more</span>}
          </div>
        )}
        <button
          onClick={() => onViewFull(orderData.order_id)}
          className="w-full py-2 border border-lime-400 text-lime-700 rounded-xl text-sm font-semibold hover:bg-lime-50 transition-colors"
        >
          View Full Details →
        </button>
      </div>
    </div>
  );
}

/* ── Order Success Card ───────────────────────────────────────────────────── */
function OrderSuccessCard({ successData, onTrack }) {
  if (!successData) return null;
  return (
    <div className="mt-3 bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
      <div className="bg-green-50 px-4 py-2.5 border-b border-green-100 flex items-center gap-2">
        <span>✅</span>
        <span className="font-bold text-sm text-green-800">Order Confirmed!</span>
      </div>
      <div className="px-4 py-3 space-y-3">
        <div className="text-center py-1">
          <div className="text-3xl mb-1">🎉</div>
          <p className="text-sm text-gray-700">
            Order from <span className="font-semibold">{successData.stall_name}</span> is placed!
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Ready in</p>
            <p className="font-bold text-sm text-gray-900">~{successData.eta} min</p>
          </div>
          <div className="bg-lime-50 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-gray-400 mb-1 uppercase tracking-wide">Pickup Code</p>
            <p className="font-black text-xl text-lime-600 tracking-widest">{successData.pickup_code}</p>
          </div>
        </div>
        <div className="text-xs text-gray-400 text-center">
          ₹{Number(successData.total).toFixed(0)} deducted · Wallet: ₹{Number(successData.new_balance).toFixed(0)}
        </div>
        <button
          onClick={() => onTrack(successData.order_id)}
          className="w-full py-2.5 bg-lime-500 hover:bg-lime-600 text-white rounded-xl text-sm font-bold transition-colors"
        >
          Track My Order →
        </button>
      </div>
    </div>
  );
}

/* ── Recommendations Strip (horizontal scroll) ────────────────────────────── */
function RecsStrip({ items, onOrder }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs font-semibold text-gray-500 mb-2">✨ You might also like</p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {items.map(item => (
          <div key={item.id} className="flex-shrink-0 w-28 bg-white rounded-xl border border-gray-100 shadow-sm p-2.5">
            <div className="w-full h-14 rounded-lg bg-gray-100 overflow-hidden mb-2">
              {item.image_url
                ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                : <div className="w-full h-full flex items-center justify-center text-xl">🍽️</div>
              }
            </div>
            <p className="text-xs font-semibold text-gray-800 truncate">{item.name}</p>
            <p className="text-xs text-gray-500 mt-0.5">₹{item.price}</p>
            <button
              onClick={() => onOrder(item)}
              className="w-full mt-2 py-1 bg-lime-500 hover:bg-lime-600 text-white rounded-lg text-[10px] font-bold transition-colors"
            >
              + Add
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Inline Top-up Card ───────────────────────────────────────────────────── */
function TopupCard({ shortfall, onTopup, onClose }) {
  const [amount, setAmount] = useState(
    shortfall ? String(Math.ceil(shortfall / 100) * 100) : ""
  );
  const presets = [100, 200, 500, 1000].filter(a => !shortfall || a >= shortfall).slice(0, 4);

  return (
    <div className="mt-2 bg-white rounded-2xl border border-lime-200 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-sm text-gray-900">💰 Add Money to Wallet</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xs px-2 py-1 rounded">✕</button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {presets.map(s => (
          <button
            key={s}
            onClick={() => setAmount(String(s))}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${amount === String(s) ? "bg-lime-500 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            +₹{s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          value={amount}
          min={1}
          max={10000}
          onChange={e => setAmount(e.target.value)}
          placeholder="Custom amount"
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-lime-400"
        />
        <button
          onClick={() => { const a = Number(amount); if (a > 0) onTopup(a); }}
          disabled={!amount || Number(amount) <= 0 || Number(amount) > 10000}
          className="px-4 py-2 bg-lime-500 hover:bg-lime-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-colors"
        >
          Add
        </button>
      </div>
      {shortfall > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-center">Minimum needed: ₹{Math.ceil(shortfall)}</p>
      )}
    </div>
  );
}

/* ── Quick Action Chips ───────────────────────────────────────────────────── */
function QuickChips({ onChip, disabled }) {
  const chips = [
    { emoji: "🏪", label: "Show Stalls",     text: "Show all available stalls" },
    { emoji: "📋", label: "My Order",         text: "Where is my order?" },
    { emoji: "💰", label: "Wallet",           text: "What is my wallet balance?" },
    { emoji: "⭐", label: "Recommend",        text: "What do you recommend?" },
    { emoji: "🍔", label: "Show Menu",        text: "Show all menu items" },
  ];
  return (
    <div className="flex gap-1.5 overflow-x-auto px-3 py-2 scrollbar-hide">
      {chips.map(c => (
        <button
          key={c.label}
          onClick={() => !disabled && onChip(c.text)}
          disabled={disabled}
          className="flex-shrink-0 flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 px-3 py-1.5 rounded-full font-medium transition-colors"
        >
          <span>{c.emoji}</span>
          <span>{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/* ── Chat Bubble ─────────────────────────────────────────────────────────── */
function Bubble({ msg, onConfirm, onCancel, onBrowse, onOrder, onTrack, onAddMoney }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 bg-gradient-to-br from-lime-400 to-lime-600 rounded-full flex items-center justify-center text-white text-[10px] font-black mr-2 mt-1 flex-shrink-0 shadow">
          AI
        </div>
      )}
      <div className="max-w-[86%]">
        {/* Text bubble */}
        {msg.content && (
          <div
            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
              isUser
                ? "bg-zinc-900 text-white rounded-tr-sm"
                : "bg-gray-100 text-gray-800 rounded-tl-sm"
            }`}
          >
            {msg.content}
          </div>
        )}

        {/* Rich cards (assistant only) */}
        {!isUser && msg.intent && (
          <>
            {/* Stall search results */}
            {msg.intent === "search_stalls" && msg.data?.stalls && (
              <StallListCard stalls={msg.data.stalls} onBrowse={onBrowse} />
            )}

            {/* Item search / recommendations */}
            {(msg.intent === "search_items" || msg.intent === "recommend") && msg.data?.items && (
              <ItemListCard items={msg.data.items} onOrder={onOrder} />
            )}

            {/* Order summary (with confirm/cancel) */}
            {msg.intent === "order_summary" && msg.data?.order_summary && (
              <OrderSummaryCard
                orderData={msg.data.order_summary}
                walletBalance={msg.data.wallet_balance ?? 0}
                onConfirm={() => onConfirm(msg)}
                onCancel={() => onCancel(msg)}
                confirmed={msg.confirmed}
              />
            )}

            {/* Low balance warning */}
            {msg.intent === "low_balance" && msg.data && (
              <LowBalanceCard
                required={msg.data.required}
                available={msg.data.wallet_balance}
                shortfall={msg.data.shortfall}
                onAddMoney={() => onAddMoney(msg.data.shortfall)}
                confirmed={msg.confirmed}
              />
            )}

            {/* Order tracking */}
            {msg.intent === "track_order" && msg.data && (
              <TrackingCard orderData={msg.data} onViewFull={onTrack} />
            )}

            {/* Order success */}
            {msg.intent === "order_success" && msg.data && (
              <OrderSuccessCard successData={msg.data} onTrack={onTrack} />
            )}

            {/* Recommendations strip */}
            {msg.intent === "recs_strip" && msg.data?.items && (
              <RecsStrip items={msg.data.items} onOrder={onOrder} />
            )}
          </>
        )}
      </div>
    </div>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function AIAssistant() {
  const navigate      = useNavigate();
  const { pathname }  = useLocation();
  const token         = localStorage.getItem("token");

  // ── State ──────────────────────────────────────────────────────────────────
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState([{
    id: "welcome", role: "assistant",
    content: "Hi! 👋 I'm EatsBot — your AI food assistant.\n\nI can search stalls, find menu items, place orders, and track your food — all through chat! Try the quick buttons below.",
    intent: null, data: null, confirmed: false,
  }]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [balance, setBalance]     = useState(0);
  const [pendingOrder, setPendingOrder] = useState(null); // { msg }
  const [showTopup, setShowTopup]       = useState(false);
  const [topupShortfall, setTopupShortfall] = useState(0);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const msgIdRef   = useRef(0);
  const nextId     = () => String(++msgIdRef.current);

  // ── Voice hooks ────────────────────────────────────────────────────────────
  const { speaking, speak, stopSpeaking } = useTextToSpeech();
  const { listening, start: startListen, stop: stopListen } = useSpeechToText({
    continuous: false, interimResults: false,
    onResult: (text) => {
      if (!text?.trim()) return;
      if (speaking) stopSpeaking();
      setInput(text);
      setTimeout(() => handleSend(text), 300);
    },
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────
  useEffect(() => () => { stopListen(); stopSpeaking(); }, []);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, showTopup]);

  // ── Load balance when opening ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      fetchBalance()
        .then(r => setBalance(Number(r.data.balance || 0)))
        .catch(() => {});
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // ── Add message helper ─────────────────────────────────────────────────────
  const addMsg = useCallback((msg) => {
    setMessages(prev => [...prev, { id: nextId(), confirmed: false, ...msg }]);
  }, []);

  // ── Confirm Order ──────────────────────────────────────────────────────────
  const handleConfirmOrder = useCallback(async (msgOrOrderData) => {
    // Accept either a message object OR direct order data object
    const orderData = msgOrOrderData?.data?.order_summary ?? msgOrOrderData;
    const msgId     = msgOrOrderData?.id ?? null;

    if (!orderData) return;

    // Mark order summary card as confirmed (hides buttons)
    if (msgId) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
    }
    setPendingOrder(null);
    setLoading(true);

    try {
      // 1. Re-verify wallet balance
      const balRes = await fetchBalance();
      const liveBal = Number(balRes.data.balance || 0);
      setBalance(liveBal);

      if (liveBal < Number(orderData.total)) {
        const short = Number(orderData.total) - liveBal;
        addMsg({
          role: "assistant",
          content: `❌ Insufficient balance. You need ₹${short.toFixed(0)} more.`,
          intent: "low_balance",
          data: { required: orderData.total, wallet_balance: liveBal, shortfall: short },
        });
        return;
      }

      // 2. Place the order
      const orderBody = {
        stall_id: String(orderData.stall_id),
        items: orderData.items.map(i => ({
          menu_item_id:   String(i.id),
          qty:            Number(i.qty),
          customizations: [],
        })),
        special_instructions: null,
      };
      const orderRes = await placeOrderAPI(orderBody);
      const placed   = orderRes.data;

      // 3. Deduct wallet
      const deductRes = await deductWallet({
        amount:      Number(orderData.total),
        description: `Food order from ${orderData.stall_name}`,
        order_id:    placed.order_id,
      });
      const newBal = Number(deductRes.data.balance || 0);
      setBalance(newBal);

      const eta       = placed.predicted_prep_min || 10;
      const pCode     = placed.order_id.slice(-4).toUpperCase();

      // 4. Show success card
      addMsg({
        role: "assistant",
        content: `✅ Order confirmed! Pickup code: ${pCode}`,
        intent: "order_success",
        data: {
          order_id:    placed.order_id,
          stall_name:  orderData.stall_name,
          total:       orderData.total,
          eta,
          pickup_code: pCode,
          new_balance: newBal,
        },
      });

      speak(shortSpeech(`Order placed! Pickup code ${pCode}. Ready in ${eta} minutes.`));

      // 5. Fetch recommendations after a short delay
      try {
        const recRes = await api.post("/ai/recommend", {
          stall_id:      orderData.stall_id,
          cart_item_ids: orderData.items.map(i => i.id),
        });
        if (recRes.data?.length > 0) {
          setTimeout(() => {
            addMsg({
              role: "assistant",
              content: "You might also enjoy these from the same stall 😋",
              intent: "recs_strip",
              data:   { items: recRes.data },
            });
          }, 1200);
        }
      } catch { /* recommendations are non-critical */ }

      // 6. Navigate to tracking page
      setTimeout(() => {
        setOpen(false);
        navigate(`/track/${placed.order_id}`);
      }, 2500);

    } catch (e) {
      const detail = e.response?.data?.detail || "Order failed. Please try again.";
      addMsg({ role: "assistant", content: `⚠️ ${detail}`, intent: null, data: null });
      speak(shortSpeech(detail));
    } finally {
      setLoading(false);
    }
  }, [addMsg, navigate, speak]);

  // ── Cancel Order ───────────────────────────────────────────────────────────
  const handleCancelOrder = useCallback((msg) => {
    setPendingOrder(null);
    if (msg?.id) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, confirmed: true } : m));
    }
    addMsg({
      role: "assistant",
      content: "Order cancelled 👍 Let me know if you'd like to order something else!",
      intent: null, data: null,
    });
  }, [addMsg]);

  // ── Quick order from item card ─────────────────────────────────────────────
  const handleQuickOrder = useCallback((item) => {
    const text = `Order 1 ${item.name}${item.stall_name ? ` from ${item.stall_name}` : ""}`;
    handleSend(text);
  }, []);

  // ── Browse stall ───────────────────────────────────────────────────────────
  const handleBrowse = useCallback((stall) => {
    setOpen(false);
    navigate(`/restaurant/${stall.slug || stall.id}`);
  }, [navigate]);

  // ── View full tracking page ────────────────────────────────────────────────
  const handleTrack = useCallback((orderId) => {
    setOpen(false);
    navigate(`/track/${orderId}`);
  }, [navigate]);

  // ── Add money (show inline top-up) ────────────────────────────────────────
  const handleAddMoney = useCallback((shortfall) => {
    setTopupShortfall(shortfall || 0);
    setShowTopup(true);
  }, []);

  // ── Execute top-up ─────────────────────────────────────────────────────────
  const handleTopup = useCallback(async (amount) => {
    if (!amount || amount <= 0) return;
    setShowTopup(false);
    setLoading(true);
    try {
      const res    = await topUpWallet({ amount });
      const newBal = Number(res.data.balance || 0);
      setBalance(newBal);
      addMsg({
        role: "assistant",
        content: `💰 ₹${amount} added to your wallet!\nNew balance: ₹${newBal.toFixed(0)}`,
        intent: null, data: null,
      });
      speak(`Added ${amount} rupees to your wallet. New balance is ${newBal} rupees.`);
    } catch (e) {
      addMsg({ role: "assistant", content: "❌ Top-up failed. Please try again.", intent: null, data: null });
    } finally {
      setLoading(false);
    }
  }, [addMsg, speak]);

  // ── Main send handler ──────────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput("");

    addMsg({ role: "user", content, intent: null, data: null });

    // ── Pending order confirmation shortcut ──────────────────────────────────
    if (pendingOrder) {
      const lower = content.toLowerCase();
      const isYes = ["yes","confirm","ok","okay","sure","proceed","pay","book","y","go ahead","do it","approve"]
        .some(kw => lower === kw || lower.startsWith(kw + " ") || lower.endsWith(" " + kw));
      const isNo  = ["no","cancel","stop","don't","dont","nevermind","never mind","n","nope"]
        .some(kw => lower === kw || lower.startsWith(kw + " ") || lower.endsWith(" " + kw));

      if (isYes) {
        const { msg } = pendingOrder;
        setPendingOrder(null);
        await handleConfirmOrder(msg);
        return;
      }
      if (isNo) {
        const { msg } = pendingOrder;
        setPendingOrder(null);
        handleCancelOrder(msg);
        return;
      }
      // Any other text clears the pending order and proceeds normally
      setPendingOrder(null);
    }

    setLoading(true);
    try {
      // ── Refresh wallet balance ─────────────────────────────────────────────
      const balRes  = await fetchBalance();
      const liveBal = Number(balRes.data.balance || 0);
      setBalance(liveBal);

      // ── Build chat history (last 6 turns) ─────────────────────────────────
      const history = messages
        .slice(-5)
        .filter(m => m.role === "user" || m.role === "assistant")
        .map(m => ({ role: m.role, content: m.content || "" }));
      history.push({ role: "user", content });

      // ── Call /ai/chat ──────────────────────────────────────────────────────
      const { data } = await api.post("/ai/chat", {
        messages:       history,
        wallet_balance: liveBal,
      });

      const intent  = data.intent  || "chat";
      const message = data.message || "";
      const aiData  = data.data;

      speak(shortSpeech(message));

      // ── Handle wallet top-up response ──────────────────────────────────────
      if (intent === "wallet_topup" && aiData?.topup_amount) {
        const amt = Number(aiData.topup_amount);
        if (amt > 0) {
          try {
            const res    = await topUpWallet({ amount: amt });
            const newBal = Number(res.data.balance || 0);
            setBalance(newBal);
            addMsg({
              role: "assistant",
              content: `💰 ₹${amt} added! New balance: ₹${newBal.toFixed(0)}`,
              intent: null, data: null,
            });
          } catch {
            addMsg({ role: "assistant", content: "❌ Top-up failed.", intent: null, data: null });
          }
          return;
        }
      }

      // ── Build and store new message ────────────────────────────────────────
      const newMsg = {
        id: nextId(), role: "assistant",
        content: message,
        intent,
        data: aiData,
        confirmed: false,
      };
      setMessages(prev => [...prev, newMsg]);

      // ── Track pending order for conversational confirmation ────────────────
      if (intent === "order_summary" && aiData?.order_summary && aiData?.requires_confirmation) {
        setPendingOrder({ msg: newMsg });
      }

    } catch (e) {
      console.error("EatsBot error:", e);
      addMsg({
        role: "assistant",
        content: "Something went wrong. Please try again!",
        intent: null, data: null,
      });
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pendingOrder, addMsg, handleConfirmOrder, handleCancelOrder, speak]);

  // ── Enter key ──────────────────────────────────────────────────────────────
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Hide on auth / public pages ────────────────────────────────────────────
  if (!token || pathname === "/" || pathname === "/register") return null;

  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Float Button ─────────────────────────────────────────────────── */}
      <button
        id="eatsbot-btn"
        onClick={() => setOpen(v => !v)}
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 ${
          open
            ? "bg-zinc-900"
            : "bg-gradient-to-br from-lime-400 to-lime-600 hover:scale-110 hover:shadow-lime-300/50"
        }`}
        title="EatsBot — AI Food Assistant"
      >
        <span className="text-2xl">{open ? "✕" : "🤖"}</span>
        {!open && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-black shadow">
            AI
          </span>
        )}
      </button>

      {/* ── Chat Panel ───────────────────────────────────────────────────── */}
      {open && (
        <div
          id="eatsbot-panel"
          className="fixed bottom-40 right-4 z-50 flex flex-col bg-white rounded-3xl shadow-2xl overflow-hidden"
          style={{
            width: "min(420px, calc(100vw - 2rem))",
            maxHeight: "72vh",
            border: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-900 px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-gradient-to-br from-lime-400 to-lime-600 rounded-2xl flex items-center justify-center text-lg shadow-lg flex-shrink-0">
              🤖
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-sm">EatsBot</span>
                <VoiceWave active={listening || speaking} />
              </div>
              <span className="text-zinc-400 text-xs">
                {listening ? "🎤 Listening..." : speaking ? "🔊 Speaking..." : "AI Food Assistant · Easy Eats"}
              </span>
            </div>
            {/* Live wallet balance */}
            <div className="flex items-center gap-1 bg-zinc-700/70 rounded-full px-3 py-1.5 flex-shrink-0">
              <span className="text-lime-400 text-xs">💰</span>
              <span className="text-white text-xs font-bold">₹{balance.toFixed(0)}</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50 space-y-0">
            {messages.map(msg => (
              <Bubble
                key={msg.id}
                msg={msg}
                onConfirm={handleConfirmOrder}
                onCancel={handleCancelOrder}
                onBrowse={handleBrowse}
                onOrder={handleQuickOrder}
                onTrack={handleTrack}
                onAddMoney={handleAddMoney}
              />
            ))}

            {/* Typing indicator */}
            {loading && (
              <div className="flex justify-start mb-3">
                <div className="w-7 h-7 bg-gradient-to-br from-lime-400 to-lime-600 rounded-full flex items-center justify-center text-white text-[10px] font-black mr-2 mt-1 flex-shrink-0 shadow">
                  AI
                </div>
                <TypingDots />
              </div>
            )}

            {/* Inline top-up card */}
            {showTopup && (
              <div className="flex justify-start mb-3">
                <div className="w-7 mr-2 flex-shrink-0" />
                <div style={{ width: "calc(86%)" }}>
                  <TopupCard
                    shortfall={topupShortfall}
                    onTopup={handleTopup}
                    onClose={() => setShowTopup(false)}
                  />
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick action chips */}
          <div className="bg-white border-t border-gray-100 flex-shrink-0">
            <QuickChips onChip={handleSend} disabled={loading} />
          </div>

          {/* Input bar */}
          <div className="px-3 py-3 bg-white border-t border-gray-100 flex gap-2 items-center flex-shrink-0">
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={listening}
              placeholder={
                pendingOrder
                  ? "Type yes to confirm, no to cancel..."
                  : listening
                  ? "Listening..."
                  : "Type or speak your order..."
              }
              className={`flex-1 bg-gray-50 border rounded-xl px-3 py-2.5 text-sm focus:outline-none transition-colors ${
                pendingOrder
                  ? "border-lime-400 focus:ring-1 focus:ring-lime-100"
                  : "border-gray-200 focus:border-lime-400"
              }`}
            />
            {/* Mic button */}
            <button
              onClick={() => listening ? stopListen() : startListen()}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all flex-shrink-0 ${
                listening
                  ? "bg-red-500 text-white shadow-lg scale-110"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-600"
              }`}
              title={listening ? "Stop listening" : "Voice input"}
            >
              🎤
            </button>
            {/* Send button */}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-lime-500 hover:bg-lime-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0 shadow-sm"
              title="Send"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}