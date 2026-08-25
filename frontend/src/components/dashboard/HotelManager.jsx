import { useState, useEffect } from "react";
import { getMyStalls, createStall, updateStall, deleteStall, toggleStall } from "../../api";

export default function HotelManager({ onSelectStall }) {
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStall, setEditingStall] = useState(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState("list"); // "list" | "grid"
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    hero_image_url: "",
    location_label: "",
    owner_email: "",
    owner_password: ""
  });

  const loadStalls = async () => {
    try {
      setLoading(true);
      const res = await getMyStalls();
      setStalls(res.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStalls();
  }, []);

  const handleToggle = async (id, e) => {
    e.stopPropagation();
    try {
      await toggleStall(id);
      loadStalls();
    } catch (e) {}
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (window.confirm("Delete this hotel stall? This action cannot be undone.")) {
      try {
        await deleteStall(id);
        loadStalls();
      } catch (e) {}
    }
  };

  const handleEditClick = (stall, e) => {
    e?.stopPropagation?.();
    setEditingStall(stall);
    setFormData({
      name: stall.name,
      description: stall.description || "",
      hero_image_url: stall.hero_image_url || "",
      location_label: stall.location_label || "",
      owner_email: stall.owner_email || "",
      owner_password: ""
    });
    setShowEditModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        description: formData.description,
        hero_image_url: formData.hero_image_url,
        location_label: formData.location_label,
        slug: formData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        cuisine_type: "Other",
        menu_categories: ["Popular", "All"],
        estimated_pickup_min: 10
      };

      if (editingStall) {
        const updatePayload = {
          name: formData.name,
          description: formData.description,
          hero_image_url: formData.hero_image_url,
          location_label: formData.location_label
        };
        if (formData.owner_email) updatePayload.owner_email = formData.owner_email;
        if (formData.owner_password) updatePayload.owner_password = formData.owner_password;
        await updateStall(editingStall.id, updatePayload);
      } else {
        if (formData.owner_email) payload.owner_email = formData.owner_email;
        if (formData.owner_password) payload.owner_password = formData.owner_password;
        await createStall(payload);
      }
      
      setShowAddModal(false);
      setShowEditModal(false);
      setEditingStall(null);
      loadStalls();
    } catch (err) {
      let errorMsg = err.message;
      if (err.response?.data?.detail) {
        if (typeof err.response.data.detail === "string") {
          errorMsg = err.response.data.detail;
        } else if (Array.isArray(err.response.data.detail)) {
          errorMsg = err.response.data.detail.map(e => e.msg).join(", ");
        }
      }
      alert("Error saving hotel. " + errorMsg);
    }
  };

  const filteredStalls = stalls.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.location_label && s.location_label.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-10 h-10 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Loading hotel stalls...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top action header & search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            Hotel Stalls ({stalls.length})
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Manage your food stalls, menus, and order operations
          </p>
        </div>

        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stalls..."
              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-4 py-2 text-xs font-medium outline-none focus:border-lime-500 dark:focus:border-lime-400 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 transition-all shadow-sm"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">🔍</span>
          </div>

          {/* View Mode Toggle */}
          <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200 dark:border-zinc-700">
            <button
              onClick={() => setViewMode("list")}
              title="List View"
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                viewMode === "list"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              ☰ List
            </button>
            <button
              onClick={() => setViewMode("grid")}
              title="Grid View"
              className={`px-2.5 py-1 rounded-lg text-xs font-extrabold transition-all ${
                viewMode === "grid"
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              ▦ Grid
            </button>
          </div>

          <button
            onClick={() => {
              setFormData({ name: "", description: "", hero_image_url: "", location_label: "", owner_email: "", owner_password: "" });
              setEditingStall(null);
              setShowAddModal(true);
            }}
            className="bg-lime-500 hover:bg-lime-400 text-zinc-950 font-extrabold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-lime-500/20 hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
          >
            <span>+</span> Add Hotel
          </button>
        </div>
      </div>

      {filteredStalls.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-zinc-900/60 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 p-8 shadow-sm">
          <div className="w-16 h-16 bg-lime-500/10 text-lime-500 rounded-3xl flex items-center justify-center text-3xl mx-auto mb-4">
            🏪
          </div>
          <p className="font-extrabold text-lg text-zinc-900 dark:text-white">
            {search ? "No matching stalls found" : "No hotel stalls found"}
          </p>
          <p className="text-zinc-500 dark:text-zinc-400 text-xs max-w-sm mx-auto mt-1">
            {search ? "Try searching for another name or location." : "Create your first hotel stall to begin managing menus and live kitchen orders!"}
          </p>
        </div>
      ) : viewMode === "list" ? (
        /* ── HORIZONTAL LIST ROW ALIGNMENT ────────────────────────── */
        <div className="space-y-3.5">
          {filteredStalls.map((s) => (
            <div
              key={s.id}
              onClick={(e) => handleEditClick(s, e)}
              className="group bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/90 dark:border-zinc-800 p-4 hover:border-lime-500 dark:hover:border-lime-400 hover:shadow-xl hover:shadow-lime-500/5 transition-all duration-300 cursor-pointer flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
            >
              {/* Left: Thumbnail & Main Info */}
              <div className="flex items-center gap-4 w-full md:w-auto">
                <div className="w-20 h-20 rounded-2xl bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden flex-shrink-0">
                  {s.hero_image_url ? (
                    <img
                      src={s.hero_image_url}
                      alt={s.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-2xl">
                      🏪
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-zinc-900 dark:text-white group-hover:text-lime-500 dark:group-hover:text-lime-400 transition-colors truncate">
                      {s.name}
                    </h3>
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${
                      s.is_open 
                        ? "bg-lime-500/10 text-lime-600 dark:text-lime-400 border-lime-500/20" 
                        : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                    }`}>
                      {s.is_open ? "● Open Now" : "● Closed"}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 font-medium">
                    {s.description || "No description provided."}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500 font-semibold">
                    <span>📍 {s.location_label || "Main Campus"}</span>
                    {s.avg_rating > 0 && <span>⭐ {s.avg_rating.toFixed(1)}</span>}
                    <span>⏱ {s.estimated_pickup_min || 8} min</span>
                  </div>
                </div>
              </div>

              {/* Right: Quick Actions */}
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0 border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onSelectStall) onSelectStall(s.id);
                  }}
                  className="flex-1 sm:flex-none py-2 px-3.5 rounded-xl bg-lime-500 hover:bg-lime-400 text-zinc-950 font-extrabold text-xs flex items-center justify-center gap-1 shadow-md shadow-lime-500/15 transition-all whitespace-nowrap"
                >
                  <span>🍳</span> Open Kitchen →
                </button>

                <button
                  onClick={(e) => handleToggle(s.id, e)}
                  className={`py-2 px-3 rounded-xl text-[11px] font-extrabold border transition-colors ${
                    s.is_open
                      ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border-rose-500/20"
                      : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  }`}
                >
                  {s.is_open ? "Close" : "Open"}
                </button>

                <button
                  onClick={(e) => handleEditClick(s, e)}
                  className="py-2 px-3 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 text-[11px] font-extrabold transition-colors"
                >
                  ✏️ Edit
                </button>

                <button
                  onClick={(e) => handleDelete(s.id, e)}
                  className="py-2 px-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-[11px] font-extrabold transition-colors"
                  title="Delete Stall"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── GRID ALIGNMENT VIEW ──────────────────────────────────── */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStalls.map((s) => (
            <div
              key={s.id}
              onClick={(e) => handleEditClick(s, e)}
              className="group bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/90 dark:border-zinc-800 overflow-hidden hover:border-lime-500 dark:hover:border-lime-400 hover:shadow-xl hover:shadow-lime-500/5 transition-all duration-300 cursor-pointer flex flex-col"
            >
              {/* Image banner */}
              <div className="h-36 bg-zinc-100 dark:bg-zinc-800 relative overflow-hidden">
                {s.hero_image_url ? (
                  <img
                    src={s.hero_image_url}
                    alt={s.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-900 text-4xl">
                    🏪
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/80 via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

                {/* Status pill */}
                <div className="absolute top-3 right-3 bg-zinc-950/70 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-full text-[11px] font-bold text-white shadow-lg flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${s.is_open ? "bg-lime-400 animate-pulse" : "bg-rose-400"}`} />
                  {s.is_open ? "Open Now" : "Closed"}
                </div>

                <div className="absolute bottom-3 left-3 right-3 text-white">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-lime-500/80 text-zinc-950 backdrop-blur-sm">
                    {s.location_label || "Main Campus"}
                  </span>
                </div>
              </div>

              {/* Card content */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-extrabold text-lg text-zinc-900 dark:text-white group-hover:text-lime-500 dark:group-hover:text-lime-400 transition-colors truncate">
                    {s.name}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1 font-medium">
                    {s.description || "No description provided."}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 space-y-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onSelectStall) onSelectStall(s.id);
                    }}
                    className="w-full py-2.5 px-3 rounded-xl bg-lime-500/10 hover:bg-lime-500/20 text-lime-600 dark:text-lime-400 border border-lime-500/20 font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all"
                  >
                    <span>🍳</span> Open Kitchen Dashboard →
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => handleToggle(s.id, e)}
                      className={`flex-1 text-[11px] font-bold py-1.5 rounded-xl border transition-colors ${
                        s.is_open
                          ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 dark:text-rose-400 border-rose-500/20"
                          : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      }`}
                    >
                      {s.is_open ? "Close Stall" : "Open Stall"}
                    </button>
                    <button
                      onClick={(e) => handleEditClick(s, e)}
                      className="flex-1 text-[11px] font-bold py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-200 dark:border-zinc-700 transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={(e) => handleDelete(s.id, e)}
                      className="px-2.5 text-[11px] font-bold py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 transition-colors"
                      title="Delete Stall"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Stall Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-slide-up space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                {editingStall ? "Edit Hotel Stall" : "Add New Hotel Stall"}
              </h3>
              <button
                onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Hotel Stall Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Spice Express"
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of cuisine and specialties..."
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400 resize-none h-20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Banner Image URL</label>
                  <input
                    value={formData.hero_image_url}
                    onChange={e => setFormData({ ...formData, hero_image_url: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                    placeholder="https://..."
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Location Label</label>
                  <input
                    value={formData.location_label}
                    onChange={e => setFormData({ ...formData, location_label: e.target.value })}
                    placeholder="e.g. Block B Food Court"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Owner Email (For Login)</label>
                  <input
                    type="email"
                    required
                    value={formData.owner_email}
                    onChange={e => setFormData({ ...formData, owner_email: e.target.value })}
                    placeholder="stall@easyeats.com"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Owner Password</label>
                  <input
                    type="password"
                    required={!editingStall}
                    value={formData.owner_password}
                    onChange={e => setFormData({ ...formData, owner_password: e.target.value })}
                    placeholder={editingStall ? "Leave blank to keep same" : "••••••••"}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black py-2.5 rounded-xl text-xs shadow-md shadow-lime-500/20 transition-all"
                >
                  {editingStall ? "Save Changes" : "Create Stall"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

