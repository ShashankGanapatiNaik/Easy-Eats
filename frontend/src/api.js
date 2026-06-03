import axios from "axios";

// VITE_API_URL=http://localhost:8000 set in frontend/.env
export const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: SOCKET_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear invalid/expired token and user data to stop infinite 401 loops
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("user_data");
      
      // Redirect to login if not already on the login page
      if (window.location.pathname !== "/") {
        window.location.href = "/";
      }
    }
    return Promise.reject(error);
  }
);

// ── Stalls ────────────────────────────────────────────────────────────────────
export const getStalls          = (params = {}) => api.get("/stalls/", { params });
export const getStall           = (id)          => api.get(`/stalls/${id}`);
export const toggleStall        = (id)          => api.put(`/stalls/${id}/toggle`);
export const updateCategories   = (id, cats)    => api.put(`/stalls/${id}/categories`, { categories: cats });
export const createStall        = (data)        => api.post("/stalls/", data);
export const getMyStalls        = ()            => api.get("/stalls/my_stalls");
export const deleteStall        = (id)          => api.delete(`/stalls/${id}`);
export const updateStall        = (id, data)    => api.put(`/stalls/${id}`, data);

// ── Menu ──────────────────────────────────────────────────────────────────────
export const getAvailableMenu      = (stallId)        => api.get(`/menu/${stallId}/available`);
export const getCategoryItems      = (stallId, cat)   => api.get(`/menu/${stallId}/category/${cat}`);
export const toggleItemAvailability= (itemId)         => api.put(`/menu/item/${itemId}/toggle`);
export const addMenuItem           = (stallId, data)  => api.post(`/menu/${stallId}`, data);
export const updateMenuItem        = (itemId, data)   => api.put(`/menu/item/${itemId}`, data);
export const deleteMenuItem        = (itemId)         => api.delete(`/menu/item/${itemId}`);
export const getRecommendations    = (stallId, cartItemIds) => api.post(`/menu/${stallId}/recommendations`, { cart_item_ids: cartItemIds });
export const trackRecommendationClick = (stallId, itemId)  => api.post(`/menu/recommendations/click`, { stall_id: stallId, item_id: itemId });


// ── Orders ────────────────────────────────────────────────────────────────────
export const placeOrder      = (data)         => api.post("/orders/place", data);
export const myOrders        = ()             => api.get("/orders/my");
export const getOrderHistory = (params = {})  => api.get("/orders/history", { params });
export const stallOrders     = (stallId, params = {}) => api.get(`/orders/stall/${stallId}`, { params });
export const trackOrder      = (id)           => api.get(`/orders/${id}/track`);
export const updateStatus    = (id, status, prepTime) => {
  const params = { status };
  if (prepTime) params.prep_time = prepTime;
  return api.put(`/orders/${id}/status`, null, { params });
};
export const cancelOrder     = (id)           => api.delete(`/orders/${id}`);
export const getAnalytics    = (stallId)      => api.get(`/orders/analytics/${stallId}`);

// ── Reviews ───────────────────────────────────────────────────────────────────
export const submitReview = (stallId, body) => api.post(`/reviews/${stallId}`, body);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const register = (data) => api.post("/auth/register", data);
export const login    = (data) => api.post("/auth/login",    data);

// ── Wallet ────────────────────────────────────────────────────────────────────
export const getWalletBalance = ()      => api.get("/wallet/balance");
export const topUpWallet      = (amt)   => api.post("/wallet/topup", { amount: amt });
export const deductWallet     = (body)  => api.post("/wallet/deduct", body);
export const getTransactions  = ()      => api.get("/wallet/transactions");

// ── AI ────────────────────────────────────────────────────────────────────────
export const aiChat = (body) => api.post("/ai/chat", body);

// ── Payments ──────────────────────────────────────────────────────────────────
export const createRazorpayOrder = (amount) => api.post("/payments/create-order", { amount });
export const verifyPayment       = (body)   => api.post("/payments/verify", body);

// ── OTP, Profile & Notifications ──────────────────────────────────────────────
export const sendOtp                  = (phone, email) => api.post("/auth/otp/send", { phone, email });
export const verifyOtp                = (phone, code)  => api.post("/auth/otp/verify", { phone, code });
export const updateProfile            = (data)         => api.put("/auth/profile", data);
export const getNotifications         = (params = {})  => api.get("/notifications", { params });
export const markNotificationRead     = (id)           => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = ()             => api.put("/notifications/read-all");

export default api;
