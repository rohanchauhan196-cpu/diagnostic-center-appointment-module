"use client";

import { FormEvent, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Shell } from "../../components/shell";
import { api, API_URL } from "../../lib/api";
import { getToken, getUser } from "../../lib/auth";

const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Analytics = {
  kpis: { total: number; today: number; monthly: number; completed: number; cancelled: number };
  byReferral: { referredBy: string | null; _count: number }[];
  byAgent?: { agentId: string; agentName: string; role: string; count: number }[];
  byMarketing?: { agentId: string; monthly: number }[];
};
type Test = { id: string; name: string; active: boolean; workDays?: string[]; locationWorkDays?: string[] | null; slots: { label: string; capacity: number; sortOrder?: number; active?: boolean; dayOfWeek?: string }[] };
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FRONTDESK" | "TECHNICIAN" | "MARKETING" | "ANALYTICS" | "OPERATOR";
  active: boolean;
  createdAt: string;
  location?: { id: string; name: string } | null;
  testTypes?: { id: string; name: string }[];
  canCreateAppointments?: boolean;
};
type Location = {
  id: string;
  name: string;
  active: boolean;
  showContactToTechnicians: boolean;
};

export default function AdminPage() {
  const queryClient = useQueryClient();
  const currentUser = getUser();
  const isAnalytics = currentUser?.role === "ANALYTICS";

  const [userMessage, setUserMessage] = useState("");
  const [userError, setUserError] = useState("");

  const [techMessage, setTechMessage] = useState("");
  const [techError, setTechError] = useState("");
  const [techSearch, setTechSearch] = useState("");
  const [techTestFilter, setTechTestFilter] = useState("");
  const [selectedTechTestTypeIds, setSelectedTechTestTypeIds] = useState<string[]>([]);

  const [opMessage, setOpMessage] = useState("");
  const [opError, setOpError] = useState("");
  const [selectedOpTestTypeIds, setSelectedOpTestTypeIds] = useState<string[]>([]);

  const [emailTestSending, setEmailTestSending] = useState(false);
  const [emailCenterTestSending, setEmailCenterTestSending] = useState(false);
  const [emailTestResult, setEmailTestResult] = useState<{ message?: string; error?: string } | null>(null);

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editUserName, setEditUserName] = useState("");
  const [editUserEmail, setEditUserEmail] = useState("");
  const [editUserLocationId, setEditUserLocationId] = useState("");
  const [editUserTestTypeIds, setEditUserTestTypeIds] = useState<string[]>([]);
  const [editUserCanBook, setEditUserCanBook] = useState(false);

  const [mktMessage, setMktMessage] = useState("");
  const [mktError, setMktError] = useState("");

  const [locationName, setLocationName] = useState("");
  const [locationQrCodeUrl, setLocationQrCodeUrl] = useState("");
  const [locationMapLink, setLocationMapLink] = useState("");
  const [locationAddress, setLocationAddress] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [locationError, setLocationError] = useState("");

  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);
  const [editingLocationName, setEditingLocationName] = useState("");
  const [editingLocationMapLink, setEditingLocationMapLink] = useState("");
  const [editingLocationQrCodeUrl, setEditingLocationQrCodeUrl] = useState("");
  const [editingLocationAddress, setEditingLocationAddress] = useState("");

  const [testName, setTestName] = useState("");
  const [testInstructions, setTestInstructions] = useState("");
  const [newTestDays, setNewTestDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState("");

  const [editingTestId, setEditingTestId] = useState<string | null>(null);
  const [editingTestName, setEditingTestName] = useState("");
  const [editingTestInstructions, setEditingTestInstructions] = useState("");
  const [editingTestDays, setEditingTestDays] = useState<string[]>([]);

  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedSlotTestId, setSelectedSlotTestId] = useState("");
  const [editingSlots, setEditingSlots] = useState<{ label: string; capacity: number; sortOrder: number; active?: boolean; dayOfWeek?: string }[]>([]);
  const [selectedSlotDay, setSelectedSlotDay] = useState("All");
  const [editingLocationWorkDays, setEditingLocationWorkDays] = useState<string[]>([]);
  const [slotMessage, setSlotMessage] = useState("");
  const [slotError, setSlotError] = useState("");

  const [csvStartDate, setCsvStartDate] = useState("");
  const [csvEndDate, setCsvEndDate] = useState("");
  const [csvLocationId, setCsvLocationId] = useState("");
  const [csvTestId, setCsvTestId] = useState("");

  const [proNameInput, setProNameInput] = useState("");
  const [proMessage, setProMessage] = useState("");
  const [proError, setProError] = useState("");
  const [editingProId, setEditingProId] = useState<string | null>(null);
  const [editingProName, setEditingProName] = useState("");
  const [proSearchQuery, setProSearchQuery] = useState("");

  // Chart month filter — defaults to current month
  const now = new Date();
  const [chartMonth, setChartMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data } = useQuery({
    queryKey: ["analytics", chartMonth, csvLocationId, csvTestId, csvStartDate, csvEndDate],
    queryFn: () => {
      const params = new URLSearchParams();
      // Custom date range takes priority over month picker
      if (csvStartDate || csvEndDate) {
        if (csvStartDate) params.set("startDate", csvStartDate);
        if (csvEndDate)   params.set("endDate",   csvEndDate);
      } else {
        const [yr, mo] = chartMonth.split("-");
        params.set("year",  yr);
        params.set("month", String(parseInt(mo)));
      }
      if (csvLocationId) params.set("locationId", csvLocationId);
      if (csvTestId)     params.set("testId",     csvTestId);
      return api<Analytics>(`/admin/analytics?${params.toString()}`);
    }
  });
  

  const { data: locations = [], refetch: refetchLocations } = useQuery({
    queryKey: ["locations"],
    queryFn: async () => {
      const res = await api<Location[]>("/locations");
      if (res.length > 0 && !selectedLocationId) {
        setSelectedLocationId(res[0].id);
      }
      return res;
    }
  });

  const { data: tests = [], refetch: refetchTests } = useQuery({
    queryKey: ["tests-admin", selectedLocationId],
    queryFn: () => api<Test[]>(selectedLocationId ? `/tests?locationId=${selectedLocationId}&all=true` : "/tests?all=true"),
    enabled: true
  });

  const { data: proList = [], refetch: refetchProList } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["pro-names-admin"],
    queryFn: () => api<{ id: string; name: string }[]>("/pro-names"),
  });

  const { data: users = [], refetch: refetchUsers } = useQuery({ queryKey: ["users"], queryFn: () => api<AdminUser[]>("/users") });

  // Add a user hook to copy current slots when test or location changes
  // Add a user hook to copy current slots when test or location changes
  const handleSelectTest = (testId: string, day = selectedSlotDay) => {
    setSelectedSlotTestId(testId);
    const test = tests.find((t) => t.id === testId);
    if (test) {
      const hasCustomDaySlots = test.slots.some(s => (s.dayOfWeek ?? "All") === day);
      const daySlots = (hasCustomDaySlots || day === "All")
        ? test.slots.filter(s => (s.dayOfWeek ?? "All") === day)
        : test.slots.filter(s => (s.dayOfWeek ?? "All") === "All");
      setEditingSlots(daySlots.map((s, idx) => ({ label: s.label, capacity: s.capacity, sortOrder: idx + 1, active: s.active ?? true, dayOfWeek: s.dayOfWeek ?? "All" })));
      // Load per-center workDays if available, else fall back to global workDays
      setEditingLocationWorkDays(
        test.locationWorkDays ?? test.workDays ?? DAYS_OF_WEEK
      );
    } else {
      setEditingSlots([]);
      setEditingLocationWorkDays(DAYS_OF_WEEK);
    }
    setSlotMessage("");
    setSlotError("");
  };

  const handleSelectSlotDay = (day: string) => {
    setSelectedSlotDay(day);
    if (selectedSlotTestId) {
      const test = tests.find((t) => t.id === selectedSlotTestId);
      if (test) {
        const hasCustomDaySlots = test.slots.some(s => (s.dayOfWeek ?? "All") === day);
        const daySlots = (hasCustomDaySlots || day === "All")
          ? test.slots.filter(s => (s.dayOfWeek ?? "All") === day)
          : test.slots.filter(s => (s.dayOfWeek ?? "All") === "All");
        setEditingSlots(daySlots.map((s, idx) => ({ label: s.label, capacity: s.capacity, sortOrder: idx + 1, active: s.active ?? true, dayOfWeek: s.dayOfWeek ?? "All" })));
      }
    } else {
      setEditingSlots([]);
    }
    setSlotMessage("");
    setSlotError("");
  };

  // Sync slots after query loaded/changed
  const syncEditingSlots = (testId: string, currentTests: Test[], day = selectedSlotDay) => {
    const test = currentTests.find((t) => t.id === testId);
    if (test) {
      let daySlots = test.slots.filter(s => (s.dayOfWeek ?? "All") === day);
      if (daySlots.length === 0 && day !== "All") {
        daySlots = test.slots.filter(s => (s.dayOfWeek ?? "All") === "All");
      }
      setEditingSlots(daySlots.map((s, idx) => ({ label: s.label, capacity: s.capacity, sortOrder: idx + 1, active: s.active ?? true, dayOfWeek: s.dayOfWeek ?? "All" })));
      setEditingLocationWorkDays(
        test.locationWorkDays ?? test.workDays ?? DAYS_OF_WEEK
      );
    } else {
      setEditingSlots([]);
      setEditingLocationWorkDays(DAYS_OF_WEEK);
    }
  };

  // Actions
  async function createFrontdeskUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserMessage("");
    setUserError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          role: "FRONTDESK"
        })
      });
      formElement.reset();
      setUserMessage("Frontdesk user created. They can now log in with the email and password you set.");
      refetchUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Could not create user");
    }
  }

  async function createAnalyticsUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setUserMessage("");
    setUserError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("analyticsName"),
          email: form.get("analyticsEmail"),
          password: form.get("analyticsPassword"),
          role: "ANALYTICS"
        })
      });
      formElement.reset();
      setUserMessage("Analytics account created successfully.");
      refetchUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Could not create analytics user");
    }
  }

  async function updateUser(id: string, body: Record<string, unknown>) {
    setUserMessage("");
    setUserError("");
    try {
      await api(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      setUserMessage("User updated.");
      refetchUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Could not update user");
    }
  }

  function startEditUser(user: AdminUser) {
    setEditingUser(user);
    setEditUserName(user.name);
    setEditUserEmail(user.email);
    setEditUserLocationId(user.location?.id || "");
    setEditUserTestTypeIds(user.testTypes?.map(t => t.id) || []);
    setEditUserCanBook(user.canCreateAppointments || false);
  }

  async function handleEditUserSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingUser) return;
    setUserMessage("");
    setUserError("");
    try {
      const payload: Record<string, any> = {
        name: editUserName,
        locationId: editUserLocationId || null,
        testTypeIds: editUserTestTypeIds,
      };
      if (editingUser.role === "TECHNICIAN") {
        payload.canCreateAppointments = editUserCanBook;
      }
      await api(`/users/${editingUser.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setUserMessage("User details updated successfully.");
      setEditingUser(null);
      refetchUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Could not update user");
    }
  }

  async function resetPassword(id: string) {
    const password = window.prompt("Enter a new password, minimum 8 characters:");
    if (!password) return;
    if (password.length < 8) {
      setUserError("Password must be at least 8 characters.");
      return;
    }
    updateUser(id, { password });
  }

  async function deleteUser(id: string) {
    if (!confirm("Are you sure you want to delete this user? Their existing bookings will remain completely safe and preserved in the system.")) return;
    setUserMessage("");
    setUserError("");
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      setUserMessage("User deleted successfully. All bookings were preserved.");
      refetchUsers();
    } catch (error) {
      setUserError(error instanceof Error ? error.message : "Could not delete user");
    }
  }

  async function createMarketing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMktMessage("");
    setMktError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({ name: form.get("mktName"), email: form.get("mktEmail"), password: form.get("mktPassword"), role: "MARKETING" })
      });
      formElement.reset();
      setMktMessage("Marketing agent account created. They can now log in from the mobile app.");
      refetchUsers();
    } catch (error) {
      setMktError(error instanceof Error ? error.message : "Could not create marketing account");
    }
  }

  async function createTechnician(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTechMessage("");
    setTechError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("techName"),
          email: form.get("techEmail"),
          password: form.get("techPassword"),
          role: "TECHNICIAN",
          locationId: form.get("techLocationId") || null,
          testTypeIds: selectedTechTestTypeIds,
          canCreateAppointments: form.get("techCanBook") === "on"
        })
      });
      formElement.reset();
      setSelectedTechTestTypeIds([]);
      setTechMessage("Technician account created. They can log in and view today's schedule.");
      refetchUsers();
    } catch (error) {
      setTechError(error instanceof Error ? error.message : "Could not create technician account");
    }
  }

  async function createOperator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOpMessage("");
    setOpError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await api("/users", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("opName"),
          email: form.get("opEmail"),
          password: form.get("opPassword"),
          role: "OPERATOR",
          locationId: form.get("opLocationId") || null,
          testTypeIds: selectedOpTestTypeIds
        })
      });
      formElement.reset();
      setSelectedOpTestTypeIds([]);
      setOpMessage("Machine Operator account created. They can log in and manage today's scan progress.");
      refetchUsers();
    } catch (error) {
      setOpError(error instanceof Error ? error.message : "Could not create Machine Operator account");
    }
  }

  async function triggerTestEmail() {
    setEmailTestSending(true);
    setEmailTestResult(null);
    try {
      const res = await api<{ message: string }>("/admin/test-email", { method: "POST" });
      setEmailTestResult({ message: res.message });
    } catch (error) {
      setEmailTestResult({ error: error instanceof Error ? error.message : "Failed to send test email" });
    } finally {
      setEmailTestSending(false);
    }
  }

  async function triggerTestCenterEmail() {
    setEmailCenterTestSending(true);
    setEmailTestResult(null);
    try {
      const res = await api<{ message: string }>("/admin/test-center-email", { method: "POST" });
      setEmailTestResult({ message: res.message });
    } catch (error) {
      setEmailTestResult({ error: error instanceof Error ? error.message : "Failed to send test email" });
    } finally {
      setEmailCenterTestSending(false);
    }
  }

  async function uploadFile(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    const token = localStorage.getItem("token") || "";
    // Note: The API runs on a different base URL than the frontend sometimes.
    // The api() helper does json, so we use fetch directly.
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const res = await fetch(`${baseUrl}/upload`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      throw new Error("File upload failed");
    }
    const data = await res.json();
    return baseUrl + data.url;
  }

  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocationMessage("");
    setLocationError("");
    const formElement = event.currentTarget;
    try {
      const created = await api<Location>("/locations", {
        method: "POST",
        body: JSON.stringify({ 
          name: locationName,
          qrCodeUrl: locationQrCodeUrl,
          mapLink: locationMapLink,
          address: locationAddress
        })
      });
      setLocationName("");
      setLocationQrCodeUrl("");
      setLocationMapLink("");
      setLocationAddress("");
      setLocationMessage(`Location "${created.name}" created successfully.`);
      refetchLocations();
      if (!selectedLocationId) setSelectedLocationId(created.id);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not create location");
    }
  }

  async function toggleLocationActive(id: string, currentActive: boolean) {
    setLocationMessage(""); setLocationError("");
    try {
      await api(`/locations/${id}`, { method: "PATCH", body: JSON.stringify({ active: !currentActive }) });
      setLocationMessage("Location status updated.");
      refetchLocations(); refetchTests();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not update location status");
    }
  }

  function startEditingLocation(loc: Location & { mapLink?: string | null; qrCodeUrl?: string | null; address?: string | null }) {
    setEditingLocationId(loc.id);
    setEditingLocationName(loc.name);
    setEditingLocationMapLink(loc.mapLink || "");
    setEditingLocationQrCodeUrl(loc.qrCodeUrl || "");
    setEditingLocationAddress(loc.address || "");
  }

  async function saveLocationEdit(id: string) {
    try {
      await api(`/locations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editingLocationName,
          mapLink: editingLocationMapLink || null,
          qrCodeUrl: editingLocationQrCodeUrl || null,
          address: editingLocationAddress || null,
        }),
      });
      setEditingLocationId(null);
      setLocationMessage("Location updated successfully!");
      refetchLocations();
      setTimeout(() => setLocationMessage(""), 3000);
    } catch (err: any) {
      setLocationError(err.message || "Failed to update location");
    }
  }

  async function toggleLocationContactVisible(id: string, currentVal: boolean) {
    setLocationMessage(""); setLocationError("");
    try {
      await api(`/locations/${id}`, { method: "PATCH", body: JSON.stringify({ showContactToTechnicians: !currentVal }) });
      setLocationMessage("Location contact visibility updated.");
      refetchLocations();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not update contact visibility");
    }
  }

  async function deleteLocation(id: string, name: string) {
    if (!confirm(`Delete location "${name}"? This cannot be undone.`)) return;
    setLocationMessage(""); setLocationError("");
    try {
      await api(`/locations/${id}`, { method: "DELETE" });
      setLocationMessage(`Location "${name}" deleted.`);
      if (selectedLocationId === id) setSelectedLocationId("");
      refetchLocations(); refetchTests();
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : "Could not delete location");
    }
  }

  async function createTest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTestMessage(""); setTestError("");
    try {
      await api("/tests", { 
        method: "POST", 
        body: JSON.stringify({ 
          name: testName, 
          workDays: newTestDays,
          instructions: testInstructions
        }) 
      });
      setTestName("");
      setTestInstructions("");
      setNewTestDays(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
      setTestMessage(`Test "${testName}" created.`);
      refetchTests();
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Could not create test");
    }
  }

  const startEditingTest = (test: Test & { instructions?: string | null }) => {
    setEditingTestId(test.id);
    setEditingTestName(test.name);
    setEditingTestInstructions(test.instructions || "");
    setEditingTestDays(test.workDays || ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  };

  async function saveTestEdit(id: string) {
    setTestMessage(""); setTestError("");
    try {
      await api(`/tests/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ 
          name: editingTestName, 
          workDays: editingTestDays,
          instructions: editingTestInstructions
        })
      });
      setEditingTestId(null);
      setTestMessage("Test updated successfully.");
      refetchTests();
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Could not update test");
    }
  }

  async function toggleTestActive(id: string, currentActive: boolean, name: string) {
    setTestMessage(""); setTestError("");
    try {
      await api(`/tests/${id}`, { method: "PATCH", body: JSON.stringify({ active: !currentActive }) });
      setTestMessage(`"${name}" ${currentActive ? "deactivated" : "activated"}.`);
      refetchTests();
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Could not update test");
    }
  }

  async function deleteTest(id: string, name: string) {
    if (!confirm(`Delete test "${name}"? This cannot be undone.`)) return;
    setTestMessage(""); setTestError("");
    try {
      await api(`/tests/${id}`, { method: "DELETE" });
      setTestMessage(`Test "${name}" deleted.`);
      refetchTests();
    } catch (error) {
      setTestError(error instanceof Error ? error.message : "Could not delete test");
    }
  }

  // PRO Name Management handlers
  async function createProName(e: FormEvent) {
    e.preventDefault();
    setProMessage(""); setProError("");
    if (!proNameInput.trim()) return;
    try {
      await api("/pro-names", {
        method: "POST",
        body: JSON.stringify({ name: proNameInput.trim() }),
      });
      setProNameInput("");
      setProMessage("PRO name added successfully!");
      refetchProList();
      queryClient.invalidateQueries({ queryKey: ["pro-names"] });
    } catch (err: any) {
      setProError(err.message || "Failed to add PRO name.");
    }
  }

  async function updateProName(id: string, name: string) {
    setProMessage(""); setProError("");
    if (!name.trim()) return;
    try {
      await api(`/pro-names/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim() }),
      });
      setEditingProId(null);
      setProMessage("PRO name updated successfully!");
      refetchProList();
      queryClient.invalidateQueries({ queryKey: ["pro-names"] });
    } catch (err: any) {
      setProError(err.message || "Failed to update PRO name.");
    }
  }

  async function deleteProName(id: string, name: string) {
    if (!confirm(`Are you sure you want to delete PRO name "${name}"?`)) return;
    setProMessage(""); setProError("");
    try {
      await api(`/pro-names/${id}`, { method: "DELETE" });
      setProMessage("PRO name deleted successfully!");
      refetchProList();
      queryClient.invalidateQueries({ queryKey: ["pro-names"] });
    } catch (err: any) {
      setProError(err.message || "Failed to delete PRO name.");
    }
  }

  // Slot editor actions
  const addSlotRow = () => {
    setEditingSlots([...editingSlots, { label: "", capacity: 5, sortOrder: editingSlots.length + 1, active: true }]);
  };

  const removeSlotRow = (index: number) => {
    setEditingSlots(editingSlots.filter((_, idx) => idx !== index));
  };

  const updateSlotField = (index: number, field: "label" | "capacity" | "active", value: string | number | boolean) => {
    const updated = [...editingSlots];
    if (field === "label") {
      updated[index].label = String(value);
    } else if (field === "capacity") {
      updated[index].capacity = Number(value);
    } else if (field === "active") {
      updated[index].active = Boolean(value);
    }
    setEditingSlots(updated);
  };

  const blockAllSlots = () => {
    setEditingSlots(editingSlots.map(s => ({ ...s, active: false })));
  };

  const unblockAllSlots = () => {
    setEditingSlots(editingSlots.map(s => ({ ...s, active: true })));
  };

  async function saveSlots() {
    setSlotMessage("");
    setSlotError("");
    if (!selectedLocationId) {
      setSlotError("Please select a location first.");
      return;
    }
    if (!selectedSlotTestId) {
      setSlotError("Please select a test type first.");
      return;
    }
    if (editingSlots.some((s) => !s.label.trim())) {
      setSlotError("All slots must have a non-empty label.");
      return;
    }
    // Snapshot the current state we're about to save
    const snapshotSlots = [...editingSlots];
    try {
      await api(`/tests/${selectedSlotTestId}/slots`, {
        method: "PUT",
        body: JSON.stringify({
          locationId: selectedLocationId,
          dayOfWeek: selectedSlotDay,
          slots: snapshotSlots.map((s, idx) => ({ ...s, sortOrder: idx + 1 })),
          workDays: editingLocationWorkDays  // save per-center working days
        })
      });
      setSlotMessage("Slot configuration saved successfully.");
      await refetchTests();
      // Keep user's state — do NOT re-sync from refetched data here.
      // The refetch keeps cache fresh for other parts of UI, but the editor
      // should show exactly what was just saved (including all-blocked / empty).
      setEditingSlots(snapshotSlots.map((s, idx) => ({ ...s, sortOrder: idx + 1 })));
    } catch (error) {
      setSlotError(error instanceof Error ? error.message : "Could not save slot configuration");
    }
  }

  // Sync test when tests list loads or changes
  const activeTests = tests;
  const currentTest = activeTests.find((t) => t.id === selectedSlotTestId);
  const activeLocations = locations.filter((loc) => loc.active);

  async function exportCsv() {
    const params = new URLSearchParams();
    if (csvStartDate) params.set("startDate", csvStartDate);
    if (csvEndDate) params.set("endDate", csvEndDate);
    if (csvLocationId) params.set("locationId", csvLocationId);
    if (csvTestId) params.set("testId", csvTestId);

    const res = await fetch(`${API_URL}/admin/exports/appointments.csv?${params.toString()}`, {
      headers: { Authorization: `Bearer ${getToken()}` }
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const locName = csvLocationId ? locations.find(l => l.id === csvLocationId)?.name.replace(/\s+/g, "_") : "all";
    const testNameStr = csvTestId ? tests.find(t => t.id === csvTestId)?.name.replace(/\s+/g, "_") : "all";
    link.download = `appointments_${locName}_${testNameStr}_${csvStartDate || "start"}_to_${csvEndDate || "end"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Shell>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{isAnalytics ? "Analytics Dashboard" : "Admin Panel"}</h1>
          <p className="text-sm text-slate-500">{isAnalytics ? "Read-access view for reports and appointment analytics." : "Management view for reports, locations, slot configurations, and staff accounts."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">Location:</span>
            <select
              className="input h-9 py-0 px-2 text-xs min-w-[140px]"
              value={csvLocationId}
              onChange={(e) => setCsvLocationId(e.target.value)}
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">Test:</span>
            <select
              className="input h-9 py-0 px-2 text-xs min-w-[140px]"
              value={csvTestId}
              onChange={(e) => setCsvTestId(e.target.value)}
            >
              <option value="">All Tests</option>
              {tests.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">From:</span>
            <input
              type="date"
              className="input h-9 py-0 px-2 text-xs"
              value={csvStartDate}
              onChange={(e) => setCsvStartDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch (err) {} }}
              placeholder="Start Date"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-slate-500 font-medium">To:</span>
            <input
              type="date"
              className="input h-9 py-0 px-2 text-xs"
              value={csvEndDate}
              onChange={(e) => setCsvEndDate(e.target.value)}
              onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch (err) {} }}
              placeholder="End Date"
            />
          </div>
          {(csvStartDate || csvEndDate || csvLocationId || csvTestId) && (
            <button
              className="text-xs text-slate-500 hover:text-red-500 border rounded-md px-2 h-9"
              onClick={() => { setCsvStartDate(""); setCsvEndDate(""); setCsvLocationId(""); setCsvTestId(""); }}
              title="Clear filters"
            >
              ✕ Clear
            </button>
          )}
          <button className="btn bg-gradient-to-r from-medical-600 to-medical-700 shadow-md hover:from-medical-500 hover:to-medical-600 h-9" onClick={exportCsv}>
            Export CSV
          </button>
          {!isAnalytics && (
            <>
              <button
                disabled={emailTestSending}
                className="btn bg-amber-600 hover:bg-amber-700 shadow-md text-xs h-9"
                onClick={triggerTestEmail}
              >
                {emailTestSending ? "Sending Email..." : "✉️ Send Test Email Report"}
              </button>
              <button
                disabled={emailCenterTestSending}
                className="btn bg-violet-600 hover:bg-violet-700 shadow-md text-xs h-9"
                onClick={triggerTestCenterEmail}
              >
                {emailCenterTestSending ? "Sending Email..." : "✉️ Send Test Center-Wise Report"}
              </button>
            </>
          )}
        </div>
      </div>
      {emailTestResult && (
        <div className={`mb-4 p-3 rounded-lg text-xs font-medium border flex items-center justify-between ${emailTestResult.error ? "bg-red-50 border-red-200 text-red-700" : "bg-emerald-50 border-emerald-200 text-emerald-700"}`}>
          <span>{emailTestResult.error ? `Email Error: ${emailTestResult.error}` : `✓ ${emailTestResult.message}`}</span>
          <button className="text-slate-400 hover:text-slate-600 ml-2" onClick={() => setEmailTestResult(null)}>✕</button>
        </div>
      )}

      {/* Stats & Charts Period Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stats &amp; Charts Period</span>
        {(csvStartDate || csvEndDate) ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-medical-50 dark:bg-medical-900/30 border border-medical-200 dark:border-medical-800 text-xs font-semibold text-medical-700 dark:text-medical-400">
            📅 Custom range active: {csvStartDate || "…"} → {csvEndDate || "…"}
            <span className="text-[10px] font-normal text-slate-400 ml-1">(clear header dates to use month picker)</span>
          </span>
        ) : (
          <>
            <input
              type="month"
              className="input h-9 py-0 px-3 text-sm font-medium"
              value={chartMonth}
              max={`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`}
              onChange={(e) => setChartMonth(e.target.value)}
              onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch (_) {} }}
            />
            <button
              className="text-xs text-slate-400 hover:text-medical-600 font-semibold transition-colors"
              onClick={() => {
                const d = new Date();
                setChartMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
              }}
            >
              Reset to current month
            </button>
          </>
        )}
        <span className="ml-auto text-xs text-slate-400 italic">
          {(csvStartDate || csvEndDate)
            ? `${csvStartDate || "start"} → ${csvEndDate || "end"}${csvLocationId ? " · filtered by location" : ""}${csvTestId ? ` · filtered by ${tests.find(t => t.id === csvTestId)?.name || "test"}` : ""}`
            : `${new Date(chartMonth + "-01").toLocaleString("en-IN", { month: "long", year: "numeric" })}${csvLocationId ? " · filtered by location" : ""}${csvTestId ? ` · filtered by ${tests.find(t => t.id === csvTestId)?.name || "test"}` : ""}`
          }
        </span>
      </div>

      {/* KPI Stats — scoped to selected period */}
      {(() => {
        const periodLabel = (csvStartDate || csvEndDate)
          ? `${csvStartDate || "…"} → ${csvEndDate || "…"}`
          : new Date(chartMonth + "-01").toLocaleString("en-IN", { month: "short", year: "numeric" });
        return (
          <section className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data && Object.entries(data.kpis).map(([label, value]) => (
              <div className="card border-l-4 border-l-medical-500 bg-white hover:shadow-md transition-shadow duration-200" key={label}>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label.replace(/([A-Z])/g, " $1")}</p>
                <p className="text-3xl font-bold text-slate-800 dark:text-slate-100 mt-1">{value}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{periodLabel}</p>
              </div>
            ))}
          </section>
        );
      })()}

      {/* Referral Source Chart */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Referral Source Distribution</h2>
            {csvTestId && (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full bg-medical-50 dark:bg-medical-950/40 text-medical-700 dark:text-medical-300 font-semibold border border-medical-200 dark:border-medical-800">
                🧪 Test: {tests.find(t => t.id === csvTestId)?.name}
              </span>
            )}
          </div>
          {(() => {
            const referralData = (data?.byReferral || []).map(x => ({ name: x.referredBy || "Direct / Unknown", count: x._count })).sort((a, b) => b.count - a.count);
            const barW = Math.max(40, 820 / Math.max(referralData.length, 1));
            const chartWidth = Math.max(820, referralData.length * barW);
            return (
              <div className="overflow-x-auto" style={{ width: "100%" }}>
                <div style={{ width: chartWidth, height: 288 }}>
                  <BarChart width={chartWidth} height={288} data={referralData} margin={{ top: 4, right: 8, bottom: 64, left: 8 }}>
                    <defs>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.9}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-40} textAnchor="end" interval={0} />
                    <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} width={36} />
                    <Tooltip contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }} formatter={(v: any) => [v, "Count"]} />
                    <Bar dataKey="count" fill="url(#colorBar)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="card flex flex-col justify-between">
          <div>
            <h2 className="mb-3 font-semibold text-slate-800 dark:text-slate-200">System Activity &amp; Audit Trail</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              All administrative operations, login events, booking changes, and modifications are immutably tracked for safety, compliance, and security.
            </p>
            <div className="rounded-lg border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span>Audit API Endpoint active</span>
              </div>
              <p className="text-xs text-slate-500 leading-normal">
                Logs contain user references, remote IP addresses, HTTP headers, request context, and detailed JSON differences for all field edits.
              </p>
            </div>
          </div>
          <div className="mt-4 border-t pt-4 text-xs text-slate-400 flex items-center justify-between">
            <span>Database Status: Connected</span>
            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">v1.0.4-live</span>
          </div>
        </div>
      </section>

      {/* Appointments by Agent Section */}
      <section className="mb-6 grid gap-6 lg:grid-cols-12">
        <div className="card lg:col-span-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-200">Appointments by Agent</h2>
              <p className="text-xs text-slate-500 mt-0.5">Bookings created by agents on that day/range (excluding cancelled bookings)</p>
            </div>
            <span className="text-xs text-slate-400 font-medium">{(data?.byAgent || []).length} agents</span>
          </div>
          {(() => {
            const agentData = (data?.byAgent || []).slice(0, 40);
            const barW = Math.max(50, 600 / Math.max(agentData.length, 1));
            const chartWidth = Math.max(600, agentData.length * barW);
            const roleColors: Record<string, string> = { ADMIN: "#7c3aed", FRONTDESK: "#0ea5e9", MARKETING: "#f97316", TECHNICIAN: "#10b981" };
            return (
              <div className="overflow-x-auto" style={{ width: "100%" }}>
                <div style={{ width: chartWidth, height: 300 }}>
                  <BarChart width={chartWidth} height={300} data={agentData.map(a => ({ ...a, name: a.agentName }))} margin={{ top: 4, right: 8, bottom: 72, left: 8 }}>
                    <defs>
                      <linearGradient id="colorAgent" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.9}/>
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.85}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} angle={-40} textAnchor="end" interval={0} />
                    <YAxis allowDecimals={false} stroke="#64748b" fontSize={11} width={36} />
                    <Tooltip
                      contentStyle={{ borderRadius: "8px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                      formatter={(v: any, _: any, props: any) => [v, `Bookings (${props?.payload?.role || ""})`]}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={52}>
                      {agentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={roleColors[entry.role] || "#0ea5e9"} />
                      ))}
                    </Bar>
                  </BarChart>
                </div>
              </div>
            );
          })()}
          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t text-xs text-slate-500">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{background:"#7c3aed"}} />Admin</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{background:"#0ea5e9"}} />Frontdesk</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm inline-block" style={{background:"#f97316"}} />Marketing</span>
          </div>
        </div>

        <div className="card lg:col-span-4 flex flex-col justify-between">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">Agent Summary</h2>
            <p className="text-xs text-slate-500 mb-3">Tabular breakdown of bookings created by agents on that day.</p>
            <div className="overflow-y-auto max-h-[300px] border rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase font-medium">
                  <tr>
                    <th className="p-2">Agent Name</th>
                    <th className="p-2">Role</th>
                    <th className="p-2 text-right">Bookings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(data?.byAgent || []).map((agent: any) => (
                    <tr key={agent.agentId} className="hover:bg-slate-50/50">
                      <td className="p-2 font-medium truncate max-w-[120px]" title={agent.agentName}>{agent.agentName}</td>
                      <td className="p-2">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          agent.role === "ADMIN" ? "bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-400" :
                          agent.role === "FRONTDESK" ? "bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-400" :
                          agent.role === "MARKETING" ? "bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-400" :
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400"
                        }`}>
                          {agent.role.slice(0, 5)}
                        </span>
                      </td>
                      <td className="p-2 text-right font-semibold text-slate-700 dark:text-slate-300">{agent.count}</td>
                    </tr>
                  ))}
                  {(data?.byAgent || []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="p-4 text-center text-slate-400 italic">No bookings found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 border-t pt-3 text-[10px] text-slate-400 italic">
            Filters are automatically synced with date/location headers.
          </div>
        </div>
      </section>

      {/* Locations & Staff Account Management — Admin only */}
      {!isAnalytics && (<>
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Location Management */}
        <div className="card flex flex-col space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Location Centers</h2>
            <p className="text-sm text-slate-500">Configure regional diagnostics clinics and toggle availability.</p>
          </div>
          <form className="flex flex-col gap-2" onSubmit={createLocation}>
            <input className="input" name="name" value={locationName} onChange={e => setLocationName(e.target.value)} placeholder="Center location name" required />
            <div className="flex gap-2">
              <input className="input flex-1" value={locationMapLink} onChange={e => setLocationMapLink(e.target.value)} placeholder="Google Maps Link URL (optional)" />
              <div className="flex items-center gap-2 flex-1">
                {locationQrCodeUrl && <img src={locationQrCodeUrl} alt="QR" className="w-10 h-10 object-contain rounded border border-medical-200" />}
                <input className="input w-full" type="file" accept="image/*" title="Upload QR Code Image" onChange={async e => {
                  if (e.target.files?.[0]) {
                    try { const url = await uploadFile(e.target.files[0]); setLocationQrCodeUrl(url); } catch (err) { alert("Upload failed"); }
                  }
                }} />
              </div>
              <input className="input flex-1" value={locationAddress} onChange={e => setLocationAddress(e.target.value)} placeholder="Full Address (optional)" />
            </div>
            <button className="btn bg-medical-600 hover:bg-medical-700 whitespace-nowrap">Add Location</button>
          </form>
          {locationMessage && <p className="rounded-md bg-green-50 p-2 text-xs text-green-700 dark:bg-green-950/20 dark:text-green-400">{locationMessage}</p>}
          {locationError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700 dark:bg-red-950/20 dark:text-red-400">{locationError}</p>}
          
          <div className="overflow-y-auto max-h-60 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-3">Location Name</th>
                  <th className="p-3 text-center">Show Contacts to Techs</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {locations.map((loc: any) => (
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30" key={loc.id}>
                    {editingLocationId === loc.id ? (
                      <td className="p-3" colSpan={4}>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              className="input flex-1 h-9"
                              value={editingLocationName}
                              onChange={(e) => setEditingLocationName(e.target.value)}
                              placeholder="Location name"
                              required
                            />
                            <button className="btn bg-green-600 hover:bg-green-700 h-9 px-3 text-xs" onClick={() => saveLocationEdit(loc.id)}>
                              Save
                            </button>
                            <button className="btn bg-slate-200 text-slate-700 hover:bg-slate-300 h-9 px-3 text-xs dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => setEditingLocationId(null)}>
                              Cancel
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              className="input flex-1 h-9 text-xs"
                              value={editingLocationMapLink}
                              onChange={(e) => setEditingLocationMapLink(e.target.value)}
                              placeholder="Google Maps Link URL (optional)"
                            />
                            <div className="flex gap-2 items-center">
                              {editingLocationQrCodeUrl && <img src={editingLocationQrCodeUrl} alt="QR" className="w-10 h-10 object-contain rounded border" />}
                              <input
                                className="input w-full"
                                type="file" accept="image/*" title="Upload new QR Code Image"
                                onChange={async (e) => {
                                  if (e.target.files?.[0]) {
                                    try { const url = await uploadFile(e.target.files[0]); setEditingLocationQrCodeUrl(url); } catch (err) { alert("Upload failed"); }
                                  }
                                }}
                              />
                            </div>
                            <textarea
                              className="input w-full min-h-[60px]"
                              placeholder="Full Address (optional)"
                              value={editingLocationAddress}
                              onChange={(e) => setEditingLocationAddress(e.target.value)}
                            />
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                          {loc.name}
                          {(loc.mapLink || loc.qrCodeUrl) && (
                            <div className="flex gap-2 mt-1 text-[10px]">
                              {loc.mapLink && <a href={loc.mapLink} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">🗺️ Map</a>}
                              {loc.qrCodeUrl && <a href={loc.qrCodeUrl} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">📱 QR</a>}
                            </div>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <input
                            type="checkbox"
                            checked={loc.showContactToTechnicians || false}
                            onChange={() => toggleLocationContactVisible(loc.id, loc.showContactToTechnicians)}
                            className="accent-medical-650 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${loc.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-650"}`}>
                            {loc.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-3">
                          <button
                            className="text-xs text-slate-600 hover:text-slate-700 font-semibold"
                            onClick={() => startEditingLocation(loc)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-medical-600 hover:text-medical-700 font-semibold"
                            onClick={() => toggleLocationActive(loc.id, loc.active)}
                          >
                            {loc.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="text-xs text-red-500 hover:text-red-700 font-semibold"
                            onClick={() => deleteLocation(loc.id, loc.name)}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr><td className="p-3 text-slate-400 text-center" colSpan={4}>No locations registered yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Accounts Management */}
        <div className="card flex flex-col space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Frontdesk Staff</h2>
            <p className="text-sm text-slate-500">Create Frontdesk employee login credentials.</p>
          </div>
          <form className="grid grid-cols-1 sm:grid-cols-3 gap-2" onSubmit={createFrontdeskUser}>
            <input className="input" name="name" placeholder="Full name" required />
            <input className="input" name="email" type="email" placeholder="Email" required />
            <input className="input" name="password" type="password" placeholder="Password (min 8)" minLength={8} required />
            <button className="btn bg-medical-600 hover:bg-medical-700 sm:col-span-3">Create Frontdesk Account</button>
          </form>
          {userMessage && <p className="rounded-md bg-green-50 p-2 text-xs text-green-700">{userMessage}</p>}
          {userError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{userError}</p>}
          
          <div className="overflow-y-auto max-h-60 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-3">Staff Member</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.filter(u => ["ADMIN", "FRONTDESK", "ANALYTICS"].includes(u.role)).map((user) => (
                  <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30" key={user.id}>
                    <td className="p-3 font-medium text-slate-700 dark:text-slate-300">
                      <div>{user.name}</div>
                      <span className={`inline-block text-[10px] uppercase font-bold tracking-wider ${user.active ? "text-emerald-600" : "text-rose-500"}`}>
                        {user.active ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-400 text-xs">{user.email}</td>
                    <td className="p-3 font-mono text-xs">{user.role}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        className="text-xs text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-350"
                        onClick={() => updateUser(user.id, { active: !user.active })}
                      >
                        {user.active ? "Disable" : "Enable"}
                      </button>
                      <button
                        className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                        onClick={() => startEditUser(user)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-xs text-medical-600 hover:text-medical-700 font-semibold"
                        onClick={() => resetPassword(user.id)}
                      >
                        Reset
                      </button>
                      <button
                        className="text-xs text-red-500 hover:text-red-700 font-semibold ml-2"
                        onClick={() => deleteUser(user.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {users.filter(u => ["ADMIN", "FRONTDESK", "ANALYTICS"].includes(u.role)).length === 0 && (
                  <tr>
                    <td className="p-3 text-slate-400 text-center" colSpan={4}>No users found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Technician Account + Test Management + Marketing */}
      <section className="mb-6 grid gap-6 lg:grid-cols-2">
        {/* Technician Accounts */}
        <div className="card flex flex-col space-y-4 border-l-4 border-l-purple-400">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="text-base">🧪</span> Technician / Lab Team Access
            </h2>
            <p className="text-sm text-slate-500">Create read-only accounts for the test-performing team. They see today&apos;s schedule only.</p>
          </div>
          <form className="space-y-3" onSubmit={createTechnician}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="input" name="techName" placeholder="Full name" required />
              <input className="input" name="techEmail" type="email" placeholder="Email" required />
              <input className="input" name="techPassword" type="password" placeholder="Password (min 8)" minLength={8} required />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allot Center (Location)</label>
                <select className="select w-full" name="techLocationId">
                  <option value="">No Allotted Center (Sees All)</option>
                  {locations.filter(l => l.active).map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allot Test Types</label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto bg-white dark:bg-slate-900 grid grid-cols-2 gap-2">
                  {tests.map(test => {
                    const checked = selectedTechTestTypeIds.includes(test.id);
                    return (
                      <label key={test.id} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTechTestTypeIds([...selectedTechTestTypeIds, test.id]);
                            } else {
                              setSelectedTechTestTypeIds(selectedTechTestTypeIds.filter(id => id !== test.id));
                            }
                          }}
                        />
                        {test.name}
                      </label>
                    );
                  })}
                  {tests.length === 0 && <span className="text-slate-400 text-xs col-span-2">No test types configured</span>}
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                id="techCanBook"
                name="techCanBook"
                className="accent-purple-600 h-4 w-4 cursor-pointer"
              />
              <label htmlFor="techCanBook" className="text-xs font-semibold text-slate-705 dark:text-slate-300 cursor-pointer select-none">
                Give permission to create appointments (Allow Booking)
              </label>
            </div>

            <button className="btn bg-purple-600 hover:bg-purple-700 w-full">Create Technician Account</button>
          </form>
          {techMessage && <p className="rounded-md bg-purple-50 p-2 text-xs text-purple-700">{techMessage}</p>}
          {techError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{techError}</p>}
          <div className="rounded-md bg-purple-50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900 p-3 text-xs text-purple-700 dark:text-purple-300">
            <strong>Technician login:</strong> They will be redirected to the <code>/schedule</code> page after login — a clean read-only view grouped by time slot. No booking or editing access unless granted "Allow Booking".
          </div>
          
          <div className="overflow-y-auto max-h-44 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Center</th>
                  <th className="p-2">Test Types</th>
                  <th className="p-2 text-center">Allow Booking</th>
                  <th className="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(() => {
                  const filtered = users.filter(u => u.role === "TECHNICIAN");
                  return (
                    <>
                      {filtered.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium">{user.name}</td>
                          <td className="p-2 text-xs text-slate-500">{user.email}</td>
                          <td className="p-2 text-xs font-semibold text-medical-600">{user.location?.name || "All Centers"}</td>
                          <td className="p-2 text-xs">
                            {user.testTypes && user.testTypes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.testTypes.map(t => (
                                  <span key={t.id} className="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-medium text-[10px]">
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">All Tests</span>
                            )}
                          </td>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={user.canCreateAppointments || false}
                              onChange={(e) => updateUser(user.id, { canCreateAppointments: e.target.checked })}
                              className="accent-purple-650 h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="p-2 text-right space-x-2">
                            <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => updateUser(user.id, { active: !user.active })}>
                              {user.active ? "Disable" : "Enable"}
                            </button>
                            <button className="text-xs text-blue-600 hover:text-blue-700 font-semibold" onClick={() => startEditUser(user)}>
                              Edit
                            </button>
                            <button className="text-xs text-purple-600 hover:text-purple-700 font-semibold" onClick={() => resetPassword(user.id)}>
                              Reset
                            </button>
                            <button className="text-xs text-red-500 hover:text-red-700 font-semibold" onClick={() => deleteUser(user.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td className="p-3 text-slate-400 text-center text-xs" colSpan={6}>No technician accounts found.</td></tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Machine Operator Accounts */}
        <div className="card flex flex-col space-y-4 border-l-4 border-l-amber-500">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="text-base">⚙️</span> Machine Operator Access
            </h2>
            <p className="text-sm text-slate-500">Create accounts for machine operators. They see today&apos;s arrived appointments and update scan statuses.</p>
          </div>
          <form className="space-y-3" onSubmit={createOperator}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <input className="input" name="opName" placeholder="Full name" required />
              <input className="input" name="opEmail" type="email" placeholder="Email" required />
              <input className="input" name="opPassword" type="password" placeholder="Password (min 8)" minLength={8} required />
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allot Center (Location)</label>
                <select className="select w-full" name="opLocationId">
                  <option value="">No Allotted Center (Sees All)</option>
                  {locations.filter(l => l.active).map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allot Test Types</label>
                <div className="border rounded-md p-2 max-h-32 overflow-y-auto bg-white dark:bg-slate-900 grid grid-cols-2 gap-2">
                  {tests.map(test => {
                    const checked = selectedOpTestTypeIds.includes(test.id);
                    return (
                      <label key={test.id} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedOpTestTypeIds([...selectedOpTestTypeIds, test.id]);
                            } else {
                              setSelectedOpTestTypeIds(selectedOpTestTypeIds.filter(id => id !== test.id));
                            }
                          }}
                        />
                        {test.name}
                      </label>
                    );
                  })}
                  {tests.length === 0 && <span className="text-slate-400 text-xs col-span-2">No test types configured</span>}
                </div>
              </div>
            </div>

            <button className="btn bg-amber-600 hover:bg-amber-700 w-full">Create Machine Operator Account</button>
          </form>
          {opMessage && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-700">{opMessage}</p>}
          {opError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{opError}</p>}
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900 p-3 text-xs text-amber-700 dark:text-amber-300">
            <strong>Operator login:</strong> Operators only see <strong>today&apos;s arrived appointments</strong> for their assigned location &amp; test. Allowed actions: Scan Started, Scan Done, Report Delivered.
          </div>
          
          <div className="overflow-y-auto max-h-44 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2">Center</th>
                  <th className="p-2">Test Types</th>
                  <th className="p-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(() => {
                  const filtered = users.filter(u => u.role === "OPERATOR");
                  return (
                    <>
                      {filtered.map(user => (
                        <tr key={user.id} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium">{user.name}</td>
                          <td className="p-2 text-xs text-slate-500">{user.email}</td>
                          <td className="p-2 text-xs font-semibold text-medical-600">{user.location?.name || "All Centers"}</td>
                          <td className="p-2 text-xs">
                            {user.testTypes && user.testTypes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {user.testTypes.map(t => (
                                  <span key={t.id} className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-medium text-[10px]">
                                    {t.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">All Tests</span>
                            )}
                          </td>
                          <td className="p-2 text-right space-x-2">
                            <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => updateUser(user.id, { active: !user.active })}>
                              {user.active ? "Disable" : "Enable"}
                            </button>
                            <button className="text-xs text-blue-600 hover:text-blue-700 font-semibold" onClick={() => startEditUser(user)}>
                              Edit
                            </button>
                            <button className="text-xs text-amber-600 hover:text-amber-700 font-semibold" onClick={() => resetPassword(user.id)}>
                              Reset
                            </button>
                            <button className="text-xs text-red-500 hover:text-red-700 font-semibold" onClick={() => deleteUser(user.id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr><td className="p-3 text-slate-400 text-center text-xs" colSpan={5}>No machine operator accounts found.</td></tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* Marketing Agent Accounts */}
        <div className="card flex flex-col space-y-4 border-l-4 border-l-orange-400">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <span className="text-base">📱</span> Marketing Agent Access
            </h2>
            <p className="text-sm text-slate-500">Create mobile app login credentials for field marketing agents.</p>
          </div>
          <form className="grid grid-cols-1 sm:grid-cols-3 gap-2" onSubmit={createMarketing}>
            <input className="input" name="mktName" placeholder="Full name" required />
            <input className="input" name="mktEmail" type="email" placeholder="Email" required />
            <input className="input" name="mktPassword" type="password" placeholder="Password (min 8)" minLength={8} required />
            <button className="btn bg-orange-500 hover:bg-orange-600 sm:col-span-3">Create Marketing Agent Account</button>
          </form>
          {mktMessage && <p className="rounded-md bg-orange-50 p-2 text-xs text-orange-700">{mktMessage}</p>}
          {mktError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{mktError}</p>}
          <div className="rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-100 dark:border-orange-900 p-3 text-xs text-orange-700 dark:text-orange-300">
            <strong>Marketing agent login:</strong> Agents use the <strong>mobile app</strong> with these credentials. They can create bookings and view only their own leads. They cannot see other agents&apos; data.
          </div>
          <div className="overflow-y-auto max-h-44 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2 text-center">This Month</th>
                  <th className="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.filter(u => u.role === "MARKETING").map(u => {
                  const agentStats = data?.byMarketing?.find(m => m.agentId === u.id);
                  return (
                    <tr key={u.id} className="hover:bg-orange-50/30 dark:hover:bg-orange-900/10">
                      <td className="p-2 font-medium">{u.name}</td>
                      <td className="p-2 text-xs text-slate-500">{u.email}</td>
                      <td className="p-2 text-center font-bold text-orange-600">{agentStats?.monthly ?? 0}</td>
                      <td className="p-2 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => updateUser(u.id, { active: !u.active })}>
                            {u.active ? "Disable" : "Enable"}
                          </button>
                          <button className="text-xs text-medical-600 hover:text-medical-700 font-semibold" onClick={() => resetPassword(u.id)}>
                            Reset Pwd
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.filter(u => u.role === "MARKETING").length === 0 && (
                  <tr><td className="p-3 text-slate-400 text-center text-xs" colSpan={4}>No marketing agents yet. Create one above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
              {/* Test Management */}
        <div className="card flex flex-col space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Test Type Management</h2>
            <p className="text-sm text-slate-500">Add or remove diagnostic test types available for booking.</p>
          </div>
          <form className="flex flex-col gap-2" onSubmit={createTest}>
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={testName}
                onChange={(e) => setTestName(e.target.value)}
                placeholder="e.g. MRI Brain, CT Chest, X-Ray"
                required
              />
              <button className="btn bg-medical-600 hover:bg-medical-700 whitespace-nowrap">Add Test</button>
            </div>
            <textarea
              className="input w-full min-h-[80px]"
              value={testInstructions}
              onChange={(e) => setTestInstructions(e.target.value)}
              placeholder="Test instructions to be sent on WhatsApp (optional)"
            />
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Working Days</label>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {DAYS_OF_WEEK.map(day => (
                  <label key={day} className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-350 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newTestDays.includes(day)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setNewTestDays([...newTestDays, day]);
                        } else {
                          setNewTestDays(newTestDays.filter(d => d !== day));
                        }
                      }}
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>
          </form>
          {testMessage && <p className="rounded-md bg-green-50 p-2 text-xs text-green-700">{testMessage}</p>}
          {testError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{testError}</p>}
          <div className="overflow-y-auto max-h-60 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-3">Test Name</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tests.map((test) => (
                  <tr key={test.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    {editingTestId === test.id ? (
                      <td className="p-3" colSpan={3}>
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              className="input flex-1 h-9"
                              value={editingTestName}
                              onChange={(e) => setEditingTestName(e.target.value)}
                              required
                            />
                            <button className="btn bg-green-600 hover:bg-green-700 h-9 px-3 text-xs" onClick={() => saveTestEdit(test.id)}>
                              Save
                            </button>
                            <button className="btn bg-slate-200 text-slate-700 hover:bg-slate-300 h-9 px-3 text-xs dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700" onClick={() => setEditingTestId(null)}>
                              Cancel
                            </button>
                          </div>
                          <textarea
                            className="input w-full min-h-[60px] text-xs"
                            value={editingTestInstructions}
                            onChange={(e) => setEditingTestInstructions(e.target.value)}
                            placeholder="Test instructions (optional)"
                          />
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Working Days</label>
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {DAYS_OF_WEEK.map(day => (
                                <label key={day} className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-350 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={editingTestDays.includes(day)}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setEditingTestDays([...editingTestDays, day]);
                                      } else {
                                        setEditingTestDays(editingTestDays.filter(d => d !== day));
                                      }
                                    }}
                                  />
                                  {day}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="p-3 font-medium text-slate-700 dark:text-slate-350">
                          <div>{test.name}</div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            Days: {test.workDays && test.workDays.length > 0 ? test.workDays.join(", ") : "None"}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${test.active ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-550"}`}>
                            {test.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-3">
                          <button
                            className="text-xs text-slate-600 hover:text-slate-700 font-semibold"
                            onClick={() => startEditingTest(test)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-xs text-medical-600 hover:text-medical-700 font-semibold"
                            onClick={() => toggleTestActive(test.id, test.active, test.name)}
                          >
                            {test.active ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            className="text-xs text-red-500 hover:text-red-700 font-semibold"
                            onClick={() => deleteTest(test.id, test.name)}
                          >
                            Delete
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {tests.length === 0 && (
                  <tr><td className="p-3 text-slate-400 text-center" colSpan={3}>No test types configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* PRO List Name Management (Admin Only) */}
        {!isAnalytics && (
          <div className="card flex flex-col space-y-4 border-l-4 border-l-teal-500">
            <div>
              <h2 className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <span className="text-base">👤</span> PRO List Name Management
              </h2>
              <p className="text-sm text-slate-500">Add, edit, or remove master PRO referral names available in dropdown lists.</p>
            </div>
            <form className="flex gap-2" onSubmit={createProName}>
              <input
                className="input flex-1"
                value={proNameInput}
                onChange={(e) => setProNameInput(e.target.value)}
                placeholder="Enter new PRO name..."
                required
              />
              <button className="btn bg-teal-600 hover:bg-teal-700 whitespace-nowrap">Add PRO Name</button>
            </form>
            {/* Search filter for PRO Names */}
            <div className="flex gap-2">
              <input
                className="input flex-1 text-xs"
                value={proSearchQuery}
                onChange={(e) => setProSearchQuery(e.target.value)}
                placeholder="🔍 Search PRO names from master list..."
              />
              {proSearchQuery && (
                <button
                  type="button"
                  className="btn bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs px-3"
                  onClick={() => setProSearchQuery("")}
                >
                  Clear
                </button>
              )}
            </div>

            {proMessage && <p className="rounded-md bg-teal-50 dark:bg-teal-950/20 border border-teal-200 p-2 text-xs text-teal-700 dark:text-teal-300">{proMessage}</p>}
            {proError && <p className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 p-2 text-xs text-red-700 dark:text-red-300">{proError}</p>}
            
            <div className="overflow-y-auto max-h-72 border rounded-lg">
              <table className="w-full text-left text-sm">
                <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                  <tr>
                    <th className="p-3">PRO Name</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {proList.filter(pro => pro.name.toLowerCase().includes(proSearchQuery.toLowerCase())).map((pro) => (
                    <tr key={pro.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="p-3 font-medium">
                        {editingProId === pro.id ? (
                          <input
                            className="input h-8 py-1 text-xs w-full max-w-xs"
                            value={editingProName}
                            onChange={(e) => setEditingProName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") updateProName(pro.id, editingProName);
                              if (e.key === "Escape") setEditingProId(null);
                            }}
                            autoFocus
                          />
                        ) : (
                          pro.name
                        )}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingProId === pro.id ? (
                            <>
                              <button
                                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold"
                                onClick={() => updateProName(pro.id, editingProName)}
                              >
                                Save
                              </button>
                              <button
                                className="text-xs text-slate-400 hover:text-slate-600"
                                onClick={() => setEditingProId(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                                onClick={() => {
                                  setEditingProId(pro.id);
                                  setEditingProName(pro.name);
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="text-xs text-red-500 hover:text-red-700 font-semibold"
                                onClick={() => deleteProName(pro.id, pro.name)}
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {proList.filter(pro => pro.name.toLowerCase().includes(proSearchQuery.toLowerCase())).length === 0 && (
                    <tr><td className="p-3 text-slate-400 text-center text-xs" colSpan={2}>No matching PRO names found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </section>

      {/* Slots configuration by location */}
      <section className="card mb-6">
        <div className="mb-4">
          <h2 className="font-semibold text-slate-800 dark:text-slate-200">Slot Configuration Editor</h2>
          <p className="text-sm text-slate-500">Configure available timings and participant capacities dynamically per test type and location.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-[250px_1fr]">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Select Location</label>
              <select
                className="input w-full"
                value={selectedLocationId}
                onChange={(e) => {
                  setSelectedLocationId(e.target.value);
                  setSelectedSlotTestId("");
                  setEditingSlots([]);
                  setSlotMessage("");
                  setSlotError("");
                }}
              >
                <option value="">-- Choose Location --</option>
                {activeLocations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Select Test Type</label>
              <select
                className="input w-full"
                value={selectedSlotTestId}
                onChange={(e) => handleSelectTest(e.target.value)}
                disabled={!selectedLocationId}
              >
                <option value="">-- Choose Test Type --</option>
                {tests.map((test) => (
                  <option key={test.id} value={test.id}>{test.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">Select Day (For Custom Slots)</label>
              <select
                className="input w-full"
                value={selectedSlotDay}
                onChange={(e) => handleSelectSlotDay(e.target.value)}
                disabled={!selectedSlotTestId}
              >
                <option value="All">All Days (Default)</option>
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>

            {!selectedLocationId && (
              <p className="text-xs text-slate-400 italic">Please select a location first to load tests and edit slot values.</p>
            )}
          </div>

          <div className="rounded-lg border bg-slate-50/50 p-4 dark:bg-slate-900/20">
            {selectedLocationId && selectedSlotTestId ? (
              <div className="space-y-4">
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <h3 className="font-medium text-slate-700 dark:text-slate-350">
                    Timings for <span className="text-medical-600 font-semibold">{tests.find((t) => t.id === selectedSlotTestId)?.name}</span> on <span className="text-indigo-600 font-semibold">{selectedSlotDay === "All" ? "All Days (Default)" : `${selectedSlotDay}s`}</span> at <span className="font-semibold text-slate-800 dark:text-slate-100">{locations.find((l) => l.id === selectedLocationId)?.name}</span>
                  </h3>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button className="btn h-8 px-2.5 bg-red-100 text-red-700 hover:bg-red-200 border border-red-350 dark:bg-red-950/40 dark:text-red-400 text-xs font-semibold" onClick={blockAllSlots}>
                      🚫 Block All
                    </button>
                    <button className="btn h-8 px-2.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border border-emerald-355 dark:bg-emerald-950/40 dark:text-emerald-400 text-xs font-semibold" onClick={unblockAllSlots}>
                      ✅ Unblock All
                    </button>
                    <button className="btn h-8 px-3 bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 text-xs font-semibold" onClick={addSlotRow}>
                      + Add Timing Slot
                    </button>
                  </div>
                </div>

                <div className="space-y-2 max-h-[350px] overflow-y-auto pr-2">
                  {editingSlots.map((slot, index) => (
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 bg-white p-2 rounded-md border dark:bg-slate-900" key={index}>
                      <span className="text-xs font-mono text-slate-400 w-6">#{index + 1}</span>
                      <input
                        className={`input flex-1 h-9 ${slot.active === false ? "line-through text-red-500 border-red-200 bg-red-50/20" : ""}`}
                        placeholder="e.g. 09:00 AM - 10:00 AM"
                        value={slot.label}
                        onChange={(e) => updateSlotField(index, "label", e.target.value)}
                        required
                      />
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-500 whitespace-nowrap">Capacity:</label>
                        <input
                          className="input w-20 h-9"
                          type="number"
                          min={1}
                          max={100}
                          value={slot.capacity}
                          onChange={(e) => updateSlotField(index, "capacity", Number(e.target.value))}
                          onWheel={(e) => e.currentTarget.blur()}
                          required
                        />
                      </div>
                      <div className="flex items-center gap-1.5 ml-1">
                        <input
                          type="checkbox"
                          id={`slot-active-${index}`}
                          checked={slot.active !== false}
                          onChange={(e) => updateSlotField(index, "active", e.target.checked)}
                          className="accent-medical-600 h-4 w-4 cursor-pointer"
                        />
                        <label htmlFor={`slot-active-${index}`} className="text-xs text-slate-600 dark:text-slate-400 select-none cursor-pointer whitespace-nowrap min-w-[50px]">
                          {slot.active === false ? <span className="text-red-500 font-semibold">Blocked</span> : <span>Active</span>}
                        </label>
                      </div>
                      <button
                        className="text-xs text-red-500 hover:text-red-700 px-2 py-1 ml-auto sm:ml-0"
                        onClick={() => removeSlotRow(index)}
                      >
                        Delete
                      </button>
                    </div>
                  ))}

                  {editingSlots.length === 0 && (
                    <div className="p-8 text-center text-slate-400 text-sm border-2 border-dashed rounded-lg bg-white dark:bg-slate-900/50">
                      No timing slots configured. Click "Add Timing Slot" to create one.
                    </div>
                  )}
                </div>

                {/* Per-center Working Days */}
                <div className="rounded-lg border border-blue-100 bg-blue-50/60 dark:bg-blue-950/20 dark:border-blue-900 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-300">Working Days at This Center</span>
                    <span className="text-[10px] text-blue-500 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded font-medium">Per-Center Override</span>
                  </div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
                    Select which days this test is available <strong>at this specific center</strong>. This overrides the global test schedule for this location only.
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <label key={day} className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          className="accent-blue-600"
                          checked={editingLocationWorkDays.includes(day)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditingLocationWorkDays([...editingLocationWorkDays, day]);
                            } else {
                              setEditingLocationWorkDays(editingLocationWorkDays.filter((d) => d !== day));
                            }
                          }}
                        />
                        <span className={editingLocationWorkDays.includes(day) ? "font-semibold text-blue-700 dark:text-blue-300" : "text-slate-500"}>
                          {day.slice(0, 3)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <button className="btn bg-medical-600 hover:bg-medical-700 px-6 shadow" onClick={saveSlots}>
                    Save Slot Configuration
                  </button>
                  {slotMessage && <p className="text-xs text-green-600 font-medium">{slotMessage}</p>}
                  {slotError && <p className="text-xs text-red-650 font-medium">{slotError}</p>}
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center p-6">
                <p className="text-slate-400 text-sm">Select a center and test type on the left to view and edit individual slots.</p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Grid Overview of Slots by Location */}
      <section className="card">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Current Slot Overview</h2>
            <p className="text-sm text-slate-500">Live config snapshot of available slots for patients.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Viewing center:</span>
            <select
              className="input h-8 py-0 px-2"
              value={selectedLocationId}
              onChange={(e) => {
                setSelectedLocationId(e.target.value);
                setSelectedSlotTestId("");
                setEditingSlots([]);
              }}
            >
              {activeLocations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {tests.map((test) => (
            <div className="p-3 border rounded-lg bg-slate-50/20 dark:bg-slate-800/20" key={test.id}>
              <h3 className="mb-2 font-medium text-slate-700 dark:text-slate-300 border-b pb-1 flex justify-between">
                <span>{test.name}</span>
                <span className="text-xs text-slate-400 font-normal">{test.slots.length} slots</span>
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(() => {
                  const sortedSlots = [...test.slots].sort((a, b) => {
                    const dayA = a.dayOfWeek ?? "All";
                    const dayB = b.dayOfWeek ?? "All";
                    if (dayA === "All" && dayB !== "All") return -1;
                    if (dayA !== "All" && dayB === "All") return 1;
                    return dayA.localeCompare(dayB) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                  });
                  return (
                    <>
                      {sortedSlots.map((slot, sIdx) => (
                        <div key={`${slot.label}-${slot.dayOfWeek}-${sIdx}`} className={`text-xs flex justify-between items-center p-2 rounded shadow-xs ${slot.active === false ? "bg-red-50/50 dark:bg-red-950/10 border border-red-100/50" : "bg-white dark:bg-slate-900"}`}>
                          <div className="flex flex-col gap-0.5">
                            <span className={`font-medium ${slot.active === false ? "line-through text-red-500" : "text-slate-600 dark:text-slate-400"}`}>{slot.label}</span>
                            <span className="text-[10px] text-slate-400 font-medium">{slot.dayOfWeek ?? "All Days"}</span>
                          </div>
                          {slot.active === false ? (
                            <span className="text-[10px] text-red-650 bg-red-100 dark:bg-red-900/40 font-bold px-1.5 py-0.5 rounded uppercase">Blocked</span>
                          ) : (
                            <span className="text-slate-500 font-semibold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">Cap: {slot.capacity}</span>
                          )}
                        </div>
                      ))}
                    </>
                  );
                })()}
                {test.slots.length === 0 && (
                  <p className="text-xs text-slate-450 italic py-2">No slots configured.</p>
                )}
              </div>
            </div>
          ))}
          {tests.length === 0 && (
            <p className="text-sm text-slate-400 col-span-3 text-center py-6">No test types configured or active.</p>
          )}
        </div>
      </section>

      {/* Analytics Account Management — within admin-only section */}
      <section className="mb-6">
        <div className="card flex flex-col space-y-4">
          <div>
            <h2 className="font-semibold text-slate-800 dark:text-slate-200">Analytics Accounts</h2>
            <p className="text-sm text-slate-500">Create read-only analytics accounts that can view appointments and charts but cannot manage locations, slots, or users. Revenue totals are hidden.</p>
          </div>
          <form className="grid grid-cols-1 sm:grid-cols-3 gap-2" onSubmit={createAnalyticsUser}>
            <input className="input" name="analyticsName" placeholder="Full name" required />
            <input className="input" name="analyticsEmail" type="email" placeholder="Email" required />
            <input className="input" name="analyticsPassword" type="password" placeholder="Password (min 8)" minLength={8} required />
            <button className="btn bg-indigo-600 hover:bg-indigo-700 sm:col-span-3">Create Analytics Account</button>
          </form>
          {userMessage && <p className="rounded-md bg-green-50 p-2 text-xs text-green-700">{userMessage}</p>}
          {userError && <p className="rounded-md bg-red-50 p-2 text-xs text-red-700">{userError}</p>}
          <div className="rounded-md bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900 p-3 text-xs text-indigo-700 dark:text-indigo-300">
            <strong>Analytics login:</strong> They can view all appointments, charts, and filter data. They cannot see total revenue KPIs or manage any system settings.
          </div>
          <div className="overflow-y-auto max-h-44 border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase font-medium">
                <tr>
                  <th className="p-2">Name</th>
                  <th className="p-2">Email</th>
                  <th className="p-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.filter(u => u.role === "ANALYTICS").map(u => (
                  <tr key={u.id} className="hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10">
                    <td className="p-2 font-medium">{u.name}</td>
                    <td className="p-2 text-xs text-slate-500">{u.email}</td>
                    <td className="p-2 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => updateUser(u.id, { active: !u.active })}>
                          {u.active ? "Disable" : "Enable"}
                        </button>
                        <button className="text-xs text-medical-600 hover:text-medical-700 font-semibold" onClick={() => resetPassword(u.id)}>Reset Pwd</button>
                        <button className="text-xs text-red-500 hover:text-red-700 font-semibold" onClick={() => deleteUser(u.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {users.filter(u => u.role === "ANALYTICS").length === 0 && (
                  <tr><td className="p-3 text-slate-400 text-center text-xs" colSpan={3}>No analytics accounts yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md border dark:border-slate-800 overflow-hidden">
            <div className="bg-gradient-to-r from-medical-600 to-medical-700 text-white px-6 py-4 flex items-center justify-between">
              <h3 className="font-bold text-base">Edit {editingUser.role === "TECHNICIAN" ? "Technician" : editingUser.role === "OPERATOR" ? "Operator" : "User"} Details</h3>
              <button onClick={() => setEditingUser(null)} className="text-white hover:text-slate-200">✕</button>
            </div>
            <form onSubmit={handleEditUserSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Full Name</label>
                <input
                  className="input w-full"
                  value={editUserName}
                  onChange={e => setEditUserName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Email</label>
                <input
                  className="input w-full bg-slate-50 dark:bg-slate-950 text-slate-500"
                  type="email"
                  value={editUserEmail}
                  disabled
                  required
                />
              </div>
              
              {["TECHNICIAN", "OPERATOR"].includes(editingUser.role) && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allotted Center (Location)</label>
                    <select
                      className="select w-full"
                      value={editUserLocationId}
                      onChange={e => setEditUserLocationId(e.target.value)}
                    >
                      <option value="">No Allotted Center (Sees All)</option>
                      {locations.filter(l => l.active).map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allotted Test Types</label>
                    <div className="border rounded-md p-3 max-h-36 overflow-y-auto bg-slate-50 dark:bg-slate-950 grid grid-cols-2 gap-2">
                      {tests.map(test => {
                        const checked = editUserTestTypeIds.includes(test.id);
                        return (
                          <label key={test.id} className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setEditUserTestTypeIds([...editUserTestTypeIds, test.id]);
                                } else {
                                  setEditUserTestTypeIds(editUserTestTypeIds.filter(id => id !== test.id));
                                }
                              }}
                            />
                            {test.name}
                          </label>
                        );
                      })}
                      {tests.length === 0 && <span className="text-slate-400 text-xs col-span-2">No test types configured</span>}
                    </div>
                  </div>
                </>
              )}

              {editingUser.role === "TECHNICIAN" && (
                <div className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    id="editTechCanBook"
                    checked={editUserCanBook}
                    onChange={e => setEditUserCanBook(e.target.checked)}
                    className="accent-purple-600 h-4 w-4 cursor-pointer"
                  />
                  <label htmlFor="editTechCanBook" className="text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                    Give permission to create appointments (Allow Booking)
                  </label>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border rounded-md text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-medical-600 hover:bg-medical-700 text-white rounded-md text-sm font-semibold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      </>)}
    </Shell>
  );
}
