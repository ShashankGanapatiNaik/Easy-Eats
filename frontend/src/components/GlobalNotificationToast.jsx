import { useState, useEffect, useRef } from "react";
import { getNotifications, markNotificationRead } from "../api";
import { useLocation } from "react-router-dom";

export default function GlobalNotificationToast() {
  const [toast, setToast] = useState(null);
  const audioRef = useRef(null);
  const location = useLocation();

  // Check if token exists
  const token = localStorage.getItem("token");

  // Check if student
  const isStudent = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user_data") || "{}");
      return u.role === "student";
    } catch {
      return false;
    }
  })();

  const shownNotifIds = useRef(new Set());

  const fetchUnreadNotifications = async () => {
    if (!token || !isStudent) return;
    try {
      const res = await getNotifications({ unread_only: true });
      const unread = res.data || [];
      
      const newNotif = unread.find(n => !shownNotifIds.current.has(n.id));
      if (newNotif) {
        shownNotifIds.current.add(newNotif.id);
        
        // Show the toast popup
        setToast(newNotif);
        
        // Play notification sound
        audioRef.current?.play().catch(() => {});
      }
    } catch (e) {
      console.error("Failed to poll notifications", e);
    }
  };

  useEffect(() => {
    if (!token || !isStudent) return;
    
    // Initial fetch
    fetchUnreadNotifications();
    
    // Poll every 8 seconds
    const interval = setInterval(fetchUnreadNotifications, 8000);
    return () => clearInterval(interval);
  }, [token, isStudent, location.pathname]); // recheck if page changes

  // Auto-dismiss toast after 6 seconds
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast(null);
    }, 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return <audio ref={audioRef} src="/notification.mp3" preload="auto" />;

  const isReady = toast.type === "order_ready";

  return (
    <div className="fixed top-4 left-0 right-0 z-[150] flex justify-center px-4">
      <audio ref={audioRef} src="/notification.mp3" preload="auto" />
      
      <div 
        className={`w-full max-w-sm rounded-2xl px-5 py-4 shadow-2xl flex items-start gap-3 border backdrop-blur-md transition-all animate-slide-down
          ${isReady 
            ? "bg-lime-500/90 border-lime-400 text-zinc-900" 
            : "bg-zinc-900/95 border-zinc-800 text-white"
          }`}
        style={{ animation: "slideDown 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards" }}
      >
        <span className="text-2xl flex-shrink-0">{isReady ? "🎉" : "🍔"}</span>
        <div className="flex-1 text-left">
          <p className="font-black text-base leading-tight">
            {isReady ? "Your Order is Ready!" : "Order Placed Successfully"}
          </p>
          <p className={`text-sm font-medium mt-1 ${isReady ? "text-zinc-700" : "text-zinc-300"}`}>
            {toast.message.split("\n\n").slice(1).join("\n\n") || toast.message}
          </p>
          <p className={`text-[10px] mt-2 font-mono ${isReady ? "text-zinc-600" : "text-zinc-400"}`}>
            SMS sent to {toast.phone}
          </p>
        </div>
        <button 
          onClick={() => setToast(null)} 
          className={`font-bold text-lg flex-shrink-0 transition-colors ${
            isReady ? "text-zinc-700 hover:text-zinc-950" : "text-gray-400 hover:text-white"
          }`}
        >
          ✕
        </button>
      </div>

      <style>{`
        @keyframes slideDown { 
          from { transform: translateY(-120%); opacity: 0; } 
          to { transform: translateY(0); opacity: 1; } 
        }
      `}</style>
    </div>
  );
}
