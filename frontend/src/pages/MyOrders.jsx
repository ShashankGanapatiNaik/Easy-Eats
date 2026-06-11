import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { myOrders, submitReview } from "../api";
import { useCart } from "../context/CartContext";

const STATUS_STYLES = {
  Placed: "bg-gray-100 text-gray-700",
  Accepted: "bg-blue-50 text-blue-700",
  Preparing: "bg-yellow-50 text-yellow-700",
  "Almost Ready": "bg-orange-50 text-orange-700",
  Ready: "bg-lime-100 text-lime-800",
  Collected: "bg-zinc-900 text-white",
  Cancelled: "bg-red-50 text-red-600",
};

function MyOrders() {

  const navigate = useNavigate();

  const { addToCart } = useCart();

  const [orders, setOrders] = useState([]);

  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");

  const [selectedOrder, setSelectedOrder] = useState(null);

  const [rating, setRating] = useState(5);

  const [reviewText, setReviewText] = useState("");

  useEffect(() => {

    loadOrders();

  }, []);

  const loadOrders = async () => {

    try {

      const res = await myOrders();

      setOrders(res.data || []);

    } catch (err) {

      console.log(err);

    } finally {

      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) => {

    const searchText = search.toLowerCase();

    return (
      (order.stall_name || "")
        .toLowerCase()
        .includes(searchText)
    );
  });

  const handleTrackOrder = (orderId) => {

    navigate(`/track/${orderId}`);
  };

  const handleReorder = (order) => {

    (order.items || []).forEach((item) => {

      addToCart({
        id: item.menu_item_id,
        name: item.name,
        price: item.price,
        image_url: item.image_url,
        stall_id: order.stall_id,
        category: item.category,
        is_available: true,
        qty: 1,
      });

    });

    navigate("/cart");
  };

  const handlePrintReceipt = (order) => {

    const receiptWindow = window.open("", "_blank");

    receiptWindow.document.write(`
      <html>

        <head>

          <title>Receipt</title>

        </head>

        <body style="font-family:sans-serif;padding:20px;">

          <h2>Easy Eats Receipt</h2>

          <hr />

          <p>
            <strong>Restaurant:</strong>
            ${order.stall_name}
          </p>

          <p>
            <strong>Order ID:</strong>
            ${order.id}
          </p>

          <p>
            <strong>Status:</strong>
            ${order.status}
          </p>

          <p>
            <strong>Date:</strong>
            ${new Date(order.placed_at).toLocaleString()}
          </p>

          <hr />

          ${(order.items || []).map((item) => `

            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">

              <span>
                ${item.qty}× ${item.name}
              </span>

              <span>
                ₹${item.subtotal}
              </span>

            </div>

          `).join("")}

          <hr />

          <h3>Total: ₹${order.total}</h3>

        </body>

      </html>
    `);

    receiptWindow.document.close();

    receiptWindow.print();
  };

  const handleSubmitReview = async () => {

    if (!selectedOrder) return;

    try {

      await submitReview(
        selectedOrder.stall_id,
        {
          rating,
          comment: reviewText,
          order_id: selectedOrder.id,
        }
      );

      const updatedOrders = orders.map((order) => {

        if (order.id === selectedOrder.id) {

          return {
            ...order,
            review_submitted: true,
          };
        }

        return order;
      });

      setOrders(updatedOrders);

      alert("Review submitted successfully");

      setSelectedOrder(null);

      setReviewText("");

      setRating(5);

    } catch (err) {

      alert(
        err?.response?.data?.detail ||
        "Review submission failed"
      );
    }
  };

  if (loading) {

    return (

      <div className="min-h-screen flex items-center justify-center text-2xl font-bold">

        Loading Orders...

      </div>

    );
  }

  return (

    <div className="max-w-5xl mx-auto min-h-screen bg-zinc-50 p-4 md:p-8">

      {/* HEADER */}

      <div className="flex items-center justify-between mb-8">

        <h1 className="text-4xl font-black text-zinc-900">

          My Orders

        </h1>

        <button
          onClick={() => navigate(-1)}
          className="w-14 h-14 rounded-full bg-zinc-100 text-3xl text-zinc-500"
        >

          ×

        </button>

      </div>

      {/* SEARCH */}

      <div className="bg-white border border-zinc-200 rounded-3xl px-6 py-5 flex items-center gap-4 mb-8 shadow-sm">

        <span className="text-2xl text-zinc-400">

          🔍

        </span>

        <input
          type="text"
          placeholder="Search restaurants..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-transparent outline-none w-full text-xl"
        />

      </div>

      {/* ORDER LIST */}

      <div className="space-y-6">

        {filteredOrders.length === 0 ? (

          <div className="bg-white rounded-3xl p-10 text-center border border-zinc-200">

            <p className="text-6xl mb-4">

              📦

            </p>

            <h2 className="text-3xl font-black mb-2">

              No Orders Found

            </h2>

            <p className="text-zinc-500">

              Your orders will appear here.

            </p>

          </div>

        ) : (

          filteredOrders.map((order) => {

            return (

              <div
                key={order.id}
                className="bg-white border border-zinc-200 rounded-[35px] overflow-hidden shadow-sm"
              >

                {/* TOP */}

                <div className="p-6 flex items-center justify-between">

                  <div className="flex items-center gap-5">

                    <div className="w-20 h-20 rounded-[24px] bg-lime-400 flex items-center justify-center text-4xl font-black text-zinc-900">

                      {(order.stall_name || "S")
                        .charAt(0)}

                    </div>

                    <div>

                      <h2 className="text-3xl font-black text-zinc-900">

                        {order.stall_name || "Restaurant"}

                      </h2>

                      <p className="text-zinc-400 mt-1 text-lg">

                        {new Date(
                          order.placed_at
                        ).toLocaleString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}

                      </p>

                    </div>

                  </div>

                  <div className={`px-4 py-2 rounded-2xl text-sm font-black ${STATUS_STYLES[order.status]
                    }`}>

                    {order.status}

                  </div>

                </div>

                {/* ITEMS */}

                <div className="border-t border-zinc-100 p-6">

                  {(order.items || []).map((item, index) => (

                    <div
                      key={index}
                      className="flex justify-between text-lg text-zinc-600 mb-3"
                    >

                      <span>

                        {item.qty}× {item.name}

                      </span>

                      <span>

                        ₹{item.subtotal}

                      </span>

                    </div>

                  ))}

                </div>

                {/* FOOTER */}

                <div className="border-t border-zinc-100 p-6 flex items-center justify-between flex-wrap gap-4">

                  {/* TOTAL */}

                  <h3 className="text-4xl font-black text-zinc-900">

                    ₹{order.total}

                  </h3>

                  {/* BUTTONS */}

                  <div className="flex gap-3 flex-wrap justify-end">

                    {/* IF ORDER NOT COLLECTED */}

                    {order.status !== "Collected" &&
                      order.status !== "Cancelled" && (

                        <button
                          onClick={() => handleTrackOrder(order.id)}
                          className="bg-lime-400 hover:bg-lime-500 px-6 py-3 rounded-2xl font-black text-zinc-900 transition-all"
                        >

                          📍 Track Order

                        </button>

                      )}

                    {/* IF ORDER COLLECTED */}

                    {order.status === "Collected" && (

                      <>

                        {/* TRACK */}

                        <button
                          onClick={() => handleTrackOrder(order.id)}
                          className="bg-lime-400 hover:bg-lime-500 px-6 py-3 rounded-2xl font-black text-zinc-900 transition-all"
                        >

                          📍 Track

                        </button>

                        {/* REORDER */}

                        <button
                          disabled={order.stall_is_open === false}
                          onClick={() => handleReorder(order)}
                          className={`px-6 py-3 rounded-2xl font-black transition-all ${
                            order.stall_is_open !== false
                              ? "bg-zinc-900 hover:bg-black text-white"
                              : "bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200"
                          }`}
                        >

                          {order.stall_is_open !== false ? "🔄 Reorder" : "🔒 Closed"}

                        </button>

                        {/* RECEIPT */}

                        <button
                          onClick={() => handlePrintReceipt(order)}
                          className="bg-zinc-100 hover:bg-zinc-200 px-6 py-3 rounded-2xl font-black text-zinc-700 transition-all"
                        >

                          🧾 Receipt

                        </button>

                        {/* REVIEW */}

                        {!order.review_submitted && (

                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="bg-yellow-300 hover:bg-yellow-400 px-6 py-3 rounded-2xl font-black text-zinc-900 transition-all"
                          >

                            ⭐ Review

                          </button>

                        )}

                        {/* REVIEWED */}

                        {order.review_submitted && (

                          <div className="bg-lime-100 text-lime-700 px-6 py-3 rounded-2xl font-black">

                            ✅ Reviewed

                          </div>

                        )}

                      </>

                    )}

                    {/* CANCELLED */}

                    {order.status === "Cancelled" && (

                      <div className="bg-red-100 text-red-700 px-6 py-3 rounded-2xl font-black">

                        ❌ Cancelled

                      </div>

                    )}

                  </div>

                </div>

              </div>

            );
          })

        )}

      </div>

      {/* REVIEW MODAL */}

      {selectedOrder && (

        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">

          <div className="bg-white w-full max-w-xl rounded-[35px] p-8">

            <h2 className="text-3xl font-black mb-6">

              Review Restaurant

            </h2>

            <div className="mb-5">

              <label className="block font-black mb-3">

                Rating

              </label>

              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full border border-zinc-200 rounded-2xl px-5 py-4"
              >

                <option value={5}>⭐⭐⭐⭐⭐</option>
                <option value={4}>⭐⭐⭐⭐</option>
                <option value={3}>⭐⭐⭐</option>
                <option value={2}>⭐⭐</option>
                <option value={1}>⭐</option>

              </select>

            </div>

            <div className="mb-6">

              <label className="block font-black mb-3">

                Review

              </label>

              <textarea
                rows={5}
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="Write your review..."
                className="w-full border border-zinc-200 rounded-2xl px-5 py-4 resize-none"
              />

            </div>

            <div className="flex gap-4">

              <button
                onClick={() => setSelectedOrder(null)}
                className="flex-1 border border-zinc-200 rounded-2xl py-4 font-black"
              >

                Cancel

              </button>

              <button
                onClick={handleSubmitReview}
                className="flex-1 bg-lime-400 hover:bg-lime-500 rounded-2xl py-4 font-black text-zinc-900"
              >

                Submit

              </button>

            </div>

          </div>

        </div>

      )}

    </div>
  );
}

export default MyOrders;