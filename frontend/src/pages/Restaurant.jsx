import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { io } from "socket.io-client";

import {
  getStall,
  SOCKET_URL
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

  // REVIEW POPUP

  const [showReviews, setShowReviews] =
    useState(false);

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

    <div className="max-w-md md:max-w-3xl xl:max-w-7xl mx-auto min-h-screen bg-zinc-50 pb-28">

      {/* HERO */}

      <div className="relative">

        <div className="w-full h-64 md:h-72 relative">

          <img
            src={
              stall.hero_image_url ||
              "https://images.unsplash.com/photo-1550547660-d9450f859349"
            }
            className="w-full h-full object-cover"
            alt={stall.name}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/90 via-zinc-900/30 to-transparent" />

        </div>

        {/* TOP BUTTONS */}

        <div className="absolute top-5 left-4 right-4 flex justify-between z-10">

          <button
            onClick={() => navigate(-1)}
            className="bg-white/20 backdrop-blur-md text-white border border-white/20 w-10 h-10 flex items-center justify-center rounded-full"
          >

            ←

          </button>

          <button
            onClick={() => navigate("/cart")}
            className="bg-white/20 backdrop-blur-md text-white border border-white/20 px-4 py-2 rounded-full flex items-center gap-2"
          >

            Cart

            <span className="bg-lime-500 text-black px-2 py-0.5 rounded-full text-xs font-bold">

              {cartCount}

            </span>

          </button>

        </div>

        {/* DETAILS */}

        <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-10">

          <div className="flex items-center gap-2 mb-1 flex-wrap">

            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stall.is_open
                ? "bg-lime-500 text-zinc-900"
                : "bg-red-500 text-white"
              }`}>

              {stall.is_open
                ? "Open"
                : "Closed"}

            </span>

            {stall.is_open && stall.queue_density && (
              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border backdrop-blur-md flex items-center gap-1
                ${stall.queue_density.crowd_level === "Low" 
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" 
                  : stall.queue_density.crowd_level === "Medium"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                    : "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full 
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
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold px-2 py-0.5 rounded-full">
                ⚡ Fast Pickup
              </span>
            )}
            
            {stall.is_open && stall.queue_density?.is_rush_hour && (
              <span className="text-xs bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold px-2 py-0.5 rounded-full animate-pulse">
                🔥 Rush Hour
              </span>
            )}

          </div>

          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">

            {stall.name}

          </h1>

          <p className="text-sm font-medium text-zinc-300 mt-1">

            {stall.description}

          </p>

          {/* CLICKABLE STAR */}

          <div className="flex items-center gap-3 mt-2 text-sm text-zinc-300">

            <button
              onClick={() =>
                setShowReviews(true)
              }
              className="hover:text-yellow-300 transition-all"
            >

              ⭐ {stall.avg_rating}

              {" "}

              ({stall.total_ratings})

            </button>

            <span>

              ⏱ {

                stall.estimated_pickup_min || 8

              }–

              {

                (stall.estimated_pickup_min || 8) + 3

              }

              {" "}min pickup

            </span>

            {stall.is_open && stall.queue_density && (
              <span className="bg-white/10 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-medium border border-white/10">
                🕒 Best Time to Order: {stall.queue_density.best_time_to_order}
              </span>
            )}

          </div>

        </div>

      </div>

      {/* CATEGORY */}

      <div className="px-4 md:px-6 xl:px-8 mt-6">

        <div className="flex gap-3 overflow-x-auto pb-2">

          {categories.map((cat) => (

            <button
              key={cat}
              onClick={() =>
                setActiveTab(cat)
              }
              className={`px-5 py-2.5 rounded-full whitespace-nowrap text-sm font-medium transition-all ${activeTab === cat
                  ? "bg-zinc-900 text-white"
                  : "bg-white border border-gray-200 text-gray-600"
                }`}
            >

              {cat}

            </button>

          ))}

        </div>

      </div>

      {/* MENU */}

      <div className="px-4 md:px-6 xl:px-8 mt-6 space-y-5">

        {activeItems.map((item) => {

          const found =
            cart.find(
              (p) =>
                p.id === item.id
            );

          return (

            <div
              key={item.id}
              className={`bg-white rounded-3xl p-4 shadow-sm border flex gap-4 transition-all ${
                !item.is_available ? "opacity-60 select-none" : ""
              }`}
            >

              <div className="w-28 h-28 rounded-2xl overflow-hidden flex-shrink-0">

                <img
                  src={
                    item.image_url ||
                    "https://images.unsplash.com/photo-1550547660-d9450f859349"
                  }
                  className="w-full h-full object-cover"
                  alt={item.name}
                />

              </div>

              <div className="flex-1 flex flex-col justify-between">

                <div>

                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-lg text-zinc-900">
                      {item.name}
                    </h3>
                    {!item.is_available && (
                      <span className="bg-red-100 text-red-600 text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider">
                        Sold Out
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-400 mt-0.5">

                    {item.description}

                  </p>

                </div>

                <div className="flex justify-between items-center mt-3">

                  <p className="font-bold text-lg text-zinc-900">

                    ₹{item.price}

                  </p>

                  {!item.is_available ? (

                    <button
                      disabled
                      className="bg-gray-100 text-gray-400 px-4 py-2 rounded-full font-bold text-xs cursor-not-allowed border border-gray-200"
                    >
                      SOLD OUT
                    </button>

                  ) : found ? (

                    <div className="flex items-center justify-between w-24 bg-zinc-900 text-white px-3 py-2 rounded-full">

                      <button
                        onClick={() =>
                          decreaseQty(item.id)
                        }
                      >

                        -

                      </button>

                      <span>

                        {found.qty}

                      </span>

                      <button
                        onClick={() =>
                          increaseQty(item.id)
                        }
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
                          stall_name:
                            stall?.name
                        });

                      }}
                      className="bg-lime-500 hover:bg-lime-600 text-zinc-900 px-6 py-2 rounded-full font-bold"
                    >

                      ADD

                    </button>

                  )}

                </div>

              </div>

            </div>

          );
        })}

      </div>

      {/* REVIEW POPUP */}

      {showReviews && (

        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">

          <div className="bg-white w-full max-w-2xl rounded-3xl p-6 max-h-[80vh] overflow-y-auto">

            {/* HEADER */}

            <div className="flex items-center justify-between mb-6">

              <div>

                <h2 className="text-3xl font-black">

                  ⭐ {stall.avg_rating}

                </h2>

                <p className="text-zinc-500">

                  {stall.total_ratings} Reviews

                </p>

              </div>

              <button
                onClick={() =>
                  setShowReviews(false)
                }
                className="w-10 h-10 rounded-full bg-zinc-100 hover:bg-zinc-200"
              >

                ✕

              </button>

            </div>

            {/* REVIEW LIST */}

            <div className="space-y-4">

              {stall.reviews &&
                stall.reviews.length > 0 ? (

                stall.reviews.map(
                  (review, index) => (

                    <div
                      key={index}
                      className="border border-zinc-200 rounded-2xl p-5"
                    >

                      <div className="flex items-center justify-between mb-2">

                        <h3 className="font-black text-lg">

                          {review.user_name || "User"}

                        </h3>

                        <span className="bg-lime-100 text-lime-700 px-3 py-1 rounded-full text-sm font-black">

                          ⭐ {review.rating}

                        </span>

                      </div>

                      <p className="text-zinc-600">

                        {review.comment}

                      </p>

                    </div>

                  )
                )

              ) : (

                <div className="text-center py-10">

                  <p className="text-5xl mb-4">

                    ⭐

                  </p>

                  <h3 className="text-2xl font-black">

                    No Reviews Yet

                  </h3>

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