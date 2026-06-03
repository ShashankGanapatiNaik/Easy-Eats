import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { getStalls, updateProfile, sendOtp, getOrderHistory, submitReview, getNotifications, markAllNotificationsRead, SOCKET_URL } from "../api";
import { useCart } from "../context/CartContext";
import logo from "../assets/logo.svg";
import WalletWidget from "../components/ai/WalletWidget";
import OTPModal from "../components/OTPModal";
import { io } from "socket.io-client";

function CrowdBadge({ density }) {
  if (!density) return null;
  const { crowd_level, estimated_wait_min } = density;
  
  let colorClass = "";
  let dotColor = "";
  
  if (crowd_level === "Low") {
    colorClass = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    dotColor = "bg-emerald-400";
  } else if (crowd_level === "Medium") {
    colorClass = "bg-amber-500/20 text-amber-400 border-amber-500/30";
    dotColor = "bg-amber-400";
  } else {
    colorClass = "bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse";
    dotColor = "bg-rose-400";
  }

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md shadow-sm ${colorClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} ${crowd_level === "High" ? "animate-ping" : ""}`} />
      <span>{crowd_level} Crowd • {estimated_wait_min} min</span>
    </div>
  );
}

const CUISINE_FILTERS = ["All", "Snacks", "Burgers", "Coffee", "Meals", "Desserts", "Drinks"];

export default function Home() {
  const navigate = useNavigate();
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState("All");
  const [showProfile, setShowProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [saving, setSaving] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);

  // ── Order History State ─────────────────────────────────────────────────────
  const { reorderItems } = useCart();
  const [profileTab, setProfileTab] = useState("info"); // "info" | "history"
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState("");
  const [reviewingId, setReviewingId] = useState(null);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const user = (() => { try { return JSON.parse(localStorage.getItem("user_data") || "{}"); } catch { return {}; } })();
  const [profile, setProfile] = useState({
    name: user.name || localStorage.getItem("profile_name") || "",
    email: user.email || "",
    phone: user.phone || localStorage.getItem("profile_phone") || "",
  });
  const [editForm, setEditForm] = useState({ ...profile });

  useEffect(() => { loadStalls(); }, [active]);

  const fetchNotifications = async () => {
    if (user.role !== "student") return;
    try {
      const res = await getNotifications({ unread_only: true });
      const list = res.data || [];
      setNotifs(list);
      
      const lastOpened = parseInt(localStorage.getItem("last_opened_notif") || "0");
      const unread = list.filter(n => new Date(n.sent_at).getTime() > lastOpened).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    }
  };

  useEffect(() => {
    if (user.role !== "student") return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 8000);
    return () => clearInterval(interval);
  }, []);

  const loadStalls = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const params = {};
      if (active !== "All") params.cuisine = active;
      const res = await getStalls(params);
      setStalls(res.data || []);
    } catch (e) {
      if (!silent) setError(e.response?.data?.detail || e.message || "Cannot connect to server");
      setStalls([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    // Socket.IO connection for real-time queue updates
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socket.on("queue_update", (data) => {
      setStalls((prevStalls) =>
        prevStalls.map((s) =>
          s.id === data.stall_id
            ? { ...s, queue_density: data.queue_density }
            : s
        )
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    // Background polling for safety/fallback
    const interval = setInterval(() => {
      loadStalls(true);
    }, 12000);
    return () => clearInterval(interval);
  }, [active]);

  const filtered = stalls.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const getInitial = () => {
    if (profile.name) return profile.name.charAt(0).toUpperCase();
    if (profile.email) return profile.email.charAt(0).toUpperCase();
    return "U";
  };

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const parsePhone = (ph) => {
    if (!ph) return { code: "+91", number: "" };
    if (ph.startsWith("+91")) return { code: "+91", number: ph.slice(3) };
    if (ph.startsWith("+1")) return { code: "+1", number: ph.slice(2) };
    if (ph.startsWith("+44")) return { code: "+44", number: ph.slice(3) };
    if (ph.startsWith("+971")) return { code: "+971", number: ph.slice(4) };
    return { code: "+91", number: ph.replace(/\D/g, "") };
  };

  const handleSaveProfile = async () => {
    setUpdateError("");

    // Check if phone changed
    const phoneChanged = editForm.phone.trim() !== profile.phone.trim();

    if (phoneChanged) {
      // Validate phone number digits
      const parsed = parsePhone(editForm.phone);
      if (parsed.number.length !== 10) {
        setUpdateError("Please enter a valid 10-digit mobile number.");
        return;
      }

      const fullPhone = `${parsed.code}${parsed.number}`;
      setEditForm(prev => ({ ...prev, phone: fullPhone }));
      setIsOtpModalOpen(true);
    } else {
      // Direct update
      setSaving(true);
      try {
        const res = await updateProfile({ name: editForm.name });
        // Update local storage user_data
        const updatedUser = { ...user, ...res.data.user };
        localStorage.setItem("user_data", JSON.stringify(updatedUser));

        setProfile({
          name: res.data.user.name,
          email: res.data.user.email,
          phone: res.data.user.phone || "",
        });
        setIsEditing(false);
      } catch (err) {
        setUpdateError(err.response?.data?.detail || "Failed to update profile.");
      } finally {
        setSaving(false);
      }
    }
  };

  const handleProfileOtpVerified = async (idToken) => {
    setIsOtpModalOpen(false);
    setSaving(true);
    try {
      const res = await updateProfile({
        name: editForm.name,
        phone: editForm.phone,
        firebase_token: idToken
      });
      // Update local storage user_data
      const updatedUser = { ...user, ...res.data.user };
      localStorage.setItem("user_data", JSON.stringify(updatedUser));

      setProfile({
        name: res.data.user.name,
        email: res.data.user.email,
        phone: res.data.user.phone || "",
      });
      setIsEditing(false);
    } catch (err) {
      setUpdateError(err.response?.data?.detail || "Failed to update profile after verification.");
    } finally {
      setSaving(false);
    }
  };

  // ── Order History Functions ─────────────────────────────────────────────────
  const loadOrderHistory = async () => {
    setOrdersLoading(true);
    try {
      const res = await getOrderHistory();
      setOrders(res.data || []);
    } catch { setOrders([]); }
    finally { setOrdersLoading(false); }
  };

  useEffect(() => {
    if (showProfile && profileTab === "history" && orders.length === 0) {
      loadOrderHistory();
    }
  }, [showProfile, profileTab]);

  const filteredOrders = orders.filter((o) => {
    if (!orderSearch) return true;
    const q = orderSearch.toLowerCase();
    const nameMatch = (o.restaurant_name || "").toLowerCase().includes(q);
    const itemMatch = o.items?.some((it) => (it.name || "").toLowerCase().includes(q));
    return nameMatch || itemMatch;
  });

  const handleReorder = (order) => {
    reorderItems(order.items, order.stall_id, order.restaurant_name);
    setShowProfile(false);
    navigate("/cart");
  };

  const handleSubmitReview = async (order) => {
    if (reviewRating < 1) return;
    setReviewSubmitting(true);
    try {
      await submitReview(order.stall_id, {
        rating: reviewRating,
        comment: reviewComment || null,
        order_id: order.id,
      });
      setOrders((prev) => prev.map((o) => o.id === order.id ? { ...o, is_reviewed: true } : o));
      setReviewingId(null);
      setReviewRating(0);
      setReviewComment("");
    } catch { }
    finally { setReviewSubmitting(false); }
  };

  const generateInvoiceHTML = (order) => {
    const itemsRows = order.items.map((it) =>
      `<tr><td style="padding:8px 0;border-bottom:1px solid #f3f4f6">${it.qty}× ${it.name}</td><td style="padding:8px 0;border-bottom:1px solid #f3f4f6;text-align:right">₹${it.subtotal}</td></tr>`
    ).join("");
    return `<!DOCTYPE html><html><head><title>Invoice - Easy Eats</title><style>body{font-family:'Segoe UI',sans-serif;max-width:420px;margin:40px auto;padding:20px;color:#18181b}h1{font-size:24px;margin:0}h2{font-size:14px;color:#71717a;margin:4px 0 24px}.info{display:flex;justify-content:space-between;margin:6px 0;font-size:13px;color:#52525b}.total{display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-top:12px;padding-top:12px;border-top:2px solid #18181b}table{width:100%;border-collapse:collapse;margin:16px 0}th{text-align:left;padding:8px 0;border-bottom:2px solid #e5e7eb;font-size:13px;color:#71717a}td{font-size:14px}@media print{body{margin:0;padding:16px}}</style></head><body><h1>🍽️ Easy Eats</h1><h2>Order Invoice</h2><div class="info"><span>Order ID</span><span>#${order.id.slice(-6).toUpperCase()}</span></div><div class="info"><span>Restaurant</span><span>${order.restaurant_name}</span></div><div class="info"><span>Date</span><span>${new Date(order.placed_at).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div><div class="info"><span>Pickup Code</span><span style="font-weight:bold;font-size:16px">${order.pickup_code}</span></div><table><thead><tr><th>Item</th><th style="text-align:right">Amount</th></tr></thead><tbody>${itemsRows}</tbody></table><div class="total"><span>Total</span><span>₹${order.total}</span></div><p style="text-align:center;margin-top:32px;font-size:11px;color:#a1a1aa">Thank you for ordering with Easy Eats! 🎓</p></body></html>`;
  };

  const handleDownloadInvoice = (order) => {
    const html = generateInvoiceHTML(order);
    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="max-w-md md:max-w-3xl xl:max-w-7xl mx-auto min-h-screen bg-zinc-50 pb-24">
      <div className="px-4 md:px-6 xl:px-8 pt-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logo} alt="Easy Eats" className="w-12 h-12 object-contain" />
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Easy Eats</h1>
              <p className="text-sm text-gray-400">Pick up faster on campus</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <WalletWidget compact />
            
            {/* Animated Notification Bell Dropdown */}
            {user.role === "student" && (
              <div className="relative">
                <button 
                  onClick={() => {
                    setShowNotifDropdown(!showNotifDropdown);
                    if (!showNotifDropdown) {
                      setUnreadCount(0);
                      localStorage.setItem("last_opened_notif", Date.now().toString());
                    }
                  }}
                  className={`w-10 h-10 rounded-full bg-white border border-gray-200 text-zinc-700 hover:text-zinc-950 flex items-center justify-center shadow-sm hover:scale-105 transition-all relative ${unreadCount > 0 ? "animate-wiggle" : ""}`}
                >
                  <span className="text-xl">🔔</span>
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-white animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>

                {showNotifDropdown && (
                  <div 
                    className="absolute right-0 mt-3 w-80 bg-white/95 backdrop-blur-md border border-gray-100 shadow-2xl rounded-3xl p-4 z-[100] animate-slide-up"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex justify-between items-center mb-3 pb-2 border-b border-gray-50">
                      <h3 className="font-bold text-zinc-900 text-sm">Notifications</h3>
                      {notifs.length > 0 && (
                        <button 
                          onClick={async () => {
                            try {
                              setNotifs([]);
                              setUnreadCount(0);
                              await markAllNotificationsRead();
                              localStorage.setItem("last_opened_notif", Date.now().toString());
                              fetchNotifications();
                            } catch {}
                          }}
                          className="text-xs font-bold text-lime-600 hover:text-lime-700 hover:underline"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="space-y-3 max-h-64 overflow-y-auto scrollbar-hide">
                      {notifs.length === 0 ? (
                        <p className="text-center text-xs text-gray-400 py-6">No notifications yet 🍔</p>
                      ) : (
                        notifs.map((n) => {
                          const isReady = n.type === "order_ready";
                          const isNew = new Date(n.sent_at).getTime() > parseInt(localStorage.getItem("last_opened_notif") || "0");
                          return (
                            <div 
                              key={n.id} 
                              onClick={() => {
                                setShowNotifDropdown(false);
                                navigate(`/track/${n.order_id}`);
                              }}
                              className={`p-3 rounded-2xl text-left transition-all cursor-pointer flex gap-2.5 items-start border ${isNew ? "bg-lime-50/50 border-lime-200" : "bg-white border-transparent hover:bg-gray-50/50"}`}
                            >
                              <span className="text-xl flex-shrink-0">{isReady ? "🎉" : "🍔"}</span>
                              <div className="flex-1 min-w-0">
                                <p className="font-bold text-xs text-zinc-900 leading-tight">
                                  {isReady ? "Your Order is Ready!" : "Order Confirmed"}
                                </p>
                                <p className="text-[11px] text-gray-500 mt-1 leading-normal truncate">
                                  {n.message.split("\n\n").slice(1).join(" ") || n.message}
                                </p>
                                <span className="text-[9px] text-gray-400 mt-1 block">
                                  {new Date(n.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                </span>
                              </div>
                              {isNew && <span className="w-1.5 h-1.5 rounded-full bg-lime-500 flex-shrink-0 mt-1.5" />}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setShowProfile(true)}
              className="w-10 h-10 rounded-full bg-zinc-900 text-white font-bold
                         flex items-center justify-center shadow-md hover:scale-105 transition-transform">
              {getInitial()}
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-5">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input type="text" placeholder="Search stalls or cuisine…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-white rounded-2xl pl-12 pr-4 py-4 shadow-sm border
                       border-gray-200 outline-none focus:ring-2 focus:ring-lime-500/50
                       focus:border-lime-500 transition-all"/>
        </div>

        {/* Promo banners */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 text-white rounded-3xl
                          p-5 row-span-2 min-h-[190px] flex flex-col justify-between shadow-lg relative overflow-hidden">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-lime-500 rounded-full opacity-30 blur-xl" />
            <div className="relative z-10">
              <p className="text-sm text-white/70 font-medium">Today's Offer</p>
              <h2 className="text-3xl font-bold mt-2">Flat 20% Off</h2>
            </div>
            <p className="relative z-10 text-xs bg-white/20 px-3 py-1.5 rounded-full w-fit">Pickup orders only</p>
          </div>
          <div className="bg-white rounded-3xl p-4 min-h-[90px] shadow-sm border border-gray-100 flex flex-col justify-between">
            <p className="text-sm text-gray-500 font-medium">Bonus Deal</p>
            <h3 className="font-bold text-lg text-zinc-900">Free Coffee ☕</h3>
          </div>
          <div className="bg-gradient-to-br from-lime-400 to-lime-500 text-black rounded-3xl p-4 min-h-[90px] shadow-sm flex flex-col justify-between">
            <p className="text-sm font-medium opacity-80">Fast Lane</p>
            <h3 className="font-bold text-lg">Ready in 5 min</h3>
          </div>
        </div>

        {/* Cuisine filter */}
        <div className="flex gap-3 overflow-x-auto mt-6 pb-2 scrollbar-hide">
          {CUISINE_FILTERS.map(item => (
            <button key={item} onClick={() => setActive(item)}
              className={`px-5 py-2.5 rounded-full whitespace-nowrap font-medium transition-all ${active === item
                  ? "bg-zinc-900 text-white shadow-md"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}>
              {item}
            </button>
          ))}
        </div>
      </div>

      {/* Stall cards */}
      <div className="px-4 md:px-6 xl:px-8 mt-6 space-y-5">

        {/* Error state */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-3">
            <span className="text-xl flex-shrink-0">⚠️</span>
            <div>
              <p className="font-bold text-red-700 text-sm">Could not load stalls</p>
              <p className="text-red-500 text-xs mt-0.5">{error}</p>
              <p className="text-red-400 text-xs mt-1">
                Make sure backend is running: <code className="bg-red-100 px-1 rounded">uvicorn app.main:app --reload</code>
              </p>
              <button onClick={loadStalls}
                className="mt-2 text-xs bg-red-500 text-white px-3 py-1.5 rounded-lg font-bold">
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Loading */}
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100 animate-pulse">
            <div className="w-full h-44 bg-gray-200" />
            <div className="p-5 space-y-3">
              <div className="h-5 bg-gray-200 rounded w-2/3" />
              <div className="h-4 bg-gray-100 rounded w-1/3" />
            </div>
          </div>
        ))}

        {/* Empty */}
        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🏪</p>
            <p className="text-gray-400 text-lg font-medium">No stalls found</p>
            <p className="text-gray-300 text-sm mt-1">
              {stalls.length === 0 ? "Run seed_demo.py to add demo data" : "Try a different filter"}
            </p>
          </div>
        )}

        {/* Stall cards */}
        {!loading && filtered.map(stall => (
          <div key={stall.id} onClick={() => navigate("/restaurant/" + stall.id)}
            className="group bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100
                       cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
            <div className="w-full h-44 overflow-hidden relative">
              <img
                src={stall.hero_image_url || "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80"}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                alt={stall.name} />
              {!stall.is_open && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <span className="bg-red-500 text-white text-sm font-bold px-4 py-2 rounded-full">Closed</span>
                </div>
              )}
              {stall.is_open && (
                <span className="absolute top-3 left-3 bg-lime-500 text-zinc-900 text-xs font-bold px-2.5 py-1 rounded-full">Open</span>
              )}
              {stall.is_open && stall.queue_density && (
                <div className="absolute top-3 right-3 z-10">
                  <CrowdBadge density={stall.queue_density} />
                </div>
              )}
            </div>
            <div className="p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 group-hover:text-lime-600 transition-colors">{stall.name}</h3>
                  <p className="text-sm text-gray-500 mt-0.5">{stall.cuisine_type}</p>
                  {stall.location_label && <p className="text-xs text-gray-400 mt-0.5">{stall.location_label}</p>}
                  
                  {/* Live Crowd Intelligence Row */}
                  {stall.is_open && stall.queue_density && (
                    <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
                      {stall.queue_density.fast_pickup && (
                        <span className="bg-emerald-500/10 text-emerald-600 font-extrabold px-2 py-0.5 rounded border border-emerald-500/25">
                          ⚡ Fast Pickup
                        </span>
                      )}
                      {stall.queue_density.is_rush_hour && (
                        <span className="bg-rose-500/10 text-rose-600 font-extrabold px-2 py-0.5 rounded border border-rose-500/25 animate-pulse">
                          🔥 Rush Hour
                        </span>
                      )}
                      <span className="bg-zinc-100 text-zinc-500 font-bold px-2 py-0.5 rounded">
                        🕒 Best Time: {stall.queue_density.best_time_to_order}
                      </span>
                    </div>
                  )}
                </div>
                {stall.avg_rating > 0 && (
                  <div className="bg-lime-50 text-lime-700 border border-lime-100 px-2.5 py-1.5 rounded-xl text-sm font-bold">
                    ⭐ {stall.avg_rating.toFixed(1)}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 mt-4 pt-4 flex justify-between items-center text-sm">
                <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 px-2.5 py-1 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {stall.estimated_pickup_min}–{stall.estimated_pickup_min + 3} min
                </div>
                <p className="text-lime-600 font-bold">Pickup Ready</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Profile Modal */}
      {showProfile && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => { setShowProfile(false); setIsEditing(false); setProfileTab("info"); }}>
          <div className={`bg-white w-full rounded-t-3xl md:rounded-3xl shadow-2xl flex flex-col transition-all duration-300 ${profileTab === "history" ? "md:max-w-3xl max-h-[90vh]" : "md:max-w-md max-h-[85vh]"
            }`}
            onClick={e => e.stopPropagation()}>

            {/* Modal Header with Tabs */}
            <div className="flex-shrink-0 p-5 pb-0">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-zinc-900">My Profile</h2>
                <button onClick={() => { setShowProfile(false); setProfileTab("info"); }}
                  className="bg-gray-100 p-2 rounded-full text-gray-500 hover:bg-gray-200 transition-colors">✕</button>
              </div>
              {/* Tab Pills */}
              <div className="flex bg-gray-100 rounded-2xl p-1 gap-1">
                <button onClick={() => setProfileTab("info")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${profileTab === "info" ? "bg-white text-zinc-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  👤 Profile
                </button>
                <button onClick={() => setProfileTab("history")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${profileTab === "history" ? "bg-white text-zinc-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}>
                  📦 Order History
                </button>
              </div>
            </div>

            {/* Tab Content — scrollable */}
            <div className="flex-1 overflow-y-auto p-5 pt-4">

              {/* ═══════════ PROFILE INFO TAB ═══════════ */}
              {profileTab === "info" && (
                <>
                  {!isEditing ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 bg-gray-50 p-4 rounded-2xl text-left">
                        <div className="w-14 h-14 rounded-full bg-lime-500 text-zinc-900 font-bold text-xl flex items-center justify-center flex-shrink-0">
                          {getInitial()}
                        </div>
                        <div>
                          <p className="font-black text-lg text-zinc-900 leading-snug">{profile.name || "Add your name"}</p>
                          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5">
                            <span>📧</span> {profile.email}
                          </p>
                          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>📱</span> {profile.phone || "Add mobile number"}
                            {profile.phone && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] bg-lime-100 text-lime-800 font-bold px-2 py-0.5 rounded-full ml-1 select-none">
                                ✅ Verified
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => { setEditForm({ ...profile }); setUpdateError(""); setIsEditing(true); }}
                        className="w-full flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50">
                        <span className="font-semibold">Edit Profile</span><span>›</span>
                      </button>
                      <button onClick={() => { setShowProfile(false); setShowLogoutConfirm(true); }}
                        className="w-full flex items-center justify-between p-4 bg-white border border-red-100 rounded-2xl hover:bg-red-50">
                        <span className="font-bold text-red-500">Logout</span><span className="text-red-400">›</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {updateError && (
                        <div className="bg-red-50 text-red-700 border border-red-200 text-xs px-3 py-2 rounded-xl font-medium text-left">
                          ⚠️ {updateError}
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-bold text-gray-700 mb-1 text-left">Full Name</label>
                        <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-lime-500 font-medium bg-gray-50 focus:bg-white transition-all focus:ring-2 focus:ring-lime-500/20" />
                      </div>
                      {(() => {
                        const editPhoneParts = parsePhone(editForm.phone);
                        return (
                          <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1 text-left">Phone Number</label>
                            <div className="flex gap-2">
                              <select
                                value={editPhoneParts.code}
                                onChange={e => {
                                  const newCode = e.target.value;
                                  setEditForm({ ...editForm, phone: `${newCode}${editPhoneParts.number}` });
                                }}
                                className="border border-gray-200 rounded-xl px-2 py-3 text-sm outline-none bg-gray-50 font-bold focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all cursor-pointer"
                              >
                                <option value="+91">🇮🇳 +91</option>
                                <option value="+1">🇺🇸 +1</option>
                                <option value="+44">🇬🇧 +44</option>
                                <option value="+971">🇦🇪 +971</option>
                              </select>
                              <input
                                type="tel"
                                value={editPhoneParts.number}
                                onChange={e => {
                                  const newNum = e.target.value.replace(/\D/g, "");
                                  setEditForm({ ...editForm, phone: `${editPhoneParts.code}${newNum}` });
                                }}
                                placeholder="98765 43210"
                                className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-lime-500 focus:ring-2 focus:ring-lime-500/20 transition-all bg-gray-50 focus:bg-white font-medium"
                              />
                            </div>
                          </div>
                        );
                      })()}
                      <div className="flex gap-3">
                        <button onClick={() => setIsEditing(false)} disabled={saving} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold hover:bg-gray-200 transition-colors">Cancel</button>
                        <button onClick={handleSaveProfile} disabled={saving}
                          className="flex-1 bg-lime-500 text-zinc-900 py-3 rounded-xl font-bold flex items-center justify-center gap-1.5 hover:bg-lime-600 transition-colors">
                          {saving ? (
                            <div className="w-5 h-5 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" />
                          ) : "Save"}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* ═══════════ ORDER HISTORY TAB ═══════════ */}
              {profileTab === "history" && (
                <div className="space-y-4">

                  {/* Search Bar */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input type="text" placeholder="Search orders or restaurants…"
                      value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                      className="w-full bg-gray-50 rounded-xl pl-10 pr-4 py-3 text-sm border border-gray-200 outline-none focus:ring-2 focus:ring-lime-500/30 focus:border-lime-500 transition-all" />
                  </div>

                  {/* Loading State */}
                  {ordersLoading && (
                    <div className="space-y-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
                          <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
                          <div className="h-3 bg-gray-100 rounded w-2/3 mb-2" />
                          <div className="h-3 bg-gray-100 rounded w-1/2" />
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Empty State */}
                  {!ordersLoading && filteredOrders.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-4xl mb-3">🛍️</p>
                      <p className="text-lg font-bold text-zinc-900 mb-1">No orders yet</p>
                      <p className="text-gray-500 text-sm">
                        {orders.length === 0 ? "Your order history will appear here." : "No results for your search."}
                      </p>
                    </div>
                  )}

                  {/* Order Cards — Zomato Style */}
                  {!ordersLoading && filteredOrders.map((order) => (
                    <div key={order.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden">

                      {/* Header: Restaurant + Date */}
                      <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b border-gray-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-lime-400 to-lime-500 flex items-center justify-center text-base font-bold text-zinc-900 flex-shrink-0">
                            {order.restaurant_name?.charAt(0) || "?"}
                          </div>
                          <div>
                            <p className="font-bold text-zinc-900 text-sm">{order.restaurant_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(order.placed_at).toLocaleString("en-IN", {
                                day: "numeric", month: "short", year: "numeric",
                                hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                        {order.pickup_code && (
                          <div className="bg-zinc-100 text-zinc-700 text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                            #{order.pickup_code}
                          </div>
                        )}
                      </div>

                      {/* Items */}
                      <div className="px-5 py-3 space-y-1">
                        {order.items?.map((item, i) => (
                          <div key={i} className="flex justify-between text-sm">
                            <span className="text-gray-600">{item.qty}× {item.name}</span>
                            <span className="text-gray-700 font-medium">₹{item.subtotal}</span>
                          </div>
                        ))}
                      </div>

                      {/* Footer: Total + Actions */}
                      <div className="px-5 pb-4 pt-2 border-t border-gray-50 flex items-center justify-between gap-3">
                        <p className="font-bold text-zinc-900 text-base">₹{order.total}</p>
                        <div className="flex gap-2 items-center">
                          {/* Reorder */}
                          <button onClick={() => handleReorder(order)}
                            className="bg-zinc-900 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-zinc-800 transition-all">
                            🔄 Reorder
                          </button>
                          {/* Rate — only if collected & not yet reviewed */}
                          {order.status === "Collected" && !order.is_reviewed && (
                            <button onClick={() => { setReviewingId(reviewingId === order.id ? null : order.id); setReviewRating(0); setReviewComment(""); }}
                              className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-100 transition-all">
                              ⭐ Rate
                            </button>
                          )}
                          {order.is_reviewed && (
                            <span className="text-xs text-lime-600 font-bold">✅ Rated</span>
                          )}
                          {/* Invoice */}
                          <button onClick={() => handleDownloadInvoice(order)}
                            className="p-2 bg-gray-50 text-gray-500 border border-gray-200 rounded-xl text-xs hover:bg-gray-100 transition-all">
                            🧾
                          </button>
                        </div>
                      </div>

                      {/* Inline Review Form */}
                      {reviewingId === order.id && (
                        <div className="px-5 pb-4">
                          <div className="bg-amber-50/50 border border-amber-100 rounded-2xl p-4 space-y-3">
                            <p className="text-sm font-bold text-zinc-900">Rate your experience</p>
                            <div className="flex gap-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <button key={star} onClick={() => setReviewRating(star)}
                                  className={`text-2xl transition-transform hover:scale-125 ${star <= reviewRating ? "drop-shadow-sm" : "opacity-30"
                                    }`}>
                                  ⭐
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={reviewComment}
                              onChange={(e) => setReviewComment(e.target.value)}
                              placeholder="Share your thoughts (optional)…"
                              rows={2}
                              className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-amber-400 bg-white resize-none"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => setReviewingId(null)}
                                className="flex-1 bg-white border border-gray-200 py-2 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50">
                                Cancel
                              </button>
                              <button onClick={() => handleSubmitReview(order)}
                                disabled={reviewRating < 1 || reviewSubmitting}
                                className="flex-1 bg-amber-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1">
                                {reviewSubmitting ? (
                                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : "Submit Review"}
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Refresh button */}
                  {!ordersLoading && orders.length > 0 && (
                    <button onClick={loadOrderHistory}
                      className="w-full py-3 text-sm text-gray-500 font-semibold hover:text-lime-600 transition-colors flex items-center justify-center gap-2">
                      🔄 Refresh Orders
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 shadow-2xl max-w-sm w-full text-center">
            <h3 className="text-xl font-bold text-zinc-900 mb-2">Logout?</h3>
            <p className="text-gray-500 mb-6">Are you sure you want to log out?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 bg-gray-100 py-3 rounded-xl font-bold">Cancel</button>
              <button onClick={logout} className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold">Logout</button>
            </div>
          </div>
        </div>
      )}

      <OTPModal
        isOpen={isOtpModalOpen}
        phone={editForm.phone}
        email={editForm.email || profile.email}
        onVerify={handleProfileOtpVerified}
        onClose={() => setIsOtpModalOpen(false)}
      />
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          10%, 90% { transform: rotate(0deg); }
          20%, 60% { transform: rotate(-8deg); }
          40%, 80% { transform: rotate(8deg); }
        }
        .animate-wiggle {
          animation: wiggle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
