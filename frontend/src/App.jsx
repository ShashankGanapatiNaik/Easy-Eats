import { lazy, Suspense } from "react";
import ForgotPassword from "./pages/ForgotPassword";
import {
  BrowserRouter as Router, Routes, Route,
  Navigate, useNavigate, useLocation,
} from "react-router-dom";
import { CartProvider, useCart } from "./context/CartContext";

import Login from "./pages/Login";
import Home from "./pages/Home";
import Restaurant from "./pages/Restaurant";
import Cart from "./pages/Cart";
import TrackOrder from "./pages/TrackOrder";
import MyOrders from "./pages/MyOrders";
import AdminPanel from "./pages/AdminPanel";
import KitchenDashboard from "./pages/KitchenDashboard";
import GlobalNotificationToast from "./components/GlobalNotificationToast";

const WalletPage = lazy(() =>
  import("./pages/WalletPage").catch(() => ({
    default: () =>
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400">Wallet page loading...</p>
      </div>
  }))
);
const AIAssistant = lazy(() => import("./components/ai/AIAssistant").catch(() => ({ default: () => null })));
const CartConflictModal = lazy(() => import("./components/CartConflictModal").catch(() => ({ default: () => null })));

const ALIAS = { owner: "stall_owner", kitchen: "stall_owner" };

function getRole() {
  try {
    const u = JSON.parse(localStorage.getItem("user_data") || "{}");
    return ALIAS[u.role] || u.role || "";
  } catch { return ""; }
}

function RequireAuth({ children, roles = [] }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/" replace />;
  if (roles.length > 0) {
    const role = getRole();
    if (!roles.includes(role)) {
      if (role === "stall_owner") return <Navigate to="/admin" replace />;
      if (role === "student") return <Navigate to="/home" replace />;
      return <Navigate to="/" replace />;
    }
  }
  return children;
}

function GlobalCartBar() {
  const { cart, cartCount, cartTotal } = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const hidden = ["/", "/cart", "/admin", "/wallet"].includes(pathname) || pathname.startsWith("/track");
  if (hidden || cartCount === 0) return null;
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-5 pointer-events-none">
      <div onClick={() => navigate("/cart")}
        className="pointer-events-auto max-w-md mx-auto bg-zinc-900 text-white rounded-2xl
                   shadow-2xl px-5 py-4 flex items-center justify-between cursor-pointer
                   active:scale-[0.98] transition-all">
        <div className="flex items-center gap-3">
          <div className="bg-lime-500 text-zinc-900 font-black text-sm w-7 h-7 rounded-lg
                          flex items-center justify-center flex-shrink-0">{cartCount}</div>
          <div>
            <p className="font-bold text-sm leading-tight">View Cart</p>
            <p className="text-zinc-400 text-xs">
              {cartCount} {cartCount === 1 ? "item" : "items"}
              {cart[0]?.stall_name ? ` · ${cart[0].stall_name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-black text-lime-400">₹{cartTotal.toFixed(0)}</span>
          <svg className="h-5 w-5 text-zinc-400" fill="none" viewBox="0 0 24 24"
            stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-zinc-50">
      <div className="w-10 h-10 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Inner() {
  const location = useLocation();
  const hideAI = location.pathname.startsWith("/admin") || location.pathname.startsWith("/kitchen");

  return (
    <>
      <GlobalCartBar />
      <GlobalNotificationToast />
      <Suspense fallback={null}>
        {!hideAI && <AIAssistant />}
        <CartConflictModal />
      </Suspense>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/home" element={<RequireAuth roles={["student", "admin"]}><Home /></RequireAuth>} />
        <Route path="/restaurant/:id" element={<RequireAuth roles={["student", "admin"]}><Restaurant /></RequireAuth>} />
        <Route path="/cart" element={<RequireAuth roles={["student", "admin"]}><Cart /></RequireAuth>} />
        <Route path="/track/:id" element={<RequireAuth roles={["student", "admin"]}><TrackOrder /></RequireAuth>} />
        <Route path="/orders" element={<RequireAuth roles={["student", "admin"]}><MyOrders /></RequireAuth>} />
        <Route path="/wallet" element={<RequireAuth roles={["student", "admin"]}><Suspense fallback={<Spinner />}><WalletPage /></Suspense></RequireAuth>} />
        <Route path="/admin" element={<RequireAuth roles={["stall_owner", "admin"]}><AdminPanel /></RequireAuth>} />
        <Route path="/kitchen/:id" element={<RequireAuth roles={["stall_owner", "admin"]}><KitchenDashboard /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <CartProvider>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Inner />
      </Router>
    </CartProvider>
  );
}
