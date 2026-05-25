import { useState, useEffect } from "react";
import { getMyStalls, createStall, updateStall, deleteStall, toggleStall } from "../../api";

export default function HotelManager({ onSelectStall }) {
  const [stalls, setStalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStall, setEditingStall] = useState(null);
  
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
      setStalls(res.data);
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
    if (window.confirm("Delete this hotel? This action cannot be undone.")) {
      try {
        await deleteStall(id);
        loadStalls();
      } catch (e) {}
    }
  };

  const handleEditClick = (stall, e) => {
    e.stopPropagation();
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

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Loading hotels...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-black text-zinc-900">My Hotels</h2>
        <button
          onClick={() => {
            setFormData({ name: "", description: "", hero_image_url: "", location_label: "", owner_email: "", owner_password: "" });
            setEditingStall(null);
            setShowAddModal(true);
          }}
          className="bg-zinc-900 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-zinc-800 transition-all"
        >
          + Add Hotel
        </button>
      </div>

      {stalls.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-3xl border border-gray-100">
          <div className="text-4xl mb-4">🏪</div>
          <p className="font-bold text-lg text-zinc-900">No hotels found</p>
          <p className="text-gray-400 text-sm mt-1">Add your first hotel to get started!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stalls.map(s => (
            <div
              key={s.id}
              onClick={(e) => handleEditClick(s, e)}
              className="bg-white rounded-3xl border border-gray-100 overflow-hidden hover:border-lime-400 hover:shadow-lg transition-all cursor-pointer group"
            >
              <div className="h-32 bg-gray-100 relative">
                {s.hero_image_url ? (
                  <img src={s.hero_image_url} alt={s.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-3xl">🏪</div>
                )}
                <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm px-2 py-1 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${s.is_open ? "bg-lime-500" : "bg-red-500"}`} />
                  {s.is_open ? "Open" : "Closed"}
                </div>
              </div>
              
              <div className="p-4">
                <h3 className="font-bold text-zinc-900 truncate">{s.name}</h3>
                <p className="text-xs text-gray-500 truncate mt-0.5">{s.location_label || "Campus"}</p>
                
                <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    onClick={(e) => handleToggle(s.id, e)}
                    className="flex-1 text-xs font-bold py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-zinc-700 transition-colors"
                  >
                    {s.is_open ? "Close" : "Open"}
                  </button>
                  <button
                    onClick={(e) => handleEditClick(s, e)}
                    className="flex-1 text-xs font-bold py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleDelete(s.id, e)}
                    className="flex-1 text-xs font-bold py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {(showAddModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl animate-slide-up">
            <h3 className="text-xl font-black text-zinc-900 mb-4">
              {editingStall ? "Edit Hotel" : "Add Hotel"}
            </h3>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Hotel Name</label>
                <input
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium resize-none h-20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Banner Image URL</label>
                <input
                  value={formData.hero_image_url}
                  onChange={e => setFormData({ ...formData, hero_image_url: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium"
                  placeholder="https://..."
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Location</label>
                <input
                  value={formData.location_label}
                  onChange={e => setFormData({ ...formData, location_label: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Owner Email (For Login)</label>
                <input
                  type="email"
                  required
                  value={formData.owner_email}
                  onChange={e => setFormData({ ...formData, owner_email: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">Owner Password</label>
                <input
                  type="password"
                  required={!editingStall}
                  value={formData.owner_password}
                  onChange={e => setFormData({ ...formData, owner_password: e.target.value })}
                  placeholder={editingStall ? "Leave blank to keep same" : ""}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 outline-none focus:border-lime-500 text-sm font-medium"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddModal(false); setShowEditModal(false); }}
                  className="flex-1 bg-gray-100 text-gray-600 font-bold py-3 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-lime-500 text-zinc-900 font-black py-3 rounded-xl hover:bg-lime-600 transition-colors"
                >
                  {editingStall ? "Save Changes" : "Create Hotel"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
