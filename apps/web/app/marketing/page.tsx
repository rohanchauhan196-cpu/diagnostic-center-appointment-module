"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shell } from "../../components/shell";
import { api, statuses } from "../../lib/api";
import { useQueryClient } from "@tanstack/react-query";

type Appointment = {
  id: string;
  bookingId: string;
  patientName: string;
  phoneNumber: string | null;
  appointmentDate: string;
  slot: string;
  referredBy?: string;
  notes?: string;
  status: string;
  test: { name: string };
  location?: { id: string; name: string } | null;
  createdBy: { id: string; name: string; email: string };
};

type User = { id: string; name: string; email: string; role: string; active: boolean };

const STATUS_COLORS: Record<string, string> = {
  BOOKED: "bg-blue-100 text-blue-700",
  ON_THE_WAY: "bg-amber-100 text-amber-700",
  ARRIVED: "bg-indigo-100 text-indigo-700",
  CANCELLED: "bg-rose-100 text-rose-700 line-through",
};

function getMonthOptions() {
  const options: { label: string; value: string }[] = [{ label: "All Time", value: "" }];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    options.push({ label, value: `${year}-${month}` });
  }
  return options;
}

export default function MarketingLeadsPage() {
  const queryClient = useQueryClient();
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [searchQ, setSearchQ] = useState("");

  const monthOptions = getMonthOptions();

  // Fetch all users to get marketing agents
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users-marketing"],
    queryFn: () => api<User[]>("/users"),
  });
  const marketingAgents = allUsers.filter((u) => u.role === "MARKETING");

  // Fetch all appointments (no date filter — we filter client-side by month)
  const { data: allAppointments = [], isLoading } = useQuery({
    queryKey: ["marketing-appointments"],
    queryFn: () => api<Appointment[]>("/appointments"),
  });

  // Filter to only MARKETING-created appointments
  const marketingAppts = useMemo(
    () => allAppointments.filter((a) => {
      const agent = allUsers.find((u) => u.id === a.createdBy.id);
      return agent?.role === "MARKETING";
    }),
    [allAppointments, allUsers]
  );

  // Apply filters
  const filtered = useMemo(() => {
    return marketingAppts.filter((a) => {
      if (selectedAgentId && a.createdBy.id !== selectedAgentId) return false;
      if (selectedStatus && a.status !== selectedStatus) return false;
      if (selectedMonth) {
        const apptMonth = a.appointmentDate.slice(0, 7); // YYYY-MM
        if (apptMonth !== selectedMonth) return false;
      }
      if (searchQ) {
        const q = searchQ.toLowerCase();
        if (
          !a.patientName.toLowerCase().includes(q) &&
          !(a.phoneNumber || "").includes(q) &&
          !a.bookingId.toLowerCase().includes(q) &&
          !(a.referredBy || "").toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [marketingAppts, selectedAgentId, selectedStatus, selectedMonth, searchQ]);

  // Chart data: bookings per agent (all time, no filter applied)
  const chartData = useMemo(() => {
    return marketingAgents.map((agent) => ({
      name: agent.name,
      total: marketingAppts.filter((a) => a.createdBy.id === agent.id).length,
      converted: marketingAppts.filter(
        (a) => a.createdBy.id === agent.id && ["ARRIVED"].includes(a.status)
      ).length,
    }));
  }, [marketingAgents, marketingAppts]);

  // KPIs
  const kpis = useMemo(() => {
    const startMonth = new Date();
    startMonth.setDate(1);
    startMonth.setHours(0, 0, 0, 0);
    return {
      total: marketingAppts.length,
      monthly: marketingAppts.filter((a) => new Date(a.appointmentDate) >= startMonth).length,
      converted: marketingAppts.filter((a) => ["ARRIVED"].includes(a.status)).length,
      agents: marketingAgents.length,
    };
  }, [marketingAppts, marketingAgents]);

  async function updateStatus(id: string, status: string) {
    await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    queryClient.invalidateQueries({ queryKey: ["marketing-appointments"] });
  }

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span>📱</span> Marketing Leads
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            All bookings created by marketing agents via the mobile app.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Leads", value: kpis.total, color: "border-l-orange-400" },
          { label: "This Month", value: kpis.monthly, color: "border-l-amber-400" },
          { label: "Converted", value: kpis.converted, color: "border-l-emerald-400" },
          { label: "Active Agents", value: kpis.agents, color: "border-l-blue-400" },
        ].map((k) => (
          <div className={`card border-l-4 ${k.color}`} key={k.label}>
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{k.label}</p>
            <p className="text-3xl font-bold mt-1">{k.value}</p>
          </div>
        ))}
      </section>

      {/* Chart */}
      {marketingAgents.length > 0 && (
        <section className="card mb-6">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">Agent Performance (All Time)</h2>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} />
                <Tooltip
                  contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                />
                <Bar dataKey="total" name="Total Bookings" fill="#f97316" radius={[4, 4, 0, 0]} />
                <Bar dataKey="converted" name="Converted" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-orange-400 inline-block"></span> Total Bookings</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"></span> Converted (Arrived)</span>
          </div>
        </section>
      )}

      {/* Filters + Table */}
      <div className="card">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          {/* Search */}
          <input
            className="input h-9 min-w-[200px] flex-1 text-sm"
            placeholder="Search name, phone, booking ID, doctor..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />

          {/* Agent filter */}
          <select
            className="input h-9 text-sm min-w-[160px]"
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
          >
            <option value="">All Agents</option>
            {marketingAgents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {/* Month filter */}
          <select
            className="input h-9 text-sm min-w-[160px]"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            className="input h-9 text-sm min-w-[140px]"
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
          >
            <option value="">All Statuses</option>
            {statuses.map((s) => <option key={s}>{s}</option>)}
          </select>

          {/* Clear */}
          {(selectedAgentId || selectedMonth || selectedStatus || searchQ) && (
            <button
              className="text-xs text-slate-500 hover:text-red-500 border rounded-md px-2 h-9"
              onClick={() => { setSelectedAgentId(""); setSelectedMonth(""); setSelectedStatus(""); setSearchQ(""); }}
            >
              ✕ Clear
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 dark:bg-slate-800/50 text-slate-500 text-xs uppercase font-medium">
              <tr>
                {["Booking ID", "Patient", "Phone", "Test", "Location", "Date", "Slot", "PRO Name", "Agent", "Status", "Actions"].map((h) => (
                  <th className="p-2 whitespace-nowrap" key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td className="p-4 text-center text-slate-400" colSpan={11}>Loading leads...</td></tr>
              )}
              {!isLoading && filtered.length === 0 && (
                <tr><td className="p-4 text-center text-slate-400" colSpan={11}>
                  No marketing leads found.
                  {(selectedAgentId || selectedMonth || selectedStatus || searchQ) && (
                    <button className="text-orange-500 underline ml-1" onClick={() => { setSelectedAgentId(""); setSelectedMonth(""); setSelectedStatus(""); setSearchQ(""); }}>
                      Clear filters
                    </button>
                  )}
                </td></tr>
              )}
              {filtered.map((a) => (
                <tr
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-orange-50/30 dark:hover:bg-orange-900/10"
                  key={a.id}
                >
                  <td className="p-2 font-mono text-xs font-medium">{a.bookingId}</td>
                  <td className="p-2 font-medium">{a.patientName}</td>
                  <td className="p-2 text-slate-500">{a.phoneNumber || "—"}</td>
                  <td className="p-2">{a.test.name}</td>
                  <td className="p-2 font-semibold text-medical-600">{a.location?.name || "—"}</td>
                  <td className="p-2 whitespace-nowrap">{a.appointmentDate.slice(0, 10)}</td>
                  <td className="p-2 whitespace-nowrap">{a.slot}</td>
                  <td className="p-2">{a.referredBy || "—"}</td>
                  <td className="p-2 text-xs text-orange-600 font-semibold">{a.createdBy.name}</td>
                  <td className="p-2">
                    <select
                      className="input text-xs h-8 py-0 px-2"
                      value={a.status}
                      onChange={(e) => updateStatus(a.id, e.target.value)}
                    >
                      {statuses.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="p-2">
                    <Link
                      className="text-medical-700 font-semibold hover:text-medical-500 text-xs whitespace-nowrap"
                      href={`/appointments/${a.id}`}
                    >
                      View/Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <p className="mt-3 text-xs text-slate-400 text-right">
            Showing {filtered.length} of {marketingAppts.length} marketing lead{marketingAppts.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>
    </Shell>
  );
}
