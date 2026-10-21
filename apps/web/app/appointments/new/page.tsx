"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Shell } from "../../../components/shell";
import { ProNameAutocomplete } from "../../../components/ProNameAutocomplete";
import { api, uploadFile, API_URL } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { getUser } from "../../../lib/auth";
import { getUsgSubTestOptions } from "../../../lib/usgTests";
import { AppointmentSuccessPopup } from "../../../components/AppointmentSuccessPopup";
import { AppointmentAssistantPanel, DayAvailability } from "../../../components/AppointmentAssistantPanel";

type Test = { id: string; name: string; workDays?: string[]; locationWorkDays?: string[] | null; instructions?: string | null; color?: string; sortOrder?: number; };

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
// past = slot time has already gone by today (only admins may still book it, e.g. walk-ins)
type Slot = { label: string; startTime?: string | null; capacity: number; left: number; full: boolean; past?: boolean };
type Location = { id: string; name: string; active: boolean; mapLink?: string | null; qrCodeUrl?: string | null; address?: string | null; };
type Appointment = {
  id: string;
  bookingId: string;
  patientName: string;
  phoneNumber: string | null;
  appointmentDate: string;
  slot: string;
  status: string;
  test: { name: string };
};

function validatePhone(val: string) {
  const trimmed = val.trim();
  if (trimmed === "") return true; // empty is allowed
  return /^[0-9]{10}$/.test(trimmed);
}

function parseAgeInYears(ageStr: string): number | null {
  const normalized = ageStr.toLowerCase().trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (normalized.includes("month") || normalized.includes("week") || normalized.includes("day") || normalized.endsWith("m") || normalized.endsWith("w") || normalized.endsWith("d")) {
    return num / 12;
  }
  return num;
}

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return "Select date";
  const [year, month, day] = dateStr.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

export default function NewAppointmentPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";
  const router = useRouter();
  const queryClient = useQueryClient();
  const [patientName, setPatientName] = useState("");
  const [testId, setTestId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [patientAge, setPatientAge] = useState("");
  const [totalPrice, setTotalPrice] = useState("");
  const [advanceReceived, setAdvanceReceived] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("UPI");
  const [remainingMethod, setRemainingMethod] = useState("UPI");
  const [subTest, setSubTest] = useState("");
  const [isPregnant, setIsPregnant] = useState("");
  const [preferredDoctor, setPreferredDoctor] = useState("");
  const [referredBy, setReferredBy] = useState("");
  const [error, setError] = useState("");
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateAcknowledged, setDuplicateAcknowledged] = useState(false);

  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupData, setPopupData] = useState<any>(null);

  // Prescription / Scan fields (MRI & USG Special Study)
  const [scanName, setScanName] = useState("");
  const [prescriptionFile, setPrescriptionFile] = useState<File | null>(null);
  const [prescriptionUrl, setPrescriptionUrl] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);



  const cleanName = patientName.trim();
  const cleanPhone = phoneNumber.trim().replace(/\s+/g, "");

  const [debouncedName, setDebouncedName] = useState("");
  const [debouncedPhone, setDebouncedPhone] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedName(cleanName);
    }, 250);
    return () => clearTimeout(timer);
  }, [cleanName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPhone(cleanPhone);
    }, 250);
    return () => clearTimeout(timer);
  }, [cleanPhone]);

  const { data: proNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["pro-names"],
    queryFn: () => api<{ id: string; name: string }[]>("/pro-names"),
  });

  const { data: nameAppointments = [] } = useQuery({
    queryKey: ["appointments", "search-name", debouncedName],
    enabled: debouncedName.length >= 3,
    queryFn: () => api<Appointment[]>(`/appointments?q=${encodeURIComponent(debouncedName)}&futureOnly=true&limit=20`),
  });

  const { data: phoneAppointments = [] } = useQuery({
    queryKey: ["appointments", "search-phone", debouncedPhone],
    enabled: debouncedPhone.length >= 5,
    queryFn: () => api<Appointment[]>(`/appointments?q=${encodeURIComponent(debouncedPhone)}&futureOnly=true&limit=20`),
  });

  const matchingAppointments = useMemo(() => {
    const map = new Map<string, Appointment>();
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const combined = [...nameAppointments, ...phoneAppointments];
    for (const appt of combined) {
      if (map.has(appt.id)) continue;

      const nameMatch = cleanName.length >= 3 && appt.patientName.toLowerCase().includes(cleanName.toLowerCase());
      const phoneMatch = cleanPhone.length >= 5 && Boolean(appt.phoneNumber && appt.phoneNumber.includes(cleanPhone));

      const isFutureOrToday = appt.appointmentDate.slice(0, 10) >= localToday;

      if ((nameMatch || phoneMatch) && isFutureOrToday) {
        map.set(appt.id, appt);
      }
    }
    return Array.from(map.values());
  }, [nameAppointments, phoneAppointments, cleanName, cleanPhone]);

  // Show red alert modal when duplicates are detected and not yet acknowledged
  useEffect(() => {
    if (matchingAppointments.length > 0 && !duplicateAcknowledged) {
      setShowDuplicateModal(true);
      // Play alert sound
      try {
        const audio = new Audio("/alert.wav");
        audio.volume = 1.0;
        audio.play().catch(() => { });
      } catch { }
    } else if (matchingAppointments.length === 0) {
      setDuplicateAcknowledged(false);
      setShowDuplicateModal(false);
    }
  }, [matchingAppointments.length, duplicateAcknowledged]);

  function handleDuplicateAcknowledge() {
    setDuplicateAcknowledged(true);
    setShowDuplicateModal(false);
  }

  const { data: tests = [] } = useQuery({
    queryKey: ["tests", locationId],
    queryFn: () => api<Test[]>(locationId ? `/tests?locationId=${locationId}` : "/tests"),
    enabled: true
  });
  const { data: locations = [] } = useQuery({ queryKey: ["locations"], queryFn: () => api<Location[]>("/locations") });

  const { data: slots = [] } = useQuery({
    queryKey: ["slots", testId, locationId, date],
    enabled: Boolean(testId && locationId && date),
    queryFn: () => api<Slot[]>(`/appointments/availability?testId=${testId}&locationId=${locationId}&date=${date}`)
  });

  const { data: upcomingDays = [], isLoading: isLoadingUpcomingDays } = useQuery<DayAvailability[]>({
    queryKey: ["upcoming-availability", testId, locationId],
    enabled: Boolean(testId && locationId),
    queryFn: () => api<DayAvailability[]>(`/appointments/upcoming-availability?testId=${testId}&locationId=${locationId}&startDate=${new Date().toLocaleDateString("en-CA")}&days=7`)
  });

  const filteredTestsForUser = useMemo(() => {
    if (user?.role === "TECHNICIAN" && user?.testTypes && user.testTypes.length > 0) {
      const allowedIds = user.testTypes.map((t) => t.id);
      return tests.filter((t) => allowedIds.includes(t.id));
    }
    return tests;
  }, [tests, user]);

  useEffect(() => {
    if (filteredTestsForUser.length > 0) {
      if (!testId || !filteredTestsForUser.some(t => t.id === testId)) {
        setTestId(filteredTestsForUser[0].id);
      }
    }
  }, [filteredTestsForUser, testId]);

  useEffect(() => {
    if (user?.role === "TECHNICIAN" && user?.locationId) {
      setLocationId(user.locationId);
      return;
    }
    const activeLocs = locations.filter(l => l.active);
    if (!locationId && activeLocs.length > 0) {
      const defaultLoc = activeLocs.find(l => l.name.toLowerCase().includes("ghaziabad")) || activeLocs[0];
      setLocationId(defaultLoc.id);
    }
  }, [locations, locationId, user]);

  useEffect(() => {
    socket.connect();
    socket.on("slots:changed", () => {
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      queryClient.invalidateQueries({ queryKey: ["upcoming-availability"] });
    });
    return () => { socket.off("slots:changed"); socket.disconnect(); };
  }, [queryClient]);

  const total = parseInt(totalPrice, 10) || 0;
  const advance = parseInt(advanceReceived, 10) || 0;
  const pending = Math.max(total - advance, 0);

  const selectedLocation = locations.find(l => l.id === locationId);
  const isSpecialLocation = selectedLocation
    ? (selectedLocation.name.toLowerCase().includes("gwalior") || selectedLocation.name.toLowerCase().includes("dehradun"))
    : false;

  const selectedTest = tests.find((t) => t.id === testId);
  const isDTPA = selectedTest ? selectedTest.name.toLowerCase() === "dtpa" : false;
  const isHSG = selectedTest ? selectedTest.name.toLowerCase().includes("hsg") : false;
  const isMRI = selectedTest ? selectedTest.name.toLowerCase().includes("mri") : false;
  const isUSGSpecial = selectedTest
    ? (selectedTest.name.toLowerCase().includes("usg") && selectedTest.name.toLowerCase().includes("special"))
    : false;
  const needsPrescription = isMRI || isUSGSpecial;
  const usgSubOptions = getUsgSubTestOptions(selectedTest?.name);

  const selectedSubTestName = usgSubOptions.length > 0 ? (subTest || usgSubOptions[0]) : "";
  const isTVS = selectedSubTestName.toLowerCase().includes("tvs");

  // Clear prescription state when switching away from MRI/USG Special
  useEffect(() => {
    if (!needsPrescription) {
      setScanName("");
      setPrescriptionFile(null);
      setPrescriptionUrl("");
      setUploadError("");
    }
  }, [needsPrescription]);

  async function handlePrescriptionFile(file: File) {
    setUploadError("");
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("File too large — maximum 5 MB allowed.");
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/jpg", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setUploadError("Only PDF, JPG, or PNG files are accepted.");
      return;
    }
    setIsUploading(true);
    setPrescriptionFile(file);
    try {
      const result = await uploadFile(file);
      setPrescriptionUrl(result.url);
    } catch (e: any) {
      setUploadError(e.message || "Upload failed. Please try again.");
      setPrescriptionFile(null);
    } finally {
      setIsUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formEl = event.currentTarget;
    const form = new FormData(formEl);

    // Validate referredBy (PRO Name) — required field
    if (!referredBy || !referredBy.trim()) {
      setError("PRO Name is required. Please select a PRO Name before creating the appointment.");
      return;
    }
    const isValidPro = proNames.some((p) => p.name.toLowerCase() === referredBy.toLowerCase());
    if (!isValidPro) {
      setError("Please select a valid PRO Name from the dropdown list. Custom names are not allowed.");
      return;
    }

    // Validate TVS inputs
    if (isTVS) {
      if (!isPregnant) {
        setError("Please specify if the patient is pregnant or not.");
        return;
      }
      if (!preferredDoctor) {
        setError("Please specify the preferred doctor.");
        return;
      }
    }

    // Date validation: Backdates
    const dateParts = date.split("-").map(Number);
    const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = DAYS_OF_WEEK[selectedDate.getDay()];
    const activeTest = tests.find((t) => t.id === testId);
    const activeLocation = locations.find((l) => l.id === locationId);

    // Use per-center workDays if available, else global
    const effectiveWorkDays = (activeTest?.locationWorkDays && activeTest.locationWorkDays.length > 0)
      ? activeTest.locationWorkDays
      : activeTest?.workDays;

    if (effectiveWorkDays && effectiveWorkDays.length > 0 && !effectiveWorkDays.includes(dayName)) {
      const atCenter = activeLocation ? ` at ${activeLocation.name}` : "";
      setError(`This test is not available${atCenter} on ${dayName}s.`);
      return;
    }
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (selectedDate < todayLocal) {
      setError("Bookings cannot be scheduled for past dates.");
      return;
    }

    if (phoneNumber.trim() !== "" && !validatePhone(phoneNumber)) {
      setPhoneError("Enter a valid 10-digit phone number (digits only)");
      return;
    }
    setPhoneError("");

    if (isDTPA) {
      const isSaturday = selectedDate.getDay() === 6;
      if (isSaturday) {
        const ageVal = parseAgeInYears(patientAge);
        if (ageVal === null || ageVal < 15) {
          setError("Patient must be older than 15 years to register for a DTPA scan on Saturdays.");
          return;
        }
      }
    }

    if (isHSG) {
      const refDoc = (form.get("referredDoctor") as string) || "";
      if (!refDoc.trim()) {
        setError("Referral Doctor Name is mandatory for HSG test.");
        return;
      }
    }

    try {
      const result = await api<any>("/appointments", {
        method: "POST",
        body: JSON.stringify({
          patientName: (form.get("patientName") as string)?.trim(),
          phoneNumber: phoneNumber.trim(),
          patientAge: isDTPA ? patientAge.trim() : undefined,
          testId,
          locationId,
          appointmentDate: date,
          slot: form.get("slot"),
          referredBy: referredBy || undefined,
          referredDoctor: form.get("referredDoctor") || undefined,
          cityHospital: form.get("cityHospital") || undefined,
          notes: form.get("notes") || undefined,
          totalPrice: totalPrice ? parseInt(totalPrice, 10) : undefined,
          advanceReceived: advanceReceived ? parseInt(advanceReceived, 10) : undefined,
          advanceMethod: advanceMethod || "UPI",
          remainingMethod: remainingMethod || "UPI",
          subTest: usgSubOptions.length > 0 ? (subTest || usgSubOptions[0]) : undefined,
          isPregnant: isTVS ? (isPregnant === "true") : undefined,
          preferredDoctor: isTVS ? preferredDoctor : undefined,
          scanName: needsPrescription ? scanName.trim() || undefined : undefined,
          prescriptionUrl: needsPrescription ? prescriptionUrl || undefined : undefined,
        })
      });
      
      const activeTest = tests.find((t) => t.id === testId);
      const activeLocation = locations.find((l) => l.id === locationId);
      
      const d = new Date(date);
      const formattedDate = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
      
      setPopupData({
        patientName: result.patientName || (form.get("patientName") as string)?.trim(),
        phoneNumber: result.phoneNumber || phoneNumber.trim(),
        appointmentDate: formattedDate,
        slotTime: result.slot || form.get("slot") as string,
        testName: activeTest?.name || "",
        totalPrice: result.totalPrice || (totalPrice ? parseInt(totalPrice, 10) : 0),
        locationName: activeLocation?.name || "",
        bookedBy: user?.name || "Unknown Agent",
        instructions: activeTest?.instructions || null,
        mapLink: activeLocation?.mapLink || null,
        qrCodeUrl: activeLocation?.qrCodeUrl || null,
        address: activeLocation?.address || null,
        proName: referredBy || result.referredBy || null,
        scanName: needsPrescription ? (scanName.trim() || null) : null,
        cityHospital: (form.get("cityHospital") as string)?.trim() || result.cityHospital || null,
        referredDoctor: (form.get("referredDoctor") as string)?.trim() || result.referredDoctor || null,
      });
      setIsPopupOpen(true);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create appointment");
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Main Appointment Form */}
          <form onSubmit={submit} className="card space-y-5 xl:col-span-7 2xl:col-span-8 shadow-sm">
            <div>
              <h1 className="text-2xl font-semibold">Create Appointment</h1>
              <p className="text-sm text-slate-500">Slot capacity updates in real time.</p>
            </div>        {/* Patient */}
        <section className={isDTPA ? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-2"}>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient Name *</label>
            <input
              className="input w-full"
              name="patientName"
              placeholder="Full patient name"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value.trimStart())}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phone Number</label>
            <input
              className={`input w-full ${phoneError ? "border-red-400 focus:border-red-500" : ""}`}
              name="phoneNumber"
              placeholder="10-digit mobile number (optional)"
              value={phoneNumber}
              maxLength={10}
              inputMode="numeric"
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 10);
                setPhoneNumber(val);
                setPhoneError("");
              }}
            />
            {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
            {phoneNumber.trim() !== "" && phoneNumber.trim().length < 10 && !phoneError && (
              <p className="text-xs text-amber-500 mt-1">{10 - phoneNumber.trim().length} more digit{10 - phoneNumber.trim().length !== 1 ? "s" : ""} needed</p>
            )}
          </div>
          {isDTPA && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Patient Age *</label>
              <input
                className="input w-full"
                placeholder="e.g. 25, 6 Months"
                value={patientAge}
                onChange={(e) => setPatientAge(e.target.value)}
                required={isDTPA}
              />
              <p className="text-[10px] text-slate-400 mt-1">
                {(() => {
                  const parts = date.split("-").map(Number);
                  const d = new Date(parts[0], parts[1] - 1, parts[2]);
                  return d.getDay() === 6 ? "Must be older than 15 years on Saturdays." : "No age restriction today.";
                })()}
              </p>
            </div>
          )}
        </section>

        {/* Duplicate Booking Red Alert Modal */}
        {showDuplicateModal && (
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.65)" }}
          >
            <div
              className="relative mx-4 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, #1a0000 0%, #3d0000 50%, #1a0000 100%)",
                border: "2px solid #ef4444",
                boxShadow: "0 0 40px rgba(239,68,68,0.6), 0 0 80px rgba(239,68,68,0.3)",
                animation: "duplicateAlertPulse 1.5s ease-in-out infinite",
              }}
            >
              {/* Pulsing red glow top bar */}
              <div
                style={{
                  height: "5px",
                  background: "linear-gradient(90deg, #ef4444, #ff6b6b, #ef4444)",
                  animation: "duplicateBarShimmer 2s linear infinite",
                }}
              />
              <div className="p-8">
                {/* Warning icon */}
                <div className="flex justify-center mb-5">
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: "50%",
                      background: "rgba(239,68,68,0.15)",
                      border: "2px solid rgba(239,68,68,0.6)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      animation: "duplicateIconPop 0.6s ease-out",
                    }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" fill="none" viewBox="0 0 24 24" stroke="#ef4444" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>

                {/* Title */}
                <h2
                  className="text-center font-bold mb-1"
                  style={{ color: "#ff6b6b", fontSize: "1.35rem", letterSpacing: "0.02em" }}
                >
                  ⚠ DUPLICATE BOOKING DETECTED
                </h2>
                <p className="text-center text-sm mb-5" style={{ color: "rgba(255,180,180,0.75)" }}>
                  An existing appointment with the same name or phone number was found
                </p>

                {/* Appointment list */}
                <div
                  className="rounded-xl mb-6 overflow-hidden"
                  style={{ border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.07)" }}
                >
                  <div
                    className="px-4 py-2 text-xs font-bold uppercase tracking-widest"
                    style={{ background: "rgba(239,68,68,0.18)", color: "#ff9999" }}
                  >
                    Existing Appointments
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y" style={{ borderColor: "rgba(239,68,68,0.15)" }}>
                    {matchingAppointments.map((appt) => (
                      <div key={appt.id} className="px-4 py-3 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="font-bold" style={{ color: "#ffbbbb" }}>{appt.patientName}</span>
                            {appt.phoneNumber && (
                              <span className="ml-2 font-mono" style={{ color: "rgba(255,150,150,0.8)" }}>{appt.phoneNumber}</span>
                            )}
                            <span className="ml-2 font-mono" style={{ color: "rgba(255,120,120,0.6)" }}>#{appt.bookingId}</span>
                          </div>
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold uppercase"
                            style={{ background: "rgba(239,68,68,0.25)", color: "#ff9999" }}
                          >
                            {appt.status}
                          </span>
                        </div>
                        <div className="mt-1" style={{ color: "rgba(255,150,150,0.7)" }}>
                          {appt.test.name} · {appt.appointmentDate.slice(0, 10)} · {appt.slot}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Acknowledge button */}
                <button
                  type="button"
                  onClick={handleDuplicateAcknowledge}
                  className="w-full rounded-xl py-3.5 font-bold text-sm uppercase tracking-widest transition-all"
                  style={{
                    background: "linear-gradient(135deg, #dc2626, #ef4444)",
                    color: "#fff",
                    boxShadow: "0 4px 20px rgba(239,68,68,0.5)",
                    letterSpacing: "0.08em",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #b91c1c, #dc2626)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 6px 28px rgba(239,68,68,0.7)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.background = "linear-gradient(135deg, #dc2626, #ef4444)";
                    (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 4px 20px rgba(239,68,68,0.5)";
                  }}
                >
                  I Understand — Proceed with Booking
                </button>
              </div>

              {/* CSS Keyframes injected inline */}
              <style>{`
                @keyframes duplicateAlertPulse {
                  0%, 100% { box-shadow: 0 0 40px rgba(239,68,68,0.6), 0 0 80px rgba(239,68,68,0.3); }
                  50% { box-shadow: 0 0 60px rgba(239,68,68,0.9), 0 0 120px rgba(239,68,68,0.5); }
                }
                @keyframes duplicateBarShimmer {
                  0% { background-position: -200% 0; }
                  100% { background-position: 200% 0; }
                }
                @keyframes duplicateIconPop {
                  0% { transform: scale(0.5); opacity: 0; }
                  70% { transform: scale(1.15); }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </div>
          </div>
        )}

        {/* Appointment config */}
        <section className={`grid gap-3 ${usgSubOptions.length > 0 ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Location Center *</label>
            <select
              className="input w-full"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={user?.role === "TECHNICIAN" && !!user?.locationId}
              required
            >
              {locations.filter(l => l.active).map((l) => <option value={l.id} key={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Test Type *</label>
            {(() => {
              const currentTest = filteredTestsForUser.find(t => t.id === testId);
              const testBg = currentTest?.color;
              const testText = testBg ? getContrastColor(testBg) : undefined;
              return (
                <select 
                  className="input w-full font-bold transition-all duration-150" 
                  style={{ 
                    backgroundColor: testBg || undefined,
                    color: testText || 'inherit',
                    borderColor: testBg || undefined
                  }}
                  value={testId} 
                  onChange={(e) => { setTestId(e.target.value); setSubTest(""); }} 
                  required
                >
                  {filteredTestsForUser.map((t) => {
                    const optBg = t.color;
                    const optColor = optBg ? getContrastColor(optBg) : '#0f172a';
                    return (
                      <option 
                        value={t.id} 
                        key={t.id} 
                        style={{ 
                          backgroundColor: optBg || '#ffffff', 
                          color: optColor,
                          fontWeight: 'bold',
                          padding: '6px 10px'
                        }}
                      >
                        {t.name}
                      </option>
                    );
                  })}
                </select>
              );
            })()}
          </div>
          {usgSubOptions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Specific Test Name *</label>
              <select
                className="input w-full font-medium text-slate-800 dark:text-slate-100"
                value={subTest || usgSubOptions[0]}
                onChange={(e) => setSubTest(e.target.value)}
                required
              >
                {usgSubOptions.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Appointment Date *</label>
            <div className="relative">
              {/* Styled display showing "3 July 2026" */}
              <div
                className="input w-full flex items-center justify-between cursor-pointer select-none"
              >
                <span className={date ? "text-slate-800 dark:text-slate-100 font-medium" : "text-slate-400"}>
                  {formatDateDisplay(date)}
                </span>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              {/* Hidden native date input — handles all real logic */}
              <input
                id="appt-date-input"
                type="date"
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                value={date}
                min={new Date().toLocaleDateString("en-CA")}
                onChange={(e) => setDate(e.target.value)}
                onClick={(e) => {
                  try {
                    e.currentTarget.showPicker?.();
                  } catch (err) { }
                }}
                required
              />
            </div>
          </div>
        </section>

        {/* TVS Scan Questions */}
        {isTVS && (
          <section className="grid gap-3 md:grid-cols-2 bg-pink-50/30 dark:bg-pink-950/10 p-4 rounded-lg border border-pink-100 dark:border-pink-900/30">
            <div>
              <label className="block text-xs font-semibold text-pink-700 dark:text-pink-400 uppercase mb-1">Is Pregnant? *</label>
              <select
                className="input w-full"
                value={isPregnant}
                onChange={(e) => setIsPregnant(e.target.value)}
                required
              >
                <option value="">-- Select Pregnancy Status --</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-pink-700 dark:text-pink-400 uppercase mb-1">Preferred Doctor Gender *</label>
              <select
                className="input w-full"
                value={preferredDoctor}
                onChange={(e) => setPreferredDoctor(e.target.value)}
                required
              >
                <option value="">-- Select Preferred Doctor --</option>
                <option value="Female">Female Doctor</option>
                <option value="Male">Male Doctor</option>
              </select>
            </div>
          </section>
        )}

        {/* Prescription Upload — MRI & USG Special Study */}
        {needsPrescription && (
          <section className="rounded-xl border-2 border-violet-200 bg-violet-50/40 dark:bg-violet-950/20 dark:border-violet-800/50 p-4 space-y-3">
            <div className="flex items-center gap-2 pb-1 border-b border-violet-200 dark:border-violet-800/40">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-violet-600 dark:text-violet-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <h3 className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                {selectedTest?.name} — Prescription (Optional)
              </h3>
            </div>

            {/* Scan Name */}
            <div>
              <label className="block text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase mb-1">
                Scan Name / Procedure
              </label>
              <input
                className="input w-full"
                placeholder="e.g. MRI Brain with Contrast, MRI Spine L-S, USG Abdomen Special..."
                value={scanName}
                onChange={(e) => setScanName(e.target.value)}
              />
            </div>

            {/* Prescription Upload */}
            <div>
              <label className="block text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase mb-1">
                Upload Prescription
                <span className="ml-2 text-[10px] font-normal text-slate-400 normal-case">(PDF, JPG, PNG · max 5 MB)</span>
              </label>

              {!prescriptionUrl ? (
                <label
                  className={`flex flex-col items-center justify-center gap-2 w-full min-h-[90px] border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    isUploading
                      ? "border-violet-300 bg-violet-50/60 dark:bg-violet-900/20"
                      : "border-violet-300 hover:border-violet-500 bg-violet-50/30 hover:bg-violet-50/60 dark:bg-violet-950/20 dark:hover:bg-violet-900/20"
                  }`}
                >
                  {isUploading ? (
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="h-6 w-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                      <span className="text-xs text-violet-600 dark:text-violet-400 font-medium">Uploading...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 pointer-events-none">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">Click to upload prescription</span>
                      <span className="text-[10px] text-slate-400">or drag & drop here</span>
                    </div>
                  )}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePrescriptionFile(f);
                    }}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 dark:border-emerald-800/50 px-4 py-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/40">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4.5 w-4.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                      {prescriptionFile?.name || "Prescription uploaded"}
                    </p>
                    <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70">
                      {prescriptionFile ? `${(prescriptionFile.size / 1024).toFixed(0)} KB` : ""} · Upload successful
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setPrescriptionUrl(""); setPrescriptionFile(null); setUploadError(""); }}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors font-medium ml-auto shrink-0"
                  >
                    ✕ Remove
                  </button>
                </div>
              )}

              {uploadError && (
                <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                  {uploadError}
                </p>
              )}
            </div>
          </section>
        )}

        {/* Slots */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-2">Available Timing Slots *</label>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => {
              const blocked = slot.full || (slot.past && !isAdmin);
              return (
                <label
                  className={`rounded-md border p-3 text-sm flex items-center cursor-pointer transition ${blocked ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                    : slot.past ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
                    : "border-medical-100 bg-medical-50 text-medical-700 hover:border-medical-300"
                    }`}
                  key={slot.label}
                >
                  <input className="mr-2 accent-medical-600" name="slot" type="radio" value={slot.label} disabled={blocked} required />
                  <span>{slot.label} ({slot.full ? "FULL" : slot.past ? (isAdmin ? `time passed · ${slot.left} left` : "Time passed") : `${slot.left} left`})</span>
                </label>
              );
            })}
            {slots.length === 0 && (
              <div className="p-4 text-center text-slate-400 text-xs col-span-3 border-2 border-dashed rounded-lg bg-slate-50">
                {(() => {
                  const dateParts = date.split("-").map(Number);
                  const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                  const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                  const dayName = DAYS_OF_WEEK[selectedDate.getDay()];
                  const activeTest = tests.find((t) => t.id === testId);
                  const activeLocation = locations.find((l) => l.id === locationId);
                  const effectiveWorkDays = (activeTest?.locationWorkDays && activeTest.locationWorkDays.length > 0)
                    ? activeTest.locationWorkDays
                    : activeTest?.workDays;
                  if (effectiveWorkDays && effectiveWorkDays.length > 0 && !effectiveWorkDays.includes(dayName)) {
                    const atCenter = activeLocation ? ` at ${activeLocation.name}` : "";
                    return `This test does not operate${atCenter} on ${dayName}s.`;
                  }
                  return "No active slots configured for this selection. Please select a location and test type.";
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Payment */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 dark:bg-slate-800/20 dark:border-slate-700 p-4">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-350 mb-3 flex items-center gap-2">
            <span className="text-base">₹</span> Payment Details
          </h3>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Total Price (₹)</label>
              <input
                className="input w-full"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 5000"
                value={totalPrice}
                onChange={(e) => setTotalPrice(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Advance Received (₹)</label>
              <input
                className="input w-full"
                type="number"
                min="0"
                step="1"
                placeholder="e.g. 2000"
                value={advanceReceived}
                onChange={(e) => setAdvanceReceived(e.target.value)}
                onWheel={(e) => e.currentTarget.blur()}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Advance Method</label>
              <select
                className="select w-full"
                value={advanceMethod}
                disabled={!advanceReceived || parseInt(advanceReceived, 10) === 0}
                onChange={(e) => setAdvanceMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Remaining Method</label>
              <select
                className="select w-full"
                value={remainingMethod}
                disabled={pending <= 0}
                onChange={(e) => setRemainingMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
              </select>
            </div>
            <div className="col-span-2 md:col-span-1">
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Pending Payment (₹)</label>
              <div className={`input w-full flex items-center font-bold text-base ${pending > 0 ? "text-red-600 bg-red-50 border-red-200" : "text-green-600 bg-green-50 border-green-200"}`}>
                ₹{pending.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </div>


        {/* Extra info */}
        <section className={(isSpecialLocation || isHSG) ? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-2"}>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
              PRO Name <span className="text-red-500">*</span>
            </label>
            <ProNameAutocomplete
              value={referredBy}
              onChange={setReferredBy}
              name="referredBy"
              placeholder="Select or type PRO name…"
            />
          </div>
          {(isSpecialLocation || isHSG) && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">
                Referral Doctor Name {isHSG && <span className="text-red-500">*</span>}
              </label>
              <input className="input w-full" name="referredDoctor" placeholder="Referral Doctor Name" required={isHSG} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">City/Hospital</label>
            <input className="input w-full" name="cityHospital" placeholder="City / Hospital" />
          </div>
          <div className={(isSpecialLocation || isHSG) ? "md:col-span-3" : "md:col-span-2"}>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Notes</label>
            <input className="input w-full" name="notes" placeholder="Any special instructions" />
          </div>
        </section>

        {error && <p className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</p>}
        {matchingAppointments.length > 0 && !duplicateAcknowledged && (
          <p className="text-xs text-red-600 flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            Please acknowledge the duplicate booking alert before proceeding.
          </p>
        )}
        <button
          className="btn bg-medical-600 hover:bg-medical-700 shadow-md w-full md:w-auto disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={matchingAppointments.length > 0 && !duplicateAcknowledged}
        >
          Create Appointment
        </button>
      </form>

      {/* Right Assistant Panel */}
      <div className="xl:col-span-5 2xl:col-span-4 xl:sticky xl:top-24">
        <AppointmentAssistantPanel
          selectedTest={selectedTest}
          selectedLocation={selectedLocation}
          selectedDate={date}
          onSelectDate={(newDate) => setDate(newDate)}
          upcomingDays={upcomingDays}
          isLoadingDays={isLoadingUpcomingDays}
        />
      </div>
    </div>
  </div>
      
      <AppointmentSuccessPopup 
        isOpen={isPopupOpen} 
        onClose={() => {
          setIsPopupOpen(false);
          const user = getUser();
          router.push(user?.role === "TECHNICIAN" ? "/schedule" : "/dashboard");
        }} 
        data={popupData} 
      />
    </Shell>
  );
}
