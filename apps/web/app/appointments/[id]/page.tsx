"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shell } from "../../../components/shell";
import { ProNameAutocomplete } from "../../../components/ProNameAutocomplete";
import { api, statuses } from "../../../lib/api";
import { socket } from "../../../lib/socket";
import { getUser } from "../../../lib/auth";
import { getUsgSubTestOptions } from "../../../lib/usgTests";

type Test = { id: string; name: string; workDays?: string[] };
type Slot = { label: string; capacity: number; left: number; full: boolean };
type Location = { id: string; name: string; active: boolean };

type AppointmentDetail = {
  id: string;
  bookingId: string;
  patientName: string;
  phoneNumber: string | null;
  patientAge?: string | null;
  appointmentDate: string;
  slot: string;
  referredBy?: string;
  referredDoctor?: string;
  cityHospital?: string | null;
  notes?: string;
  status: string;
  totalPrice?: number | null;
  advanceReceived?: number | null;
  advanceMethod?: string | null;
  remainingMethod?: string | null;
  subTest?: string | null;
  isPregnant?: boolean | null;
  preferredDoctor?: string | null;
  test: { id: string; name: string };
  location?: { id: string; name: string; showContactToTechnicians?: boolean } | null;
  createdBy?: { id: string; name: string; email: string };
  activities: {
    id: string;
    message: string;
    createdAt: string;
    user?: { name: string; role: string };
  }[];
  statusHistory: {
    id: string;
    fromStatus?: string;
    toStatus: string;
    createdAt: string;
    user?: { name: string; role: string };
  }[];
  audits: {
    id: string;
    action: string;
    createdAt: string;
    user?: { name: string; role: string };
  }[];
};

function validatePhone(val: string) {
  return /^\+?[0-9]{10,15}$/.test(val.trim());
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

export default function AppointmentDetailPage() {
  const user = getUser();
  const isAdmin = user?.role === "ADMIN";
  const isFrontdesk = user?.role === "FRONTDESK";
  const isTech = user?.role === "TECHNICIAN";
  const canSeePayments = isAdmin || isFrontdesk || isTech;
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState("");
  const [phoneError, setPhoneError] = useState("");

  // Edit states
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editPatientAge, setEditPatientAge] = useState("");
  const [editTestId, setEditTestId] = useState("");
  const [editLocationId, setEditLocationId] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editSlot, setEditSlot] = useState("");
  const [editReferredBy, setEditReferredBy] = useState("");
  const [editReferredDoctor, setEditReferredDoctor] = useState("");
  const [editCityHospital, setEditCityHospital] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editTotalPrice, setEditTotalPrice] = useState("");
  const [editAdvanceReceived, setEditAdvanceReceived] = useState("");
  const [editAdvanceMethod, setEditAdvanceMethod] = useState("UPI");
  const [editRemainingMethod, setEditRemainingMethod] = useState("UPI");
  const [editSubTest, setEditSubTest] = useState("");
  const [editIsPregnant, setEditIsPregnant] = useState("");
  const [editPreferredDoctor, setEditPreferredDoctor] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["appointment", params.id],
    queryFn: () => api<AppointmentDetail>(`/appointments/${params.id}`)
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests"],
    enabled: isEditing,
    queryFn: () => api<Test[]>("/tests")
  });

  const { data: proNames = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["pro-names"],
    enabled: isEditing,
    queryFn: () => api<{ id: string; name: string }[]>("/pro-names"),
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["locations"],
    enabled: isEditing,
    queryFn: () => api<Location[]>("/locations")
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["slots", editTestId, editLocationId, editDate, params.id],
    enabled: isEditing && Boolean(editTestId && editLocationId && editDate),
    queryFn: () => api<Slot[]>(`/appointments/availability?testId=${editTestId}&locationId=${editLocationId}&date=${editDate}&ignoreAppointmentId=${params.id}`)
  });

  useEffect(() => {
    if (data) {
      setEditName(data.patientName);
      setEditPhone(data.phoneNumber || "");
      setEditPatientAge(data.patientAge || "");
      setEditTestId(data.test.id);
      setEditLocationId(data.location?.id || "");
      setEditDate(data.appointmentDate.slice(0, 10));
      setEditSlot(data.slot);
      setEditReferredBy(data.referredBy || "");
      setEditReferredDoctor(data.referredDoctor || "");
      setEditCityHospital(data.cityHospital || "");
      setEditNotes(data.notes || "");
      setEditStatus(data.status);
      setEditTotalPrice(data.totalPrice != null ? String(data.totalPrice) : "");
      setEditAdvanceReceived(data.advanceReceived != null ? String(data.advanceReceived) : "");
      setEditAdvanceMethod(data.advanceMethod || "UPI");
      setEditRemainingMethod(data.remainingMethod || "UPI");
      setEditSubTest(data.subTest || "");
      setEditIsPregnant(data.isPregnant != null ? String(data.isPregnant) : "");
      setEditPreferredDoctor(data.preferredDoctor || "");
    }
  }, [data, isEditing]);

  useEffect(() => {
    if (!isEditing) return;
    socket.connect();
    socket.on("slots:changed", () => queryClient.invalidateQueries({ queryKey: ["slots"] }));
    return () => { socket.off("slots:changed"); socket.disconnect(); };
  }, [isEditing, queryClient]);

  const editTotal = parseInt(editTotalPrice, 10) || 0;
  const editAdvance = parseInt(editAdvanceReceived, 10) || 0;
  const editPending = Math.max(editTotal - editAdvance, 0);

  const selectedLocation = locations.find(l => l.id === editLocationId);
  const isSpecialLocation = selectedLocation
    ? (selectedLocation.name.toLowerCase().includes("gwalior") || selectedLocation.name.toLowerCase().includes("dehradun"))
    : false;
  
  const selectedTest = tests.find(t => t.id === editTestId);
  const isDTPA = selectedTest
    ? selectedTest.name.toLowerCase() === "dtpa"
    : (data?.test.name.toLowerCase() === "dtpa" ? true : false);
  const isHSG = selectedTest
    ? selectedTest.name.toLowerCase().includes("hsg")
    : (data?.test.name.toLowerCase().includes("hsg") ?? false);

  const activeTestObj = selectedTest || data?.test;
  const editSelectedTestOptions = getUsgSubTestOptions(activeTestObj?.name);

  const editSelectedSubTestName = editSelectedTestOptions.length > 0 ? (editSubTest || editSelectedTestOptions[0]) : "";
  const isTVS = editSelectedSubTestName.toLowerCase().includes("tvs");

  const isViewTVS = data?.subTest?.toLowerCase().includes("tvs") || false;

  const isViewDTPA = data?.test.name.toLowerCase() === "dtpa";
  const isViewHSG = data?.test.name.toLowerCase().includes("hsg") ?? false;

  const isViewSpecialLocation = data?.location
    ? (data.location.name.toLowerCase().includes("gwalior") || data.location.name.toLowerCase().includes("dehradun"))
    : false;

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    // Date validation: Backdates
    const dateParts = editDate.split("-").map(Number);
    const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayName = DAYS_OF_WEEK[selectedDate.getDay()];
    const activeTest = tests.find((t) => t.id === editTestId);
    if (activeTest && activeTest.workDays && activeTest.workDays.length > 0 && !activeTest.workDays.includes(dayName)) {
      setError(`This test is not available on ${dayName}s.`);
      return;
    }
    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (selectedDate < todayLocal) {
      setError("Bookings cannot be scheduled for past dates.");
      return;
    }

    if (editPhone.trim() !== "" && !validatePhone(editPhone)) {
      setPhoneError("Enter a valid phone number (10–15 digits)");
      return;
    }
    setPhoneError("");
    if (isDTPA) {
      const nextDateParts = editDate.split("-").map(Number);
      const nextSelectedDate = new Date(nextDateParts[0], nextDateParts[1] - 1, nextDateParts[2]);
      const nextIsSaturday = nextSelectedDate.getDay() === 6;
      if (nextIsSaturday) {
        const ageVal = parseAgeInYears(editPatientAge);
        if (ageVal === null || ageVal < 15) {
          setError("Patient must be older than 15 years to register for a DTPA scan on Saturdays.");
          return;
        }
      }
    }
    // Validate referredBy (PRO Name) must exist in the master list
    if (editReferredBy && editReferredBy.trim()) {
      const isValid = proNames.some((p) => p.name.toLowerCase() === editReferredBy.toLowerCase());
      if (!isValid) {
        setError("Please select a valid PRO Name from the dropdown list. Custom names are not allowed.");
        return;
      }
    }

    // Validate TVS inputs
    if (isTVS) {
      if (!editIsPregnant) {
        setError("Please specify if the patient is pregnant or not.");
        return;
      }
      if (!editPreferredDoctor) {
        setError("Please specify the preferred doctor.");
        return;
      }
    }

    if (isHSG) {
      if (!editReferredDoctor.trim()) {
        setError("Referral Doctor Name is mandatory for HSG test.");
        return;
      }
    }

    try {
      await api(`/appointments/${params.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          patientName: editName.trim(),
          phoneNumber: editPhone.trim(),
          patientAge: isDTPA ? editPatientAge.trim() : null,
          testId: editTestId,
          locationId: editLocationId,
          appointmentDate: editDate,
          slot: editSlot,
          referredBy: editReferredBy || null,
          referredDoctor: editReferredDoctor || null,
          cityHospital: editCityHospital || null,
          notes: editNotes || null,
          status: editStatus,
          totalPrice: editTotalPrice ? parseInt(editTotalPrice, 10) : null,
          advanceReceived: editAdvanceReceived ? parseInt(editAdvanceReceived, 10) : null,
          advanceMethod: editAdvanceMethod || "UPI",
          remainingMethod: editRemainingMethod || "UPI",
          subTest: editSelectedTestOptions.length > 0 ? (editSubTest || editSelectedTestOptions[0]) : null,
          isPregnant: isTVS ? (editIsPregnant === "true") : null,
          preferredDoctor: isTVS ? editPreferredDoctor : null,
        })
      });
      queryClient.invalidateQueries({ queryKey: ["appointment", params.id] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["schedule"] });
      queryClient.invalidateQueries({ queryKey: ["slots"] });
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  if (isLoading) return <Shell><div className="card">Loading appointment...</div></Shell>;
  if (!data) return <Shell><div className="card">Appointment not found.</div></Shell>;

  const viewTotal = data.totalPrice ?? 0;
  const viewAdvance = data.advanceReceived ?? 0;
  const viewPending = Math.max(viewTotal - viewAdvance, 0);

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{data.bookingId}</h1>
          <p className="text-sm text-slate-500">{data.patientName} · {data.test.name} · {data.location?.name || "No Location"}</p>
        </div>
        <div className="flex gap-2">
          {!isEditing && (
            <button className="btn bg-medical-600 hover:bg-medical-700" onClick={() => setIsEditing(true)}>
              Edit Booking
            </button>
          )}
          <button
            className="btn bg-slate-500 hover:bg-slate-600"
            onClick={() => {
              const user = getUser();
              router.push(user?.role === "TECHNICIAN" ? "/schedule" : "/dashboard");
            }}
          >
            Back
          </button>
        </div>
      </div>

      {isEditing ? (
        <form onSubmit={saveChanges} className="card space-y-5">
          <h2 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Edit Appointment Details</h2>
          
          <section className={isDTPA ? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-2"}>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Patient Name *</label>
              <input className="input w-full" value={editName} onChange={(e) => setEditName(e.target.value.trimStart())} placeholder="Patient Name" required />
            </div>
            {user?.role !== "TECHNICIAN" && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Phone Number</label>
                <input
                  className={`input w-full ${phoneError ? "border-red-400" : ""}`}
                  value={editPhone}
                  onChange={(e) => { setEditPhone(e.target.value); setPhoneError(""); }}
                  placeholder="10-digit mobile (optional)"
                />
                {phoneError && <p className="text-xs text-red-600 mt-1">{phoneError}</p>}
              </div>
            )}
            {isDTPA && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Patient Age *</label>
                <input
                  className="input w-full"
                  value={editPatientAge}
                  onChange={(e) => setEditPatientAge(e.target.value)}
                  placeholder="e.g. 25, 6 Months"
                  required={isDTPA}
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  {(() => {
                    const parts = editDate.split("-").map(Number);
                    const d = new Date(parts[0], parts[1] - 1, parts[2]);
                    return d.getDay() === 6 ? "Must be older than 15 years on Saturdays." : "No age restriction today.";
                  })()}
                </p>
              </div>
            )}
          </section>

          <section className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Location *</label>
              <select className="input w-full" value={editLocationId} onChange={(e) => setEditLocationId(e.target.value)}>
                {locations.filter(l => l.active || l.id === editLocationId).map((l) => <option value={l.id} key={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Test Type *</label>
              <select className="input w-full" value={editTestId} onChange={(e) => { setEditTestId(e.target.value); setEditSubTest(""); }}>
                {tests.map((t) => <option value={t.id} key={t.id}>{t.name}</option>)}
              </select>
            </div>
            {editSelectedTestOptions.length > 0 && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Specific Test Name *</label>
                <select className="input w-full font-medium text-slate-800 dark:text-slate-100" value={editSubTest || editSelectedTestOptions[0]} onChange={(e) => setEditSubTest(e.target.value)}>
                  {editSelectedTestOptions.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Date *</label>
              <input className="input w-full" type="date" value={editDate} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setEditDate(e.target.value)} onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch (err) {} }} required />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Status</label>
              <select className="input w-full" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                {statuses.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </section>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-2 uppercase">Select Time Slot *</label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {slots.map((slot) => {
                const isSelected = editSlot === slot.label;
                return (
                  <label
                    className={`rounded-md border p-3 text-sm flex items-center cursor-pointer ${
                      slot.full && !isSelected ? "border-slate-200 bg-slate-100 text-slate-400"
                      : isSelected ? "border-medical-500 bg-medical-50 text-medical-800 font-medium"
                      : "border-medical-100 bg-medical-50/50 text-medical-700 hover:bg-medical-50"
                    }`}
                    key={slot.label}
                  >
                    <input className="mr-2" name="slot" type="radio" value={slot.label} checked={isSelected} onChange={(e) => setEditSlot(e.target.value)} disabled={slot.full && !isSelected} required />
                    {slot.label} ({slot.full && !isSelected ? "FULL" : isSelected ? "Selected" : `${slot.left} left`})
                  </label>
                );
              })}
              {slots.length === 0 && (
                <p className="text-sm text-slate-500 font-medium">
                  {(() => {
                    const dateParts = editDate.split("-").map(Number);
                    const selectedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
                    const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    const dayName = DAYS_OF_WEEK[selectedDate.getDay()];
                    const activeTest = tests.find((t) => t.id === editTestId);
                    if (activeTest && activeTest.workDays && activeTest.workDays.length > 0 && !activeTest.workDays.includes(dayName)) {
                      return `This test does not operate on ${dayName}s.`;
                    }
                    return "No slots configured or loading...";
                  })()}
                </p>
              )}
            </div>
          </div>
          {/* Payment edit */}
          {canSeePayments && (
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 dark:bg-slate-800/20 dark:border-slate-700 p-4">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-350 mb-3">₹ Payment Details</h3>
              <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Total Price (₹)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={editTotalPrice}
                    onChange={(e) => setEditTotalPrice(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Advance Received (₹)</label>
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="0"
                    value={editAdvanceReceived}
                    onChange={(e) => setEditAdvanceReceived(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Advance Method</label>
                  <select
                    className="select w-full"
                    value={editAdvanceMethod}
                    disabled={!editAdvanceReceived || parseInt(editAdvanceReceived, 10) === 0}
                    onChange={(e) => setEditAdvanceMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Remaining Method</label>
                  <select
                    className="select w-full"
                    value={editRemainingMethod}
                    disabled={editTotal <= editAdvance}
                    onChange={(e) => setEditRemainingMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">Card</option>
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Pending Payment (₹)</label>
                  <div className={`input w-full flex items-center font-bold ${editPending > 0 ? "text-red-600 bg-red-50 border-red-200" : "text-green-600 bg-green-50 border-green-200"}`}>
                    ₹{editPending.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            </div>
          )}
          <section className={(isSpecialLocation || isHSG) ? "grid gap-3 md:grid-cols-3" : "grid gap-3 md:grid-cols-2"}>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">PRO Name</label>
              <ProNameAutocomplete
                value={editReferredBy}
                onChange={setEditReferredBy}
                placeholder="Select or type PRO name…"
              />
            </div>
            {(isSpecialLocation || isHSG) && (
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">
                  Referral Doctor Name {isHSG && <span className="text-red-500">*</span>}
                </label>
                <input className="input w-full" value={editReferredDoctor} onChange={(e) => setEditReferredDoctor(e.target.value)} placeholder="Referral Doctor Name" required={isHSG} />
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">City/Hospital</label>
              <input className="input w-full" value={editCityHospital} onChange={(e) => setEditCityHospital(e.target.value)} placeholder="City / Hospital" />
            </div>
            <div className={(isSpecialLocation || isHSG) ? "col-span-3" : "col-span-2"}>
              <label className="text-xs font-semibold text-slate-500 block mb-1 uppercase">Notes</label>
              <input className="input w-full" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notes" />
            </div>
          </section>

          {/* TVS Scan Questions */}
          {isTVS && (
            <div className="grid gap-3 md:grid-cols-2 bg-pink-50/30 dark:bg-pink-950/10 p-4 rounded-lg border border-pink-100 dark:border-pink-900/30">
              <div>
                <label className="block text-xs font-semibold text-pink-700 dark:text-pink-400 uppercase mb-1">Is Pregnant? *</label>
                <select
                  className="input w-full font-medium"
                  value={editIsPregnant}
                  onChange={(e) => setEditIsPregnant(e.target.value)}
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
                  className="input w-full font-medium"
                  value={editPreferredDoctor}
                  onChange={(e) => setEditPreferredDoctor(e.target.value)}
                  required
                >
                  <option value="">-- Select Preferred Doctor --</option>
                  <option value="Female">Female Doctor</option>
                  <option value="Male">Male Doctor</option>
                </select>
              </div>
            </div>
          )}

          {error && <p className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</p>}

          <div className="flex gap-2 justify-end pt-2 border-t">
            <button className="btn bg-medical-700 hover:bg-medical-800" type="submit">Save Changes</button>
            <button className="btn bg-slate-500 hover:bg-slate-600" type="button" onClick={() => setIsEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-5 lg:grid-cols-3">
            <div className="card space-y-2">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Patient Details</h2>
              <p className="text-sm"><span className="text-slate-500">Name:</span> {data.patientName}</p>
              {data.patientAge && (
                <p className="text-sm"><span className="text-slate-500">Age:</span> {data.patientAge}</p>
              )}
              <p className="text-sm"><span className="text-slate-500">Phone:</span> {user?.role === "TECHNICIAN" && !data.location?.showContactToTechnicians ? "Hidden" : (data.phoneNumber || "—")}</p>
              <p className="text-sm"><span className="text-slate-500">PRO Name:</span> {data.referredBy || "—"}</p>
              {(isViewSpecialLocation || isViewHSG || data.referredDoctor) && (
                <p className="text-sm"><span className="text-slate-500">Referral Doctor Name:</span> {data.referredDoctor || "—"}</p>
              )}
              <p className="text-sm"><span className="text-slate-500">City/Hospital:</span> {data.cityHospital || "—"}</p>
              {isViewTVS && (
                <div className="mt-2 bg-pink-50/30 dark:bg-pink-950/10 p-2.5 rounded border border-pink-100 dark:border-pink-900/30 text-xs space-y-1">
                  <p><span className="text-pink-700 dark:text-pink-400 font-semibold uppercase">Pregnant:</span> {data.isPregnant === true ? "Yes" : (data.isPregnant === false ? "No" : "—")}</p>
                  <p><span className="text-pink-700 dark:text-pink-400 font-semibold uppercase">Preferred Doctor:</span> {data.preferredDoctor || "—"}</p>
                </div>
              )}
            </div>
            <div className="card space-y-2">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Appointment Details</h2>
              <p className="text-sm"><span className="text-slate-500">Test:</span> <span className="font-semibold text-medical-600">{data.test.name}{data.subTest ? ` (${data.subTest})` : ""}</span></p>
              <p className="text-sm"><span className="text-slate-500">Location:</span> <span className="font-semibold text-medical-600">{data.location?.name || "None"}</span></p>
              <p className="text-sm"><span className="text-slate-500">Date:</span> {data.appointmentDate.slice(0, 10)}</p>
              <p className="text-sm"><span className="text-slate-500">Slot:</span> {data.slot}</p>
              <p className="text-sm"><span className="text-slate-500">Notes:</span> {data.notes || "—"}</p>
              <p className="text-sm"><span className="text-slate-500">Status:</span> <span className="font-semibold text-medical-700">{data.status}</span></p>
            </div>
            <div className="card space-y-2">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Audit Info</h2>
              <p className="text-sm"><span className="text-slate-500">Booking ID:</span> {data.bookingId}</p>
              <p className="text-sm"><span className="text-slate-500">Created By:</span> {data.createdBy?.name || "System"}</p>
            </div>
          </section>

          {/* Payment card */}
          {canSeePayments && (
            <div className="card">
              <h2 className="font-semibold text-slate-800 dark:text-slate-200 mb-4">₹ Payment Summary</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 p-4 text-center">
                  <p className="text-xs text-blue-500 uppercase font-semibold mb-1">Total Price</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">₹{viewTotal.toLocaleString("en-IN", { minimumFractionDigits: 0 })}</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 p-4 text-center">
                  <p className="text-xs text-emerald-600 uppercase font-semibold mb-1">Advance Received</p>
                  <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">₹{viewAdvance.toLocaleString("en-IN", { minimumFractionDigits: 0 })}</p>
                  {data.advanceMethod && viewAdvance > 0 && (
                    <p className="text-xs text-emerald-600 font-semibold mt-1">Method: {data.advanceMethod}</p>
                  )}
                </div>
                <div className={`rounded-lg border p-4 text-center ${viewPending > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800" : "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800"}`}>
                  <p className={`text-xs uppercase font-semibold mb-1 ${viewPending > 0 ? "text-red-500" : "text-green-600"}`}>Pending Payment</p>
                  <p className={`text-2xl font-bold ${viewPending > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
                    ₹{viewPending.toLocaleString("en-IN", { minimumFractionDigits: 0 })}
                  </p>
                  {viewPending === 0 && viewTotal > 0 && (
                    <div>
                      <p className="text-xs text-green-500 mt-1">Fully Paid ✓</p>
                      {data.remainingMethod && (
                        <p className="text-xs text-green-600 font-semibold mt-0.5">Remaining via: {data.remainingMethod}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <section className="mt-5 grid gap-5 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">Activity Timeline</h2>
          <div className="space-y-4">
            {data.activities.map((a) => (
              <div className="border-l-2 border-medical-500 pl-3 text-sm" key={a.id}>
                <div className="text-xs text-slate-400">
                  {new Date(a.createdAt).toLocaleString()} by{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {a.user ? `${a.user.name} (${a.user.role})` : "System"}
                  </span>
                </div>
                <div className="mt-1 text-slate-700 dark:text-slate-300">{a.message}</div>
              </div>
            ))}
            {data.activities.length === 0 && <p className="text-sm text-slate-500">No activities recorded.</p>}
          </div>
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">Status History</h2>
          <div className="space-y-4">
            {data.statusHistory.map((s) => (
              <div className="border-l-2 border-slate-300 pl-3 text-sm" key={s.id}>
                <div className="text-xs text-slate-400">
                  {new Date(s.createdAt).toLocaleString()} by{" "}
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {s.user ? `${s.user.name} (${s.user.role})` : "System"}
                  </span>
                </div>
                <div className="mt-1 text-slate-700 dark:text-slate-300 font-medium">
                  {s.fromStatus || "New"} &rarr; {s.toStatus}
                </div>
              </div>
            ))}
            {data.statusHistory.length === 0 && <p className="text-sm text-slate-500">No status history recorded.</p>}
          </div>
        </div>
      </section>
    </Shell>
  );
}
