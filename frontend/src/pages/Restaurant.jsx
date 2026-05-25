import { useNavigate, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../context/CartContext";
import { getStall } from "../api";

function Restaurant() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { cart, addToCart, increaseQty, decreaseQty } = useCart();

  const [stall, setStall]           = useState(null);
  const [menuSections, setMenuSections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeTab, setActiveTab]   = useState("");
  const [selectedItem, setSelectedItem] = useState(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getStall(id);
        const data = res.data;
        setStall(data);

        // Per-stall categories come from the DB (Stall.menu_categories)
        const cats = data.menu_categories || [];
        setCategories(cats);
        setActiveTab(cats[0] || "Popular");
        setMenuSections(data.menu || []);
      } catch (e) {
        setError("Could not load stall. Please try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  // Items for the current tab
  const activeItems = (() => {
    const section = menuSections.find((s) => s.category === activeTab);
    return section ? section.items : [];
  })();

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-500 font-medium">Loading menu…</p>
      </div>
    </div>
  );

  if (error || !stall) return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50">
      <div className="text-center p-8">
        <p className="text-red-500 font-bold text-lg mb-4">{error || "Stall not found"}</p>
        <button onClick={() => navigate(-1)} className="bg-lime-500 text-zinc-900 px-6 py-3 rounded-full font-bold">
          Go Back
        </button>
      </div>
    </div>
  );

  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="max-w-md md:max-w-3xl xl:max-w-7xl mx-auto min-h-screen bg-zinc-50 pb-28">

      {/* Hero */}
      <div className="relative">
        <div className="w-full h-64 md:h-72 relative">
          <img
            src={stall.hero_image_url || "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=1200&q=80"}
            className="w-full h-full object-cover"
            alt={stall.name}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/90 via-zinc-900/30 to-transparent pointer-events-none" />
        </div>

        <div className="absolute top-5 left-4 right-4 flex justify-between z-10">
          <button
            onClick={() => navigate(-1)}
            className="bg-white/20 backdrop-blur-md text-white border border-white/20 w-10 h-10 flex items-center justify-center rounded-full shadow-lg hover:bg-white/30 active:scale-95 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>

          <button
            onClick={() => navigate("/cart")}
            className="bg-white/20 backdrop-blur-md text-white border border-white/20 px-4 py-2 rounded-full shadow-lg font-semibold hover:bg-white/30 active:scale-95 transition-all flex items-center gap-2"
          >
            Cart <span className="bg-lime-500 text-black px-2 py-0.5 rounded-full text-xs">{cartCount}</span>
          </button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-5 text-white z-10">
          <div className="flex items-center gap-2 mb-1">
            {/* Availability badge */}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${stall.is_open ? "bg-lime-500 text-zinc-900" : "bg-red-500 text-white"}`}>
              {stall.is_open ? "Open" : "Closed"}
            </span>
            {stall.location_label && (
              <span className="text-xs text-zinc-300">{stall.location_label}</span>
            )}
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{stall.name}</h1>
          {stall.description && (
            <p className="text-sm font-medium text-zinc-300 mt-1">{stall.description}</p>
          )}
          <div className="flex items-center gap-3 mt-2 text-sm text-zinc-300">
            {stall.avg_rating > 0 && (
              <span>⭐ {stall.avg_rating.toFixed(1)} ({stall.total_ratings})</span>
            )}
            <span>⏱ {stall.estimated_pickup_min}–{stall.estimated_pickup_min + 3} min pickup</span>
          </div>
        </div>
      </div>

      {/* ── Per-stall category tabs (from DB) ────────────────────────────── */}
      <div className="px-4 md:px-6 xl:px-8 mt-6">
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className={`px-5 py-2.5 rounded-full whitespace-nowrap flex-shrink-0 text-sm font-medium transition-all duration-300 ${
                activeTab === cat
                  ? "bg-zinc-900 text-white shadow-md"
                  : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Menu items ────────────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 xl:px-8 mt-6 space-y-5">
        {activeItems.length === 0 ? (
          <p className="text-center text-gray-400 py-10">No items in this category right now.</p>
        ) : (
          activeItems.map((item) => {
            const found = cart.find((p) => p.id === item.id);
            return (
              <div
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={`group bg-white rounded-3xl p-4 shadow-sm border flex gap-4 transition-all duration-300 cursor-pointer
                  ${item.is_available
                    ? "border-gray-100 hover:shadow-xl hover:-translate-y-1"
                    : "border-gray-100 opacity-50 cursor-not-allowed"
                  }`}
              >
                <div className="w-28 h-28 md:w-32 md:h-32 rounded-2xl overflow-hidden flex-shrink-0 relative">
                  <img
                    src={item.image_url || "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    alt={item.name}
                  />
                  {!item.is_available && (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                      <span className="text-white text-xs font-bold bg-red-500 px-2 py-1 rounded-full">Sold Out</span>
                    </div>
                  )}
                  {/* Veg indicator */}
                  <div className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-sm border-2 flex items-center justify-center ${item.is_veg ? "border-green-600 bg-white" : "border-red-600 bg-white"}`}>
                    <div className={`w-2 h-2 rounded-full ${item.is_veg ? "bg-green-600" : "bg-red-600"}`} />
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-zinc-900 group-hover:text-lime-600 transition-colors">
                      {item.name}
                    </h3>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{item.description}</p>
                    )}
                    <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {item.prep_time_min} min
                    </p>
                    {item.tags?.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {item.tags.map(tag => (
                          <span key={tag} className="text-xs bg-lime-50 text-lime-700 border border-lime-100 px-1.5 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between items-center mt-3">
                    <div>
                      {item.discounted_price ? (
                        <div>
                          <span className="font-bold text-lg text-zinc-900">₹{item.discounted_price}</span>
                          <span className="text-sm text-gray-400 line-through ml-1">₹{item.price}</span>
                        </div>
                      ) : (
                        <p className="font-bold text-lg text-zinc-900">₹{item.price}</p>
                      )}
                    </div>

                    {item.is_available ? (
                      !stall.is_open ? (
                        <span className="text-gray-400 text-sm font-semibold bg-gray-100 px-3 py-1.5 rounded-full">Closed</span>
                      ) : found ? (
                        <div className="flex items-center justify-between w-24 bg-zinc-900 text-white px-3 py-2 rounded-full shadow-md">
                          <button onClick={(e) => { e.stopPropagation(); decreaseQty(item.id); }}
                            className="w-6 h-6 flex items-center justify-center font-bold text-lg active:scale-90 transition-transform">
                            -
                          </button>
                          <span className="font-bold text-sm">{found.qty}</span>
                          <button onClick={(e) => { e.stopPropagation(); increaseQty(item.id); }}
                            className="w-6 h-6 flex items-center justify-center font-bold text-lg text-lime-400 active:scale-90 transition-transform">
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            addToCart({ ...item, stall_id: id, stall_name: stall?.name });
                          }}
                          className="bg-lime-500 hover:bg-lime-600 active:scale-95 text-zinc-900 px-6 py-2 rounded-full font-bold shadow-md shadow-lime-500/20 transition-all"
                        >
                          ADD
                        </button>
                      )
                    ) : (
                      <span className="text-red-400 text-sm font-semibold">Unavailable</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Item Detail Modal */}
      {selectedItem && selectedItem.is_available && (
        <div
          className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div
            className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative h-64 w-full">
              <img src={selectedItem.image_url || "https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80"} className="w-full h-full object-cover" alt={selectedItem.name} />
              <button onClick={() => setSelectedItem(null)}
                className="absolute top-4 right-4 bg-black/40 backdrop-blur-md text-white p-2 rounded-full">
                ✕
              </button>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-2xl font-bold text-zinc-900">{selectedItem.name}</h2>
                {selectedItem.is_popular && (
                  <span className="bg-lime-50 text-lime-700 px-2 py-1 rounded-lg text-xs font-bold border border-lime-100">⭐ Bestseller</span>
                )}
              </div>
              {selectedItem.description && (
                <p className="text-gray-500 mb-4 text-sm leading-relaxed">{selectedItem.description}</p>
              )}

              {/* Customization options */}
              {selectedItem.customization_groups?.length > 0 && (
                <div className="mb-4 space-y-3">
                  {selectedItem.customization_groups.map((group, gi) => (
                    <div key={gi}>
                      <p className="text-sm font-bold text-zinc-900 mb-1">
                        {group.name} {group.required && <span className="text-red-500">*</span>}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {group.choices?.map((choice, ci) => (
                          <span key={ci} className="text-xs border border-gray-200 px-3 py-1 rounded-full text-gray-600">
                            {choice.label} {choice.price_delta > 0 && `+₹${choice.price_delta}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                <div>
                  <p className="text-sm text-gray-500 font-medium">Price</p>
                  <p className="text-2xl font-bold text-zinc-900">₹{selectedItem.discounted_price || selectedItem.price}</p>
                </div>
                {cart.find(p => p.id === selectedItem.id) ? (
                  <div className="flex items-center justify-between w-32 bg-zinc-900 text-white px-4 py-3 rounded-full shadow-md">
                    <button onClick={() => decreaseQty(selectedItem.id)} className="w-6 h-6 flex items-center justify-center font-bold text-xl">-</button>
                    <span className="font-bold text-lg">{cart.find(p => p.id === selectedItem.id).qty}</span>
                    <button onClick={() => increaseQty(selectedItem.id)} className="w-6 h-6 flex items-center justify-center font-bold text-xl text-lime-400">+</button>
                  </div>
                ) : !stall.is_open ? (
                  <button
                    disabled
                    className="bg-gray-200 text-gray-500 px-8 py-3 rounded-full font-bold shadow-md cursor-not-allowed"
                  >
                    CLOSED
                  </button>
                ) : (
                  <button
                    onClick={() => { addToCart({ ...selectedItem, stall_id: id, stall_name: stall?.name }); setSelectedItem(null); }}
                    className="bg-lime-500 hover:bg-lime-600 text-zinc-900 px-8 py-3 rounded-full font-bold shadow-md transition-all"
                  >
                    ADD TO CART
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Restaurant;