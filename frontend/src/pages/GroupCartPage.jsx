import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { useAuth } from "../hooks/useAuth";
import { io } from "socket.io-client";
import {
  getGroupSession,
  updateGroupItem,
  checkoutGroupSession,
  getWalletBalance,
  getAvailableMenu,
  updateGroupPaymentMethod,
  SOCKET_URL
} from "../api";

export default function GroupCartPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const socketRef = useRef(null);

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkoutError, setCheckoutError] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [myBalance, setMyBalance] = useState(0.0);
  const paymentMethod = session?.payment_method || "split";

  // Stall Menu items for quick-add list
  const [menuItems, setMenuItems] = useState([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    loadSession();
    fetchBalance();
  }, [sessionId]);

  // Socket connection for real-time updates
  useEffect(() => {
    if (!sessionId) return;

    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join_group", { group_id: sessionId });
    });

    socket.on("group_updated", (data) => {
      if (data.id === sessionId) {
        setSession(data);
      }
    });

    socket.on("group_checked_out", (data) => {
      navigate(`/track/${data.order_id}`, {
        state: {
          msg: "Group order placed successfully!"
        }
      });
    });

    return () => {
      socket.emit("leave_group", { group_id: sessionId });
      socket.disconnect();
    };
  }, [sessionId, navigate]);

  const loadSession = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await getGroupSession(sessionId);
      setSession(res.data);
      if (res.data.status === "completed" && res.data.order_id) {
        navigate(`/track/${res.data.order_id}`);
      }
      // Load stall menu items
      if (!silent) loadStallMenu(res.data.stall_id);
    } catch (e) {
      if (!silent) setError(e.response?.data?.detail || "Failed to load group session");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Background polling for fallback/sync safety
  useEffect(() => {
    if (!sessionId) return;
    const interval = setInterval(() => {
      loadSession(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [sessionId]);

  const loadStallMenu = async (stallId) => {
    try {
      setMenuLoading(true);
      const res = await getAvailableMenu(stallId);
      // getAvailableMenu returns a grouped dict { category: [items] }
      // Flatten all category arrays into one list
      const grouped = res.data || {};
      const flat = Array.isArray(grouped)
        ? grouped
        : Object.values(grouped).flat();
      setMenuItems(flat);
    } catch (e) {
      console.error("Failed to load menu items", e);
    } finally {
      setMenuLoading(false);
    }
  };

  const fetchBalance = async () => {
    try {
      const res = await getWalletBalance();
      setMyBalance(res.data.balance || 0.0);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateItem = async (menuItemId, currentQty, delta) => {
    const newQty = currentQty + delta;
    try {
      const res = await updateGroupItem(sessionId, {
        menu_item_id: menuItemId,
        qty: newQty,
        customizations: [] // base customizations for simplicity in quick-add
      });
      setSession(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Could not update item");
    }
  };

  const handlePaymentMethodChange = async (method) => {
    try {
      const res = await updateGroupPaymentMethod(sessionId, method);
      setSession(res.data);
    } catch (e) {
      alert(e.response?.data?.detail || "Could not update payment method");
    }
  };

  const handleCheckout = async () => {
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const res = await checkoutGroupSession(sessionId, {
        payment_method: paymentMethod
      });
      navigate(`/track/${res.data.order_id}`);
    } catch (e) {
      setCheckoutError(e.response?.data?.detail || "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50">
        <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-3 text-sm text-zinc-500 font-bold">Synchronizing group cart...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-md mx-auto min-h-screen bg-zinc-50 flex flex-col items-center justify-center px-4 text-center">
        <span className="text-5xl mb-3">⚠️</span>
        <h2 className="text-xl font-black text-zinc-900">Session Error</h2>
        <p className="text-gray-500 text-sm mt-1 mb-6">{error}</p>
        <button
          onClick={() => navigate("/home")}
          className="bg-zinc-900 text-white px-6 py-2.5 rounded-full font-bold text-sm"
        >
          Back to Stalls
        </button>
      </div>
    );
  }

  // Normalize user id — localStorage user_data may use _id or id
  const myUserId = String(user?.id || user?._id || "");
  const isHost = String(session.host_id) === myUserId;

  // Group calculations
  const groupTotal = session.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  // Calculate subtotal per user
  const memberSplits = session.members.reduce((acc, member) => {
    const memberItems = session.items.filter(i => String(i.user_id) === String(member.user_id || member._id));
    const total = memberItems.reduce((s, i) => s + (i.price * i.qty), 0);
    acc[String(member.user_id)] = {
      name: member.name,
      total: total,
      items: memberItems
    };
    return acc;
  }, {});

  const copyRoomCode = () => {
    navigator.clipboard.writeText(session.code);
    alert(`Code ${session.code} copied! Share it with your friends.`);
  };

  return (
    <div className="max-w-md mx-auto min-h-screen bg-white dark:bg-zinc-950 pb-36 transition-colors duration-200">
      {/* Sticky Header */}
      <div className="bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 px-4 py-4 flex items-center justify-between sticky top-0 z-20 shadow-sm transition-colors duration-200">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-black text-zinc-900 dark:text-white leading-tight">Shared Feast</h1>
            <p className="text-xs font-bold text-lime-600">{session.stall_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-lime-100 dark:bg-lime-950/40 text-lime-800 dark:text-lime-400 border border-lime-200 dark:border-lime-900 px-3 py-1.5 rounded-full font-black text-xs">
          Code: <span className="text-zinc-950 dark:text-white font-black tracking-wider ml-0.5">{session.code}</span>
          <button onClick={copyRoomCode} className="ml-1 text-[10px] bg-white dark:bg-zinc-800 border border-lime-300 dark:border-lime-800 rounded px-1 text-lime-800 dark:text-lime-400 hover:bg-lime-50 dark:hover:bg-zinc-700 font-bold">
            Copy
          </button>
        </div>
      </div>

      <div className="px-4 mt-5 space-y-4">
        {/* Connection status banner */}
        <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 rounded-2xl p-3 flex items-center gap-2.5 text-emerald-800 dark:text-emerald-400 text-xs font-bold">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          Live Sync Active: {session.members.length} friends in session
        </div>

        {/* Member list bubble badges */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-4 border border-gray-100 dark:border-zinc-800 shadow-sm transition-colors duration-200">
          <h3 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider mb-2">Connected Feasters</h3>
          <div className="flex flex-wrap gap-2">
            {session.members.map((m, idx) => (
              <span
                key={m.user_id}
                className={`text-xs px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5 ${
                  String(m.user_id) === myUserId
                    ? "bg-zinc-900 dark:bg-lime-500 dark:text-zinc-900 text-white"
                    : "bg-zinc-100 dark:bg-zinc-850 text-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700"
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `hsl(${(idx * 60) % 360}, 70%, 50%)` }}></span>
                {m.name} {String(m.user_id || m._id) === String(session.host_id) && "👑"}
              </span>
            ))}
          </div>
        </div>

        {/* Menu Expandable Drawer / Section (Quick Add) */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm overflow-hidden transition-colors duration-200">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-50 dark:hover:bg-zinc-850/50 transition-all"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-lg">🍔</span>
              <div className="text-left">
                <h3 className="font-black text-sm text-zinc-900 dark:text-white">Add Items to Shared Cart</h3>
                <p className="text-xs text-gray-400 dark:text-zinc-500">Quickly add food from the stall</p>
              </div>
            </div>
            <span className={`text-zinc-400 font-bold transition-all transform ${showMenu ? "rotate-180" : ""}`}>
              ▼
            </span>
          </button>

          {showMenu && (
            <div className="border-t border-gray-50 dark:border-zinc-800 p-4 max-h-72 overflow-y-auto space-y-3">
              {menuLoading ? (
                <div className="text-center py-4 text-xs font-bold text-zinc-400">Loading menu...</div>
              ) : menuItems.length === 0 ? (
                <div className="text-center py-4 text-xs font-bold text-zinc-400">No items available right now.</div>
              ) : (
                menuItems.map((item) => {
                  // Find if currently added by me
                  const myItem = session.items.find(i => String(i.menu_item_id) === String(item.id) && String(i.user_id) === myUserId);
                  const myQty = myItem ? myItem.qty : 0;
                  return (
                    <div key={item.id} className="flex items-center justify-between border-b border-zinc-50 dark:border-zinc-800 pb-2.5 last:border-0 last:pb-0">
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">{item.name}</p>
                        <p className="text-xs text-lime-600 font-bold">₹{item.price}</p>
                      </div>
                      {myQty > 0 ? (
                        <div className="flex items-center gap-2 bg-zinc-950 dark:bg-zinc-800 text-white px-2.5 py-1.5 rounded-full flex-shrink-0">
                          <button onClick={() => handleUpdateItem(item.id, myQty, -1)} className="w-5 text-center font-bold font-mono">-</button>
                          <span className="w-4 text-center font-bold text-xs">{myQty}</span>
                          <button onClick={() => handleUpdateItem(item.id, myQty, 1)} className="w-5 text-center font-bold font-mono text-lime-400">+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUpdateItem(item.id, 0, 1)}
                          className="bg-lime-500 hover:bg-lime-600 text-zinc-900 text-xs font-black px-4 py-1.5 rounded-full transition-all"
                        >
                          + ADD
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Shared Cart Split breakdown */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-4 space-y-4 transition-colors duration-200">
          <h3 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">Group Cart Breakdown</h3>
          
          {session.items.length === 0 ? (
            <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 text-sm font-bold">
              Shared cart is empty. Tap menu button above to add items!
            </div>
          ) : (
            <div className="space-y-4">
              {Object.keys(memberSplits).map((uid) => {
                const split = memberSplits[uid];
                if (split.items.length === 0) return null;
                return (
                  <div key={uid} className="bg-zinc-50 dark:bg-zinc-850 rounded-2xl p-3.5 border border-zinc-150 dark:border-zinc-800">
                    <div className="flex justify-between items-center border-b border-zinc-200/50 dark:border-zinc-850 pb-2 mb-2">
                      <span className="font-black text-sm text-zinc-900 dark:text-white">
                        {split.name} {uid === myUserId ? "(You)" : ""}
                      </span>
                      <span className="font-black text-sm text-lime-700 dark:text-lime-400">₹{split.total.toFixed(0)}</span>
                    </div>
                    <div className="space-y-1">
                      {split.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                          <span>{item.name} × {item.qty}</span>
                          <span>₹{(item.price * item.qty).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Payment and Wallet Details */}
        <div className="bg-white dark:bg-zinc-900 rounded-3xl border border-gray-100 dark:border-zinc-800 shadow-sm p-5 space-y-4 transition-colors duration-200">
          <h3 className="text-xs font-black uppercase text-zinc-400 dark:text-zinc-500 tracking-wider">Payment Details</h3>
          
          {/* Your wallet status */}
          <div className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-850 border border-zinc-150 dark:border-zinc-800 p-3 rounded-2xl">
            <div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-black uppercase">Your Wallet Balance</p>
              <p className="text-sm font-black text-zinc-800 dark:text-white">₹{myBalance.toFixed(2)}</p>
            </div>
            <button
              onClick={() => navigate("/wallet")}
              className="text-[11px] bg-lime-500 hover:bg-lime-600 text-zinc-900 font-black px-3 py-1.5 rounded-full transition-all"
            >
              TOP UP
            </button>
          </div>

          {/* Payment Method Selector (Host only) */}
          {isHost ? (
            <div className="space-y-2">
              <label className="block text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase">Payment Mode</label>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => handlePaymentMethodChange("split")}
                  className={`flex-1 py-3 px-4 rounded-2xl border text-xs font-black transition-all ${
                    paymentMethod === "split"
                      ? "bg-zinc-950 border-zinc-950 text-white shadow-md shadow-zinc-950/20"
                      : "bg-white dark:bg-zinc-800 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  👥 SPLIT PAY
                </button>
                <button
                  type="button"
                  onClick={() => handlePaymentMethodChange("host")}
                  className={`flex-1 py-3 px-4 rounded-2xl border text-xs font-black transition-all ${
                    paymentMethod === "host"
                      ? "bg-zinc-950 border-zinc-950 text-white shadow-md shadow-zinc-950/20"
                      : "bg-white dark:bg-zinc-800 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50"
                  }`}
                >
                  👑 HOST PAYS ALL
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium">
                {paymentMethod === "split" 
                  ? "Every member pays their own share from their wallet." 
                  : "You pay the entire total ₹" + groupTotal.toFixed(0) + " from your wallet."}
              </p>
            </div>
          ) : (
            <div className="bg-zinc-50 dark:bg-zinc-850 rounded-2xl p-3.5 border border-zinc-200/50 dark:border-zinc-800">
              <span className="text-xs font-black text-zinc-400 dark:text-zinc-500 uppercase">Current Checkout Mode</span>
              <p className="text-xs font-bold text-zinc-800 dark:text-white mt-1">
                {paymentMethod === "split" ? "👥 Split Pay (You'll pay your share)" : "👑 Host Pays All (Host will pay for you)"}
              </p>
            </div>
          )}

          {/* Financial summary totals */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-1 flex justify-between font-black text-lg text-zinc-950 dark:text-white">
            <span>Group Total</span>
            <span>₹{groupTotal.toFixed(0)}</span>
          </div>

          {checkoutError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 text-xs font-bold text-rose-700">
              ⚠️ {checkoutError}
            </div>
          )}
        </div>
      </div>

      {/* Sticky Action Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border-t border-gray-100 dark:border-zinc-800 p-4 transition-colors duration-200">
        <div className="max-w-md mx-auto">
          {isHost ? (
            <button
              onClick={handleCheckout}
              disabled={checkingOut || session.items.length === 0}
              className="w-full py-4 bg-lime-500 hover:bg-lime-600 active:scale-[0.98] disabled:opacity-60 text-zinc-900 font-black rounded-2xl text-base shadow-xl shadow-lime-500/25 transition-all flex items-center justify-center gap-2"
            >
              {checkingOut ? (
                <>
                  <div className="w-5 h-5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                  Placing Group Order…
                </>
              ) : (
                <>
                  🛒 Place Group Order · ₹{groupTotal.toFixed(0)}
                </>
              )}
            </button>
          ) : (
            <div className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4 rounded-2xl text-center text-xs font-bold text-zinc-500 dark:text-zinc-400">
              ⏳ Waiting for the Host to place the order... Keep adding items!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
