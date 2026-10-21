"use client";

import React, { useState } from "react";
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  MapPin, 
  Sparkles, 
  FileText, 
  Info,
  CalendarDays,
  ShieldAlert,
  ChevronRight
} from "lucide-react";

export type DayAvailability = {
  date: string;
  dayName: string;
  isWorkDay: boolean;
  totalCapacity: number;
  totalBooked: number;
  totalLeft: number;
  isFull: boolean;
  slots: {
    id: string;
    label: string;
    capacity: number;
    booked: number;
    left: number;
    full: boolean;
    past?: boolean;
  }[];
};

type Test = {
  id: string;
  name: string;
  workDays?: string[];
  locationWorkDays?: string[] | null;
  instructions?: string | null;
};

type Location = {
  id: string;
  name: string;
  active: boolean;
  mapLink?: string | null;
  qrCodeUrl?: string | null;
  address?: string | null;
};

interface AppointmentAssistantPanelProps {
  selectedTest?: Test;
  selectedLocation?: Location;
  selectedDate: string;
  onSelectDate: (dateStr: string) => void;
  upcomingDays: DayAvailability[];
  isLoadingDays?: boolean;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", 
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function formatDisplayDate(dateStr: string) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

export function AppointmentAssistantPanel({
  selectedTest,
  selectedLocation,
  selectedDate,
  onSelectDate,
  upcomingDays,
  isLoadingDays = false
}: AppointmentAssistantPanelProps) {
  const [copied, setCopied] = useState(false);

  const todayStr = new Date().toLocaleDateString("en-CA");
  const tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowStr = tomorrowDate.toLocaleDateString("en-CA");

  // Prepare text for copying
  const handleCopyInstructions = () => {
    if (!selectedTest) return;
    
    let text = `📋 *Patient Instructions for ${selectedTest.name}*\n`;
    if (selectedLocation) {
      text += `🏥 *Center:* ${selectedLocation.name}\n`;
      if (selectedLocation.address) {
        text += `📍 *Address:* ${selectedLocation.address}\n`;
      }
    }
    text += `\n`;
    
    if (selectedTest.instructions && selectedTest.instructions.trim()) {
      text += `${selectedTest.instructions.trim()}\n\n`;
    } else {
      text += `• Please arrive 15 minutes before your scheduled slot.\n`;
      text += `• Carry previous scan reports, doctor's prescription & ID proof.\n`;
      text += `• Wear loose, comfortable clothing without metal fasteners.\n\n`;
    }

    text += `For queries or directions, feel free to reach out to our front desk.`;

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  // Determine working schedule summary
  const effectiveWorkDays = (selectedTest?.locationWorkDays && selectedTest.locationWorkDays.length > 0)
    ? selectedTest.locationWorkDays
    : selectedTest?.workDays;

  return (
    <div className="space-y-4">
      {/* Header Badge */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-medical-500/10 text-medical-600 dark:bg-medical-500/20 dark:text-medical-400">
            <Sparkles className="h-4 w-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Frontdesk Assistant
            </h3>
            <p className="text-[11px] text-slate-500">Live test info & multi-day slot glance</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          Live Realtime
        </span>
      </div>

      {/* 1. UPCOMING 7-DAY SLOTS CARD */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-medical-600 dark:text-medical-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Upcoming Slot Availability
            </h4>
          </div>
          {selectedTest && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-medical-50 text-medical-700 dark:bg-medical-950/60 dark:text-medical-300 border border-medical-200 dark:border-medical-800 truncate max-w-[120px]">
              {selectedTest.name}
            </span>
          )}
        </div>

        {/* Days List */}
        <div className="mt-3 space-y-1.5">
          {isLoadingDays ? (
            <div className="py-8 text-center text-xs text-slate-400">
              <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-medical-500 border-t-transparent mb-2" />
              <p>Checking slot availability across days…</p>
            </div>
          ) : upcomingDays.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400 border border-dashed rounded-xl border-slate-200 dark:border-slate-800 p-4">
              <Info className="h-4 w-4 mx-auto mb-1 text-slate-400" />
              Select a Test & Center to see upcoming slot availability.
            </div>
          ) : (
            upcomingDays.map((day) => {
              const isSelected = day.date === selectedDate;
              const isToday = day.date === todayStr;
              const isTomorrow = day.date === tomorrowStr;

              let labelBadge = null;
              if (isToday) {
                labelBadge = (
                  <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                    Today
                  </span>
                );
              } else if (isTomorrow) {
                labelBadge = (
                  <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Tomorrow
                  </span>
                );
              }

              return (
                <button
                  type="button"
                  key={day.date}
                  onClick={() => onSelectDate(day.date)}
                  className={`w-full group text-left rounded-xl p-2.5 transition-all duration-150 border flex flex-col gap-1.5 ${
                    isSelected
                      ? "bg-medical-50/90 border-medical-400 ring-2 ring-medical-500/20 shadow-sm dark:bg-medical-950/40 dark:border-medical-600"
                      : "bg-slate-50/50 hover:bg-slate-100/80 border-slate-200/70 hover:border-slate-300 dark:bg-slate-800/30 dark:border-slate-800 dark:hover:bg-slate-800/60"
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    {/* Date & Day */}
                    <div className="flex items-center gap-2">
                      <div className={`text-xs font-semibold ${isSelected ? "text-medical-800 dark:text-medical-200" : "text-slate-700 dark:text-slate-300"}`}>
                        {day.dayName.slice(0, 3)}, {formatDisplayDate(day.date)}
                      </div>
                      {labelBadge}
                      {isSelected && (
                        <span className="text-[10px] font-bold text-medical-600 dark:text-medical-400 flex items-center">
                          • Selected
                        </span>
                      )}
                    </div>

                    {/* Status Pill */}
                    <div>
                      {!day.isWorkDay ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                          ⛔ Closed
                        </span>
                      ) : day.isFull ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-900/40">
                          🔴 Full (0 left)
                        </span>
                      ) : day.totalLeft > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                          {day.totalLeft} {day.totalLeft === 1 ? "slot" : "slots"} left
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800">
                          No Slots
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Micro Slots Preview (only if available) */}
                  {day.isWorkDay && day.slots.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {day.slots.map((s) => (
                        <span
                          key={s.label}
                          className={`text-[9px] px-1.5 py-0.5 rounded ${
                            s.full || s.past
                              ? "bg-slate-100 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500 line-through"
                              : isSelected
                              ? "bg-white text-medical-700 font-medium border border-medical-200 dark:bg-slate-800 dark:text-medical-300 dark:border-medical-800"
                              : "bg-white/80 text-slate-600 border border-slate-200/60 dark:bg-slate-800/50 dark:text-slate-400 dark:border-slate-700"
                          }`}
                        >
                          {s.label} ({s.full ? "Full" : s.past ? "Passed" : `${s.left}`})
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <Info className="h-3 w-3 flex-shrink-0" />
          Click any day above to instantly select date in form.
        </p>
      </div>

      {/* 2. TEST PREPARATION & PATIENT INSTRUCTIONS CARD */}
      <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Test Preparation & Instructions
            </h4>
          </div>
          <button
            type="button"
            onClick={handleCopyInstructions}
            disabled={!selectedTest}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-medical-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-medical-300 dark:hover:bg-slate-800 transition-colors duration-150 disabled:opacity-40"
            title="Copy patient instructions for WhatsApp / SMS"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-emerald-600 font-bold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-3">
          {selectedTest ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {selectedTest.name} Guidelines
                </span>
                {effectiveWorkDays && effectiveWorkDays.length > 0 && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    Runs: {effectiveWorkDays.map(d => d.slice(0, 3)).join(", ")}
                  </span>
                )}
              </div>

              {selectedTest.instructions && selectedTest.instructions.trim() ? (
                <div className="rounded-xl bg-teal-50/50 p-3 text-xs leading-relaxed text-slate-700 dark:bg-teal-950/20 dark:text-teal-200 border border-teal-100 dark:border-teal-900/30 whitespace-pre-line font-normal">
                  {selectedTest.instructions.trim()}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/40 dark:text-slate-400 border border-slate-200/60 dark:border-slate-800 space-y-1.5">
                  <p className="font-semibold text-slate-700 dark:text-slate-300">Standard Test Checklist:</p>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <li>Arrive 15 minutes prior to scheduled slot.</li>
                    <li>Bring doctor's prescription & previous scan records.</li>
                    <li>Wear loose clothing with no metal zippers/buttons.</li>
                  </ul>
                  <p className="text-[10px] text-slate-400 italic pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                    Specific guidelines for {selectedTest.name} can be updated by Admin in Test Settings.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="py-4 text-center text-xs text-slate-400">
              Select a test above to view instructions.
            </div>
          )}
        </div>
      </div>

      {/* 3. CENTER / LOCATION QUICK CARD */}
      {selectedLocation && (
        <div className="rounded-2xl border border-slate-200/90 bg-white/90 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 backdrop-blur-sm text-xs">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="h-4 w-4 text-rose-500 flex-shrink-0" />
            <h4 className="font-bold text-slate-800 dark:text-slate-200">
              {selectedLocation.name} Center
            </h4>
          </div>
          {selectedLocation.address ? (
            <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed pl-6">
              {selectedLocation.address}
            </p>
          ) : (
            <p className="text-slate-400 text-[11px] pl-6">No specific address configured.</p>
          )}

          {selectedLocation.mapLink && (
            <div className="mt-2 pl-6">
              <a
                href={selectedLocation.mapLink}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-semibold text-medical-600 dark:text-medical-400 hover:underline inline-flex items-center gap-1"
              >
                Open Google Maps Location <ChevronRight className="h-3 w-3" />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
