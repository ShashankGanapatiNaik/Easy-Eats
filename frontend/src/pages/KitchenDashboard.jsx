import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { getStall, toggleStall, stallOrders, SOCKET_URL } from "../api";
import OrderCard      from "../components/dashboard/OrderCard";
import MenuManager    from "../components/dashboard/MenuManager";
import KitchenInsights from "../components/dashboard/KitchenInsights";

const ACTIVE = ["Placed","Accepted","Preparing","Almost Ready","Ready"];

function fmt(iso) {
  return iso
    ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
}

export default function KitchenDashboard() {
  const navigate    = useNavigate();
  const { id: stallId } = useParams();
  
  const [tab,          setTab]         = useState("orders");
  const [stall,        setStall]       = useState(null);

  const stallLabel  = stall?.name || "My Stall";
  const [orders,       setOrders]      = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [newOrderIds,  setNewOrderIds] = useState(new Set());
  const [filterStatus, setFilter]      = useState("active");
  const [search,       setSearch]      = useState("");
  const [lastUpdated,  setLastUpdated] = useState(null);
  const prevIds  = useRef(new Set());
  const audioRef = useRef(null);
  const pollRef  = useRef(null);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!stallId) { 
      navigate("/admin");
      return; 
    }
    setLoading(true);
    loadAll();
    pollRef.current = setInterval(() => fetchOrders(true), 5000);
    return () => clearInterval(pollRef.current);
  }, [stallId]);

  // ── Socket.IO — stall room for instant cross-device updates ────────────
  useEffect(() => {
    if (!stallId) return;
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });
    socket.on("connect", () => {
      socket.emit("join_stall", { stall_id: stallId });
    });
    socket.on("order_status_updated", () => {
      // Re-fetch orders silently when any order in this stall changes
      fetchOrders(true);
    });
    return () => socket.disconnect();
  }, [stallId]);

  const loadAll = async () => {
    try {
      const [stallRes, ordersRes] = await Promise.all([
        getStall(stallId),
        stallOrders(stallId),
      ]);
      setStall(stallRes.data);
      setOrders(ordersRes.data);
      prevIds.current = new Set(ordersRes.data.map((o) => o.id));
      setLastUpdated(new Date());
    } catch {}
    finally { setLoading(false); }
  };

  const fetchOrders = async (silent = false) => {
    if (!stallId) return;
    try {
      const res     = await stallOrders(stallId);
      const fetched = res.data;
      // Detect new Placed orders for sound + highlight
      const brandNew = fetched
        .filter((o) => !prevIds.current.has(o.id) && o.status === "Placed")
        .map((o) => o.id);
      if (brandNew.length > 0) {
        setNewOrderIds((prev) => new Set([...prev, ...brandNew]));
        audioRef.current?.play().catch(() => {});
        setTimeout(() => {
          setNewOrderIds((prev) => {
            const next = new Set(prev);
            brandNew.forEach((id) => next.delete(id));
            return next;
          });
        }, 6000);
      }
      prevIds.current = new Set(fetched.map((o) => o.id));
      setOrders(fetched);
      setLastUpdated(new Date());
    } catch {}
  };

  const handleToggleStall = async () => {
    try {
      const res = await toggleStall(stallId);
      setStall((prev) => ({ ...prev, is_open: res.data.is_open }));
    } catch {}
  };

  // Called from OrderCard when status advances
  const handleOrderUpdated = (updated) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === updated.id ? { ...o, ...updated } : o))
    );
  };

  // Called from OrderCard delete button
  const handleOrderDeleted = (orderId) => {
    setOrders((prev) => prev.filter((o) => o.id !== orderId));
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_data");
    navigate("/");
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const activeCount   = orders.filter((o) => ACTIVE.includes(o.status)).length;
  const pendingCount  = orders.filter((o) => o.status === "Placed").length;
  const readyCount    = orders.filter((o) => o.status === "Ready").length;

  const displayOrders = orders
    .filter((o) => {
      const matchStatus =
        filterStatus === "active"
          ? ACTIVE.includes(o.status)
          : o.status === filterStatus;
      const matchSearch =
        search === "" ||
        String(o.id).toLowerCase().includes(search.toLowerCase()) ||
        o.items?.some((i) => i.name.toLowerCase().includes(search.toLowerCase()));
      return matchStatus && matchSearch;
    })
    .sort((a, b) => new Date(a.placed_at) - new Date(b.placed_at));

  if (loading) return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 text-white px-4 py-3 sticky top-0 z-30
                      flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/admin")}
            className="w-8 h-8 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-full transition-colors mr-2"
          >
            ←
          </button>
          {/* Open/Close pill */}
          <button
            onClick={handleToggleStall}
            className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors ${
              stall?.is_open ? "bg-lime-400 animate-pulse" : "bg-red-400"
            }`}
          />
          <div>
            <h1 className="font-bold text-sm leading-tight">{stallLabel}</h1>
            <p className="text-zinc-400 text-xs">
              {stall?.is_open ? "Open · " : "Closed · "}
              {lastUpdated ? `Synced ${fmt(lastUpdated.toISOString())}` : "Loading…"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleToggleStall}
            className={`text-xs font-bold px-4 py-1.5 rounded-full transition-all ${
              stall?.is_open
                ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                : "bg-lime-500/20 text-lime-300 hover:bg-lime-500/30"
            }`}
          >
            {stall?.is_open ? "Close Stall" : "Open Stall"}
          </button>
          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-red-400 text-xs px-2 transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      {/* ── Stats Strip ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 py-3
                      grid grid-cols-3 gap-0 divide-x divide-gray-100">
        {[
          { label: "Active",  value: activeCount,  color: "text-lime-600"  },
          { label: "Pending", value: pendingCount, color: "text-amber-500" },
          { label: "Ready",   value: readyCount,   color: "text-blue-600"  },
        ].map((s) => (
          <div key={s.label} className="text-center py-1">
            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 font-medium">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-100 px-4 flex gap-1 sticky top-[57px] z-20 overflow-x-auto scrollbar-hide">
        {[
          { key: "orders",   label: `🍳 Orders${activeCount > 0 ? ` (${activeCount})` : ""}` },
          { key: "menu",     label: "🍽️ Menu" },
          { key: "insights", label: "📊 Insights" },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`py-3 px-4 text-sm font-bold border-b-2 transition-all whitespace-nowrap ${
              tab === key
                ? "border-lime-500 text-lime-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 max-w-2xl mx-auto xl:max-w-5xl">

        {/* ══════════════════════════════════════════════════════════════
            ORDERS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "orders" && (
          <div className="space-y-4">

            {/* Search + filter row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by order ID or item…"
                  className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                             outline-none focus:border-lime-500 transition-all bg-white"
                />
              </div>
              <button
                onClick={() => fetchOrders(true)}
                className="px-3 py-2.5 border border-gray-200 rounded-xl text-gray-400
                           hover:text-zinc-900 hover:border-gray-300 transition-all text-sm"
                title="Refresh"
              >
                ↻
              </button>
            </div>

            {/* Status filter pills */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
              {[
                { key: "active",    label: `🔥 Active (${activeCount})` },
                { key: "Placed",    label: "Placed" },
                { key: "Preparing", label: "Preparing" },
                { key: "Ready",     label: "Ready" },
                { key: "Collected", label: "Collected" },
                { key: "Cancelled", label: "Cancelled" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setFilter(key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap
                              flex-shrink-0 transition-all ${
                    filterStatus === key
                      ? "bg-zinc-900 text-white"
                      : "bg-white border border-gray-200 text-gray-500 hover:border-lime-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Auto-refresh indicator */}
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-1.5 h-1.5 bg-lime-500 rounded-full animate-pulse" />
              Auto-refreshing every 10s
            </div>

            {/* Order cards grid */}
            {displayOrders.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-5xl mb-3">🧑‍🍳</p>
                <p className="font-semibold text-lg">
                  {filterStatus === "active" ? "No active orders right now" : `No ${filterStatus} orders`}
                </p>
                <p className="text-sm mt-1">New orders appear automatically</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {displayOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    isNew={newOrderIds.has(order.id)}
                    onUpdated={handleOrderUpdated}
                    onDeleted={handleOrderDeleted}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            MENU TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "menu" && (
          <div className="space-y-4">
            {/* Stall status banner */}
            <div className={`rounded-2xl p-4 border flex items-center justify-between ${
              stall?.is_open
                ? "bg-lime-50 border-lime-200"
                : "bg-red-50 border-red-200"
            }`}>
              <div>
                <p className={`font-bold text-sm ${stall?.is_open ? "text-lime-800" : "text-red-700"}`}>
                  {stall?.is_open ? "🟢 Stall is Open" : "🔴 Stall is Closed"}
                </p>
                <p className={`text-xs mt-0.5 ${stall?.is_open ? "text-lime-600" : "text-red-500"}`}>
                  {stall?.is_open
                    ? "Students can browse and order from your stall"
                    : "Students cannot place orders right now"}
                </p>
              </div>
              <button
                onClick={handleToggleStall}
                className={`text-xs font-bold px-4 py-2 rounded-full transition-all ${
                  stall?.is_open
                    ? "bg-red-100 text-red-600 hover:bg-red-200"
                    : "bg-lime-500 text-zinc-900 hover:bg-lime-600"
                }`}
              >
                {stall?.is_open ? "Close Stall" : "Open Stall"}
              </button>
            </div>

            <MenuManager
              stallId={stallId}
              categories={stall?.menu_categories || ["Popular"]}
            />
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            INSIGHTS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "insights" && (
          <KitchenInsights stallId={stallId} orders={orders} />
        )}
      </div>
    </div>
  );
}
