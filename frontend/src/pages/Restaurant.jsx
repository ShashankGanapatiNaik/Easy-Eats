import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { io } from "socket.io-client";

import {
  getStall,
  SOCKET_URL,
  createGroupSession,
  joinGroupSession,
  getReviews,
} from "../api";

function Restaurant() {

  const navigate = useNavigate();

  const { id } = useParams();

  const {
    cart,
    addToCart,
    increaseQty,
    decreaseQty
  } = useCart();

  const [stall, setStall] = useState(null);

  const [menuSections, setMenuSections] =
    useState([]);

  const [categories, setCategories] =
    useState([]);

  const [activeTab, setActiveTab] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState(null);

  const [showReviews, setShowReviews] = useState(false);
  const [reviewsData, setReviewsData] = useState(null);   // { avg_rating, total_ratings, reviews }
  const [reviewsLoading, setReviewsLoading] = useState(false);

  // Fetch fresh reviews whenever popup opens
  useEffect(() => {
    if (!showReviews || !id) return;
    setReviewsLoading(true);
    getReviews(id)
      .then(r => setReviewsData(r.data))
      .catch(() => setReviewsData({ reviews: [], avg_rating: 0, total_ratings: 0 }))
      .finally(() => setReviewsLoading(false));
  }, [showReviews, id]);

  useEffect(() => {

    loadRestaurant();

  }, [id]);

  // Socket.IO for Live Queue Updates
  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
    });

    socket.on("queue_update", (data) => {
      if (data.stall_id === id) {
        setStall((prevStall) =>
          prevStall ? { ...prevStall, queue_density: data.queue_density } : null
        );
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [id]);

  const loadRestaurant = async () => {

    try {

      const res = await getStall(id);

      const data = res.data;

      const reviews =
        data.reviews || [];

      const avgRating =
        reviews.length > 0

          ? (
            reviews.reduce(
              (sum, review) =>
                sum + review.rating,
              0
            ) / reviews.length
          ).toFixed(1)

          : "0.0";

      setStall({

        ...data,

        reviews,

        avg_rating: avgRating,

        total_ratings:
          reviews.length

      });

      const cats =
        data.menu_categories || [];

      setCategories(cats);

      setActiveTab(
        cats[0] || "Popular"
      );

      setMenuSections(
        data.menu || []
      );

    } catch (e) {

      setError(
        "Could not load restaurant"
      );

    } finally {

      setLoading(false);

    }

  };

  const handleStartGroupOrder = async () => {
    try {
      const res = await createGroupSession(id);
      const session = res.data;
      navigate(`/group-cart/${session.id}`);
    } catch (e) {
      alert(e.response?.data?.detail || "Could not start group session");
    }
  };

  const handleJoinGroupOrder = async () => {
    const code = prompt("Enter 6-character Group Code:");
    if (!code) return;
    try {
      const res = await joinGroupSession(code.trim());
      navigate(`/group-cart/${res.data.session_id}`);
    } catch (e) {
      alert(e.response?.data?.detail || "Could not join group session");
    }
  };

  const activeItems = (() => {

    const section =
      menuSections.find(
        (s) =>
          s.category === activeTab
      );

    return section
      ? section.items
      : [];

  })();

  if (loading) {

    return (

      <div className="flex items-center justify-center min-h-screen bg-zinc-50">

        Loading...

      </div>

    );
  }

  if (error || !stall) {

    return (

      <div className="flex items-center justify-center min-h-screen bg-zinc-50">

        Restaurant not found

      </div>

    );
  }

  const cartCount =
    cart.reduce(
      (s, i) => s + i.qty,
      0
    );

  return (

    <div className="max-w-md md:max-w-3xl xl:max-w-7xl mx-auto min-h-screen bg-white dark:bg-zinc-950 pb-28 transition-colors duration-200">

      {/* HERO BANNER */}
      <div className="relative">
        <div className="w-full h-64 md:h-80 relative overflow-hidden bg-zinc-900">
          <img
            src={
              stall.hero_image_url ||
              "https://images.unsplash.com/photo-1550547660-d9450f859349"
            }
            className="w-full h-full object-cover"
            alt={stall.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent" />
        </div>

        {/* TOP BUTTONS OVERLAY */}
        <div className="absolute top-5 left-4 right-4 flex justify-between z-10">
          <button
            onClick={() => navigate(-1)}
            className="bg-zinc-950/60 backdrop-blur-md text-white border border-white/10 w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-zinc-900 transition-all shadow-lg"
          >
            ←
          </button>

          <button
            onClick={() => navigate("/cart")}
            className="bg-zinc-950/60 backdrop-blur-md text-white border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 hover:bg-zinc-900 transition-all shadow-lg text-xs font-extrabold"
          >
            <span>🛒 Cart</span>
            <span className="bg-lime-500 text-zinc-950 px-2 py-0.5 rounded-full text-[11px] font-black">
              {cartCount}
            </span>
          </button>
        </div>

        {/* STALL DETAILS OVERLAY */}
        <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-10">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className={`text-xs font-black px-3 py-1 rounded-full shadow-md ${stall.is_open
                ? "bg-lime-500 text-zinc-950"
                : "bg-rose-500 text-white"
              }`}>
              {stall.is_open ? "Open Now" : "Closed"}
            </span>

            {stall.is_open && stall.queue_density && (
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full border backdrop-blur-md flex items-center gap-1.5 shadow-md
                ${stall.queue_density.crowd_level === "Low" 
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                  : stall.queue_density.crowd_level === "Medium"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                }`}
              >
                <span className={`w-2 h-2 rounded-full 
                  ${stall.queue_density.crowd_level === "Low" 
                    ? "bg-emerald-400" 
                    : stall.queue_density.crowd_level === "Medium"
                      ? "bg-amber-400"
                      : "bg-rose-400 animate-ping"
                  }`} 
                />
                {stall.queue_density.crowd_level} Crowd • {stall.queue_density.estimated_wait_min} min wait
              </span>
            )}

            {stall.is_open && stall.queue_density?.fast_pickup && (
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-black px-2.5 py-1 rounded-full">
                ⚡ Fast Pickup
              </span>
            )}
            
            {stall.is_open && stall.queue_density?.is_rush_hour && (
              <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 font-black px-2.5 py-1 rounded-full animate-pulse">
                🔥 Rush Hour
              </span>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
            {stall.name}
          </h1>

          <p className="text-xs sm:text-sm font-medium text-zinc-300 mt-1 max-w-xl">
            {stall.description || "Fresh food prepared daily at campus food stall."}
          </p>

          <div className="flex items-center gap-3 mt-3 text-xs font-bold text-zinc-300 flex-wrap">
            <button
              onClick={() => setShowReviews(true)}
              className="bg-white/10 hover:bg-white/20 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-1 transition-all"
            >
              <span>⭐</span> {stall.avg_rating} ({stall.total_ratings} reviews)
            </button>

            <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
              ⏱ {stall.estimated_pickup_min || 8}–{(stall.estimated_pickup_min || 8) + 3} min prep
            </span>

            {stall.is_open && stall.queue_density && (
              <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10">
                🕒 Best Time: {stall.queue_density.best_time_to_order}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* GROUP ORDERING ACTIONS */}
      {stall.is_open && (
        <div className="px-4 md:px-6 xl:px-8 mt-6">
          <div className="bg-gradient-to-r from-lime-500/15 via-emerald-500/15 to-teal-500/15 border border-lime-500/30 dark:border-lime-500/20 rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-lime-500/20 text-lime-600 dark:text-lime-400 flex items-center justify-center text-2xl flex-shrink-0">
                👥
              </div>
              <div>
                <h4 className="font-extrabold text-zinc-900 dark:text-white text-base">Shared Feast Group Order</h4>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Invite friends to add their dishes to your cart & split bill!</p>
              </div>
            </div>
            <div className="flex gap-2.5 w-full sm:w-auto">
              <button
                onClick={handleStartGroupOrder}
                className="flex-1 sm:flex-none bg-lime-500 hover:bg-lime-400 text-zinc-950 text-xs font-black px-5 py-2.5 rounded-xl shadow-md shadow-lime-500/20 transition-all"
              >
                START GROUP
              </button>
              <button
                onClick={handleJoinGroupOrder}
                className="flex-1 sm:flex-none bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-200 hover:bg-zinc-200 border border-zinc-200 dark:border-zinc-700 text-xs font-extrabold px-5 py-2.5 rounded-xl transition-all"
              >
                JOIN GROUP
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORY TABS */}
      <div className="px-4 md:px-6 xl:px-8 mt-6">
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-4 py-2 rounded-2xl whitespace-nowrap text-xs font-extrabold transition-all ${activeTab === cat
                  ? "bg-zinc-900 dark:bg-lime-500 dark:text-zinc-950 text-white shadow-md scale-105"
                  : "bg-white dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 border border-zinc-200 text-zinc-600 hover:border-lime-400"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* MENU ITEMS GRID */}
      <div className="px-4 md:px-6 xl:px-8 mt-6">
        <div className="flex flex-col gap-4">
          {activeItems.map((item) => {
            const found = cart.find((p) => p.id === item.id);

            return (
              <div
                key={item.id}
                className={`bg-white dark:bg-zinc-900 rounded-3xl p-4 shadow-sm border border-zinc-200/80 dark:border-zinc-800 flex gap-4 transition-all hover:border-lime-500/40 ${
                  !item.is_available ? "opacity-60 select-none" : ""
                }`}
              >
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 relative">
                  <img
                    src={
                      item.image_url ||
                      "https://images.unsplash.com/photo-1550547660-d9450f859349"
                    }
                    className="w-full h-full object-cover"
                    alt={item.name}
                  />
                  {item.is_veg !== undefined && (
                    <span className={`absolute top-2 left-2 w-4 h-4 rounded-md flex items-center justify-center border bg-white/90 backdrop-blur-sm ${
                      item.is_veg ? "border-emerald-600 text-emerald-600" : "border-rose-600 text-rose-600"
                    }`}>
                      <span className={`w-2 h-2 rounded-full ${item.is_veg ? "bg-emerald-600" : "bg-rose-600"}`} />
                    </span>
                  )}
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-extrabold text-base text-zinc-900 dark:text-white">
                        {item.name}
                      </h3>
                      {!item.is_available && (
                        <span className="bg-rose-500/10 text-rose-500 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider border border-rose-500/20">
                          Sold Out
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 font-medium">
                      {item.description || "Delicious campus favorite prepared fresh."}
                    </p>
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <p className="font-black text-lg text-zinc-900 dark:text-white">
                      ₹{item.price}
                    </p>

                    {!item.is_available ? (
                      <button
                        disabled
                        className="bg-zinc-100 dark:bg-zinc-800 text-zinc-400 px-4 py-2 rounded-xl font-bold text-xs cursor-not-allowed border border-zinc-200 dark:border-zinc-700"
                      >
                        UNAVAILABLE
                      </button>
                    ) : !stall.is_open && !found ? (
                      <button
                        disabled
                        className="bg-rose-500/10 text-rose-500 border border-rose-500/20 px-4 py-2 rounded-xl font-bold text-xs cursor-not-allowed"
                      >
                        STALL CLOSED
                      </button>
                    ) : found ? (
                      <div className="flex items-center justify-between w-24 bg-zinc-900 dark:bg-zinc-800 text-white px-3 py-1.5 rounded-xl border border-zinc-800 dark:border-zinc-700 shadow-sm">
                        <button
                          onClick={() => decreaseQty(item.id)}
                          className="w-6 h-6 flex items-center justify-center font-black text-lime-400 hover:scale-125 transition-transform"
                        >
                          -
                        </button>

                        <span className="font-black text-xs text-white">
                          {found.qty}
                        </span>

                        <button
                          disabled={!stall.is_open}
                          onClick={() => increaseQty(item.id)}
                          className={`w-6 h-6 flex items-center justify-center font-black text-lime-400 hover:scale-125 transition-transform ${!stall.is_open ? "opacity-35 cursor-not-allowed text-zinc-500" : ""}`}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          addToCart({
                            ...item,
                            stall_id: id,
                            stall_name: stall?.name
                          });
                        }}
                        className="bg-lime-500 hover:bg-lime-400 text-zinc-950 px-5 py-2 rounded-xl font-black text-xs shadow-md shadow-lime-500/20 active:scale-95 transition-all"
                      >
                        + ADD
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── REVIEW POPUP ──────────────────────────────────────────────────────── */}
      {showReviews && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
          onClick={() => setShowReviews(false)}
        >
          <div
            className="w-full sm:max-w-lg bg-zinc-950 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl max-h-[88vh] flex flex-col"
            style={{ border: "1px solid rgba(255,255,255,0.07)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>

            {/* Header */}
            <div className="px-6 pt-4 pb-5 border-b border-zinc-800/60 flex-shrink-0">
              {(() => {
                const rating = parseFloat(reviewsData?.avg_rating ?? stall.avg_rating) || 0;
                const reviews = reviewsData?.reviews || stall.reviews || [];
                const counts = [5,4,3,2,1].map(star => ({
                  star,
                  count: reviews.filter(r => Math.round(r.rating) === star).length,
                }));
                const maxCount = Math.max(...counts.map(c => c.count), 1);
                return (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-end gap-3 mb-1">
                        <span className="text-5xl font-black text-white leading-none">
                          {rating > 0 ? rating.toFixed(1) : "—"}
                        </span>
                        <div className="mb-1">
                          <div className="flex gap-0.5">
                            {[1,2,3,4,5].map(s => (
                              <span key={s} className={`text-base ${s <= Math.round(rating) ? "text-amber-400" : "text-zinc-700"}`}>★</span>
                            ))}
                          </div>
                          <p className="text-zinc-500 text-xs font-semibold mt-0.5">
                            {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>

                      {reviews.length > 0 && (
                        <div className="space-y-1 mt-3">
                          {counts.map(({ star, count }) => (
                            <div key={star} className="flex items-center gap-2">
                              <span className="text-[10px] text-zinc-500 font-bold w-3 text-right">{star}</span>
                              <span className="text-amber-400 text-[10px]">★</span>
                              <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-amber-400 to-lime-400 rounded-full"
                                  style={{ width: `${(count / maxCount) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-zinc-600 font-medium w-3">{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setShowReviews(false)}
                      className="w-9 h-9 rounded-2xl bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-zinc-400 hover:text-white transition-all flex-shrink-0 mt-1"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })()}
            </div>

            {/* Review list */}
            <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3 scrollbar-hide">
              {reviewsLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-zinc-700 border-t-lime-500 rounded-full animate-spin mb-3" />
                  <p className="text-zinc-500 text-xs font-medium">Loading reviews…</p>
                </div>
              ) : (reviewsData?.reviews || stall.reviews || []).length > 0 ? (
                (reviewsData?.reviews || stall.reviews || []).map((review, index) => {
                  const name = review.user_name || "Anonymous";
                  const initials = name.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase();
                  const colorPalette = ["bg-lime-500","bg-emerald-500","bg-amber-500","bg-sky-500","bg-violet-500","bg-rose-500"];
                  const colorCls = colorPalette[index % colorPalette.length];
                  const stars = Math.round(parseFloat(review.rating) || 0);
                  const ratingDisplay = parseFloat(review.rating)?.toFixed(1) || "—";
                  return (
                    <div key={review.id || index} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800/60 hover:border-zinc-700 transition-all">
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 ${colorCls} rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <span className="text-xs font-black text-white">{initials}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <h3 className="font-black text-white text-sm truncate">{name}</h3>
                            <span className="flex items-center gap-1 bg-amber-400/10 border border-amber-400/20 text-amber-400 text-xs font-black px-2 py-0.5 rounded-xl flex-shrink-0">
                              ★ {ratingDisplay}
                            </span>
                          </div>
                          <div className="flex gap-0.5 mb-2">
                            {[1,2,3,4,5].map(s => (
                              <span key={s} className={`text-xs ${s <= stars ? "text-amber-400" : "text-zinc-700"}`}>★</span>
                            ))}
                          </div>
                          {review.comment ? (
                            <p className="text-zinc-400 text-xs leading-relaxed font-medium">
                              &ldquo;{review.comment}&rdquo;
                            </p>
                          ) : (
                            <p className="text-zinc-600 text-xs italic">No comment left.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-3xl mb-4 border border-zinc-800">⭐</div>
                  <h3 className="text-white font-black text-lg mb-1">No Reviews Yet</h3>
                  <p className="text-zinc-500 text-sm font-medium">Be the first to review this stall!</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>

  );
}

export default Restaurant;