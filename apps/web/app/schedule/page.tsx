"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FlaskConical, MapPin, Phone, User, Plus } from "lucide-react";
import Link from "next/link";
import { Shell } from "../../components/shell";
import { api, statuses } from "../../lib/api";
import { getUser } from "../../lib/auth";
import { socket } from "../../lib/socket";

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
  totalPrice?: number | null;
  advanceReceived?: number | null;
  subTest?: string | null;
  test: { id: string; name: string };
  location?: { id: string; name: string; showContactToTechnicians?: boolean } | null;
  createdBy: { name: string };
  createdAt: string;
};

function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayAfterTomorrowLocal() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  BOOKED:           { bg: "bg-blue-50 border-blue-200",       text: "text-blue-700",       dot: "bg-blue-400",       label: "Booked" },
  CONFIRMED:        { bg: "bg-teal-50 border-teal-200",       text: "text-teal-700",      dot: "bg-teal-400",      label: "Confirmed (Coming)" },
  ON_THE_WAY:       { bg: "bg-amber-50 border-amber-200",     text: "text-amber-700",     dot: "bg-amber-400",     label: "On the way" },
  ARRIVED:          { bg: "bg-indigo-50 border-indigo-200",   text: "text-indigo-700",    dot: "bg-indigo-400",    label: "Arrived" },
  SCAN_STARTED:     { bg: "bg-purple-50 border-purple-200",   text: "text-purple-700",    dot: "bg-purple-500",    label: "Scan Started" },
  SCAN_DONE:        { bg: "bg-cyan-50 border-cyan-200",       text: "text-cyan-700",      dot: "bg-cyan-500",      label: "Scan Done" },
  REPORT_DELIVERED: { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700",   dot: "bg-emerald-500",   label: "Report Delivered" },
  CANCELLED:        { bg: "bg-red-50 border-red-200",         text: "text-red-600",       dot: "bg-red-400",       label: "Cancelled" },
};

export default function SchedulePage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";
  const queryClient = useQueryClient();
  const [selectedLocation, setSelectedLocation] = useState(() => {
    return ((user?.role === "TECHNICIAN" || user?.role === "OPERATOR") && user?.locationId) ? user.locationId : "";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTest, setSelectedTest] = useState("");
  const [halfFilter, setHalfFilter] = useState<"all" | "first" | "second">("all");
  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "dayAfter" | "all" | "custom" | "recent">("today");
  const [customDate, setCustomDate] = useState("");
  const [recentPage, setRecentPage] = useState(1);
  const RECENT_PAGE_SIZE = 30;

  const dateToday = todayLocal();
  const dateTomorrow = tomorrowLocal();
  const dateDayAfter = dayAfterTomorrowLocal();

  const queryDate = useMemo(() => {
    if (activeTab === "today") return dateToday;
    if (activeTab === "tomorrow") return dateTomorrow;
    if (activeTab === "dayAfter") return dateDayAfter;
    if (activeTab === "all") return "";
    if (activeTab === "recent") return ""; // fetch all, sort client-side
    return customDate;
  }, [activeTab, customDate, dateToday, dateTomorrow, dateDayAfter]);

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ id: string; name: string; active: boolean }[]>("/locations")
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests"],
    queryFn: () => api<{ id: string; name: string; active: boolean }[]>("/tests")
  });
  const filteredTestsForUser = useMemo(() => {
    if (user?.role === "TECHNICIAN" && user?.testTypes && user.testTypes.length > 0) {
      const allowedIds = user.testTypes.map((t) => t.id);
      return tests.filter((t) => allowedIds.includes(t.id));
    }
    return tests;
  }, [tests, user]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["schedule", queryDate || "all", selectedLocation],
    queryFn: () => {
      const params = new URLSearchParams();
      if (queryDate) params.set("date", queryDate);
      if (selectedLocation) params.set("locationId", selectedLocation);
      return api<Appointment[]>(`/appointments?${params.toString()}`);
    },
    refetchInterval: 30000 // auto-refresh every 30s
  });

  async function updateStatus(id: string, status: string) {
    await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    queryClient.invalidateQueries({ queryKey: ["schedule"] });
    queryClient.invalidateQueries({ queryKey: ["slots"] });
  }

  useEffect(() => {
    socket.connect();
    const handleChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
    };
    socket.on("appointment:changed", handleChanged);
    socket.on("slots:changed", handleChanged);
    return () => {
      socket.off("appointment:changed", handleChanged);
      socket.off("slots:changed", handleChanged);
      socket.disconnect();
    };
  }, [queryClient]);

  function parseTimeStr(timeStr: string): number {
    if (!timeStr) return 0;
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
    if (!match) return 0;
    let h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    const ampm = match[3] ? match[3].toUpperCase() : "";
    if (ampm === "PM" && h !== 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  const filteredData = useMemo(() => {
    return data.filter(a => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchName = a.patientName.toLowerCase().includes(q);
        const matchBookingId = a.bookingId.toLowerCase().includes(q);
        const canSeePhone = user?.role !== "TECHNICIAN" || a.location?.showContactToTechnicians;
        const matchPhone = canSeePhone && a.phoneNumber?.toLowerCase().includes(q);
        if (!matchName && !matchBookingId && !matchPhone) return false;
      }
      if (selectedTest) {
        if (a.test.id !== selectedTest) return false;
      }
      if (halfFilter === "first") {
        if (parseTimeStr(a.slot) >= 780) return false; // 1 PM onwards
      } else if (halfFilter === "second") {
        if (parseTimeStr(a.slot) < 780) return false; // Before 1 PM
      }
      return true;
    });
  }, [data, searchQuery, selectedTest, halfFilter, user?.role]);

  // Group appointments by slot
  const slotGroups = filteredData
    .filter(a => a.status !== "CANCELLED")
    .reduce<Record<string, Appointment[]>>((acc, appt) => {
      const key = appt.slot;
      if (!acc[key]) acc[key] = [];
      acc[key].push(appt);
      return acc;
    }, {});

  // Sort appointments within each slot so that ARRIVED is last
  Object.keys(slotGroups).forEach(slot => {
    slotGroups[slot].sort((a, b) => {
      if (a.status === "ARRIVED" && b.status !== "ARRIVED") return 1;
      if (a.status !== "ARRIVED" && b.status === "ARRIVED") return -1;
      return 0;
    });
  });

  // Sort slots: strictly chronologically by time
  const sortedSlots = Object.keys(slotGroups)
    .sort((a, b) => {
      return parseTimeStr(a) - parseTimeStr(b);
    });
  const cancelled = filteredData.filter(a => a.status === "CANCELLED");

  const kpis = useMemo(() => {
    const totalRevenue = filteredData.reduce((sum, a) => sum + (a.totalPrice ?? 0), 0);
    const totalPending = filteredData.reduce((sum, a) => sum + Math.max((a.totalPrice ?? 0) - (a.advanceReceived ?? 0), 0), 0);
    return {
      total: filteredData.filter(a => a.status !== "CANCELLED").length,
      onTheWay: filteredData.filter(a => a.status === "ON_THE_WAY").length,
      arrived: filteredData.filter(a => a.status === "ARRIVED").length,
      revenue: `₹${totalRevenue.toLocaleString("en-IN")}`,
      pendingPay: `₹${totalPending.toLocaleString("en-IN")}`,
    };
  }, [filteredData]);

  return (
    <Shell>
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <FlaskConical className="h-6 w-6 text-purple-600" />
            {activeTab === "today" && "Today's Test Schedule"}
            {activeTab === "tomorrow" && "Tomorrow's Test Schedule"}
            {activeTab === "dayAfter" && "Day After Tomorrow's Test Schedule"}
            {activeTab === "all" && "All Time Test Schedule"}
            {activeTab === "custom" && `Test Schedule — ${customDate}`}
            {activeTab === "recent" && "Recent Bookings"}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {activeTab === "today" && `Technician view for Today (${dateToday})`}
            {activeTab === "tomorrow" && `Technician view for Tomorrow (${dateTomorrow})`}
            {activeTab === "dayAfter" && `Technician view for Day After Tomorrow (${dateDayAfter})`}
            {activeTab === "all" && "Showing all test schedules across all dates"}
            {activeTab === "custom" && `Showing test schedules for ${customDate}`}
            {activeTab === "recent" && "Showing the most recently created bookings across all dates"}
            &nbsp;·&nbsp; Auto-refreshes every 30 seconds
          </p>
        </div>
        {user?.role !== "OPERATOR" && (
          <div className="flex flex-wrap items-center gap-3">
            {/* Quick Tabs */}
            <div className="inline-flex rounded-lg border p-1 bg-slate-100 dark:bg-slate-900/50 dark:border-slate-800">
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${activeTab === "today" ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white font-bold" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setActiveTab("today")}
              >
                Today
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${activeTab === "tomorrow" ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white font-bold" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setActiveTab("tomorrow")}
              >
                Tomorrow
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${activeTab === "dayAfter" ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white font-bold" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setActiveTab("dayAfter")}
              >
                Day After
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${activeTab === "all" ? "bg-white text-slate-800 shadow dark:bg-slate-800 dark:text-white font-bold" : "text-slate-500 hover:text-slate-700"}`}
                onClick={() => setActiveTab("all")}
              >
                All Time
              </button>
              <button
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition flex items-center gap-1 ${
                  activeTab === "recent"
                    ? "bg-amber-500 text-white shadow font-bold"
                    : "text-slate-500 hover:text-amber-600"
                }`}
                onClick={() => setActiveTab("recent")}
              >
                🕐 Recent
              </button>
            </div>

            {/* Date Picker */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="input h-9 py-0 px-2 text-sm"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  if (e.target.value) {
                    setActiveTab("custom");
                  } else {
                    setActiveTab("today");
                  }
                }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch (err) {}
                }}
              />
              {activeTab === "custom" && (
                <button
                  className="text-xs text-slate-500 hover:text-red-500 border rounded-md px-2 h-9"
                  onClick={() => { setCustomDate(""); setActiveTab("today"); }}
                  title="Clear date filter"
                >
                  ✕ Clear
                </button>
              )}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <input
            className="input h-9 py-0 text-sm min-w-[200px]"
            placeholder="Search patient or booking..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Shift Filter for Technicians & Staff */}
          <select
            className="input h-9 py-0 text-sm min-w-[170px] font-medium text-purple-700 bg-purple-50/50 border-purple-200"
            value={halfFilter}
            onChange={(e) => setHalfFilter(e.target.value as any)}
          >
            <option value="all">All Halves (Full Day)</option>
            <option value="first">🌅 First Half (Before 1 PM)</option>
            <option value="second">🌆 Second Half (1 PM Onwards)</option>
          </select>

          <select
            className="input h-9 py-0 text-sm min-w-[180px]"
            value={selectedTest}
            onChange={(e) => setSelectedTest(e.target.value)}
          >
            <option value="">All Test Types</option>
            {filteredTestsForUser.filter(t => t.active).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <select
            className="input h-9 py-0 text-sm min-w-[180px]"
            value={selectedLocation}
            disabled={user?.role === "TECHNICIAN" && !!user?.locationId}
            onChange={(e) => setSelectedLocation(e.target.value)}
          >
            {user?.role === "TECHNICIAN" && user?.locationId ? (
              locations.filter(l => l.id === user.locationId).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))
            ) : (
              <>
                <option value="">All Locations</option>
                {locations.filter(l => l.active).map(l => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </>
            )}
          </select>
          {user?.canCreateAppointments && (
            <Link className="btn h-9 px-4 text-sm" href="/appointments/new">
              <Plus className="mr-1.5 h-4 w-4" /> New Booking
            </Link>
          )}
          <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </div>
        </div>
      </div>

      {/* KPI bar */}
      <section className="mb-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: activeTab === "today" ? "Total Today" : "Total Bookings", value: kpis.total, color: "border-l-blue-500", icon: "📋" },
          { label: "On the way", value: kpis.onTheWay, color: "border-l-amber-500", icon: "🚗" },
          { label: "Arrived", value: kpis.arrived, color: "border-l-green-500", icon: "🚶" },
          ...(isAdmin ? [
            { label: "Total Revenue", value: kpis.revenue, color: "border-l-indigo-500", icon: "💰" },
            { label: "Pending Payment", value: kpis.pendingPay, color: "border-l-red-500", icon: "⚠️" }
          ] : []),
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`card border-l-4 ${color} py-3 shadow-sm`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-xs text-slate-500 font-medium">{label}</p>
                <p className="text-lg font-bold mt-0.5">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </section>

      {isLoading && (
        <div className="card text-center py-12 text-slate-400">Loading today&apos;s schedule...</div>
      )}

      {!isLoading && data.length === 0 && (
        <div className="card text-center py-16">
          <FlaskConical className="mx-auto h-12 w-12 text-slate-300 mb-3" />
          <p className="text-slate-500 font-medium">No appointments scheduled for today.</p>
        </div>
      )}

      {/* Recent Bookings — flat list sorted by createdAt desc, 30/page */}
      {activeTab === "recent" && !isLoading && (() => {
        const sortedRecent = [...filteredData].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const totalPages = Math.max(1, Math.ceil(sortedRecent.length / RECENT_PAGE_SIZE));
        const safePage = Math.min(recentPage, totalPages);
        const pageItems = sortedRecent.slice((safePage - 1) * RECENT_PAGE_SIZE, safePage * RECENT_PAGE_SIZE);
        return (
          <div className="space-y-3">
            {/* Pagination header */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">
                Showing <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedRecent.length === 0 ? 0 : (safePage - 1) * RECENT_PAGE_SIZE + 1}–{Math.min(safePage * RECENT_PAGE_SIZE, sortedRecent.length)}</span> of <span className="font-semibold text-slate-700 dark:text-slate-300">{sortedRecent.length}</span> bookings
              </p>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    onClick={() => setRecentPage(1)}
                    disabled={safePage === 1}
                  >«</button>
                  <button
                    className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    onClick={() => setRecentPage(p => Math.max(1, p - 1))}
                    disabled={safePage === 1}
                  >‹ Prev</button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                    .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                      if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push("...");
                      acc.push(p);
                      return acc;
                    }, [])
                    .map((p, i) =>
                      p === "..." ? (
                        <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-400">…</span>
                      ) : (
                        <button
                          key={p}
                          className={`px-2.5 py-1 text-xs rounded border transition ${
                            p === safePage
                              ? "bg-amber-500 text-white border-amber-500 font-bold"
                              : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700"
                          }`}
                          onClick={() => setRecentPage(p as number)}
                        >{p}</button>
                      )
                    )}
                  <button
                    className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    onClick={() => setRecentPage(p => Math.min(totalPages, p + 1))}
                    disabled={safePage === totalPages}
                  >Next ›</button>
                  <button
                    className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                    onClick={() => setRecentPage(totalPages)}
                    disabled={safePage === totalPages}
                  >»</button>
                </div>
              )}
            </div>

            {/* Cards */}
            {pageItems.map((appt) => {
              const style = STATUS_STYLES[appt.status] || STATUS_STYLES["BOOKED"];
              const total = appt.totalPrice ?? 0;
              const advance = appt.advanceReceived ?? 0;
              const pending = Math.max(total - advance, 0);
              const bookedAt = new Date(appt.createdAt);
              const apptDate = new Date(appt.appointmentDate);
              const isToday = appt.appointmentDate.startsWith(dateToday);
              const isTomorrow = appt.appointmentDate.startsWith(dateTomorrow);
              return (
                <div
                  key={appt.id}
                  className="card p-0 overflow-hidden border-l-4"
                  style={{ borderLeftColor: appt.status === "CANCELLED" ? "#f87171" : appt.status === "BOOKED" ? "#60a5fa" : appt.status === "ARRIVED" ? "#34d399" : "#a78bfa" }}
                >
                  <div className="px-5 py-4 flex flex-wrap gap-4 items-center">
                    {/* Booked-at timestamp badge */}
                    <div className="flex flex-col items-center justify-center bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 min-w-[90px] text-center flex-shrink-0">
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold uppercase tracking-wider">Booked</span>
                      <span className="text-sm font-bold text-amber-700 dark:text-amber-300">
                        {bookedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <span className="text-[10px] text-amber-500">
                        {bookedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </span>
                    </div>

                    {/* Patient info */}
                    <div className="flex flex-col gap-0.5 min-w-[160px]">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">{appt.patientName}</p>
                        {isToday && <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-1.5 py-0.5 rounded-full font-semibold">Today</span>}
                        {isTomorrow && <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5 rounded-full font-semibold">Tomorrow</span>}
                      </div>
                      <p className="text-xs text-slate-400 font-mono">{appt.bookingId}</p>
                      {(user?.role !== "TECHNICIAN" || appt.location?.showContactToTechnicians) && appt.phoneNumber && (
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Phone className="h-3 w-3" />
                          {appt.phoneNumber}
                        </div>
                      )}
                    </div>

                    {/* Test & location */}
                    <div className="flex flex-col gap-1 min-w-[150px]">
                      <div className="flex items-center gap-1.5 text-sm text-purple-700 dark:text-purple-300 font-semibold">
                        <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />
                        {appt.test.name}{appt.subTest ? ` (${appt.subTest})` : ""}
                      </div>
                      {appt.location && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {appt.location.name}
                        </div>
                      )}
                      {appt.referredBy && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <User className="h-3 w-3 flex-shrink-0" />
                          PRO: {appt.referredBy}
                        </div>
                      )}
                    </div>

                    {/* Appt date & slot */}
                    <div className="flex flex-col gap-1 border-l pl-4 border-slate-100 dark:border-slate-800 min-w-[130px]">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Appointment</div>
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {apptDate.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                      <div className="text-xs text-slate-500">🕐 {appt.slot}</div>
                    </div>

                    {/* Payment — admin/technician */}
                    {(isAdmin || user?.role === "TECHNICIAN") && (
                      <div className="flex flex-col gap-1 border-l pl-4 border-slate-100 dark:border-slate-800 min-w-[130px]">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Payment</div>
                        <div className="text-xs text-slate-600">Total: <span className="font-semibold text-blue-700 dark:text-blue-400">₹{total.toLocaleString("en-IN")}</span></div>
                        <div className="text-xs text-slate-600">Advance: <span className="font-semibold text-emerald-600">₹{advance.toLocaleString("en-IN")}</span></div>
                        <div className="text-xs">Pending: <span className={`font-bold ${pending > 0 ? "text-red-600" : "text-green-600"}`}>{pending > 0 ? `₹${pending.toLocaleString("en-IN")}` : "Paid ✓"}</span></div>
                      </div>
                    )}

                    {/* Booked by */}
                    <div className="flex flex-col gap-1 border-l pl-4 border-slate-100 dark:border-slate-800 min-w-[100px]">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">By</div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 font-medium">{appt.createdBy?.name || "—"}</div>
                    </div>

                    {/* Status & actions */}
                    <div className="ml-auto flex flex-col items-end gap-2">
                      <select
                        className={`text-xs h-8 py-0 px-2 rounded-md border font-semibold ${style.bg} ${style.text} outline-none cursor-pointer`}
                        value={appt.status}
                        onChange={(e) => updateStatus(appt.id, e.target.value)}
                      >
                        {statuses.map((s) => (
                          <option className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-normal" key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <Link className="text-xs text-medical-700 dark:text-medical-400 font-semibold hover:underline" href={`/appointments/${appt.id}`}>
                        View/Edit Details &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}

            {sortedRecent.length === 0 && (
              <div className="card text-center py-16">
                <p className="text-slate-500">No recent bookings found.</p>
              </div>
            )}

            {/* Bottom pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 pt-2">
                <button
                  className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  onClick={() => { setRecentPage(p => Math.max(1, p - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={safePage === 1}
                >‹ Prev</button>
                <span className="text-xs text-slate-500 px-2">Page {safePage} of {totalPages}</span>
                <button
                  className="px-2 py-1 text-xs rounded border bg-white dark:bg-slate-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                  onClick={() => { setRecentPage(p => Math.min(totalPages, p + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  disabled={safePage === totalPages}
                >Next ›</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Slot-grouped cards */}
      {activeTab !== "recent" && (
      <div className="space-y-6">
        {sortedSlots.map(slot => (
          <div key={slot} className="card p-0 overflow-hidden">
            {/* Slot header */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <Clock className="h-4 w-4 text-slate-300" />
                <span className="font-semibold">{slot}</span>
              </div>
              <span className="text-xs text-slate-300 bg-slate-600/50 px-2 py-0.5 rounded-full">
                {slotGroups[slot].length} patient{slotGroups[slot].length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Appointment cards in this slot */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {slotGroups[slot].map((appt, idx) => {
                const style = STATUS_STYLES[appt.status] || STATUS_STYLES["BOOKED"];
                const isDone = appt.status === "ARRIVED";
                const total = appt.totalPrice ?? 0;
                const advance = appt.advanceReceived ?? 0;
                const pending = Math.max(total - advance, 0);
                return (
                  <div
                    key={appt.id}
                    className={`px-5 py-4 flex flex-wrap gap-4 items-start transition-all ${isDone ? "opacity-60" : ""}`}
                  >
                    {/* Serial + name */}
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="flex-shrink-0 h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-sm font-bold text-slate-600 dark:text-slate-300">
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          {isDone && <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />}
                          <p className={`font-semibold text-slate-800 dark:text-slate-100 ${isDone ? "line-through text-slate-400" : ""}`}>
                            {appt.patientName}
                          </p>
                        </div>
                        <p className="text-xs text-slate-400 font-mono">{appt.bookingId}</p>
                      </div>
                    </div>

                    {/* Test & Location */}
                    <div className="flex flex-col gap-1 min-w-[160px]">
                      <div className="flex items-center gap-1.5 text-sm text-purple-700 dark:text-purple-300 font-semibold">
                        <FlaskConical className="h-3.5 w-3.5 flex-shrink-0" />
                        {appt.test.name}{appt.subTest ? ` (${appt.subTest})` : ""}
                      </div>
                      {appt.location && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          {appt.location.name}
                        </div>
                      )}
                    </div>

                    {/* Contact */}
                    <div className="flex flex-col gap-1 min-w-[130px]">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Phone className="h-3 w-3 flex-shrink-0" />
                        {user?.role === "TECHNICIAN" && !appt.location?.showContactToTechnicians ? "Hidden" : (appt.phoneNumber || "—")}
                      </div>
                      {appt.referredBy && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500">
                          <User className="h-3 w-3 flex-shrink-0" />
                          PRO: {appt.referredBy}
                        </div>
                      )}
                    </div>

                    {/* Dates */}
                    <div className="flex flex-col gap-1 min-w-[140px] border-l pl-4 border-slate-100 dark:border-slate-800">
                      <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Dates</div>
                      <div className="text-xs text-slate-600 dark:text-slate-350">
                        Appt: <span className="font-semibold text-slate-800 dark:text-slate-200">{new Date(appt.appointmentDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Booked: {new Date(appt.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>

                    {/* Payment Summary — visible to ADMIN and TECHNICIAN */}
                    {(isAdmin || user?.role === "TECHNICIAN") && (
                      <div className="flex flex-col gap-1 min-w-[150px] border-l pl-4 border-slate-100 dark:border-slate-800">
                        <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Payment</div>
                        <div className="text-xs text-slate-600 dark:text-slate-350">
                          Total: <span className="font-semibold text-blue-700 dark:text-blue-400">₹{total.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-350">
                          Advance: <span className="font-semibold text-emerald-600 dark:text-emerald-400">₹{advance.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="text-xs">
                          Pending:{" "}
                          <span className={`font-bold ${pending > 0 ? "text-red-600" : "text-green-600"}`}>
                            {pending > 0 ? `₹${pending.toLocaleString("en-IN")}` : "Paid ✓"}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {appt.notes && (
                      <div className="text-xs text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 px-3 py-1.5 rounded-md max-w-xs">
                        {appt.notes}
                      </div>
                    )}

                    {/* Status select dropdown & edit link — right side */}
                    <div className="ml-auto flex flex-col items-end gap-2">
                      <select
                        className={`text-xs h-8 py-0 px-2 rounded-md border font-semibold ${style.bg} ${style.text} outline-none cursor-pointer`}
                        value={appt.status}
                        onChange={(e) => updateStatus(appt.id, e.target.value)}
                      >
                        {statuses.map((s) => (
                          <option className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-normal" key={s} value={s}>
                            {s.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <Link className="text-xs text-medical-700 dark:text-medical-400 font-semibold hover:underline" href={`/appointments/${appt.id}`}>
                        View/Edit Details &rarr;
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Cancelled section (collapsed at bottom) */}
      {cancelled.length > 0 && (
        <details className="mt-6 card">
          <summary className="cursor-pointer text-sm text-slate-500 font-medium select-none">
            {cancelled.length} Cancelled Appointment{cancelled.length !== 1 ? "s" : ""} (click to expand)
          </summary>
          <div className="mt-3 space-y-2">
            {cancelled.map(appt => {
              const style = STATUS_STYLES[appt.status] || STATUS_STYLES["CANCELLED"];
              return (
                <div key={appt.id} className="flex items-center justify-between py-2 px-3 rounded-md bg-red-50 dark:bg-red-950/20 text-xs text-red-600">
                  <div className="flex items-center gap-3">
                    <span className="font-mono">{appt.bookingId}</span>
                    <span className="font-medium">{appt.patientName}</span>
                    <span className="text-red-400">· {appt.test.name} · {appt.slot}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      className={`text-xs h-7 py-0 px-2 rounded-md border font-semibold ${style.bg} ${style.text} outline-none cursor-pointer`}
                      value={appt.status}
                      onChange={(e) => updateStatus(appt.id, e.target.value)}
                    >
                      {statuses.map((s) => (
                        <option className="bg-white text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-normal" key={s} value={s}>
                          {s.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}
    </Shell>
  );
}
