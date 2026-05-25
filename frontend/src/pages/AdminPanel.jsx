import { useNavigate } from "react-router-dom";
import HotelManager from "../components/dashboard/HotelManager";

function getUser() {
  try { return JSON.parse(localStorage.getItem("user_data") || "{}"); }
  catch { return {}; }
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const user = getUser();

  const handleSelectStall = (id) => {
    navigate(`/kitchen/${id}`);
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user_data");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-zinc-50 pb-20">
      {/* ── Top Navbar ──────────────────────────────────────────────────── */}
      <div className="bg-zinc-900 text-white px-4 py-3 sticky top-0 z-30
                      flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-bold text-sm leading-tight">Admin Dashboard</h1>
            <p className="text-zinc-400 text-xs">
              Welcome, {user.name || "Owner"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="text-zinc-400 hover:text-red-400 text-xs px-2 transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="px-4 py-6 max-w-2xl mx-auto xl:max-w-5xl">
        <HotelManager onSelectStall={handleSelectStall} />
      </div>
    </div>
  );
}