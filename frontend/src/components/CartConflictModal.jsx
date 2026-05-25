// src/components/CartConflictModal.jsx
// Shown when user adds an item from a different stall than their current cart.
// Reads pendingItem, stallName, confirmReplace, cancelReplace from CartContext.

import { useEffect, useRef } from "react";
import { useCart } from "../context/CartContext";

export default function CartConflictModal() {
  const { pendingItem, stallName, confirmReplace, cancelReplace } = useCart();
  const confirmBtnRef = useRef(null);

  // Focus "Replace Cart" when modal opens for keyboard accessibility
  useEffect(() => {
    if (pendingItem) {
      setTimeout(() => confirmBtnRef.current?.focus(), 50);
    }
  }, [pendingItem]);

  // Close on Escape key
  useEffect(() => {
    if (!pendingItem) return;
    const handler = (e) => { if (e.key === "Escape") cancelReplace(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [pendingItem, cancelReplace]);

  if (!pendingItem) return null;

  const currentStall = stallName  || "Current Restaurant";
  const newStall     = pendingItem.stall_name || "New Restaurant";

  return (
    <>
      {/* ── CSS animations ── */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes scaleUp {
          from { opacity: 0; transform: scale(0.88) translateY(12px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
        .modal-backdrop { animation: fadeIn  0.2s ease forwards; }
        .modal-card     { animation: scaleUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
      `}</style>

      {/* ── Backdrop ── */}
      <div
        className="modal-backdrop fixed inset-0 z-[100] flex items-center justify-center
                   px-4 bg-black/60 backdrop-blur-sm"
        onClick={cancelReplace}
        aria-modal="true"
        role="dialog"
        aria-labelledby="conflict-title"
      >
        {/* ── Card ── */}
        <div
          className="modal-card bg-white rounded-3xl shadow-2xl shadow-black/20
                     w-full max-w-sm overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ── Illustration strip ── */}
          <div className="bg-gradient-to-r from-orange-400 to-red-400 px-6 pt-6 pb-5">
            <div className="flex items-center justify-center gap-3">
              {/* Cart icon */}
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl
                              flex items-center justify-center text-2xl">
                🛒
              </div>
              {/* Arrow */}
              <div className="text-white/80 text-xl font-bold">→</div>
              {/* New item icon */}
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-2xl
                              flex items-center justify-center text-2xl">
                🍽️
              </div>
            </div>
          </div>

          {/* ── Body ── */}
          <div className="px-6 py-5">
            <h2
              id="conflict-title"
              className="text-xl font-black text-zinc-900 mb-2 text-center"
            >
              Replace Cart Items?
            </h2>

            <p className="text-gray-500 text-sm text-center leading-relaxed mb-5">
              Your cart contains items from another restaurant.
              Do you want to clear the current cart and add this item instead?
            </p>

            {/* ── Stall comparison ── */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-5 space-y-3">
              {/* Current stall */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-xl flex items-center
                                justify-center text-sm flex-shrink-0">
                  🏪
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium">Current Cart</p>
                  <p className="text-sm font-bold text-zinc-900 truncate">{currentStall}</p>
                </div>
                <span className="ml-auto text-xs bg-red-100 text-red-600 px-2 py-1
                                 rounded-full font-semibold flex-shrink-0">
                  Will clear
                </span>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">replace with</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>

              {/* New stall */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-lime-100 rounded-xl flex items-center
                                justify-center text-sm flex-shrink-0">
                  ✨
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400 font-medium">New Item From</p>
                  <p className="text-sm font-bold text-zinc-900 truncate">{newStall}</p>
                </div>
                <span className="ml-auto text-xs bg-lime-100 text-lime-700 px-2 py-1
                                 rounded-full font-semibold flex-shrink-0">
                  Adding
                </span>
              </div>
            </div>

            {/* ── New item preview ── */}
            <div className="flex items-center gap-3 bg-lime-50 border border-lime-100
                            rounded-2xl px-4 py-3 mb-5">
              {pendingItem.image_url && (
                <img
                  src={pendingItem.image_url}
                  alt={pendingItem.name}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">
                  {pendingItem.name}
                </p>
                <p className="text-xs text-gray-400">{pendingItem.category}</p>
              </div>
              <p className="font-black text-zinc-900 text-sm flex-shrink-0">
                ₹{pendingItem.discounted_price || pendingItem.price}
              </p>
            </div>

            {/* ── Action buttons ── */}
            <div className="flex gap-3">
              {/* Cancel */}
              <button
                onClick={cancelReplace}
                className="flex-1 py-3 rounded-2xl border-2 border-gray-200
                           text-gray-600 font-bold text-sm
                           hover:border-gray-300 hover:bg-gray-50
                           active:scale-[0.97]
                           transition-all duration-150"
              >
                Cancel
              </button>

              {/* Replace Cart */}
              <button
                ref={confirmBtnRef}
                onClick={confirmReplace}
                className="flex-1 py-3 rounded-2xl bg-lime-500 hover:bg-lime-600
                           text-zinc-900 font-bold text-sm
                           shadow-lg shadow-lime-500/30
                           hover:shadow-lime-500/40 hover:-translate-y-0.5
                           active:scale-[0.97] active:translate-y-0
                           transition-all duration-150"
              >
                Replace Cart
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}