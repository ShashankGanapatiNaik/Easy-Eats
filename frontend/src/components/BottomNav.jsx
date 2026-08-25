import { useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../context/CartContext";

const NAV_ITEMS = [
  {
    path: "/home",
    label: "Explore",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: "/orders",
    label: "My Orders",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    path: "/cart",
    label: "My Cart",
    icon: (active) => (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill={active ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 0 : 2}>
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
    <div className="fixed bottom-4 left-0 right-0 z-40 px-4 pointer-events-none">
      <nav aria-label="Bottom Navigation" className="max-w-xs sm:max-w-sm mx-auto bg-zinc-900/90 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-800 text-white rounded-full shadow-2xl p-1.5 pointer-events-auto flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path || (item.path === "/home" && location.pathname === "/");
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex-1 flex flex-col items-center justify-center py-2 px-3 rounded-full transition-all duration-200 relative ${
                active 
                  ? "bg-lime-500 text-zinc-950 font-black shadow-lg shadow-lime-500/25 scale-105" 
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              <div className="relative flex items-center justify-center">
                {item.icon(active)}
                {item.badge && cartCount > 0 && (
                  <span className={`absolute -top-1.5 -right-2 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border ${
                    active ? "bg-zinc-950 text-lime-400 border-lime-400" : "bg-lime-500 text-zinc-950 border-zinc-900"
                  }`}>
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] tracking-tight mt-0.5 ${active ? "font-black" : "font-semibold"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

