// src/components/ai/AIAssistant.jsx
// Voice + Chat AI ordering assistant with wallet payment confirmation

import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useSpeechToText, useTextToSpeech } from "../../hooks/useVoice";
import api from "../../api";

// ── API calls ─────────────────────────────────────────────────────────────────
const fetchBalance = () => api.get("/wallet/balance");
const deductWallet = (body) => api.post("/wallet/deduct", body);
const fetchAllStalls = () => api.get("/stalls/");
const fetchStallMenu = (id) => api.get(`/menu/${id}/available`);
const placeOrderAPI = (data) => api.post("/orders/place", data);
const fetchMyOrders = () => api.get("/orders/my");

// ── Helpers ───────────────────────────────────────────────────────────────────
function getUser() {
  try {
    return JSON.parse(localStorage.getItem("user_data") || "{}");
  } catch {
    return {};
  }
}

function pickupCode(orderId) {
  return orderId?.slice(-4).toUpperCase() || "----";
}

// ── Voice wave animation ──────────────────────────────────────────────────────
function VoiceWave({ active }) {
  return (
    <div
      className={`flex items-center gap-0.5 h-5 ${active ? "opacity-100" : "opacity-30"
        }`}
    >
      {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (
        <div
          key={i}
          className="w-1 bg-lime-500 rounded-full transition-all"
          style={{
            height: active ? `${h * 4 + 4}px` : "4px",
            animationName: active ? "wave" : "none",
            animationDuration: `${0.5 + i * 0.1}s`,
            animationTimingFunction: "ease-in-out",
            animationIterationCount: "infinite",
            animationDirection: "alternate",
          }}
        />
      ))}

      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.5); }
          to   { transform: scaleY(1.4); }
        }
      `}</style>
    </div>
  );
}

// ── Typing animation ──────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-1 items-center px-4 py-3 bg-gray-100 rounded-2xl rounded-bl-sm w-fit">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      {!isUser && (
        <div
          className="w-7 h-7 bg-lime-500 rounded-full flex items-center justify-center
                     text-xs font-black text-zinc-900 flex-shrink-0 mr-2 mt-1"
        >
          AI
        </div>
      )}

      <div className="max-w-[80%]">
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${isUser
            ? "bg-zinc-900 text-white rounded-br-sm"
            : "bg-gray-100 text-zinc-800 rounded-bl-sm"
            }`}
        >
          {msg.content}
        </div>

        {/* Order confirmation card */}
        {msg.orderIntent && !msg.confirmed && (
          <OrderConfirmCard
            order={msg.orderIntent}
            messageId={msg.id}
            onConfirm={msg.onConfirm}
            onCancel={msg.onCancel}
          />
        )}

        {/* Success card */}
        {msg.success && (
          <div className="mt-2 bg-lime-50 border border-lime-200 rounded-2xl p-3">
            <p className="text-lime-700 font-bold text-sm">
              ✅ {msg.success}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order confirm card ────────────────────────────────────────────────────────
function OrderConfirmCard({ order, onConfirm, onCancel }) {
  if (!order) return null;

  return (
    <div className="mt-2 bg-white border border-lime-200 rounded-2xl p-4 shadow-sm">
      <p className="font-bold text-zinc-900 text-sm mb-2">
        🧾 Order Summary
      </p>

      <p className="text-xs text-gray-500 font-medium mb-2">
        {order.stall_name}
      </p>

      <div className="space-y-1 mb-3">
        {order.items?.map((item, i) => (
          <div key={i} className="flex justify-between text-sm text-gray-700">
            <span>
              {item.qty}× {item.name}
            </span>

            <span>₹{(item.price * item.qty).toFixed(0)}</span>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-zinc-900 mb-3">
        <span>Total</span>
        <span>₹{order.total?.toFixed(0)}</span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 bg-lime-500 hover:bg-lime-600 text-zinc-900 py-2.5 rounded-xl
                     font-bold text-sm transition-all"
        >
          ✓ Confirm & Pay
        </button>

        <button
          onClick={onCancel}
          className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl
                     font-bold text-sm transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Quick prompts ─────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  "What's available now?",
  "Suggest something under ₹100",
  "Repeat my last order",
  "Check my wallet balance",
];

// ══════════════════════════════════════════════════════════════════════════════
export default function AIAssistant() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const token = localStorage.getItem("token");

  const { addToCart, clearCart } = useCart();

  const [open, setOpen] = useState(false);

  const [messages, setMessages] = useState([
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! 👋 I'm EatsBot, your AI food assistant. I can take orders, suggest food, and pay using your wallet. Try saying or typing what you'd like!",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(0);
  const [menuContext, setMenuContext] = useState("");
  const [lastOrder, setLastOrder] = useState(null);
  const [pendingOrder, setPendingOrder] = useState(null);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const msgIdRef = useRef(0);

  const nextId = () => String(++msgIdRef.current);

  // ── Text-to-speech ────────────────────────────────────────────────────────
  const { speaking, speak, stopSpeaking } = useTextToSpeech();

  // ── Speech-to-text ────────────────────────────────────────────────────────
  const { listening, start: startListening, stop: stopListening } =
    useSpeechToText({
      onResult: (text) => {
        if (!text?.trim()) return;

        setInput(text);

        setTimeout(() => handleSend(text), 300);
      },

      onEnd: () => { },
    });

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, loading]);

  // ── Focus input when opened ───────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      loadContext();

      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  // ── Load balance + menu context ───────────────────────────────────────────
  const loadContext = async () => {
    try {
      const [balRes, stallsRes, ordersRes] = await Promise.all([
        fetchBalance(),
        fetchAllStalls(),
        fetchMyOrders(),
      ]);

      setBalance(balRes.data.balance);

      // Build compact menu context for AI
      const stalls = stallsRes.data
        .filter((s) => s.is_open)
        .slice(0, 3);

      const menuItems = await Promise.all(
        stalls.map(async (s) => {
          try {
            const m = await fetchStallMenu(s.id);

            const items = Object.values(m.data)
              .flat()
              .slice(0, 3)
              .map((i) => ({
                name: i.name,
                price: i.price,
              }));

            return {
              stall_id: s.id,
              stall: s.name,
              items,
            };
          } catch {
            return null;
          }
        })
      );

      const compactMenu = menuItems
        .filter(Boolean)
        .map((s) => ({
          stall: s.stall,
          items: s.items,
        }));

      setMenuContext(
        JSON.stringify(compactMenu).slice(0, 1200)
      );

      // Last order for repeat
      const lastO = ordersRes.data?.[0];

      if (lastO) {
        setLastOrder(
          JSON.stringify({
            stall: lastO.stall_name,
            total: lastO.total_amount,
          }).slice(0, 200)
        );
      }
    } catch (err) {
      console.error("Context load failed:", err);
    }
  };

  // ── Add message ────────────────────────────────────────────────────────────
  const addMsg = (msg) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        ...msg,
      },
    ]);
  };

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(
    async (text) => {
      const content = (text || input).trim();

      if (!content || loading) return;

      setInput("");
      stopSpeaking();

      // Add user message
      addMsg({
        role: "user",
        content,
      });

      setLoading(true);

      try {
        // LIMIT HISTORY
        const history = messages
          .filter((m) => !m.orderIntent && !m.success)
          .slice(-4)
          .map((m) => ({
            role: m.role,
            content: m.content.slice(0, 250),
          }));

        history.push({
          role: "user",
          content: content.slice(0, 250),
        });

        // TOKEN SAFETY
        const estimatedSize =
          JSON.stringify(history).length +
          menuContext.length +
          (lastOrder?.length || 0);

        console.log("Estimated Size:", estimatedSize);

        if (estimatedSize > 4500) {
          addMsg({
            role: "assistant",
            content:
              "Conversation too long. Please refresh chat.",
          });

          setLoading(false);
          return;
        }

        const { data } = await api.post("/ai/chat", {
          messages: history,
          wallet_balance: balance,
          menu_context: menuContext,
          last_order: lastOrder,
        });

        const aiContent =
          data.message || "Sorry, I didn't understand that.";

        speak(aiContent);

        // Order flow
        if (
          data.intent === "order" &&
          data.order &&
          data.requires_confirmation
        ) {
          const orderData = data.order;

          setPendingOrder(orderData);

          const msgId = nextId();

          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              role: "assistant",
              content: aiContent,
              orderIntent: orderData,
              confirmed: false,
              onConfirm: () =>
                handleConfirmOrder(orderData, msgId),

              onCancel: () =>
                handleCancelOrder(msgId),
            },
          ]);
        } else {
          addMsg({
            role: "assistant",
            content: aiContent,
          });
        }
      } catch (e) {
        console.error("AI Error:", e);

        const errDetail =
          e.response?.data?.error?.message ||
          e.response?.data?.detail ||
          "Oops! Something went wrong. Please try again. 😅";

        addMsg({
          role: "assistant",
          content: errDetail,
        });
      } finally {
        setLoading(false);
      }
    },
    [input, loading, messages, balance, menuContext, lastOrder]
  );

  // ── Confirm order ──────────────────────────────────────────────────────────
  const handleConfirmOrder = async (order, msgId) => {
    if (!order) return;

    setLoading(true);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, confirmed: true }
          : m
      )
    );

    try {
      const balRes = await fetchBalance();

      const bal = balRes.data.balance;

      setBalance(bal);

      if (bal < order.total) {
        const short = (order.total - bal).toFixed(0);

        const msg = `You're ₹${short} short. Please add money to your wallet first.`;

        addMsg({
          role: "assistant",
          content: msg,
        });

        speak(msg);

        setLoading(false);
        return;
      }

      const orderBody = {
        stall_id: order.stall_id,

        items: order.items.map((i) => ({
          menu_item_id: i.id,
          qty: i.qty,
          customizations: [],
        })),

        special_instructions: null,
        payment_method: "wallet",
        payment_status: "paid",
      };

      const orderRes = await placeOrderAPI(orderBody);

      const placed = orderRes.data;

      // Deduct wallet
      await deductWallet({
        amount: order.total,

        description: `Order #${placed.order_id
          ?.slice(-5)
          .toUpperCase()} from ${order.stall_name}`,

        order_id: placed.order_id,
      });

      const newBal =
        (await fetchBalance()).data.balance;

      setBalance(newBal);

      const code = pickupCode(placed.order_id);

      const eta =
        placed.predicted_prep_min || 10;

      const successMsg =
        `✅ Order placed! Pickup code: ${code}. ` +
        `Ready in ~${eta} minutes. ` +
        `Wallet balance: ₹${newBal.toFixed(0)}.`;

      addMsg({
        role: "assistant",
        content: successMsg,
        success: successMsg,
      });

      speak(successMsg);

      setPendingOrder(null);

      setTimeout(() => {
        if (
          window.confirm(
            `Order placed! Track order #${code}?`
          )
        ) {
          navigate(`/track/${placed.order_id}`);
          setOpen(false);
        }
      }, 1500);

    } catch (e) {
      const msg =
        e.response?.data?.detail ||
        "Order failed. Please try again.";

      addMsg({
        role: "assistant",
        content: `⚠️ ${msg}`,
      });

      speak(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Cancel order ───────────────────────────────────────────────────────────
  const handleCancelOrder = (msgId) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? { ...m, confirmed: true }
          : m
      )
    );

    setPendingOrder(null);

    const msg =
      "Order cancelled. Let me know if you'd like something else!";

    addMsg({
      role: "assistant",
      content: msg,
    });

    speak(msg);
  };

  // ── Enter key ──────────────────────────────────────────────────────────────
  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Hide on auth pages ─────────────────────────────────────────────────────
  if (
    !token ||
    pathname === "/" ||
    pathname === "/register"
  ) {
    return null;
  }

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-2xl
                    flex items-center justify-center transition-all duration-300
                    ${open
            ? "bg-zinc-900 rotate-45 scale-95"
            : "bg-gradient-to-br from-lime-500 to-lime-600 hover:scale-110"
          }`}
      >
        {open ? (
          <span className="text-white text-2xl">✕</span>
        ) : (
          <span className="text-2xl">🤖</span>
        )}
      </button>

      {/* Chat Panel */}
      {open && (
        <div
          className="fixed bottom-40 right-4 z-50 w-[350px] md:w-[400px]
                     bg-white rounded-3xl shadow-2xl border border-gray-100
                     flex flex-col overflow-hidden"
          style={{ maxHeight: "70vh" }}
        >
          {/* Header */}
          <div className="bg-zinc-900 px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 bg-lime-500 rounded-2xl flex items-center justify-center">
              🤖
            </div>

            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-sm">
                  EatsBot
                </p>

                <VoiceWave active={listening || speaking} />
              </div>

              <p className="text-zinc-400 text-xs">
                {listening
                  ? "Listening..."
                  : speaking
                    ? "Speaking..."
                    : "AI Food Assistant"}
              </p>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50">
            {messages.map((msg) => (
              <Bubble key={msg.id} msg={msg} />
            ))}

            {loading && (
              <div className="flex justify-start mb-3">
                <TypingDots />
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* Quick prompts */}
          <div className="px-4 pt-2 flex gap-2 overflow-x-auto">
            {QUICK_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => handleSend(p)}
                className="text-xs bg-white border border-gray-200
                           px-3 py-1.5 rounded-full whitespace-nowrap"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-gray-100 bg-white flex gap-2">

            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Type or speak your order..."
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm"
            />

            {/* Mic */}
            <button
              onClick={
                listening
                  ? stopListening
                  : startListening
              }
              className={`w-10 h-10 rounded-xl ${listening
                ? "bg-red-500 text-white"
                : "bg-gray-100"
                }`}
            >
              🎤
            </button>

            {/* Send */}
            <button
              onClick={() => handleSend()}
              disabled={!input.trim() || loading}
              className="w-10 h-10 bg-lime-500 rounded-xl"
            >
              ➤
            </button>

          </div>
        </div>
      )}
    </>
  );
}