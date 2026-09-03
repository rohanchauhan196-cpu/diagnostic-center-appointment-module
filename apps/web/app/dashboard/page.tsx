"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Download, Filter, TrendingUp, CheckCircle2, Clock, XCircle, IndianRupee, AlertCircle } from "lucide-react";
import { Shell } from "../../components/shell";
import { api, statuses } from "../../lib/api";
import { socket } from "../../lib/socket";
import { getUser } from "../../lib/auth";
import { AppointmentSuccessPopup } from "../../components/AppointmentSuccessPopup";

type Appointment = {
  id: string;
  bookingId: string;
  patientName: string;
  phoneNumber: string | null;
  appointmentDate: string;
  slot: string;
  referredBy?: string;
  referredDoctor?: string;
  patientAge?: string | null;
  notes?: string | null;
  status: string;
  totalPrice?: number | null;
  advanceReceived?: number | null;
  advanceMethod?: string | null;
  remainingMethod?: string | null;
  subTest?: string | null;
  test: { name: string; instructions?: string | null };
  createdBy: { name: string };
  location?: { id: string; name: string; mapLink?: string | null; qrCodeUrl?: string | null; address?: string | null; } | null;
  createdAt: string;
};

type DashboardUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FRONTDESK" | "TECHNICIAN" | "MARKETING" | "ANALYTICS" | "OPERATOR";
  active: boolean;
};

type Test = { id: string; name: string; active?: boolean; instructions?: string | null };

// Use local date to avoid UTC-timezone mismatch where frontdesk bookings don't show
function todayLocal() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function tomorrowLocal() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayAfterTomorrowLocal() {
  const d = new Date(); d.setDate(d.getDate() + 2);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  BOOKED:           { color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",          label: "Booked" },
  CONFIRMED:        { color: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",          label: "Confirmed" },
  ON_THE_WAY:       { color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",      label: "On the way" },
  ARRIVED:          { color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",    label: "Arrived" },
  SCAN_STARTED:     { color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",    label: "Scan Started" },
  SCAN_DONE:        { color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 font-bold", label: "Scan Done" },
  REPORT_DELIVERED: { color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 font-bold", label: "Report Delivered" },
  CANCELLED:        { color: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",              label: "Cancelled" },
};

function formatCreatedDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
  } catch {
    return dateStr;
  }
}

function exportCSV(data: Appointment[], filename: string) {
  const headers = ["Booking ID", "Patient Name", "Phone", "Test", "Location", "Appt Date", "Slot", "Created Date", "PRO Name", "Referred Doctor", "Total Price", "Advance", "Pending", "Advance Method", "Remaining Method", "Remarks", "Status", "Created By"];
  const rows = data.map(a => {
    const total = a.totalPrice ?? 0;
    const advance = a.advanceReceived ?? 0;
    const pending = Math.max(total - advance, 0);
    return [
      a.bookingId,
      a.patientName,
      a.phoneNumber || "",
      a.test.name,
      a.location?.name || "",
      a.appointmentDate.slice(0, 10),
      a.slot,
      formatCreatedDate(a.createdAt),
      a.referredBy || "",
      a.referredDoctor || "",
      total > 0 ? total : "",
      advance > 0 ? advance : "",
      total > 0 ? pending : "",
      a.advanceMethod || "—",
      a.remainingMethod || "—",
      a.notes || "",
      a.status,
      a.createdBy?.name || "—",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

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

export default function DashboardPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";
  const isOperator = user?.role === "OPERATOR";
  // Per-row payment columns (Total/Advance/Pending): ADMIN + FRONTDESK + TECHNICIAN
  const canSeePaymentColumns = isAdmin || user?.role === "FRONTDESK" || user?.role === "TECHNICIAN";
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"today" | "tomorrow" | "dayAfter" | "all" | "custom" | "recent">("today");
  const [customDate, setCustomDate] = useState("");
  const [q, setQ] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState(() => {
    return ((user?.role === "TECHNICIAN" || user?.role === "OPERATOR") && user?.locationId) ? user.locationId : "";
  });
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [testDropdownOpen, setTestDropdownOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [halfFilter, setHalfFilter] = useState<"all" | "first" | "second">("all");
  const [showOnlyMyBookings, setShowOnlyMyBookings] = useState(false);
  const [recentPage, setRecentPage] = useState(1);
  const RECENT_PAGE_SIZE = 30;
  
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupData, setPopupData] = useState<any>(null);

  const openMessagePopup = (appt: Appointment) => {
    const d = new Date(appt.appointmentDate);
    const formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
    const matchingTest = tests.find(t => t.name.toLowerCase() === appt.test.name.toLowerCase());
    
    setPopupData({
      patientName: appt.patientName,
      phoneNumber: appt.phoneNumber || "",
      appointmentDate: formattedDate,
      slotTime: appt.slot,
      testName: appt.test.name,
      totalPrice: appt.totalPrice || 0,
      locationName: appt.location?.name || "",
      bookedBy: appt.createdBy?.name || "Unknown Agent",
      instructions: matchingTest?.instructions || appt.test.instructions || null,
      mapLink: appt.location?.mapLink || null,
      qrCodeUrl: appt.location?.qrCodeUrl || null,
      address: appt.location?.address || null,
      proName: appt.referredBy || null,
    });
    setIsPopupOpen(true);
  };

  const copyQrCode = async (appt: Appointment) => {
    if (!appt.location?.qrCodeUrl) {
      alert("No QR Code available for this location.");
      return;
    }
    try {
      const response = await fetch(appt.location.qrCodeUrl);
      const blob = await response.blob();
      if (navigator.clipboard && navigator.clipboard.write) {
        let type = blob.type;
        // Clipboard API strictly expects image/png on many browsers
        if (type !== 'image/png') {
          alert("QR Code is not a PNG image. Copying might fail in some browsers.");
        }
        await navigator.clipboard.write([
          new ClipboardItem({ [type]: blob })
        ]);
        alert("QR Code copied to clipboard!");
      } else {
        alert("Clipboard API not supported in this browser.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to copy QR Code.");
    }
  };

  const dateToday = todayLocal();
  const dateTomorrow = tomorrowLocal();
  const dateDayAfter = dayAfterTomorrowLocal();

  const queryDate = useMemo(() => {
    if (activeTab === "today") return dateToday;
    if (activeTab === "tomorrow") return dateTomorrow;
    if (activeTab === "dayAfter") return dateDayAfter;
    if (activeTab === "all" || activeTab === "recent") return "";
    return customDate;
  }, [activeTab, customDate, dateToday, dateTomorrow, dateDayAfter]);

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);
  const handleSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  // Fetch all users for admin's agent filter
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => api<DashboardUser[]>("/users"),
    enabled: isAdmin,
  });

  const agents = useMemo(() => {
    return allUsers.filter((u) => u.role === "FRONTDESK" || u.role === "ADMIN");
  }, [allUsers]);

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    queryFn: () => api<{ id: string; name: string; active: boolean }[]>("/locations")
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests"],
    queryFn: () => api<Test[]>("/tests")
  });

  const [page, setPage] = useState(1);
  const limit = 150;

  useEffect(() => {
    setPage(1);
    setRecentPage(1);
  }, [q, queryDate, selectedLocationId, selectedTestIds, selectedAgentId, showOnlyMyBookings, activeTab]);

  // Determine if DTPA is among selected tests (to show age column)
  const showAgeColumn = selectedTestIds.length > 0 && tests.filter(t => selectedTestIds.includes(t.id)).some(t => t.name.toUpperCase().includes("DTPA"));

  const { data: appointmentsResponse, isLoading } = useQuery({
    queryKey: ["appointments", queryDate || "all", q, selectedLocationId, selectedTestIds.join(","), selectedAgentId, showOnlyMyBookings, page, activeTab],
    queryFn: () => {
      const params = new URLSearchParams({ q, page: String(page), limit: String(limit) });
      if (queryDate) params.set("date", queryDate);
      if (selectedLocationId) params.set("locationId", selectedLocationId);
      if (selectedTestIds.length > 0) params.set("testId", selectedTestIds.join(","));
      if (selectedAgentId) params.set("createdById", selectedAgentId);
      if (showOnlyMyBookings && user?.id) params.set("createdById", user.id);
      // Recent mode: sort by updatedAt desc so newest activity (create or edit) comes first
      if (activeTab === "recent") {
        params.set("sortBy", "updatedAt");
        params.set("sortOrder", "desc");
      }
      return api<{
        data: Appointment[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
        summary: {
          total: number;
          pending: number;
          completed: number;
          cancelled: number;
          advanceCount: number;
          totalRevenue: number | null;
          totalPendingPayment: number | null;
        }
      }>(`/appointments?${params.toString()}`);
    }
  });

  const data = appointmentsResponse?.data || [];
  const totalCount = appointmentsResponse?.total || 0;
  const totalPages = appointmentsResponse?.totalPages || 1;
  const summary = appointmentsResponse?.summary;

  const { sortedActiveData, sortedCancelledData } = useMemo(() => {
    let list = data;

    // In Recent mode: server already sorted by updatedAt desc, just paginate client-side
    if (activeTab === "recent") {
      const start = (recentPage - 1) * RECENT_PAGE_SIZE;
      const pageSlice = list.slice(start, start + RECENT_PAGE_SIZE);
      return { sortedActiveData: pageSlice, sortedCancelledData: [] };
    }

    if (halfFilter === "first") {
      list = list.filter(a => parseTimeStr(a.slot) < 780);
    } else if (halfFilter === "second") {
      list = list.filter(a => parseTimeStr(a.slot) >= 780);
    }

    const active = list.filter(a => a.status !== "CANCELLED");
    const cancelled = list.filter(a => a.status === "CANCELLED");

    const sortFn = (a: Appointment, b: Appointment) => {
      if (sortConfig !== null) {
        let aValue: any = a[sortConfig.key as keyof Appointment];
        let bValue: any = b[sortConfig.key as keyof Appointment];

        if (sortConfig.key === "patientName") {
           aValue = a.patientName.toLowerCase(); bValue = b.patientName.toLowerCase();
        } else if (sortConfig.key === "notes") {
           aValue = (a.notes || "").toLowerCase(); bValue = (b.notes || "").toLowerCase();
        } else if (sortConfig.key === "test") {
           aValue = a.test.name.toLowerCase(); bValue = b.test.name.toLowerCase();
        } else if (sortConfig.key === "location") {
           aValue = (a.location?.name || "").toLowerCase(); bValue = (b.location?.name || "").toLowerCase();
        } else if (sortConfig.key === "createdBy") {
           aValue = a.createdBy.name.toLowerCase(); bValue = b.createdBy.name.toLowerCase();
        } else if (sortConfig.key === "total") {
           aValue = a.totalPrice ?? 0; bValue = b.totalPrice ?? 0;
        } else if (sortConfig.key === "advance") {
           aValue = a.advanceReceived ?? 0; bValue = b.advanceReceived ?? 0;
        } else if (sortConfig.key === "pending") {
           aValue = Math.max((a.totalPrice ?? 0) - (a.advanceReceived ?? 0), 0);
           bValue = Math.max((b.totalPrice ?? 0) - (b.advanceReceived ?? 0), 0);
        } else if (sortConfig.key === "appointmentDate") {
           aValue = a.appointmentDate; bValue = b.appointmentDate;
        } else if (sortConfig.key === "slot") {
           aValue = parseTimeStr(a.slot); bValue = parseTimeStr(b.slot);
        }

        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      } else {
        // Default sort: Strictly chronologically by slot time first
        const timeDiff = parseTimeStr(a.slot) - parseTimeStr(b.slot);
        if (timeDiff !== 0) return timeDiff;

        // If time is identical, place arrived patients at the end
        if (a.status === "ARRIVED" && b.status !== "ARRIVED") return 1;
        if (a.status !== "ARRIVED" && b.status === "ARRIVED") return -1;
        return 0;
      }
    };

    active.sort(sortFn);
    cancelled.sort(sortFn);

    return { sortedActiveData: active, sortedCancelledData: cancelled };
  }, [data, sortConfig, selectedTestIds, tests, halfFilter, activeTab, recentPage, RECENT_PAGE_SIZE]);

  useEffect(() => {
    socket.connect();
    const handleChanged = () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
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

  const kpis = useMemo(() => {
    if (!summary) return {};
    return {
      total:     { value: summary.total, label: "Total Bookings",   icon: TrendingUp, color: "text-medical-600" },
      advance:   { value: summary.advanceCount ?? 0, label: "Advance Paid Bookings", icon: IndianRupee, color: "text-blue-500" },
      pending:   { value: summary.pending, label: "In Progress", icon: Clock, color: "text-amber-500" },
      completed: { value: summary.completed, label: "Completed", icon: CheckCircle2, color: "text-emerald-500" },
      cancelled: { value: summary.cancelled, label: "Cancelled", icon: XCircle, color: "text-red-400" },
      ...(isAdmin ? {
        revenue:    { value: summary.totalRevenue != null ? `₹${summary.totalRevenue.toLocaleString("en-IN")}` : "₹0", label: "Total Revenue", icon: IndianRupee, color: "text-blue-600" },
        pendingPay: { value: summary.totalPendingPayment != null ? `₹${summary.totalPendingPayment.toLocaleString("en-IN")}` : "₹0", label: "Pending Payment", icon: AlertCircle, color: "text-orange-500" },
      } : {}),
    };
  }, [summary, isAdmin]);

  const duplicateNames = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((a) => {
      if (a.status === "CANCELLED") return;
      const name = a.patientName.trim().toLowerCase();
      if (name) counts[name] = (counts[name] || 0) + 1;
    });
    return counts;
  }, [data]);

  async function updateStatus(id: string, status: string) {
    await api(`/appointments/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
    queryClient.invalidateQueries({ queryKey: ["appointments"] });
    queryClient.invalidateQueries({ queryKey: ["slots"] });
  }

  async function handleExport(exportType: "active" | "cancelled" | "all") {
    const selectedTestNames = tests.filter(t => selectedTestIds.includes(t.id)).map(t => t.name.replace(/\s+/g, "-"));
    const parts = ["appointments"];
    if (selectedTestNames.length > 0) parts.push(...selectedTestNames);
    if (queryDate) parts.push(queryDate);
    else if (activeTab !== "all") parts.push(activeTab);

    try {
      const params = new URLSearchParams({ q });
      if (queryDate) params.set("date", queryDate);
      if (selectedLocationId) params.set("locationId", selectedLocationId);
      if (selectedTestIds.length > 0) params.set("testId", selectedTestIds.join(","));
      if (selectedAgentId) params.set("createdById", selectedAgentId);
      if (showOnlyMyBookings && user?.id) params.set("createdById", user.id);
      
      let fullList = await api<Appointment[]>(`/appointments?${params.toString()}`);
      if (exportType === "active") fullList = fullList.filter(a => a.status !== "CANCELLED");
      if (exportType === "cancelled") fullList = fullList.filter(a => a.status === "CANCELLED");
      
      exportCSV(fullList, `${parts.join("-")}-${exportType}.csv`);
    } catch (err) {
      console.error("Export failed:", err);
    }
  }

  const activeTabLabel = {
    today: `Today (${dateToday})`,
    tomorrow: `Tomorrow (${dateTomorrow})`,
    dayAfter: `Day After (${dateDayAfter})`,
    all: "All Dates",
    custom: customDate || "Custom",
    recent: "Recent Bookings",
  }[activeTab];

  return (
    <Shell>
      {/* Page header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">
            Appointments
            <span className="ml-2 text-lg font-normal text-slate-400 dark:text-slate-500">
              — {activeTabLabel}
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {totalCount} {totalCount === 1 ? "record" : "records"} matching current filters
          </p>
        </div>

        {!isOperator && (
          <div className="flex flex-wrap gap-2">
            {/* Quick Tabs */}
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 p-1 bg-slate-100/80 dark:bg-slate-800/50 gap-0.5">
              {(["today", "tomorrow", "dayAfter", "all"] as const).map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "today" ? "Today" : tab === "tomorrow" ? "Tomorrow" : tab === "dayAfter" ? "Day After" : "All Time"}
                </button>
              ))}
              <button
                className={`tab-btn flex items-center gap-1 ${
                  activeTab === "recent" ? "active" : ""
                }`}
                style={activeTab === "recent" ? { background: "#f59e0b", color: "#fff" } : {}}
                onClick={() => setActiveTab("recent")}
              >
                🕐 Recent
              </button>
            </div>

            {/* Custom date */}
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                className="input h-9 py-0 px-2 text-sm"
                value={customDate}
                onChange={(e) => {
                  setCustomDate(e.target.value);
                  setActiveTab(e.target.value ? "custom" : "today");
                }}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch (err) {}
                }}
              />
              {activeTab === "custom" && (
                <button
                  className="btn-secondary h-9 px-2 text-red-500 hover:text-red-600 hover:border-red-300"
                  onClick={() => { setCustomDate(""); setActiveTab("today"); }}
                >
                  ✕
                </button>
              )}
            </div>

            <Link className="btn h-9 px-4 text-sm" href="/appointments/new">
              <Plus className="mr-1.5 h-4 w-4" /> New Booking
            </Link>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Object.entries(kpis).map(([key, kpi]) => {
          const { value, label, icon: Icon, color } = kpi as { value: string | number; label: string; icon: typeof TrendingUp; color: string };
          return (
            <div className="kpi-card animate-slide-up" key={key}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium uppercase tracking-wider">{label}</p>
                <Icon className={`h-4 w-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-800 dark:text-white tracking-tight">{value}</p>
            </div>
          );
        })}
      </section>

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        {/* Filters bar */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-800/20">
          {/* Search */}
          <div className="flex flex-1 min-w-[200px] items-center gap-2 border border-slate-200 dark:border-slate-700 rounded-lg px-3 bg-white dark:bg-slate-900 focus-within:border-medical-500 focus-within:ring-2 focus-within:ring-medical-500/20 transition-all duration-200">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              className="w-full h-9 text-sm outline-none bg-transparent placeholder:text-slate-400"
              placeholder="Search name, phone, booking ID, referral..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {/* Location filter (Hidden for Machine Operators) */}
          {!isOperator && (
            <select
              id="location-filter"
              className="input h-9 py-0 min-w-[150px] text-sm"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.filter(l => l.active).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          )}

          {/* Test filter - multi-select dropdown */}
          <div className="relative">
            <button
              id="test-filter-btn"
              className={`input h-9 py-0 min-w-[150px] text-sm text-left flex items-center justify-between gap-2 ${selectedTestIds.length > 0 ? "border-medical-400 bg-medical-50/50" : ""}`}
              onClick={() => setTestDropdownOpen(o => !o)}
            >
              <span className="truncate">
                {selectedTestIds.length === 0 ? "All Tests" : selectedTestIds.length === 1 ? tests.find(t => t.id === selectedTestIds[0])?.name : `${selectedTestIds.length} Tests`}
              </span>
              <span className="text-[10px] text-slate-400">{testDropdownOpen ? "▲" : "▼"}</span>
            </button>
            {testDropdownOpen && (
              <div className="absolute top-full left-0 z-40 mt-1 bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-lg shadow-xl min-w-[200px] max-h-72 overflow-y-auto">
                <div className="p-2 border-b dark:border-slate-700 flex gap-2">
                  <button className="text-xs text-medical-600 hover:text-medical-700" onClick={() => setSelectedTestIds(tests.map(t => t.id))}>All</button>
                  <span className="text-slate-300">|</span>
                  <button className="text-xs text-slate-500 hover:text-red-500" onClick={() => setSelectedTestIds([])}>Clear</button>
                </div>
                {tests.map(t => (
                  <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selectedTestIds.includes(t.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedTestIds(prev => [...prev, t.id]);
                        else setSelectedTestIds(prev => prev.filter(id => id !== t.id));
                      }}
                      className="accent-medical-600 h-3.5 w-3.5"
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
            {testDropdownOpen && <div className="fixed inset-0 z-30" onClick={() => setTestDropdownOpen(false)} />}
          </div>

          {/* Agent filter (Admin only) */}
          {isAdmin && (
            <select
              id="agent-filter"
              className="input h-9 py-0 min-w-[150px] text-sm"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
            >
              <option value="">All Agents</option>
              {agents.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.role.toLowerCase()})</option>
              ))}
            </select>
          )}

          {/* Booked by Me filter (Frontdesk) */}
          {user?.role === "FRONTDESK" && (
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 cursor-pointer select-none bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 h-9 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <input
                type="checkbox"
                id="booked-by-me-filter"
                className="rounded border-slate-300 text-medical-600 focus:ring-medical-500 h-4 w-4"
                checked={showOnlyMyBookings}
                onChange={(e) => setShowOnlyMyBookings(e.target.checked)}
              />
              <span>Booked by Me</span>
            </label>
          )}

          {/* Export — Admin only */}
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                className="btn-secondary h-9"
                onClick={() => handleExport("active")}
                title="Export active view as CSV"
                disabled={totalCount === 0}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export Active</span>
              </button>
              <button
                className="btn-secondary h-9"
                onClick={() => handleExport("cancelled")}
                title="Export cancelled view as CSV"
                disabled={totalCount === 0}
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export Cancelled</span>
              </button>
            </div>
          )}
        </div>

        {/* Active filters hint */}
        {(selectedTestIds.length > 0 || selectedLocationId || selectedAgentId || showOnlyMyBookings) && (
          <div className="px-4 py-2 flex items-center gap-2 bg-medical-50/50 dark:bg-medical-950/20 border-b border-medical-100 dark:border-medical-900/30">
            <Filter className="h-3.5 w-3.5 text-medical-500" />
            <span className="text-xs text-medical-700 dark:text-medical-400 font-medium flex flex-wrap gap-1 items-center">
              Filtered by:
              {selectedTestIds.map(id => <span key={id} className="bg-white/60 dark:bg-slate-800/65 px-1.5 py-0.5 rounded border border-medical-200/50">{tests.find(t => t.id === id)?.name ?? "test"}</span>)}
              {selectedLocationId && <span className="bg-white/60 dark:bg-slate-800/65 px-1.5 py-0.5 rounded border border-medical-200/50">{locations.find(l => l.id === selectedLocationId)?.name ?? "location"}</span>}
              {selectedAgentId && <span className="bg-white/60 dark:bg-slate-800/65 px-1.5 py-0.5 rounded border border-medical-200/50">Agent: {agents.find(u => u.id === selectedAgentId)?.name ?? "agent"}</span>}
              {showOnlyMyBookings && <span className="bg-white/60 dark:bg-slate-800/65 px-1.5 py-0.5 rounded border border-medical-200/50">Booked by Me</span>}
            </span>
            <button
              className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors"
              onClick={() => {
                setSelectedTestIds([]);
                setSelectedLocationId("");
                setSelectedAgentId("");
                setShowOnlyMyBookings(false);
              }}
            >
              Clear filters
            </button>
          </div>
        )}

        {/* Table */}
        {[
          { title: "Active Appointments", dataset: sortedActiveData },
          { title: "Cancelled Appointments", dataset: sortedCancelledData }
        ].map(({ title, dataset }) => {
          if (title === "Cancelled Appointments" && dataset.length === 0) return null;
          return (
            <div key={title} className="mb-4 last:mb-0">
              {title === "Cancelled Appointments" && (
                <div className="px-4 py-3 bg-red-50 dark:bg-red-900/10 border-y border-red-100 dark:border-red-900/20">
                  <h3 className="font-semibold text-red-700 dark:text-red-400">Cancelled Appointments</h3>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
                    <tr>
                      {[
                        { label: "Patient", key: "patientName" },
                        ...(!isOperator ? [{ label: "Phone", key: "phoneNumber" }] : []),
                        ...(showAgeColumn && !isOperator ? [{ label: "Age", key: "" }] : []),
                        { label: "Test", key: "test" },
                        { label: "Remarks", key: "notes" },
                        { label: "Location", key: "location" },
                        { label: "Appt Date", key: "appointmentDate" },
                        { label: "Slot", key: "slot" },
                        { label: "Booked At", key: "createdAt" },
                        ...(!isOperator ? [{ label: "PRO Name", key: "referredBy" }] : []),
                        ...(canSeePaymentColumns && !isOperator ? [
                          { label: "Total", key: "total" },
                          { label: "Advance", key: "advance" },
                          { label: "Pending", key: "pending" }
                        ] : []),
                        { label: "Status", key: "status" },
                        ...(!isOperator ? [
                          { label: "By", key: "createdBy" },
                          { label: "Message", key: "" },
                          { label: "Actions", key: "" }
                        ] : [])
                      ].map((h) => (
                        <th 
                          className={`px-3 py-3 whitespace-nowrap ${h.key ? "cursor-pointer hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors" : ""}`} 
                          key={h.label}
                          onClick={() => h.key ? handleSort(h.key) : undefined}
                        >
                          <div className="flex items-center gap-1">
                            {h.label}
                            {sortConfig?.key === h.key && (
                              <span className="text-[10px]">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                            )}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {isLoading && title === "Active Appointments" && (
                      <tr>
                        <td className="px-3 py-8 text-center text-slate-400" colSpan={isOperator ? 8 : (canSeePaymentColumns ? 15 : 12)}>
                          <div className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 rounded-full border-2 border-medical-400 border-t-transparent animate-spin" />
                            Loading appointments...
                          </div>
                        </td>
                      </tr>
                    )}
                    {!isLoading && title === "Active Appointments" && dataset.length === 0 && (
                      <tr>
                        <td className="px-3 py-10 text-center text-slate-400" colSpan={isOperator ? 8 : (canSeePaymentColumns ? 15 : 12)}>
                          <p className="font-medium">No appointments found.</p>
                          {activeTab !== "all" && !isOperator && (
                            <button className="mt-1 text-medical-600 text-sm underline" onClick={() => setActiveTab("all")}>
                              View all dates?
                            </button>
                          )}
                        </td>
                      </tr>
                    )}
                    {dataset.map((a, idx) => {
                      const total = a.totalPrice ?? 0;
                      const advance = a.advanceReceived ?? 0;
                      const pending = Math.max(total - advance, 0);
                      const hasDuplicate = duplicateNames[a.patientName.trim().toLowerCase()] > 1;
                      const sc = statusConfig[a.status] ?? { color: "bg-slate-100 text-slate-600", label: a.status };
                      return (
                        <tr
                          key={a.id}
                          className={`group transition-colors duration-100 ${
                            hasDuplicate
                              ? "bg-amber-50/60 dark:bg-amber-950/15 hover:bg-amber-50 dark:hover:bg-amber-950/25"
                              : idx % 2 === 0
                                ? "bg-white dark:bg-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                                : "bg-slate-50/40 dark:bg-slate-800/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/30"
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <span className={`font-semibold text-slate-800 dark:text-slate-100 ${hasDuplicate ? "text-amber-800 dark:text-amber-300" : ""}`}>
                              {a.patientName}
                            </span>
                            {hasDuplicate && <span className="ml-1.5 text-[10px] bg-amber-200 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 rounded px-1 py-0.5 font-semibold">DUP</span>}
                          </td>
                          {!isOperator && <td className="px-3 py-2.5 text-slate-500 text-xs">{a.phoneNumber || "—"}</td>}
                          {showAgeColumn && !isOperator && (
                            <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                              {a.patientAge ? <span className="font-medium">{a.patientAge}</span> : "—"}
                            </td>
                          )}
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 rounded-full px-2 py-0.5">
                              {a.test.name}{a.subTest ? ` (${a.subTest})` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-650 dark:text-slate-400 max-w-[150px] truncate" title={a.notes || ""}>
                            {a.notes || "—"}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="text-xs font-semibold text-medical-700 dark:text-medical-400">
                              {a.location?.name || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{a.appointmentDate.slice(0, 10)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">{a.slot}</td>
                          <td className="px-3 py-2.5 text-[11px] text-slate-500 whitespace-nowrap">
                            {new Date(a.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          {!isOperator && <td className="px-3 py-2.5 text-xs text-slate-500">{a.referredBy || "—"}</td>}
                          {canSeePaymentColumns && !isOperator && (
                            <>
                              <td className="px-3 py-2.5 text-blue-700 dark:text-blue-400 font-semibold text-xs whitespace-nowrap">
                                {total > 0 ? `₹${total.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs whitespace-nowrap">
                                {advance > 0 ? `₹${advance.toLocaleString("en-IN")}` : "—"}
                              </td>
                              <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                                {total > 0 ? (
                                  <span className={`font-bold ${pending > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                                    {pending > 0 ? `₹${pending.toLocaleString("en-IN")}` : "Paid ✓"}
                                  </span>
                                ) : "—"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2.5">
                            <select
                              className={`input text-xs h-7 py-0 px-1.5 rounded-lg min-w-[110px] font-semibold border-none ${sc.color}`}
                              value={a.status}
                              onChange={(e) => updateStatus(a.id, e.target.value)}
                            >
                              {(isOperator
                                ? (a.status === "ARRIVED" ? ["ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED"] : ["SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED"])
                                : statuses
                              ).map((s) => (
                                <option key={s} value={s} className="bg-white text-slate-800 font-normal">
                                  {statusConfig[s]?.label || s.replace("_", " ")}
                                </option>
                              ))}
                            </select>
                          </td>
                          {!isOperator && <td className="px-3 py-2.5 text-xs text-slate-400">{a.createdBy.name}</td>}
                          {!isOperator && (
                            <td className="px-3 py-2.5">
                              <div className="flex flex-col gap-1">
                                <button
                                  className="text-[10px] font-semibold text-white bg-medical-600 hover:bg-medical-700 px-2 py-1 rounded shadow-sm transition-colors uppercase tracking-wider"
                                  onClick={() => openMessagePopup(a)}
                                >
                                  Message
                                </button>
                                {a.location?.qrCodeUrl && (
                                  <button
                                    className="text-[10px] font-semibold text-medical-700 bg-medical-100 hover:bg-medical-200 border border-medical-200 px-2 py-1 rounded shadow-sm transition-colors uppercase tracking-wider"
                                    onClick={() => copyQrCode(a)}
                                  >
                                    QR Code
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                          {!isOperator && (
                            <td className="px-3 py-2.5">
                              <Link
                                className="text-xs font-semibold text-medical-600 dark:text-medical-400 hover:text-medical-700 dark:hover:text-medical-300 underline-offset-2 hover:underline transition-colors"
                                href={`/appointments/${a.id}`}
                              >
                                View/Edit
                              </Link>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}

        {data.length > 0 && (
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-800/20">
            <div className="flex flex-wrap items-center gap-2">
              {activeTab === "recent" ? (
                <span>Showing {Math.min((recentPage - 1) * RECENT_PAGE_SIZE + 1, data.length)}–{Math.min(recentPage * RECENT_PAGE_SIZE, data.length)} of {data.length} bookings (sorted newest first)</span>
              ) : (
                <span>Showing {data.length} of {totalCount} appointment{totalCount !== 1 ? "s" : ""}</span>
              )}
              {isAdmin && activeTab !== "recent" && (
                <>
                  <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
                  <button onClick={() => handleExport("active")} className="flex items-center gap-1 text-slate-400 hover:text-medical-600 font-semibold transition-colors">
                    <Download className="h-3.5 w-3.5" /> Export Active
                  </button>
                  <button onClick={() => handleExport("cancelled")} className="flex items-center gap-1 text-slate-400 hover:text-red-600 font-semibold transition-colors">
                    <Download className="h-3.5 w-3.5" /> Export Cancelled
                  </button>
                </>
              )}
            </div>
            
            {/* Recent tab: client-side pagination */}
            {activeTab === "recent" && Math.ceil(data.length / RECENT_PAGE_SIZE) > 1 && (
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setRecentPage(1)}
                  disabled={recentPage === 1}
                >« First</button>
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setRecentPage(p => Math.max(p - 1, 1))}
                  disabled={recentPage === 1}
                >‹ Prev</button>
                <span className="px-3 py-1 font-medium text-slate-600 dark:text-slate-350">
                  Page {recentPage} of {Math.ceil(data.length / RECENT_PAGE_SIZE)}
                </span>
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setRecentPage(p => Math.min(p + 1, Math.ceil(data.length / RECENT_PAGE_SIZE)))}
                  disabled={recentPage === Math.ceil(data.length / RECENT_PAGE_SIZE)}
                >Next ›</button>
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setRecentPage(Math.ceil(data.length / RECENT_PAGE_SIZE))}
                  disabled={recentPage === Math.ceil(data.length / RECENT_PAGE_SIZE)}
                >Last »</button>
              </div>
            )}

            {/* Other tabs: server-side pagination */}
            {activeTab !== "recent" && totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                >
                  « First
                </button>
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page === 1}
                >
                  ‹ Prev
                </button>
                
                <span className="px-3 py-1 font-medium text-slate-600 dark:text-slate-350">
                  Page {page} of {totalPages}
                </span>

                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={page === totalPages}
                >
                  Next ›
                </button>
                <button
                  className="btn-secondary h-8 px-2 text-[11px] disabled:opacity-50"
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                >
                  Last »
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AppointmentSuccessPopup 
        isOpen={isPopupOpen} 
        onClose={() => setIsPopupOpen(false)} 
        data={popupData} 
      />
    </Shell>
  );
}
