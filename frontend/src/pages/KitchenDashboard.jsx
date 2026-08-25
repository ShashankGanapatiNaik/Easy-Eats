import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import { getStall, toggleStall, stallOrders, SOCKET_URL } from "../api";
import { useTheme } from "../context/ThemeContext";
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
  const { theme, toggleTheme } = useTheme();
  
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center">
      <div className="w-12 h-12 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mb-3" />
      <p className="text-xs font-bold text-zinc-400">Loading Kitchen Live Dashboard...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200 pb-20">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <header className="bg-zinc-900/95 dark:bg-zinc-900/90 backdrop-blur-md text-white px-4 py-3 sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const u = (() => { try { return JSON.parse(localStorage.getItem("user_data") || "{}"); } catch { return {}; } })();
              if (u.role === "admin") {
                navigate("/admin");
              } else if (window.history.length > 2) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            className="w-9 h-9 flex items-center justify-center bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all text-zinc-300 hover:text-white font-bold"
            title="Go Back"
          >
            ←
          </button>
          
          {/* Open/Close status indicator */}
          <button
            onClick={handleToggleStall}
            className={`w-3 h-3 rounded-full flex-shrink-0 transition-colors ${
              stall?.is_open ? "bg-lime-400 animate-pulse" : "bg-rose-500"
            }`}
            title={stall?.is_open ? "Stall is Open" : "Stall is Closed"}
          />

          <div>
            <h1 className="font-black text-sm sm:text-base leading-tight tracking-tight">{stallLabel}</h1>
            <p className="text-zinc-400 text-[11px] font-medium flex items-center gap-1.5">
              <span className={stall?.is_open ? "text-lime-400 font-bold" : "text-rose-400 font-bold"}>
                {stall?.is_open ? "OPEN" : "CLOSED"}
              </span>
              <span>•</span>
              <span>{lastUpdated ? `Synced ${fmt(lastUpdated.toISOString())}` : "Loading…"}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stall Toggle button */}
          <button
            onClick={handleToggleStall}
            className={`text-xs font-black px-3.5 py-1.5 rounded-xl transition-all ${
              stall?.is_open
                ? "bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30"
                : "bg-lime-500/20 text-lime-300 hover:bg-lime-500/30 border border-lime-500/30"
            }`}
          >
            {stall?.is_open ? "Close Stall" : "Open Stall"}
          </button>

          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 flex items-center justify-center text-sm transition-all hover:scale-105 active:scale-95"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-rose-400 text-xs font-bold px-2 py-1.5 transition-all"
          >
            Logout
          </button>
        </div>
      </header>

      {/* ── Stats Cards Grid ───────────────────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200/80 dark:border-zinc-800/80 px-4 py-3 transition-colors">
        <div className="max-w-2xl mx-auto xl:max-w-5xl grid grid-cols-3 gap-3">
          <div className="bg-lime-500/10 dark:bg-lime-500/10 border border-lime-500/20 rounded-2xl p-3 text-center transition-all">
            <p className="text-2xl sm:text-3xl font-black text-lime-600 dark:text-lime-400">{activeCount}</p>
            <p className="text-[11px] font-bold text-lime-700 dark:text-lime-300 uppercase tracking-wider mt-0.5">Active</p>
          </div>
          <div className="bg-amber-500/10 dark:bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3 text-center transition-all">
            <p className="text-2xl sm:text-3xl font-black text-amber-500 dark:text-amber-400">{pendingCount}</p>
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-300 uppercase tracking-wider mt-0.5">Pending</p>
          </div>
          <div className="bg-blue-500/10 dark:bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 text-center transition-all">
            <p className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">{readyCount}</p>
            <p className="text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider mt-0.5">Ready</p>
          </div>
        </div>
      </div>

      {/* ── Tab Bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white/95 dark:bg-zinc-900/90 backdrop-blur-md border-b border-zinc-200/80 dark:border-zinc-800 px-4 sticky top-[61px] z-20 overflow-x-auto scrollbar-hide">
        <div className="max-w-2xl mx-auto xl:max-w-5xl flex gap-2">
          {[
            { key: "orders",   label: `🍳 Orders${activeCount > 0 ? ` (${activeCount})` : ""}` },
            { key: "menu",     label: "🍽️ Menu Management" },
            { key: "insights", label: "📊 Sales & Insights" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`py-3.5 px-5 text-xs font-black border-b-2 transition-all whitespace-nowrap ${
                tab === key
                  ? "border-lime-500 text-lime-600 dark:text-lime-400"
                  : "border-transparent text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto xl:max-w-5xl">

        {/* ══════════════════════════════════════════════════════════════
            ORDERS TAB
        ══════════════════════════════════════════════════════════════ */}
        {tab === "orders" && (
          <div className="space-y-5">

            {/* Search + refresh row */}
            <div className="flex gap-2.5">
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by order ID or item..."
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium outline-none focus:border-lime-500 dark:focus:border-lime-400 text-zinc-900 dark:text-white placeholder-zinc-400 transition-all shadow-sm"
                />
              </div>
              <button
                onClick={() => fetchOrders(true)}
                className="px-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-lime-500 transition-all text-xs font-bold shadow-sm flex items-center gap-1.5"
                title="Refresh orders"
              >
                <span>↻</span> Refresh
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
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex-shrink-0 transition-all ${
                    filterStatus === key
                      ? "bg-zinc-900 text-white dark:bg-lime-500 dark:text-zinc-950 shadow-md"
                      : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-lime-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Auto-refresh status bar */}
            <div className="flex items-center justify-between text-xs text-zinc-400 px-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-lime-500 rounded-full animate-pulse" />
                <span className="font-semibold text-[11px]">Live order sync active (5s)</span>
              </div>
              <span className="text-[11px] font-medium">Showing {displayOrders.length} order{displayOrders.length !== 1 ? "s" : ""}</span>
            </div>

            {/* Order cards grid */}
            {displayOrders.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-zinc-900/60 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 p-8 shadow-sm">
                <p className="text-5xl mb-3">🧑‍🍳</p>
                <p className="font-extrabold text-lg text-zinc-900 dark:text-white">
                  {filterStatus === "active" ? "No active orders right now" : `No ${filterStatus} orders`}
                </p>
                <p className="text-zinc-500 dark:text-zinc-400 text-xs mt-1">New incoming orders will appear here automatically with audio alert</p>
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
          <div className="space-y-5">
            {/* Stall status banner */}
            <div className={`rounded-3xl p-5 border flex items-center justify-between shadow-sm transition-all ${
              stall?.is_open
                ? "bg-lime-500/10 border-lime-500/30 text-lime-900 dark:text-lime-200"
                : "bg-rose-500/10 border-rose-500/30 text-rose-900 dark:text-rose-200"
            }`}>
              <div className="space-y-1">
                <p className={`font-extrabold text-sm flex items-center gap-2 ${stall?.is_open ? "text-lime-700 dark:text-lime-300" : "text-rose-700 dark:text-rose-300"}`}>
                  <span>{stall?.is_open ? "🟢 Stall is Open for Orders" : "🔴 Stall is Currently Closed"}</span>
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {stall?.is_open
                    ? "Students can browse your menu and place new orders online."
                    : "Your menu is paused; students cannot place orders right now."}
                </p>
              </div>
              <button
                onClick={handleToggleStall}
                className={`text-xs font-black px-4 py-2.5 rounded-xl transition-all shadow-sm ${
                  stall?.is_open
                    ? "bg-rose-500 hover:bg-rose-600 text-white"
                    : "bg-lime-500 hover:bg-lime-400 text-zinc-950"
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

