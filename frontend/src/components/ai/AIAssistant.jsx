// src/components/ai/AIAssistant.jsx

import {
  useState,
  useRef,
  useEffect,
  useCallback,
} from "react";

import {
  useNavigate,
  useLocation,
} from "react-router-dom";

import {
  useSpeechToText,
  useTextToSpeech,
} from "../../hooks/useVoice";

import api from "../../api";

// ─────────────────────────────────────────────────────────────
// API CALLS
// ─────────────────────────────────────────────────────────────
const fetchBalance = () =>
  api.get("/wallet/balance");

const deductWallet = (body) =>
  api.post("/wallet/deduct", body);

const topUpWallet = (body) =>
  api.post("/wallet/topup", body);

const fetchAllStalls = () =>
  api.get("/stalls/");

const fetchStallMenu = (id) =>
  api.get(`/menu/${id}`);

const placeOrderAPI = (data) =>
  api.post("/orders/place", data);

const fetchMyOrders = () =>
  api.get("/orders/my");

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
function pickupCode(orderId) {

  return (
    orderId?.slice(-4).toUpperCase() ||
    "----"
  );
}

function getShortSpeech(text) {

  if (!text) return "";

  let cleaned =
    text.replace(/[^\w\s₹.]/g, "");

  const firstSentence =

    cleaned.split(".")[0] ||

    cleaned.split("!")[0] ||

    cleaned.split("?")[0];

  return firstSentence.slice(0, 120);
}

// ─────────────────────────────────────────────────────────────
// VOICE WAVE
// ─────────────────────────────────────────────────────────────
function VoiceWave({ active }) {

  return (
    <div
      className={`flex items-center gap-0.5 h-5 ${active
        ? "opacity-100"
        : "opacity-30"
        }`}
    >

      {[1, 2, 3, 4, 3, 2, 1].map((h, i) => (

        <div
          key={i}
          className="w-1 bg-lime-500 rounded-full"
          style={{
            height: active
              ? `${h * 4 + 4}px`
              : "4px",

            animationName:
              active
                ? "wave"
                : "none",

            animationDuration:
              `${0.5 + i * 0.1}s`,

            animationIterationCount:
              "infinite",

            animationDirection:
              "alternate",
          }}
        />

      ))}

      <style>{`
        @keyframes wave {
          from { transform: scaleY(0.5); }
          to { transform: scaleY(1.4); }
        }
      `}</style>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ORDER CONFIRM CARD
// ─────────────────────────────────────────────────────────────
function OrderConfirmCard({
  order,
  onConfirm,
  onCancel,
}) {

  if (!order) return null;

  return (
    <div className="mt-3 bg-white border border-lime-200 rounded-2xl p-4">

      <p className="font-bold text-sm mb-2">
        🧾 Order Summary
      </p>

      <p className="text-xs text-gray-500 mb-3">
        {order.stall_name}
      </p>

      <div className="space-y-1 mb-3">

        {order.items?.map((item, i) => (

          <div
            key={i}
            className="flex justify-between text-sm"
          >

            <span>
              {item.qty}× {item.name}
            </span>

            <span>
              ₹{(
                item.price * item.qty
              ).toFixed(0)}
            </span>

          </div>

        ))}

      </div>

      <div className="border-t pt-2 flex justify-between font-bold mb-3">

        <span>Total</span>

        <span>
          ₹{Number(order.total).toFixed(0)}
        </span>

      </div>

      <div className="flex gap-2">

        <button
          onClick={onConfirm}
          className="flex-1 bg-lime-500 hover:bg-lime-600 py-2 rounded-xl font-bold text-sm"
        >
          ✓ Confirm & Pay
        </button>

        <button
          onClick={onCancel}
          className="px-4 py-2 bg-gray-100 rounded-xl text-sm"
        >
          Cancel
        </button>

      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CHAT BUBBLE
// ─────────────────────────────────────────────────────────────
function Bubble({ msg }) {

  const isUser =
    msg.role === "user";

  return (
    <div
      className={`flex ${isUser
        ? "justify-end"
        : "justify-start"
        } mb-3`}
    >

      {!isUser && (

        <div className="w-7 h-7 bg-lime-500 rounded-full flex items-center justify-center text-xs font-black mr-2 mt-1">
          AI
        </div>

      )}

      <div className="max-w-[80%]">

        <div
          className={`px-4 py-3 rounded-2xl text-sm ${isUser
            ? "bg-zinc-900 text-white"
            : "bg-gray-100"
            }`}
        >
          {msg.content}
        </div>

        {msg.orderIntent &&
          !msg.confirmed && (

            <OrderConfirmCard
              order={msg.orderIntent}
              onConfirm={msg.onConfirm}
              onCancel={msg.onCancel}
            />

          )}

      </div>

    </div>
  );
}

// ════════════════════════════════════════════════════════════
export default function AIAssistant() {

  const navigate =
    useNavigate();

  const { pathname } =
    useLocation();

  const token =
    localStorage.getItem("token");

  const [open, setOpen] =
    useState(false);

  const [messages, setMessages] =
    useState([
      {
        id: "welcome",

        role: "assistant",

        content:
          "Hi 👋 I'm EatsBot. I can order food from live hotel menu using your wallet.",
      },
    ]);

  const [input, setInput] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [balance, setBalance] =
    useState(0);

  const [menuContext, setMenuContext] =
    useState("");

  const [lastOrder, setLastOrder] =
    useState(null);

  const [pendingOrder, setPendingOrder] =
    useState(null);

  const bottomRef =
    useRef(null);

  const inputRef =
    useRef(null);

  const msgIdRef =
    useRef(0);

  const nextId = () =>
    String(++msgIdRef.current);

  const {
    speaking,
    speak,
    stopSpeaking,
  } = useTextToSpeech();

  const {
    listening,
    start: startListening,
    stop: stopListening,
  } = useSpeechToText({

    continuous: true,

    interimResults: false,

    onResult: (text) => {

      if (!text?.trim()) return;

      if (speaking) {
        stopSpeaking();
      }

      setInput(text);

      setTimeout(() => {
        handleSend(text);
      }, 300);
    },
  });

  // ─────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────
  useEffect(() => {

    return () => {

      stopListening();

      stopSpeaking();

    };

  }, []);

  // ─────────────────────────────────────────────────────────
  // SCROLL
  // ─────────────────────────────────────────────────────────
  useEffect(() => {

    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });

  }, [messages, loading]);

  // ─────────────────────────────────────────────────────────
  // LOAD CONTEXT
  // ─────────────────────────────────────────────────────────
  useEffect(() => {

    if (open) {

      loadContext();

      setTimeout(() => {
        inputRef.current?.focus();
      }, 200);

    }

  }, [open]);

  // ─────────────────────────────────────────────────────────
  // LOAD MENU FROM MONGODB
  // ─────────────────────────────────────────────────────────
  const loadContext = async () => {
    try {
      // 1. Fetch Wallet Balance (gracefully handle auth failure)
      try {
        const balRes = await fetchBalance();
        const walletBalance = Number(balRes.data.balance || 0);
        setBalance(walletBalance);
      } catch (err) {
        console.error("Wallet Fetch Error:", err);
      }

      // 2. Fetch Stalls list (public, doesn't need auth)
      let stalls = [];
      try {
        const stallsRes = await fetchAllStalls();
        stalls = stallsRes.data || [];
      } catch (err) {
        console.error("Stalls Fetch Error:", err);
      }

      // 3. Fetch My Orders (gracefully handle auth failure)
      try {
        const ordersRes = await fetchMyOrders();
        const lastO = ordersRes.data?.[0];
        if (lastO) {
          setLastOrder(
            JSON.stringify({
              stall: lastO.stall_name,
              total: lastO.total_amount || lastO.total,
              items: lastO.items,
            })
          );
        }
      } catch (err) {
        console.error("Orders Fetch Error:", err);
      }

      // 4. Fetch Menus for all stalls (open and closed)
      if (stalls.length > 0) {
        const menuItems = await Promise.all(
          stalls.map(async (stall) => {
            try {
              const realStallId = String(stall._id || stall.id);
              const menuRes = await fetchStallMenu(realStallId);

              // Flatten grouped items
              const flatItems = Object.values(menuRes.data || {}).flat();

              return {
                stall_id: realStallId,
                stall_name: stall.name,
                is_open: stall.is_open !== false, // Include stall open/closed status
                items: flatItems.map((i) => ({
                  id: String(i._id || i.id),
                  name: i.name,
                  price: i.discounted_price || i.price,
                  category: i.category,
                  is_veg: i.is_veg,
                  is_available: i.is_available !== false, // Include item availability status
                  prep_time_min: i.prep_time_min || 10,
                })),
              };
            } catch (err) {
              console.error(`Menu Fetch Error for Stall ${stall.name}:`, err);
              return null;
            }
          })
        );

        const validMenus = menuItems.filter(Boolean);
        setMenuContext(JSON.stringify(validMenus));
      }
    } catch (err) {
      console.error("Context Error:", err);
    }
  };

  // ─────────────────────────────────────────────────────────
  // ADD MESSAGE
  // ─────────────────────────────────────────────────────────
  const addMsg = (msg) => {

    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        ...msg,
      },
    ]);
  };

  // ─────────────────────────────────────────────────────────
  // SEND MESSAGE
  // ─────────────────────────────────────────────────────────
  const handleSend = useCallback(

    async (text) => {

      const content =
        (text || input).trim();

      if (!content || loading)
        return;

      setInput("");

      addMsg({
        role: "user",
        content,
      });

      // CONVERSATIONAL WALLET ORDER CONFIRMATION / BOOKING FLOW
      if (pendingOrder) {
        const lowerText = content.toLowerCase().trim();

        // Check for confirmation keywords
        const isConfirm = [
          "yes", "confirm", "confirm and pay", "book", "book it", "order", "order it", "pay", "pay now", "proceed", "ok", "okay", "sure", "go ahead", "do it", "y"
        ].some(kw => lowerText === kw || lowerText.startsWith(kw + " ") || lowerText.endsWith(" " + kw));

        // Check for cancellation keywords
        const isCancel = [
          "no", "cancel", "stop", "don't", "dont", "never mind", "nevermind", "n"
        ].some(kw => lowerText === kw || lowerText.startsWith(kw + " ") || lowerText.endsWith(" " + kw));

        if (isConfirm) {
          const { order, msgId } = pendingOrder;
          setPendingOrder(null);
          await handleConfirmOrder(order, msgId);
          return;
        } else if (isCancel) {
          const { msgId } = pendingOrder;
          setPendingOrder(null);
          handleCancelOrder(msgId);
          return;
        } else {
          // If the user typed/said a new query instead of confirming, clear the pending order
          setPendingOrder(null);
        }
      }

      setLoading(true);

      try {

        // LIVE WALLET
        const walletRes =
          await fetchBalance();

        const liveWalletBalance =
          Number(
            walletRes.data.balance || 0
          );

        setBalance(
          liveWalletBalance
        );

        // CHAT HISTORY
        const history =
          messages
            .slice(-4)
            .map((m) => ({
              role: m.role,
              content: m.content,
            }));

        history.push({
          role: "user",
          content,
        });

        // AI REQUEST
        const { data } =
          await api.post(
            "/ai/chat",
            {
              messages: history,

              wallet_balance:
                liveWalletBalance,

              menu_context:
                menuContext,

              last_order:
                lastOrder,
            }
          );

        const aiContent =
          data.message || "Sorry.";

        // VOICE
        speak(
          getShortSpeech(
            aiContent
          )
        );

        // CONVERSATIONAL WALLET TOP-UP
        if (data.intent === "wallet" && data.topup_amount) {
          try {
            const topupRes = await topUpWallet({ amount: Number(data.topup_amount) });
            const newBal = Number(topupRes.data.balance || 0);
            setBalance(newBal);

            const successMsg = `💰 Success! Added ₹${data.topup_amount} to your wallet. New balance: ₹${newBal}.`;
            addMsg({
              role: "assistant",
              content: successMsg,
            });
            speak(getShortSpeech(successMsg));
            return;
          } catch (topupErr) {
            console.error("Wallet Topup Error:", topupErr);
          }
        }

        // ORDER FLOW
        if (
          data.intent === "order" &&
          data.order &&
          data.requires_confirmation
        ) {

          const orderData =
            data.order;

          const msgId =
            nextId();

          // Save pending order for conversational confirmation
          setPendingOrder({ order: orderData, msgId });

          setMessages((prev) => [
            ...prev,
            {
              id: msgId,

              role: "assistant",

              content:
                aiContent,

              orderIntent:
                orderData,

              confirmed: false,

              onConfirm: () => {
                setPendingOrder(null);
                handleConfirmOrder(
                  orderData,
                  msgId
                );
              },

              onCancel: () => {
                setPendingOrder(null);
                handleCancelOrder(
                  msgId
                );
              },
            },
          ]);

        } else {

          addMsg({
            role: "assistant",
            content: aiContent,
          });

        }

      } catch (e) {

        console.error(
          "AI Error:",
          e
        );

        addMsg({
          role: "assistant",
          content:
            "Something went wrong.",
        });

      } finally {

        setLoading(false);

      }
    },

    [
      input,
      loading,
      messages,
      menuContext,
      lastOrder,
      pendingOrder,
    ]
  );

  // ─────────────────────────────────────────────────────────
  // CONFIRM ORDER
  // ─────────────────────────────────────────────────────────
  async function handleConfirmOrder(
    order,
    msgId
  ) {

    if (!order) return;

    setLoading(true);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
            ...m,
            confirmed: true,
          }
          : m
      )
    );

    try {

      // WALLET
      const balanceRes =
        await fetchBalance();

      const currentBalance =
        Number(
          balanceRes.data.balance || 0
        );

      setBalance(currentBalance);

      // CHECK BALANCE
      if (
        currentBalance <
        Number(order.total)
      ) {

        const short =
          (
            Number(order.total) -
            currentBalance
          ).toFixed(0);

        const msg =
          `Insufficient wallet balance. Add ₹${short} more.`;

        addMsg({
          role: "assistant",
          content: msg,
        });

        speak(
          getShortSpeech(msg)
        );

        setLoading(false);

        return;
      }

      // IMPORTANT
      // REAL OBJECT IDS
      const orderBody = {

        stall_id:
          String(order.stall_id),

        items:
          order.items.map((i) => ({

            menu_item_id:
              String(i.id),

            qty:
              Number(i.qty),

            customizations:
              [],
          })),

        special_instructions:
          null,
      };

      // PLACE ORDER
      const orderRes =
        await placeOrderAPI(
          orderBody
        );

      const placed =
        orderRes.data;

      // WALLET DEDUCT
      const deductRes =
        await deductWallet({

          amount:
            Number(order.total),

          description:
            `Food order from ${order.stall_name}`,

          order_id:
            placed.order_id,
        });

      // UPDATED BALANCE
      const updatedBalance =
        Number(
          deductRes.data.balance || 0
        );

      setBalance(updatedBalance);

      // TRACK PAGE
      const trackingUrl =

        placed.tracking_url ||

        `/track/${placed.order_id}`;

      // SUCCESS
      const code =
        pickupCode(
          placed.order_id
        );

      const eta =
        placed.predicted_prep_min || 10;

      const successMsg =

        `✅ Order placed successfully! ` +

        `Hotel received your order. ` +

        `₹${Number(order.total).toFixed(0)} deducted from wallet. ` +

        `Pickup code: ${code}. ` +

        `Ready in ${eta} mins. ` +

        `Wallet balance ₹${updatedBalance.toFixed(0)}.`;

      addMsg({

        role: "assistant",

        content: successMsg,

        success: successMsg,
      });

      // VOICE
      speak(
        getShortSpeech(
          successMsg
        )
      );

      // OPEN TRACK PAGE
      setTimeout(() => {

        setOpen(false);

        navigate(
          trackingUrl
        );

      }, 1500);

    } catch (e) {

      console.error(
        "Order Error:",
        e
      );

      const msg =

        e.response?.data?.detail ||

        "Order failed.";

      addMsg({
        role: "assistant",
        content: `⚠️ ${msg}`,
      });

      speak(
        getShortSpeech(msg)
      );

    } finally {

      setLoading(false);

    }
  };

  // ─────────────────────────────────────────────────────────
  // CANCEL ORDER
  // ─────────────────────────────────────────────────────────
  function handleCancelOrder(
    msgId
  ) {

    setMessages((prev) =>
      prev.map((m) =>
        m.id === msgId
          ? {
            ...m,
            confirmed: true,
          }
          : m
      )
    );

    addMsg({
      role: "assistant",
      content:
        "Order cancelled.",
    });
  };

  // ─────────────────────────────────────────────────────────
  // ENTER KEY
  // ─────────────────────────────────────────────────────────
  const handleKey = (e) => {

    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {

      e.preventDefault();

      handleSend();
    }
  };

  // HIDE LOGIN PAGE
  if (
    !token ||
    pathname === "/" ||
    pathname === "/register"
  ) {
    return null;
  }

  return (
    <>
      {/* FLOAT BUTTON */}
      <button
        onClick={() =>
          setOpen((v) => !v)
        }
        className={`fixed bottom-24 right-4 z-50 w-14 h-14 rounded-full shadow-2xl flex items-center justify-center ${open
          ? "bg-zinc-900"
          : "bg-lime-500"
          }`}
      >
        {open ? "✕" : "🤖"}
      </button>

      {/* CHAT PANEL */}
      {open && (

        <div
          className="fixed bottom-40 right-4 z-50 w-[380px] bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden"
          style={{
            maxHeight: "70vh",
          }}
        >

          {/* HEADER */}
          <div className="bg-zinc-900 px-4 py-3 flex items-center gap-3">

            <div className="w-9 h-9 bg-lime-500 rounded-2xl flex items-center justify-center">
              🤖
            </div>

            <div className="flex-1">

              <div className="flex items-center gap-2">

                <p className="text-white font-bold text-sm">
                  EatsBot
                </p>

                <VoiceWave
                  active={
                    listening ||
                    speaking
                  }
                />

              </div>

              <p className="text-zinc-400 text-xs">

                {listening
                  ? "Listening..."
                  : speaking
                    ? "Speaking..."
                    : "AI Assistant"}

              </p>

            </div>

          </div>

          {/* MESSAGES */}
          <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50">

            {messages.map((msg) => (

              <Bubble
                key={msg.id}
                msg={msg}
              />

            ))}

            <div ref={bottomRef} />

          </div>

          {/* INPUT */}
          <div className="px-3 py-3 border-t bg-white flex gap-2">

            <input
              ref={inputRef}
              value={input}
              onChange={(e) =>
                setInput(
                  e.target.value
                )
              }
              onKeyDown={handleKey}
              placeholder="Type or speak..."
              className="flex-1 bg-gray-50 border rounded-xl px-3 py-2 text-sm"
            />

            {/* MIC */}
            <button
              onClick={() => {

                if (listening) {

                  stopListening();

                } else {

                  startListening();

                }

              }}
              className={`w-10 h-10 rounded-xl ${listening
                ? "bg-red-500 text-white"
                : "bg-gray-100"
                }`}
            >
              🎤
            </button>

            {/* SEND */}
            <button
              onClick={() =>
                handleSend()
              }
              disabled={
                !input.trim() ||
                loading
              }
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