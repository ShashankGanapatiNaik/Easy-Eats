// src/components/dashboard/MenuManager.jsx
// Full menu management — add, edit, delete, toggle availability

import { useState, useEffect } from "react";
import {
  getAvailableMenu, addMenuItem, updateMenuItem,
  deleteMenuItem, toggleItemAvailability,
} from "../../api";

const EMPTY_FORM = {
  name: "", price: "", category: "Popular",
  description: "", prep_time_min: 5,
  image_url: "", is_veg: true, is_available: true, is_popular: false,
};

// ── Small helpers ─────────────────────────────────────────────────────────────
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                 outline-none focus:border-lime-500 focus:ring-1 focus:ring-lime-500 transition-all"
    />
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
function ItemModal({ item, categories, stallId, onSaved, onClose }) {
  const isEdit = !!item?.id;
  const [form,    setForm]    = useState(isEdit ? {
    name:         item.name         || "",
    price:        item.price        || "",
    category:     item.category     || "Popular",
    description:  item.description  || "",
    prep_time_min:item.prep_time_min || 5,
    image_url:    item.image_url    || "",
    is_veg:       item.is_veg       ?? true,
    is_available: item.is_available ?? true,
    is_popular:   item.is_popular   ?? false,
  } : { ...EMPTY_FORM });
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);

  const set = (key) => (e) =>
    setForm((f) => ({ ...f, [key]: e.target ? e.target.value : e }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.price) {
      setError("Name and price are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        price:         parseFloat(form.price),
        prep_time_min: parseInt(form.prep_time_min),
      };
      if (isEdit) {
        await updateMenuItem(item.id, payload);
      } else {
        await addMenuItem(stallId, payload);
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to save item.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center
                 bg-black/50 backdrop-blur-sm px-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full md:max-w-md rounded-t-3xl md:rounded-3xl
                   shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="font-black text-zinc-900 text-lg">
            {isEdit ? "✏️ Edit Item" : "➕ Add Item"}
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center
                       text-gray-500 hover:bg-gray-200 transition-all">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <Field label="Item Name *">
            <TextInput value={form.name} onChange={set("name")} placeholder="e.g. Chicken Burger" />
          </Field>

          {/* Price + Prep time */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹) *">
              <TextInput type="number" value={form.price} onChange={set("price")} placeholder="149" />
            </Field>
            <Field label="Prep Time (min)">
              <TextInput type="number" value={form.prep_time_min}
                onChange={set("prep_time_min")} placeholder="10" />
            </Field>
          </div>

          {/* Category */}
          <Field label="Category">
            <select
              value={form.category}
              onChange={set("category")}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                         outline-none focus:border-lime-500 bg-white"
            >
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </Field>

          {/* Description */}
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={set("description")}
              placeholder="Short description of the item…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm
                         outline-none focus:border-lime-500 resize-none transition-all"
            />
          </Field>

          {/* Image URL */}
          <Field label="Image URL">
            <TextInput value={form.image_url} onChange={set("image_url")}
              placeholder="https://images.unsplash.com/…" />
            {form.image_url && (
              <img src={form.image_url} alt="preview"
                className="mt-2 w-full h-28 object-cover rounded-xl border border-gray-100"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
          </Field>

          {/* Toggles row */}
          <div className="flex gap-4 flex-wrap">
            {/* Veg toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_veg: !f.is_veg }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_veg ? "bg-green-500" : "bg-red-400"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_veg ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-sm font-semibold text-gray-600">
                {form.is_veg ? "🟢 Veg" : "🔴 Non-Veg"}
              </span>
            </label>

            {/* Available toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_available ? "bg-lime-500" : "bg-gray-300"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_available ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-sm font-semibold text-gray-600">
                {form.is_available ? "Available" : "Out of Stock"}
              </span>
            </label>

            {/* Popular toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_popular: !f.is_popular }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_popular ? "bg-yellow-400" : "bg-gray-300"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_popular ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-sm font-semibold text-gray-600">
                ⭐ Bestseller
              </span>
            </label>
          </div>

          {error && (
            <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded-xl">⚠️ {error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-500
                         font-bold text-sm hover:bg-gray-50 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-3 rounded-xl bg-lime-500 hover:bg-lime-600
                         text-zinc-900 font-bold text-sm shadow-md transition-all
                         flex items-center justify-center gap-2 disabled:opacity-60">
              {saving
                ? <><div className="w-4 h-4 border-2 border-zinc-900/30 border-t-zinc-900 rounded-full animate-spin" /> Saving…</>
                : isEdit ? "Save Changes" : "Add Item"
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── MenuManager ───────────────────────────────────────────────────────────────
export default function MenuManager({ stallId, categories = [] }) {
  const [menu,       setMenu]       = useState({});
  const [loading,    setLoading]    = useState(true);
  const [modalItem,  setModalItem]  = useState(null);  // null=closed, {}=add, item=edit
  const [showModal,  setShowModal]  = useState(false);
  const [search,     setSearch]     = useState("");
  const [activecat,  setActiveCat]  = useState("All");
  const [deletingId, setDeletingId] = useState(null);

  const allCats = ["All", ...(categories.length ? categories : ["Popular"])];

  useEffect(() => {
    if (stallId) loadMenu();
  }, [stallId]);

  const loadMenu = async () => {
    setLoading(true);
    try {
      const res = await getAvailableMenu(stallId);
      setMenu(res.data);
    } catch {}
    finally { setLoading(false); }
  };

  // Flat list of all items for search / filter
  const allItems = Object.values(menu).flat();
  const filtered = allItems.filter((item) => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchCat    = activecat === "All" || item.category === activecat;
    return matchSearch && matchCat;
  });

  const handleToggle = async (itemId, current) => {
    await toggleItemAvailability(itemId);
    setMenu((prev) => {
      const updated = {};
      for (const cat in prev) {
        updated[cat] = prev[cat].map((i) =>
          i.id === itemId ? { ...i, is_available: !current } : i
        );
      }
      return updated;
    });
  };

  const handleDelete = async (itemId) => {
    if (!window.confirm("Delete this item permanently?")) return;
    setDeletingId(itemId);
    try {
      await deleteMenuItem(itemId);
      setMenu((prev) => {
        const updated = {};
        for (const cat in prev) {
          updated[cat] = prev[cat].filter((i) => i.id !== itemId);
        }
        return updated;
      });
    } catch {}
    finally { setDeletingId(null); }
  };

  const openAdd  = () => { setModalItem({}); setShowModal(true); };
  const openEdit = (item) => { setModalItem(item); setShowModal(true); };
  const closeModal = () => { setShowModal(false); setModalItem(null); };
  const onSaved  = () => { closeModal(); loadMenu(); };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Add Item button + search */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items…"
            className="w-full border border-gray-200 rounded-xl pl-9 pr-4 py-2.5 text-sm
                       outline-none focus:border-lime-500 transition-all"
          />
        </div>
        <button
          onClick={openAdd}
          className="bg-lime-500 hover:bg-lime-600 text-zinc-900 px-4 py-2.5 rounded-xl
                     font-bold text-sm flex items-center gap-1.5 shadow-md transition-all flex-shrink-0"
        >
          <span className="text-lg">+</span> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {allCats.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap
                        flex-shrink-0 transition-all ${
              activecat === cat
                ? "bg-zinc-900 text-white"
                : "bg-white border border-gray-200 text-gray-500 hover:border-lime-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items count */}
      <p className="text-xs text-gray-400 font-medium">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </p>

      {/* Item cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="font-semibold">No items found</p>
          <p className="text-sm mt-1">Add your first menu item above</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`bg-white rounded-2xl border border-gray-100 shadow-sm
                          flex gap-4 p-4 transition-all duration-300 ${
                !item.is_available ? "opacity-60" : "hover:shadow-md"
              }`}
            >
              {/* Image */}
              <div className="w-20 h-20 rounded-xl overflow-hidden flex-shrink-0 bg-gray-100">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      {/* Veg dot */}
                      <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${
                        item.is_veg ? "border-green-600" : "border-red-500"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          item.is_veg ? "bg-green-600" : "bg-red-500"
                        }`} />
                      </div>
                      <p className="font-bold text-zinc-900 text-sm">{item.name}</p>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{item.category} · {item.prep_time_min} min</p>
                    {item.description && (
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{item.description}</p>
                    )}
                  </div>
                  <p className="font-black text-zinc-900 flex-shrink-0">₹{item.price}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3">
                  {/* Availability toggle */}
                  <button
                    onClick={() => handleToggle(item.id, item.is_available)}
                    className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                      item.is_available ? "bg-lime-500" : "bg-gray-300"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                     shadow transition-transform ${
                      item.is_available ? "translate-x-5" : "translate-x-0"
                    }`} />
                  </button>
                  <span className="text-xs text-gray-500 font-medium">
                    {item.is_available ? "Available" : "Out of Stock"}
                  </span>

                  <div className="ml-auto flex gap-2">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-xs px-3 py-1.5 border border-gray-200 rounded-lg
                                 text-gray-600 hover:border-lime-400 hover:text-lime-600
                                 font-semibold transition-all"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-xs px-3 py-1.5 border border-red-100 rounded-lg
                                 text-red-400 hover:bg-red-50 hover:border-red-300
                                 font-semibold transition-all disabled:opacity-50"
                    >
                      {deletingId === item.id ? "…" : "🗑️"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ItemModal
          item={modalItem}
          categories={categories}
          stallId={stallId}
          onSaved={onSaved}
          onClose={closeModal}
        />
      )}
    </div>
  );
}