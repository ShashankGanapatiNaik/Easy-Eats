import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { myOrders } from "../api";
import { useCart } from "../context/CartContext";

const STATUS_STYLES = {
  Placed:        "bg-gray-100   text-gray-700",
  Accepted:      "bg-blue-50    text-blue-700",
  Preparing:     "bg-yellow-50  text-yellow-700",
  "Almost Ready":"bg-orange-50  text-orange-700",
  Ready:         "bg-lime-100   text-lime-800",
  Collected:     "bg-zinc-900   text-white",
  Cancelled:     "bg-red-50     text-red-600",
};

function MyOrders() {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myOrders()
      .then((res) => setOrders(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleReorder = (order) => {
    order.items.forEach((item) => {
      addToCart({
        id:          item.menu_item_id,
        name:        item.name,
        price:       item.price,
        image_url:   item.image_url,
        stall_id:    order.stall_id,
        category:    item.category,
        is_available: true,
        qty:         1,
      });
    });
    navigate("/cart");
  };

  return (
    <div className="max-w-md md:max-w-3xl mx-auto min-h-screen bg-zinc-50 pb-10">

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-4 sticky top-0 z-20">
        <button onClick={() => navigate(-1)} className="w-9 h-9 bg-gray-100 rounded-full flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-4 h-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <h1 className="text-xl font-bold text-zinc-900">My Orders</h1>
      </div>

      <div className="px-4 md:px-6 mt-6 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-5 border border-gray-100 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-2/3" />
            </div>
          ))
        ) : orders.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-4xl mb-3">🛍️</p>
            <p className="text-lg font-bold text-zinc-900 mb-1">No orders yet</p>
            <p className="text-gray-500 text-sm mb-6">Your order history will appear here.</p>
            <button onClick={() => navigate("/home")} className="bg-lime-500 text-zinc-900 px-6 py-3 rounded-full font-bold hover:bg-lime-600">
              Browse Stalls
            </button>
          </div>
        ) : (
          orders.map((order) => {
            const isActive = !["Collected", "Cancelled"].includes(order.status);
            return (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">

                {/* Card header */}
                <div className="px-5 pt-5 pb-3 flex items-center justify-between border-b border-gray-50">
                  <div>
                    <p className="font-bold text-zinc-900 text-sm">
                      #{order.id.slice(-6).toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(order.placed_at).toLocaleString("en-IN", {
                        day: "numeric", month: "short",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
                    {order.status}
                  </span>
                </div>

                {/* Items */}
                <div className="px-5 py-3 space-y-1">
                  {order.items?.slice(0, 3).map((item, i) => (
                    <div key={i} className="flex justify-between text-sm text-gray-600">
                      <span>{item.qty}× {item.name}</span>
                      <span>₹{item.subtotal}</span>
                    </div>
                  ))}
                  {order.items?.length > 3 && (
                    <p className="text-xs text-gray-400">+{order.items.length - 3} more items</p>
                  )}
                </div>

                {/* Footer */}
                <div className="px-5 pb-4 flex items-center justify-between border-t border-gray-50 pt-3">
                  <p className="font-bold text-zinc-900">₹{order.total}</p>
                  <div className="flex gap-2">
                    {isActive && (
                      <button
                        onClick={() => navigate(`/track/${order.id}`)}
                        className="text-sm bg-lime-500 text-zinc-900 px-4 py-2 rounded-full font-bold hover:bg-lime-600 transition-all"
                      >
                        Track
                      </button>
                    )}
                    {order.status === "Collected" && (
                      <button
                        onClick={() => handleReorder(order)}
                        className="text-sm border border-gray-200 text-gray-700 px-4 py-2 rounded-full font-bold hover:bg-gray-50 transition-all"
                      >
                        Reorder
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default MyOrders;
