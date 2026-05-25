import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";

const NAV_ITEMS = [
  {
    path: "/home",
    label: "Home",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: "/orders",
    label: "Orders",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    path: "/cart",
    label: "Cart",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    badge: true,
  },
];

export default function BottomNav() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { cartCount } = useCart();

  // Only show for student pages
  const studentPaths = ["/home", "/restaurant", "/cart", "/orders", "/track"];
  const show = studentPaths.some((p) => location.pathname.startsWith(p));
  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-gray-100 safe-area-pb">
      <div className="max-w-md mx-auto flex">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-all relative ${
                active ? "text-zinc-900" : "text-gray-400 hover:text-gray-600"
              }`}
            >
              <div className="relative">
                {item.icon(active)}
                {item.badge && cartCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-lime-500 text-zinc-900 text-[9px] font-black rounded-full flex items-center justify-center">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold ${active ? "text-zinc-900" : "text-gray-400"}`}>
                {item.label}
              </span>
              {active && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-lime-500 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
