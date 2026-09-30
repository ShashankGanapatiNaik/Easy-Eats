import { useState, useEffect } from "react";
import { getColleges, createCollege, updateCollege, deleteCollege, getMyStalls, createStall, unassignHotelFromCollege } from "../../api";

export default function CollegeManager() {
  const [colleges, setColleges] = useState([]);
  const [allHotels, setAllHotels] = useState([]);
  const [loading, setLoading] = useState(true);

  // College Add / Edit Modal state
  const [showAddCollegeModal, setShowAddCollegeModal] = useState(false);
  const [showEditCollegeModal, setShowEditCollegeModal] = useState(false);
  const [editingCollege, setEditingCollege] = useState(null);

  const [collegeFormData, setCollegeFormData] = useState({
    name: "",
    domain: "",
  });

  // Hotel Add Modal state for a specific college
  const [targetCollegeForHotel, setTargetCollegeForHotel] = useState(null);
  const [showAddHotelModal, setShowAddHotelModal] = useState(false);
  const [hotelFormData, setHotelFormData] = useState({
    name: "",
    description: "",
    hero_image_url: "",
    location_label: "",
    owner_email: "",
    owner_password: ""
  });
  const [creatingHotel, setCreatingHotel] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [colRes, hotelRes] = await Promise.all([
        getColleges(),
        getMyStalls()
      ]);
      setColleges(colRes.data || []);
      setAllHotels(hotelRes.data || []);
    } catch (err) {
      console.error("Failed to load college management data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCollegeSubmit = async (e) => {
    e.preventDefault();
    if (!collegeFormData.name.trim() || !collegeFormData.domain.trim()) {
      alert("Name and Domain are required.");
      return;
    }

    let domain = collegeFormData.domain.trim();
    if (!domain.startsWith("@")) domain = "@" + domain;

    try {
      if (editingCollege) {
        await updateCollege(editingCollege.id, {
          name: collegeFormData.name.trim(),
          domain: domain,
        });
      } else {
        await createCollege({
          name: collegeFormData.name.trim(),
          domain: domain,
        });
      }
      setShowAddCollegeModal(false);
      setShowEditCollegeModal(false);
      setEditingCollege(null);
      setCollegeFormData({ name: "", domain: "" });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error saving college.");
    }
  };

  const handleDeleteCollege = async (id, name) => {
    if (window.confirm(`Delete college '${name}'? This action cannot be undone.`)) {
      try {
        await deleteCollege(id);
        loadData();
      } catch (err) {
        alert(err.response?.data?.detail || "Failed to delete college.");
      }
    }
  };

  const handleOpenAddHotel = (college) => {
    setTargetCollegeForHotel(college);
    setHotelFormData({
      name: "",
      description: "",
      hero_image_url: "",
      location_label: college.name + " Campus",
      owner_email: "",
      owner_password: ""
    });
    setShowAddHotelModal(true);
  };

  const handleCreateHotelSubmit = async (e) => {
    e.preventDefault();
    if (!targetCollegeForHotel) return;
    if (!hotelFormData.name.trim()) {
      alert("Hotel Name is required.");
      return;
    }

    setCreatingHotel(true);
    try {
      const payload = {
        name: hotelFormData.name.trim(),
        description: hotelFormData.description.trim(),
        hero_image_url: hotelFormData.hero_image_url.trim(),
        location_label: hotelFormData.location_label.trim(),
        slug: hotelFormData.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now(),
        cuisine_type: "Other",
        menu_categories: ["Popular", "All"],
        estimated_pickup_min: 10,
        college_id: targetCollegeForHotel.id
      };
      if (hotelFormData.owner_email) payload.owner_email = hotelFormData.owner_email.trim();
      if (hotelFormData.owner_password) payload.owner_password = hotelFormData.owner_password.trim();

      await createStall(payload);
      setShowAddHotelModal(false);
      setTargetCollegeForHotel(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Error creating hotel for college.");
    } finally {
      setCreatingHotel(false);
    }
  };

  const handleUnassignHotel = async (collegeId, hotelId) => {
    try {
      await unassignHotelFromCollege(collegeId, hotelId);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || "Failed to unassign hotel.");
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="w-10 h-10 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">Loading colleges & domain settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-zinc-900 dark:text-white tracking-tight">
            Colleges & Campus Domains ({colleges.length})
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Configure official email domains and create hotels assigned specifically to each college campus
          </p>
        </div>

        <button
          onClick={() => {
            setCollegeFormData({ name: "", domain: "" });
            setEditingCollege(null);
            setShowAddCollegeModal(true);
          }}
          className="bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black px-4 py-2.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-lime-500/20 transition-all hover:scale-105 active:scale-95"
        >
          <span>+</span> Add College
        </button>
      </div>

      {/* College Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {colleges.map((col) => {
          const assignedHotels = allHotels.filter((h) =>
            col.hotel_ids && col.hotel_ids.includes(h.id)
          );

          return (
            <div
              key={col.id}
              className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm space-y-5 relative overflow-hidden flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* College Header */}
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🎓</span>
                      <h3 className="text-lg font-black text-zinc-900 dark:text-white">
                        {col.name}
                      </h3>
                    </div>
                    <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-lime-500/10 text-lime-600 dark:text-lime-400 border border-lime-500/20 text-xs font-bold font-mono">
                      ✉️ {col.domain}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingCollege(col);
                        setCollegeFormData({ name: col.name, domain: col.domain });
                        setShowEditCollegeModal(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 text-xs font-bold transition-colors"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCollege(col.id, col.name)}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 text-xs font-bold transition-colors"
                      title="Delete College"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Assigned Hotels List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      Assigned Hotels ({assignedHotels.length})
                    </h4>
                  </div>

                  {assignedHotels.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic bg-zinc-50 dark:bg-zinc-800/40 p-3 rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 text-center">
                      No hotels created for this college yet.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {assignedHotels.map((h) => (
                        <div
                          key={h.id}
                          className="flex items-center justify-between bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-2xl border border-zinc-200/70 dark:border-zinc-700/60"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-lime-500/10 text-lime-600 dark:text-lime-400 font-bold text-xs flex items-center justify-center">
                              🏨
                            </div>
                            <div>
                              <p className="text-xs font-bold text-zinc-900 dark:text-white">
                                {h.name}
                              </p>
                              <p className="text-[10px] text-zinc-400">
                                {h.location_label || "Main Campus"}
                              </p>
                            </div>
                          </div>

                          <button
                            onClick={() => handleUnassignHotel(col.id, h.id)}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors"
                            title="Remove from this college"
                          >
                            Remove ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Create Hotel Action Button inside College card */}
              <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => handleOpenAddHotel(col)}
                  className="w-full bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md shadow-lime-500/15 transition-all hover:scale-[1.01] active:scale-[0.99]"
                >
                  <span>+</span> Create Hotel for {col.name}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit College Modal */}
      {(showAddCollegeModal || showEditCollegeModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-5 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                {editingCollege ? "Edit College" : "Add New College"}
              </h3>
              <button
                onClick={() => { setShowAddCollegeModal(false); setShowEditCollegeModal(false); }}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCollegeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                  College Name *
                </label>
                <input
                  required
                  value={collegeFormData.name}
                  onChange={(e) => setCollegeFormData({ ...collegeFormData, name: e.target.value })}
                  placeholder="e.g. REVA University"
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">
                  Official Email Domain *
                </label>
                <input
                  required
                  value={collegeFormData.domain}
                  onChange={(e) => setCollegeFormData({ ...collegeFormData, domain: e.target.value })}
                  placeholder="e.g. @reva.edu.in"
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white font-mono placeholder-zinc-400"
                />
                <p className="text-[11px] text-zinc-400 mt-1">
                  Only students with an email ending in this domain can register.
                </p>
              </div>

              <div className="flex gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setShowAddCollegeModal(false); setShowEditCollegeModal(false); }}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-lime-500 hover:bg-lime-400 text-zinc-950 font-black py-2.5 rounded-xl text-xs shadow-md shadow-lime-500/20 transition-all"
                >
                  {editingCollege ? "Save Changes" : "Create College"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Hotel for Specific College Modal */}
      {showAddHotelModal && targetCollegeForHotel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-md p-4 animate-fade-in">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 w-full max-w-lg shadow-2xl space-y-5 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100 dark:border-zinc-800">
              <div>
                <h3 className="text-xl font-black text-zinc-900 dark:text-white">
                  Add Hotel for {targetCollegeForHotel.name}
                </h3>
                <p className="text-xs text-lime-600 dark:text-lime-400 font-bold mt-0.5">
                  Assigned domain: {targetCollegeForHotel.domain}
                </p>
              </div>
              <button
                onClick={() => { setShowAddHotelModal(false); setTargetCollegeForHotel(null); }}
                className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center justify-center font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateHotelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Hotel / Stall Name *</label>
                <input
                  required
                  value={hotelFormData.name}
                  onChange={(e) => setHotelFormData({ ...hotelFormData, name: e.target.value })}
                  placeholder="e.g. Spice Express"
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Description</label>
                <textarea
                  value={hotelFormData.description}
                  onChange={(e) => setHotelFormData({ ...hotelFormData, description: e.target.value })}
                  placeholder="Brief description of cuisine and specialties..."
                  className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium text-zinc-900 dark:text-white placeholder-zinc-400 resize-none h-20"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Location Label</label>
                  <input
                    value={hotelFormData.location_label}
                    onChange={(e) => setHotelFormData({ ...hotelFormData, location_label: e.target.value })}
                    placeholder="e.g. Block B Food Court"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Banner Image URL</label>
                  <input
                    value={hotelFormData.hero_image_url}
                    onChange={(e) => setHotelFormData({ ...hotelFormData, hero_image_url: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                    placeholder="https://..."
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Owner Email (For Login)</label>
                  <input
                    type="email"
                    value={hotelFormData.owner_email}
                    onChange={(e) => setHotelFormData({ ...hotelFormData, owner_email: e.target.value })}
                    placeholder="stall@easyeats.com"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-zinc-500 dark:text-zinc-400 mb-1">Owner Password</label>
                  <input
                    type="password"
                    value={hotelFormData.owner_password}
                    onChange={(e) => setHotelFormData({ ...hotelFormData, owner_password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-lime-500 text-xs font-medium text-zinc-900 dark:text-white placeholder-zinc-400"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={() => { setShowAddHotelModal(false); setTargetCollegeForHotel(null); }}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 font-bold py-2.5 rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingHotel}
                  className="flex-1 bg-lime-500 hover:bg-lime-400 disabled:opacity-60 text-zinc-950 font-black py-2.5 rounded-xl text-xs shadow-md shadow-lime-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  {creatingHotel ? "Creating..." : `Create Hotel & Assign to ${targetCollegeForHotel.name}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
