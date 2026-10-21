"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { X, Copy, Check, Share2, Calendar, RefreshCw, Layers, SlidersHorizontal, CheckSquare, Square } from "lucide-react";
import { api } from "../lib/api";

interface Appointment {
  id: string;
  patientName: string;
  phoneNumber?: string | null;
  slot: string;
  appointmentDate: string;
  status: string;
  subTest?: string | null;
  scanName?: string | null;
  referredBy?: string | null;
  referredDoctor?: string | null;
  advanceReceived?: number | null;
  totalPrice?: number | null;
  notes?: string | null;
  test: { id: string; name: string; color?: string | null; sortOrder?: number };
  location?: { id: string; name: string } | null;
}

interface TestType {
  id: string;
  name: string;
  color?: string | null;
  sortOrder?: number;
}

interface Location {
  id: string;
  name: string;
}

interface DailyTestSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultLocationId?: string;
}

type AdvanceOption = "none" | "amount" | "total_adv" | "yes_no";

function formatDateDisplay(dateStr: string) {
  if (!dateStr) return "";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
}

function cleanSlotTime(slot: string): string {
  if (!slot) return "";
  // Strip range if present: "07:30 AM - 08:30 AM" -> "7:30 AM"
  const start = slot.split("-")[0].trim();
  // Strip leading 0 from hour: "07:30" -> "7:30"
  return start.replace(/^0(\d:)/, "$1");
}

function getContrastColor(hexColor?: string | null) {
  if (!hexColor || !hexColor.startsWith("#")) return "#0f172a";
  const hex = hexColor.replace("#", "");
  let r = 0, g = 0, b = 0;
  if (hex.length === 3) {
    r = parseInt(hex[0] + hex[0], 16);
    g = parseInt(hex[1] + hex[1], 16);
    b = parseInt(hex[2] + hex[2], 16);
  } else if (hex.length === 6) {
    r = parseInt(hex.substring(0, 2), 16);
    g = parseInt(hex.substring(2, 4), 16);
    b = parseInt(hex.substring(4, 6), 16);
  } else {
    return "#0f172a";
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#0f172a" : "#ffffff";
}

export function DailyTestSummaryModal({
  isOpen,
  onClose,
  defaultDate,
  defaultLocationId
}: DailyTestSummaryModalProps) {
  const todayStr = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, []);

  const [date, setDate] = useState(defaultDate || todayStr);
  const [locationId, setLocationId] = useState(defaultLocationId || "");
  const [selectedTestIds, setSelectedTestIds] = useState<string[]>([]);
  const [excludeCancelled, setExcludeCancelled] = useState(true);

  // Dynamic field customization options
  const [includeNumbering, setIncludeNumbering] = useState(true);
  const [includeName, setIncludeName] = useState(true);
  const [includeTime, setIncludeTime] = useState(true);
  const [includeSubTest, setIncludeSubTest] = useState(true);
  const [includeProName, setIncludeProName] = useState(true);
  const [advanceDisplay, setAdvanceDisplay] = useState<AdvanceOption>("none");
  const [includeScanName, setIncludeScanName] = useState(true);
  const [includePhone, setIncludePhone] = useState(false);
  const [includeDoctor, setIncludeDoctor] = useState(false);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [separator, setSeparator] = useState("–");
  const [showFieldSettings, setShowFieldSettings] = useState(false);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [tests, setTests] = useState<TestType[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedFull, setCopiedFull] = useState(false);
  const [copiedTestId, setCopiedTestId] = useState<string | null>(null);
  const [customText, setCustomText] = useState("");
  const [isEditingText, setIsEditingText] = useState(false);

  // Sync date when defaultDate changes
  useEffect(() => {
    if (defaultDate) setDate(defaultDate);
  }, [defaultDate]);

  useEffect(() => {
    if (defaultLocationId) setLocationId(defaultLocationId);
  }, [defaultLocationId]);

  // Load locations and test types once
  useEffect(() => {
    if (!isOpen) return;
    api<Location[]>("/locations").then(setLocations).catch(() => {});
    api<TestType[]>("/tests?all=true").then(setTests).catch(() => {});
  }, [isOpen]);

  // Fetch appointments for selected date and location
  const fetchAppointments = useCallback(async () => {
    if (!date) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("date", date);
      if (locationId) params.set("locationId", locationId);
      const data = await api<Appointment[]>(`/appointments?${params.toString()}`);
      setAppointments(data);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [date, locationId]);

  useEffect(() => {
    if (isOpen) {
      fetchAppointments();
    }
  }, [isOpen, fetchAppointments]);

  // Filter appointments
  const filteredAppointments = useMemo(() => {
    return appointments.filter((app) => {
      if (excludeCancelled && app.status === "CANCELLED") return false;
      if (selectedTestIds.length > 0 && !selectedTestIds.includes(app.test.id)) return false;
      return true;
    });
  }, [appointments, excludeCancelled, selectedTestIds]);

  // Group appointments by test type
  const groupedByTest = useMemo(() => {
    const map = new Map<string, { test: TestType; items: Appointment[] }>();

    for (const app of filteredAppointments) {
      const tId = app.test.id;
      if (!map.has(tId)) {
        const foundTest = tests.find((t) => t.id === tId) || {
          id: tId,
          name: app.test.name,
          color: app.test.color,
          sortOrder: app.test.sortOrder ?? 0
        };
        map.set(tId, { test: foundTest, items: [] });
      }
      map.get(tId)!.items.push(app);
    }

    // Sort tests according to test sortOrder / PET CT / name
    const groupedArray = Array.from(map.values()).sort((a, b) => {
      const sortA = a.test.sortOrder ?? 0;
      const sortB = b.test.sortOrder ?? 0;
      if (sortA !== sortB) return sortA - sortB;
      const aIsPet = a.test.name.toUpperCase().includes("PET CT");
      const bIsPet = b.test.name.toUpperCase().includes("PET CT");
      if (aIsPet && !bIsPet) return -1;
      if (!aIsPet && bIsPet) return 1;
      return a.test.name.localeCompare(b.test.name);
    });

    return groupedArray;
  }, [filteredAppointments, tests]);

  // Generate formatted text for a single test group
  const generateTestText = useCallback((group: { test: TestType; items: Appointment[] }) => {
    const lines: string[] = [];
    lines.push(group.test.name.toUpperCase());
    lines.push("");

    group.items.forEach((app, idx) => {
      const parts: string[] = [];

      // 1. Patient Name
      if (includeName && app.patientName) {
        parts.push(app.patientName);
      }

      // 2. Time / Slot
      if (includeTime && app.slot) {
        parts.push(cleanSlotTime(app.slot));
      }

      // 3. Sub-test (e.g. DTPA)
      if (includeSubTest && app.subTest) {
        parts.push(app.subTest);
      }

      // 4. PRO Name
      if (includeProName && app.referredBy) {
        parts.push(app.referredBy);
      }

      // 5. Advance Payment
      if (advanceDisplay === "amount") {
        if (app.advanceReceived && app.advanceReceived > 0) {
          if (app.totalPrice && app.advanceReceived >= app.totalPrice) {
            parts.push("ADV DONE");
          } else {
            parts.push(`ADV ₹${app.advanceReceived.toLocaleString("en-IN")}`);
          }
        }
      } else if (advanceDisplay === "total_adv") {
        const adv = app.advanceReceived || 0;
        const tot = app.totalPrice || 0;
        if (tot > 0 || adv > 0) {
          if (tot > 0 && adv >= tot) {
            parts.push(`ADV ₹${adv.toLocaleString("en-IN")} / TOT ₹${tot.toLocaleString("en-IN")} (DONE)`);
          } else if (tot > 0) {
            parts.push(`ADV ₹${adv.toLocaleString("en-IN")} / TOT ₹${tot.toLocaleString("en-IN")}`);
          } else {
            parts.push(`ADV ₹${adv.toLocaleString("en-IN")}`);
          }
        }
      } else if (advanceDisplay === "yes_no") {
        const hasAdv = !!(app.advanceReceived && app.advanceReceived > 0);
        parts.push(hasAdv ? "ADV: YES" : "ADV: NO");
      }

      // 6. Phone number
      if (includePhone && app.phoneNumber) {
        parts.push(app.phoneNumber);
      }

      // 7. Referred Doctor
      if (includeDoctor && app.referredDoctor) {
        parts.push(`Dr. ${app.referredDoctor}`);
      }

      // Extra parentheses suffix: procedure & notes
      let suffix = "";
      if (includeScanName && app.scanName) {
        suffix += ` (${app.scanName})`;
      }
      if (includeNotes && app.notes) {
        suffix += ` [${app.notes}]`;
      }

      const prefix = includeNumbering ? `${idx + 1}. ` : "";
      const body = parts.join(` ${separator} `);
      const line = `${prefix}${body}${suffix}`;

      lines.push(line);
    });

    return lines.join("\n");
  }, [
    includeNumbering,
    includeName,
    includeTime,
    includeSubTest,
    includeProName,
    advanceDisplay,
    includeScanName,
    includePhone,
    includeDoctor,
    includeNotes,
    separator
  ]);

  // Generate full text
  const fullGeneratedText = useMemo(() => {
    if (groupedByTest.length === 0) return `${formatDateDisplay(date)}\n\nNo appointments found for this date.`;

    const sections: string[] = [];
    const locationName = locations.find((l) => l.id === locationId)?.name;
    
    let header = formatDateDisplay(date);
    if (locationName) {
      header += ` (${locationName})`;
    }
    sections.push(header);
    sections.push("");

    for (const group of groupedByTest) {
      sections.push(generateTestText(group));
      sections.push("");
    }

    return sections.join("\n").trim();
  }, [date, locationId, locations, groupedByTest, generateTestText]);

  // Update editable text when generated text changes (unless user is actively editing)
  useEffect(() => {
    if (!isEditingText) {
      setCustomText(fullGeneratedText);
    }
  }, [fullGeneratedText, isEditingText]);

  // Copy full list to clipboard
  const handleCopyFull = async () => {
    const textToCopy = customText || fullGeneratedText;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2500);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = textToCopy;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedFull(true);
      setTimeout(() => setCopiedFull(false), 2500);
    }
  };

  // Copy specific test list
  const handleCopyTest = async (group: { test: TestType; items: Appointment[] }) => {
    const textToCopy = `${formatDateDisplay(date)}\n\n${generateTestText(group)}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedTestId(group.test.id);
      setTimeout(() => setCopiedTestId(null), 2500);
    } catch {}
  };

  // Share via WhatsApp
  const handleShareWhatsApp = () => {
    const textToShare = customText || fullGeneratedText;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(textToShare)}`;
    window.open(url, "_blank");
  };

  // Quick preset handlers
  const applyPreset = (preset: "standard" | "with_adv_amt" | "with_adv_total" | "with_adv_yn" | "full") => {
    setIsEditingText(false);
    if (preset === "standard") {
      setIncludeNumbering(true);
      setIncludeName(true);
      setIncludeTime(true);
      setIncludeSubTest(true);
      setIncludeProName(true);
      setAdvanceDisplay("none");
      setIncludeScanName(true);
      setIncludePhone(false);
      setIncludeDoctor(false);
      setIncludeNotes(false);
    } else if (preset === "with_adv_amt") {
      setIncludeNumbering(true);
      setIncludeName(true);
      setIncludeTime(true);
      setIncludeSubTest(true);
      setIncludeProName(true);
      setAdvanceDisplay("amount");
      setIncludeScanName(true);
      setIncludePhone(false);
      setIncludeDoctor(false);
      setIncludeNotes(false);
    } else if (preset === "with_adv_total") {
      setIncludeNumbering(true);
      setIncludeName(true);
      setIncludeTime(true);
      setIncludeSubTest(true);
      setIncludeProName(true);
      setAdvanceDisplay("total_adv");
      setIncludeScanName(true);
      setIncludePhone(false);
      setIncludeDoctor(false);
      setIncludeNotes(false);
    } else if (preset === "with_adv_yn") {
      setIncludeNumbering(true);
      setIncludeName(true);
      setIncludeTime(true);
      setIncludeSubTest(true);
      setIncludeProName(true);
      setAdvanceDisplay("yes_no");
      setIncludeScanName(true);
      setIncludePhone(false);
      setIncludeDoctor(false);
      setIncludeNotes(false);
    } else if (preset === "full") {
      setIncludeNumbering(true);
      setIncludeName(true);
      setIncludeTime(true);
      setIncludeSubTest(true);
      setIncludeProName(true);
      setAdvanceDisplay("amount");
      setIncludeScanName(true);
      setIncludePhone(true);
      setIncludeDoctor(true);
      setIncludeNotes(true);
    }
  };

  const totalPatients = filteredAppointments.length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[94vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-gradient-to-r from-medical-50/80 to-indigo-50/60 dark:from-slate-800/80 dark:to-slate-900/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-medical-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-medical-500/20">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Daily Test Patient List Builder
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-medical-100 text-medical-800 dark:bg-medical-950/60 dark:text-medical-300 font-semibold">
                  {totalPatients} Booked
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Customize included fields (Name, PRO, Advance, Time, Sub-tests) &amp; copy formatted WhatsApp lists.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Primary Filter Bar: Date & Center */}
        <div className="px-5 py-3 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Date controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-medical-600" /> Date:
            </span>
            <input
              type="date"
              className="input h-8 py-0 px-2 text-xs font-semibold bg-white dark:bg-slate-900"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setIsEditingText(false);
              }}
              onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch (_) {} }}
            />
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${date === todayStr ? "bg-medical-600 text-white shadow-sm" : "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"}`}
              onClick={() => { setDate(todayStr); setIsEditingText(false); }}
            >
              Today
            </button>
            <button
              type="button"
              className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
                setIsEditingText(false);
              }}
            >
              Tomorrow
            </button>
          </div>

          {/* Location Center */}
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-600 dark:text-slate-300">Center:</span>
            <select
              className="input h-8 py-0 px-2 text-xs bg-white dark:bg-slate-900 min-w-[150px]"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                setIsEditingText(false);
              }}
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>

            <button
              type="button"
              className={`btn h-8 px-2.5 text-xs font-semibold flex items-center gap-1.5 transition-all ${
                showFieldSettings ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-100"
              }`}
              onClick={() => setShowFieldSettings(!showFieldSettings)}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Customize Fields</span>
            </button>

            <button
              type="button"
              className="btn h-8 px-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
              onClick={fetchAppointments}
              disabled={loading}
              title="Refresh appointments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-medical-600" : ""}`} />
            </button>
          </div>
        </div>

        {/* Dynamic Field Customization Panel (Collapsible / Expandable) */}
        {showFieldSettings && (
          <div className="p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30 text-xs animate-in slide-in-from-top-2 duration-150">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2 border-b border-indigo-100 dark:border-indigo-900/40">
              <span className="font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" /> Toggle Elements Included In Each Line:
              </span>
              {/* Preset buttons */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 text-[10px]">Presets:</span>
                <button
                  type="button"
                  onClick={() => applyPreset("standard")}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-[10px] font-semibold"
                >
                  Name + PRO
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("with_adv_amt")}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-[10px] font-semibold"
                >
                  With Adv (₹)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("with_adv_total")}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-[10px] font-semibold"
                >
                  With Total &amp; Adv
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("with_adv_yn")}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-[10px] font-semibold"
                >
                  With Adv (Yes/No)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset("full")}
                  className="px-2 py-0.5 rounded bg-white dark:bg-slate-800 border text-slate-700 dark:text-slate-200 hover:bg-slate-100 text-[10px] font-semibold"
                >
                  Full Details
                </button>
              </div>
            </div>

            {/* Field Toggles Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeNumbering}
                  onChange={(e) => { setIncludeNumbering(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200">1. Numbering</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeName}
                  onChange={(e) => { setIncludeName(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200">Patient Name</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeTime}
                  onChange={(e) => { setIncludeTime(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200">Slot / Time</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSubTest}
                  onChange={(e) => { setIncludeSubTest(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-semibold text-slate-700 dark:text-slate-200">Sub-Test Name</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeProName}
                  onChange={(e) => { setIncludeProName(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-semibold text-teal-700 dark:text-teal-300">PRO Name</span>
              </label>

              {/* Advance selection dropdown */}
              <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">Advance:</span>
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none w-full cursor-pointer"
                  value={advanceDisplay}
                  onChange={(e) => {
                    setAdvanceDisplay(e.target.value as AdvanceOption);
                    setIsEditingText(false);
                  }}
                >
                  <option value="none">Off (No Advance)</option>
                  <option value="amount">Amount (ADV ₹1000 / DONE)</option>
                  <option value="total_adv">Total &amp; Adv (ADV ₹1000 / TOT ₹5000)</option>
                  <option value="yes_no">Yes / No (ADV: YES / NO)</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeScanName}
                  onChange={(e) => { setIncludeScanName(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">Scan Procedure (MRI)</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includePhone}
                  onChange={(e) => { setIncludePhone(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">Phone Number</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeDoctor}
                  onChange={(e) => { setIncludeDoctor(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">Doctor Name</span>
              </label>

              <label className="flex items-center gap-1.5 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeNotes}
                  onChange={(e) => { setIncludeNotes(e.target.checked); setIsEditingText(false); }}
                  className="rounded text-medical-600"
                />
                <span className="font-medium text-slate-700 dark:text-slate-200">Notes / Remarks</span>
              </label>

              {/* Separator */}
              <div className="flex items-center gap-1 p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <span className="font-semibold text-slate-500 whitespace-nowrap">Separator:</span>
                <select
                  className="bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none w-full cursor-pointer"
                  value={separator}
                  onChange={(e) => { setSeparator(e.target.value); setIsEditingText(false); }}
                >
                  <option value="–">– (En Dash)</option>
                  <option value="-">- (Hyphen)</option>
                  <option value="|">| (Pipe)</option>
                  <option value=",">, (Comma)</option>
                  <option value="•">• (Bullet)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Options & Test Badges Strip */}
        <div className="px-5 py-2 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Test count pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-1">Tests:</span>
            {groupedByTest.map((g) => (
              <button
                key={g.test.id}
                type="button"
                onClick={() => {
                  setIsEditingText(false);
                  if (selectedTestIds.includes(g.test.id)) {
                    setSelectedTestIds(selectedTestIds.filter(id => id !== g.test.id));
                  } else {
                    setSelectedTestIds([...selectedTestIds, g.test.id]);
                  }
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all ${
                  selectedTestIds.length > 0 && !selectedTestIds.includes(g.test.id)
                    ? "opacity-40 grayscale"
                    : "shadow-sm scale-100"
                }`}
                style={{
                  backgroundColor: g.test.color || "#e2e8f0",
                  color: g.test.color ? getContrastColor(g.test.color) : "#0f172a",
                  borderColor: g.test.color || "#cbd5e1"
                }}
              >
                <span>{g.test.name}</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-black/20 text-current">
                  {g.items.length}
                </span>
              </button>
            ))}
            {groupedByTest.length === 0 && !loading && (
              <span className="text-slate-400 italic">No bookings on this day.</span>
            )}
            {selectedTestIds.length > 0 && (
              <button
                type="button"
                className="text-[11px] text-medical-600 font-semibold underline ml-1"
                onClick={() => { setSelectedTestIds([]); setIsEditingText(false); }}
              >
                Show All Tests
              </button>
            )}
          </div>

          {/* Quick Filters */}
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-350">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={excludeCancelled}
                onChange={(e) => { setExcludeCancelled(e.target.checked); setIsEditingText(false); }}
                className="rounded text-medical-600"
              />
              <span>Hide Cancelled</span>
            </label>
          </div>
        </div>

        {/* Content Body: Two Panels (Structured Cards on Left, Copyable Text on Right) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-800 overflow-hidden min-h-[380px]">
          
          {/* Left Panel: Visual Group Cards */}
          <div className="overflow-y-auto p-4 space-y-4 max-h-[460px]">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-slate-400 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-medical-600" />
                <span>Loading appointments...</span>
              </div>
            ) : groupedByTest.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-center">
                <p className="text-sm font-medium">No appointments found.</p>
                <p className="text-xs text-slate-400 mt-1">Try selecting a different date or center.</p>
              </div>
            ) : (
              groupedByTest.map((g) => (
                <div
                  key={g.test.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  {/* Test Header */}
                  <div
                    className="px-4 py-2.5 flex items-center justify-between border-b"
                    style={{
                      backgroundColor: g.test.color || "#f1f5f9",
                      color: g.test.color ? getContrastColor(g.test.color) : "#0f172a",
                      borderColor: g.test.color || "#e2e8f0"
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-sm tracking-wide">{g.test.name.toUpperCase()}</h3>
                      <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-black/20 text-current">
                        {g.items.length} {g.items.length === 1 ? "Patient" : "Patients"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyTest(g)}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-white/90 text-slate-800 hover:bg-white flex items-center gap-1 shadow-sm transition-all"
                    >
                      {copiedTestId === g.test.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy List</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Patient list */}
                  <ol className="divide-y divide-slate-100 dark:divide-slate-800/60 p-2 text-xs">
                    {g.items.map((app, idx) => (
                      <li key={app.id} className="py-2 px-2 flex flex-wrap items-center justify-between gap-1 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded transition-colors">
                        <div className="flex flex-wrap items-center gap-2">
                          {includeNumbering && (
                            <span className="font-mono text-slate-400 w-5 text-right font-medium">{idx + 1}.</span>
                          )}
                          {includeName && (
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{app.patientName}</span>
                          )}
                          {includeTime && (
                            <>
                              <span className="text-slate-400">{separator}</span>
                              <span className="font-mono font-medium text-slate-600 dark:text-slate-300">{cleanSlotTime(app.slot)}</span>
                            </>
                          )}
                          {includeSubTest && app.subTest && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                              {app.subTest}
                            </span>
                          )}
                          {includeProName && app.referredBy && (
                            <span className="text-[11px] font-bold text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/40 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
                              PRO: {app.referredBy}
                            </span>
                          )}
                          {includeScanName && app.scanName && (
                            <span className="text-[11px] text-violet-600 dark:text-violet-400 italic">
                              ({app.scanName})
                            </span>
                          )}
                          {includePhone && app.phoneNumber && (
                            <span className="text-[11px] font-mono text-slate-500">
                              📞 {app.phoneNumber}
                            </span>
                          )}
                          {includeDoctor && app.referredDoctor && (
                            <span className="text-[11px] text-amber-700 dark:text-amber-300">
                              Dr. {app.referredDoctor}
                            </span>
                          )}
                          {includeNotes && app.notes && (
                            <span className="text-[11px] text-slate-400 italic">
                              [{app.notes}]
                            </span>
                          )}
                        </div>
                        {advanceDisplay !== "none" && (
                          <div className="ml-auto">
                            {advanceDisplay === "amount" && app.advanceReceived && app.advanceReceived > 0 ? (
                              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                                {app.totalPrice && app.advanceReceived >= app.totalPrice
                                  ? "ADV DONE"
                                  : `ADV ₹${app.advanceReceived.toLocaleString("en-IN")}`}
                              </span>
                            ) : advanceDisplay === "total_adv" ? (
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                                (app.advanceReceived || 0) >= (app.totalPrice || 1) && (app.totalPrice || 0) > 0
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                  : (app.advanceReceived || 0) > 0
                                  ? "text-blue-700 bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                  : "text-slate-600 bg-slate-50 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700"
                              }`}>
                                {app.totalPrice && (app.advanceReceived || 0) >= app.totalPrice && app.totalPrice > 0
                                  ? `ADV ₹${(app.advanceReceived || 0).toLocaleString("en-IN")} / TOT ₹${app.totalPrice.toLocaleString("en-IN")} (DONE)`
                                  : app.totalPrice
                                  ? `ADV ₹${(app.advanceReceived || 0).toLocaleString("en-IN")} / TOT ₹${app.totalPrice.toLocaleString("en-IN")}`
                                  : `ADV ₹${(app.advanceReceived || 0).toLocaleString("en-IN")}`}
                              </span>
                            ) : advanceDisplay === "yes_no" ? (
                              <span className={`text-[11px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${
                                app.advanceReceived && app.advanceReceived > 0
                                  ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                                  : "text-slate-500 bg-slate-50 border-slate-200"
                              }`}>
                                {app.advanceReceived && app.advanceReceived > 0 ? "ADV: YES" : "ADV: NO"}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>
              ))
            )}
          </div>

          {/* Right Panel: Copyable Plain Text Preview */}
          <div className="flex flex-col bg-slate-50 dark:bg-slate-900/50 p-4">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-200 dark:border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                WhatsApp / Text Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingText(!isEditingText)}
                  className="text-[11px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-medium underline"
                >
                  {isEditingText ? "Reset Generated" : "Edit Text"}
                </button>
              </div>
            </div>

            <textarea
              className="flex-1 w-full font-mono text-xs p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-100 shadow-inner resize-none focus:outline-none focus:ring-2 focus:ring-medical-500"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setIsEditingText(true);
              }}
              rows={16}
              placeholder="List preview will appear here..."
            />
          </div>
        </div>

        {/* Footer Action Bar */}
        <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            <span>Click <strong>Customize Fields</strong> to toggle Name, PRO, Advance, Time, Phone, etc.</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="btn bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-3.5 flex items-center gap-1.5 shadow-sm"
              disabled={groupedByTest.length === 0}
            >
              <Share2 className="w-4 h-4" />
              <span>Share on WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleCopyFull}
              className={`btn font-bold text-xs h-9 px-4 flex items-center gap-1.5 shadow-md transition-all ${
                copiedFull
                  ? "bg-green-600 text-white hover:bg-green-700"
                  : "bg-gradient-to-r from-medical-600 to-indigo-600 hover:from-medical-500 hover:to-indigo-500 text-white"
              }`}
              disabled={groupedByTest.length === 0}
            >
              {copiedFull ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Copied to Clipboard!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Complete List</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
