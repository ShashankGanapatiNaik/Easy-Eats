import axios from "axios";

// VITE_API_URL=http://localhost:8000 set in frontend/.env
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = "Bearer " + token;
  return config;
});

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

// ── Orders ────────────────────────────────────────────────────────────────────
export const placeOrder      = (data)         => api.post("/orders/place", data);
export const myOrders        = ()             => api.get("/orders/my");
export const getOrderHistory = (params = {})  => api.get("/orders/history", { params });
export const stallOrders     = (stallId, params = {}) => api.get(`/orders/stall/${stallId}`, { params });
export const trackOrder      = (id)           => api.get(`/orders/${id}/track`);
export const updateStatus    = (id, status)   => api.put(`/orders/${id}/status`, null, { params: { status } });
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
export const sendOtp                  = (phone)        => api.post("/auth/otp/send", { phone });
export const verifyOtp                = (phone, code)  => api.post("/auth/otp/verify", { phone, code });
export const updateProfile            = (data)         => api.put("/auth/profile", data);
export const getNotifications         = ()             => api.get("/notifications");
export const markNotificationRead     = (id)           => api.put(`/notifications/${id}/read`);
export const markAllNotificationsRead = ()             => api.put("/notifications/read-all");

export default api;
