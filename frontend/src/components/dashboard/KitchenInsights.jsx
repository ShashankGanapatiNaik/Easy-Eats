// src/components/dashboard/KitchenInsights.jsx
// Analytics tab — stats cards + revenue/orders charts + pie distribution

import { useState, useEffect } from "react";
import { getAnalytics } from "../../api";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie,
  Cell, Legend,
} from "recharts";

const STATUS_COLORS = {
  Placed:         "#3b82f6",
  Accepted:       "#6366f1",
  Preparing:      "#f59e0b",
  "Almost Ready": "#f97316",
  Ready:          "#84cc16",
  Collected:      "#71717a",
  Cancelled:      "#ef4444",
};

// ── Stat tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, icon, color }) {
  return (
    <div className={`bg-white rounded-2xl p-4 border border-gray-100 shadow-sm`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className={`text-2xl font-black ${color}`}>{value}</span>
      </div>
      <p className="text-sm font-bold text-zinc-900">{label}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, prefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 shadow-lg rounded-xl px-3 py-2 text-sm">
      <p className="font-bold text-zinc-900 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-semibold">
          {p.name}: {prefix}{p.value}
        </p>
      ))}
    </div>
  );
}

// ── KitchenInsights ───────────────────────────────────────────────────────────
export default function KitchenInsights({ stallId, orders = [] }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (!stallId) return;
    (async () => {
      try {
        const res = await getAnalytics(stallId);
        setAnalytics(res.data);
      } catch {}
      finally { setLoading(false); }
    })();
  }, [stallId]);

  // ── Derived live stats from orders prop ────────────────────────────────────
  const today = new Date().toDateString();
  const todayOrders = orders.filter(
    (o) => new Date(o.placed_at).toDateString() === today && o.status !== "Cancelled"
  );
  const todayRevenue  = todayOrders.reduce((s, o) => s + o.total, 0);
  const pendingCount  = orders.filter((o) => o.status === "Placed").length;
  const preparingCount= orders.filter((o) => ["Accepted","Preparing","Almost Ready"].includes(o.status)).length;
  const readyCount    = orders.filter((o) => o.status === "Ready").length;
  const collectedToday= todayOrders.filter((o) => o.status === "Collected").length;

  // Avg prep time from collected orders that have predicted_prep_min
  const withPrep = orders.filter((o) => o.status === "Collected" && o.predicted_prep_min > 0);
  const avgPrep  = withPrep.length
    ? Math.round(withPrep.reduce((s, o) => s + o.predicted_prep_min, 0) / withPrep.length)
    : 0;

  // Pie data from status_breakdown
  const pieData = (analytics?.status_breakdown || []).map((s) => ({
    name:  s._id,
    value: s.count,
    color: STATUS_COLORS[s._id] || "#ccc",
  }));

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-8 h-8 border-4 border-lime-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* ── Live Stats Grid ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Tile icon="⏳" label="Pending"       value={pendingCount}   color="text-blue-600"   sub="Waiting to be accepted" />
        <Tile icon="👨‍🍳" label="Preparing"     value={preparingCount} color="text-amber-500"  sub="In the kitchen now" />
        <Tile icon="✅" label="Ready"         value={readyCount}     color="text-lime-600"   sub="Waiting for pickup" />
        <Tile icon="📦" label="Collected Today" value={collectedToday} color="text-zinc-600" sub="Completed orders" />
        <Tile icon="💰" label="Revenue Today" value={`₹${todayRevenue.toFixed(0)}`} color="text-lime-600" sub="Excluding cancelled" />
        <Tile icon="⏱️" label="Avg Prep Time" value={avgPrep ? `${avgPrep}m` : "--"} color="text-indigo-600" sub="Collected orders" />
      </div>

      {/* ── Revenue Chart ────────────────────────────────────────────── */}
      {analytics?.daily_revenue?.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-zinc-900">Revenue — Last 7 Days</h3>
            <span className="text-xs text-gray-400 font-medium">
              Total: ₹{analytics.daily_revenue.reduce((s, d) => s + d.revenue, 0).toFixed(0)}
            </span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={analytics.daily_revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="_id" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip content={<ChartTip prefix="₹" />} />
              <Line
                type="monotone" dataKey="revenue" name="Revenue"
                stroke="#84cc16" strokeWidth={2.5}
                dot={{ fill: "#84cc16", r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Orders Per Day + Top Items side-by-side ───────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">

        {/* Orders per day */}
        {analytics?.daily_revenue?.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4">Orders Per Day</h3>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={analytics.daily_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="_id" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="orders" name="Orders" fill="#84cc16" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status pie chart */}
        {pieData.length > 0 && (
          <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4">Status Distribution</h3>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={40} outerRadius={65}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [v, n]} />
                <Legend
                  iconType="circle"
                  iconSize={8}
                  formatter={(v) => <span className="text-xs text-gray-600">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Top items ─────────────────────────────────────────────────── */}
      {analytics?.top_items?.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h3 className="font-bold text-zinc-900 mb-4">Top Items by Sales</h3>
          <div className="space-y-3">
            {analytics.top_items.map((item, i) => {
              const max = analytics.top_items[0].qty_sold;
              const pct = Math.round((item.qty_sold / max) * 100);
              return (
                <div key={i}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-semibold text-zinc-900">
                      #{i + 1} {item._id}
                    </span>
                    <span className="text-gray-500 font-medium">
                      {item.qty_sold} sold · ₹{item.revenue}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-lime-500 rounded-full transition-all duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!analytics && (
        <div className="bg-gray-50 rounded-2xl p-8 text-center text-gray-400">
          <p className="text-3xl mb-2">📊</p>
          <p className="font-semibold">No analytics yet</p>
          <p className="text-sm mt-1">Data appears once you start receiving orders</p>
        </div>
      )}
    </div>
  );
}