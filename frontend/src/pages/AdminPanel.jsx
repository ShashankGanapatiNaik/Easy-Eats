import { useState } from "react";
import { useNavigate } from "react-router-dom";
import HotelManager from "../components/dashboard/HotelManager";
import CollegeManager from "../components/dashboard/CollegeManager";
import { useTheme } from "../context/ThemeContext";

function getUser() {
  try { return JSON.parse(localStorage.getItem("user_data") || "{}"); }
  catch { return {}; }
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const user = getUser();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("hotels"); // "hotels" | "colleges"

  const handleSelectStall = (id) => {
    navigate(`/kitchen/${id}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_data");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200 pb-20">
      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <header className="bg-zinc-900/95 dark:bg-zinc-900/90 backdrop-blur-md text-white px-4 py-3.5 sticky top-0 z-30 flex items-center justify-between border-b border-zinc-800 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-lime-500 to-emerald-400 text-zinc-950 font-black flex items-center justify-center text-base shadow-md shadow-lime-500/20">
            {user.name ? user.name.charAt(0).toUpperCase() : "A"}
          </div>
          <div>
            <h1 className="font-black text-base tracking-tight leading-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
              Admin Portal
            </h1>
            <p className="text-zinc-400 text-xs font-medium">
              Manager: <span className="text-lime-400 font-semibold">{user.name || "Admin"}</span>
            </p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="hidden sm:flex items-center bg-zinc-800/80 p-1 rounded-2xl border border-zinc-700/60">
          <button
            onClick={() => setActiveTab("hotels")}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
              activeTab === "hotels"
                ? "bg-lime-500 text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🏨 Hotels & Stalls
          </button>
          <button
            onClick={() => setActiveTab("colleges")}
            className={`px-4 py-1.5 rounded-xl text-xs font-black transition-all ${
              activeTab === "colleges"
                ? "bg-lime-500 text-zinc-950 shadow-md"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            🎓 Colleges & Domains
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Theme Switcher Button */}
          <button
            onClick={toggleTheme}
            className="w-9 h-9 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 border border-zinc-700/60 flex items-center justify-center text-sm transition-all duration-200 hover:scale-105 active:scale-95"
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>

          <button
            onClick={handleLogout}
            className="text-xs font-bold px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-all hover:scale-105 active:scale-95"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Mobile Tab Toggle */}
      <div className="sm:hidden px-4 pt-4 flex gap-2">
        <button
          onClick={() => setActiveTab("hotels")}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${
            activeTab === "hotels"
              ? "bg-lime-500 text-zinc-950 border-lime-500 shadow-md"
              : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          🏨 Hotels
        </button>
        <button
          onClick={() => setActiveTab("colleges")}
          className={`flex-1 py-2 rounded-xl text-xs font-extrabold border transition-all ${
            activeTab === "colleges"
              ? "bg-lime-500 text-zinc-950 border-lime-500 shadow-md"
              : "bg-white dark:bg-zinc-900 text-zinc-500 border-zinc-200 dark:border-zinc-800"
          }`}
        >
          🎓 Colleges
        </button>
      </div>

      <main className="px-4 py-6 max-w-2xl mx-auto xl:max-w-6xl">
        {activeTab === "hotels" ? (
          <HotelManager onSelectStall={handleSelectStall} />
        ) : (
          <CollegeManager />
        )}
      </main>
    </div>
  );
}