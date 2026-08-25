// src/components/dashboard/MenuManager.jsx
// Full menu management — add, edit, delete, toggle availability

import { useState, useEffect } from "react";
import {
  getMenu, addMenuItem, updateMenuItem,
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
      <label className="block text-[11px] font-bold text-zinc-500 dark:text-zinc-400 mb-1 uppercase tracking-wider">
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
      className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium
                 outline-none focus:border-lime-500 text-zinc-900 dark:text-white placeholder-zinc-400 transition-all"
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
                 bg-zinc-950/70 backdrop-blur-md px-0 md:px-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 w-full md:max-w-md rounded-t-3xl md:rounded-3xl
                   shadow-2xl overflow-y-auto max-h-[90vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="font-black text-zinc-900 dark:text-white text-lg">
            {isEdit ? "✏️ Edit Menu Item" : "➕ Add New Menu Item"}
          </h2>
          <button onClick={onClose}
            className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center
                       text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-all">
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
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium
                         outline-none focus:border-lime-500 text-zinc-900 dark:text-white"
            >
              {categories.map((c) => (
                <option key={c} value={c} className="bg-white dark:bg-zinc-900">{c}</option>
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
              className="w-full bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-medium
                         outline-none focus:border-lime-500 text-zinc-900 dark:text-white placeholder-zinc-400 resize-none transition-all"
            />
          </Field>

          {/* Image URL */}
          <Field label="Image URL">
            <TextInput value={form.image_url} onChange={set("image_url")}
              placeholder="https://images.unsplash.com/…" />
            {form.image_url && (
              <img src={form.image_url} alt="preview"
                className="mt-2 w-full h-28 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700"
                onError={(e) => { e.target.style.display = "none"; }}
              />
            )}
          </Field>

          {/* Toggles row */}
          <div className="flex gap-4 flex-wrap pt-1">
            {/* Veg toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_veg: !f.is_veg }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_veg ? "bg-emerald-500" : "bg-rose-500"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_veg ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {form.is_veg ? "🟢 Veg" : "🔴 Non-Veg"}
              </span>
            </label>

            {/* Available toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_available: !f.is_available }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_available ? "bg-lime-500" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_available ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                {form.is_available ? "In Stock" : "Out of Stock"}
              </span>
            </label>

            {/* Popular toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, is_popular: !f.is_popular }))}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  form.is_popular ? "bg-amber-400" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                 shadow transition-transform ${
                  form.is_popular ? "translate-x-5" : "translate-x-0"
                }`} />
              </button>
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                ⭐ Bestseller
              </span>
            </label>
          </div>

          {error && (
            <p className="text-rose-500 text-xs bg-rose-500/10 border border-rose-500/20 px-3 py-2 rounded-xl">⚠️ {error}</p>
          )}

          <div className="flex gap-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400
                         font-bold text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2.5 rounded-xl bg-lime-500 hover:bg-lime-400
                         text-zinc-950 font-black text-xs shadow-md shadow-lime-500/20 transition-all
                         flex items-center justify-center gap-2 disabled:opacity-60">
              {saving
                ? <><div className="w-4 h-4 border-2 border-zinc-950/30 border-t-zinc-950 rounded-full animate-spin" /> Saving…</>
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
      const res = await getMenu(stallId);
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
      <div className="flex gap-2.5">
        <div className="relative flex-1">
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400"
            xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu items..."
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium outline-none focus:border-lime-500 text-zinc-900 dark:text-white placeholder-zinc-400 transition-all shadow-sm"
          />
        </div>
        <button
          onClick={openAdd}
          className="bg-lime-500 hover:bg-lime-400 text-zinc-950 px-4 py-2.5 rounded-2xl
                     font-black text-xs flex items-center gap-1.5 shadow-md shadow-lime-500/20 transition-all flex-shrink-0"
        >
          <span className="text-base">+</span> Add Item
        </button>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {allCats.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap
                        flex-shrink-0 transition-all ${
              activecat === cat
                ? "bg-zinc-900 text-white dark:bg-lime-500 dark:text-zinc-950 shadow-sm"
                : "bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-lime-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Items count */}
      <p className="text-xs text-zinc-400 font-medium px-1">
        {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        {search && ` matching "${search}"`}
      </p>

      {/* Item cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-zinc-900/60 rounded-3xl border border-zinc-200/80 dark:border-zinc-800/80 p-8 shadow-sm">
          <p className="text-4xl mb-3">🍽️</p>
          <p className="font-extrabold text-zinc-900 dark:text-white">No menu items found</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Add your first menu item above to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm
                          flex gap-4 p-4 transition-all duration-300 ${
                !item.is_available ? "opacity-60 dark:opacity-50" : "hover:border-zinc-300 dark:hover:border-zinc-700 hover:shadow-md"
              }`}
            >
              {/* Image */}
              <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 bg-zinc-100 dark:bg-zinc-800 relative">
                {item.image_url ? (
                  <img src={item.image_url} alt={item.name}
                    className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl">🍽️</div>
                )}
                {item.is_popular && (
                  <div className="absolute top-1 left-1 bg-amber-400 text-zinc-950 text-[9px] font-black px-1.5 py-0.5 rounded-md shadow">
                    ★ BEST
                  </div>
                )}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        {/* Veg dot */}
                        <div className={`w-3 h-3 rounded-sm border-2 flex items-center justify-center ${
                          item.is_veg ? "border-emerald-600" : "border-rose-500"
                        }`}>
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            item.is_veg ? "bg-emerald-600" : "bg-rose-500"
                          }`} />
                        </div>
                        <p className="font-extrabold text-zinc-900 dark:text-white text-sm">{item.name}</p>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 font-medium">{item.category} · {item.prep_time_min} min prep</p>
                      {item.description && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-1">{item.description}</p>
                      )}
                    </div>
                    <p className="font-black text-zinc-900 dark:text-lime-400 text-base flex-shrink-0">₹{item.price}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                  {/* Availability toggle */}
                  <button
                    onClick={() => handleToggle(item.id, item.is_available)}
                    className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${
                      item.is_available ? "bg-lime-500" : "bg-zinc-300 dark:bg-zinc-700"
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full
                                     shadow transition-transform ${
                      item.is_available ? "translate-x-4" : "translate-x-0"
                    }`} />
                  </button>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400 font-bold">
                    {item.is_available ? "In Stock" : "Out of Stock"}
                  </span>

                  <div className="ml-auto flex gap-1.5">
                    <button
                      onClick={() => openEdit(item)}
                      className="text-xs px-3 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-xl
                                 text-zinc-700 dark:text-zinc-200 font-bold transition-all"
                    >
                      ✏️ Edit
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="text-xs px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl
                                 text-rose-500 font-bold transition-all disabled:opacity-50"
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