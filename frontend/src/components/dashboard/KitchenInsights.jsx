// src/components/dashboard/KitchenInsights.jsx
// Premium Sales & Insights analytics tab — KPI cards, Area charts, AOV, Peak hours & top item rankings

import { useState, useEffect } from "react";
import { getAnalytics } from "../../api";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie,
  Cell, Legend,
} from "recharts";

const STATUS_COLORS = {
  Placed:         "#3b82f6",
  Accepted:       "#6366f1",
  Preparing:      "#f59e0b",
  "Almost Ready": "#f97316",
  Ready:          "#84cc16",
  Collected:      "#10b981",
  Cancelled:      "#ef4444",
};

// ── Stat KPI Tile ─────────────────────────────────────────────────────────────
function KpiCard({ title, value, badge, subtext, icon, gradient, border }) {
  return (
    <div className={`bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-zinc-200/80 dark:border-zinc-800 shadow-sm relative overflow-hidden flex flex-col justify-between group hover:border-lime-500/50 transition-all duration-300`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-11 h-11 rounded-2xl ${gradient} flex items-center justify-center text-xl shadow-md`}>
          {icon}
        </div>
        {badge && (
          <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-lime-500/10 text-lime-600 dark:text-lime-400 border border-lime-500/20">
            {badge}
          </span>
        )}
      </div>
      <div>
        <p className="text-2xl sm:text-3xl font-black text-zinc-900 dark:text-white tracking-tight">{value}</p>
        <p className="text-xs font-extrabold text-zinc-600 dark:text-zinc-300 mt-1">{title}</p>
        {subtext && <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 font-medium">{subtext}</p>}
      </div>
    </div>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function ChartTip({ active, payload, label, prefix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-zinc-900/95 dark:bg-zinc-900/95 border border-zinc-800 backdrop-blur-md shadow-2xl rounded-2xl px-4 py-3 text-xs text-white space-y-1">
      <p className="font-black text-lime-400 border-b border-zinc-800 pb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center justify-between gap-4 font-bold pt-0.5">
          <span style={{ color: p.color }}>{p.name}:</span>
          <span className="font-black">{prefix}{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ── KitchenInsights ───────────────────────────────────────────────────────────
export default function KitchenInsights({ stallId, orders = [] }) {
  const [analytics, setAnalytics] = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [timeRange, setTimeRange] = useState("7d"); // "7d", "today", "all"

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
  const todayStr = new Date().toDateString();
  const validOrders = orders.filter((o) => o.status !== "Cancelled");
  
  const todayOrders = validOrders.filter(
    (o) => new Date(o.placed_at).toDateString() === todayStr
  );

  const todayRevenue  = todayOrders.reduce((s, o) => s + o.total, 0);
  const totalRevenue  = validOrders.reduce((s, o) => s + o.total, 0);
  const totalOrdersCount = validOrders.length;
  
  // Average Order Value (AOV)
  const aov = totalOrdersCount > 0 ? (totalRevenue / totalOrdersCount).toFixed(0) : 0;
  
  // Completion Rate %
  const completedCount = orders.filter((o) => o.status === "Collected").length;
  const completionRate = orders.length > 0 ? Math.round((completedCount / orders.length) * 100) : 100;

  // Avg prep time from collected orders
  const withPrep = orders.filter((o) => o.status === "Collected" && o.predicted_prep_min > 0);
  const avgPrep  = withPrep.length
    ? Math.round(withPrep.reduce((s, o) => s + o.predicted_prep_min, 0) / withPrep.length)
    : 8;

  // Peak ordering hour calculation
  const hourCounts = {};
  orders.forEach((o) => {
    if (!o.placed_at) return;
    const hr = new Date(o.placed_at).getHours();
    hourCounts[hr] = (hourCounts[hr] || 0) + 1;
  });
  let peakHourStr = "12 PM - 1 PM";
  let maxHrCount = 0;
  Object.entries(hourCounts).forEach(([hr, cnt]) => {
    if (cnt > maxHrCount) {
      maxHrCount = cnt;
      const h = parseInt(hr);
      const ampm = h >= 12 ? "PM" : "AM";
      const displayHr = h % 12 || 12;
      peakHourStr = `${displayHr} ${ampm} - ${(displayHr % 12) + 1} ${ampm}`;
    }
  });

  // Pie data from status_breakdown
  const pieData = (analytics?.status_breakdown || []).map((s) => ({
    name:  s._id,
    value: s.count,
    color: STATUS_COLORS[s._id] || "#71717a",
  }));

  if (loading) return (
    <div className="py-20 text-center">
      <div className="w-12 h-12 border-4 border-lime-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
      <p className="text-xs font-bold text-zinc-400">Loading Sales & Revenue Insights...</p>
    </div>
  );

  return (
    <div className="space-y-6">

      {/* ── Top Header & Range Switcher ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between bg-white dark:bg-zinc-900 p-4 sm:p-5 rounded-3xl border border-zinc-200/80 dark:border-zinc-800 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-zinc-900 dark:text-white tracking-tight flex items-center gap-2">
            <span>📊</span> Sales & Business Performance
          </h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">
            Real-time analytics, revenue trends, dish popularity, and kitchen efficiency
          </p>
        </div>

        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-2xl border border-zinc-200 dark:border-zinc-700/60 self-stretch sm:self-auto">
          {[
            { id: "7d", label: "7 Days" },
            { id: "today", label: "Today" },
            { id: "all", label: "All Time" },
          ].map((r) => (
            <button
              key={r.id}
              onClick={() => setTimeRange(r.id)}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                timeRange === r.id
                  ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          icon="💰"
          title="Total Revenue"
          value={`₹${timeRange === "today" ? todayRevenue.toFixed(0) : totalRevenue.toFixed(0)}`}
          badge={timeRange === "today" ? "Today" : "7 Days"}
          subtext="Net sales after fulfilled orders"
          gradient="bg-lime-500/10 text-lime-500"
        />
        <KpiCard
          icon="🛍️"
          title="Total Orders"
          value={timeRange === "today" ? todayOrders.length : totalOrdersCount}
          badge={`${completionRate}% Complete`}
          subtext={`${completedCount} successfully picked up`}
          gradient="bg-blue-500/10 text-blue-500"
        />
        <KpiCard
          icon="💳"
          title="Avg Order Value (AOV)"
          value={`₹${aov}`}
          subtext="Average spend per order"
          gradient="bg-amber-500/10 text-amber-500"
        />
        <KpiCard
          icon="⚡"
          title="Avg Fulfillment Time"
          value={`${avgPrep} min`}
          badge="Kitchen Speed"
          subtext={`Peak hours: ${peakHourStr}`}
          gradient="bg-emerald-500/10 text-emerald-500"
        />
      </div>

      {/* ── Revenue & Sales Area Chart ──────────────────────────────── */}
      {analytics?.daily_revenue?.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
            <div>
              <h3 className="font-extrabold text-zinc-900 dark:text-white text-base">Revenue & Sales Trends</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                Daily earnings breakdown for the last 7 active operating days
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block">7-Day Total</span>
              <span className="text-lg font-black text-lime-600 dark:text-lime-400">
                ₹{analytics.daily_revenue.reduce((s, d) => s + d.revenue, 0).toLocaleString()}
              </span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={analytics.daily_revenue}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#84cc16" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#84cc16" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} />
              <XAxis dataKey="_id" tick={{ fontSize: 11, fill: "#a1a1aa" }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 11, fill: "#a1a1aa" }} />
              <Tooltip content={<ChartTip prefix="₹" />} />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#84cc16"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#revenueGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Order Volume + Status Distribution side-by-side ────────── */}
      <div className="grid md:grid-cols-2 gap-5">

        {/* Orders Bar Chart */}
        {analytics?.daily_revenue?.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-3">
            <h3 className="font-extrabold text-zinc-900 dark:text-white text-base">Order Volume Per Day</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Number of customer orders received daily
            </p>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={analytics.daily_revenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.2} />
                <XAxis dataKey="_id" tick={{ fontSize: 10, fill: "#a1a1aa" }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 10, fill: "#a1a1aa" }} allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="orders" name="Orders" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Status Pie / Donut Chart */}
        {pieData.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-3">
            <h3 className="font-extrabold text-zinc-900 dark:text-white text-base">Order Fulfillment Breakdown</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
              Proportion of order statuses (Collected, Ready, Cancelled)
            </p>
            <ResponsiveContainer width="100%" height={190}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%" cy="50%"
                  innerRadius={50} outerRadius={75}
                  paddingAngle={4}
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
                  formatter={(v) => <span className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Top Selling Dishes & Best Sellers ───────────────────────── */}
      {analytics?.top_items?.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 sm:p-6 border border-zinc-200/80 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800/80 pb-3">
            <div>
              <h3 className="font-extrabold text-zinc-900 dark:text-white text-base">🏆 Top Selling Dishes</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                Highest revenue and volume generating menu items
              </p>
            </div>
            <span className="text-xs font-extrabold text-lime-600 dark:text-lime-400 bg-lime-500/10 px-3 py-1 rounded-full border border-lime-500/20">
              Best Sellers
            </span>
          </div>

          <div className="space-y-4">
            {analytics.top_items.map((item, i) => {
              const max = analytics.top_items[0].qty_sold || 1;
              const pct = Math.round((item.qty_sold / max) * 100);
              const rankMedals = ["🥇", "🥈", "🥉"];

              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm font-bold">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{rankMedals[i] || `#${i + 1}`}</span>
                      <span className="text-zinc-900 dark:text-white font-extrabold">{item._id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-zinc-500 dark:text-zinc-400 font-medium">
                        {item.qty_sold} units sold
                      </span>
                      <span className="font-black text-lime-600 dark:text-lime-400">
                        ₹{item.revenue.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden p-0.5">
                    <div
                      className="h-full bg-gradient-to-r from-lime-500 to-emerald-400 rounded-full transition-all duration-700 shadow-sm"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty fallback */}
      {!analytics && (
        <div className="bg-zinc-100 dark:bg-zinc-900/60 rounded-3xl p-12 text-center text-zinc-400 space-y-2 border border-dashed border-zinc-300 dark:border-zinc-800">
          <p className="text-5xl">📊</p>
          <p className="font-extrabold text-zinc-900 dark:text-white text-base">No analytics data recorded yet</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            Sales charts and insights will populate automatically as soon as your stall starts receiving customer orders!
          </p>
        </div>
      )}
    </div>
  );
}
