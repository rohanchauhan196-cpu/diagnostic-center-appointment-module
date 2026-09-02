"use client";

import { useState, useEffect } from "react";
import { X, Plus, Edit2, Trash2, AlertTriangle, Bell } from "lucide-react";
import { api } from "../lib/api";

interface Notice {
  id: string;
  title: string;
  message: string;
  startDate: string;
  endDate: string;
  active: boolean;
  readCount?: number;
  createdBy: { name: string };
  location?: { id: string; name: string } | null;
  test?: { id: string; name: string } | null;
}

interface Location { id: string; name: string; active: boolean; }
interface Test { id: string; name: string; active: boolean; }

const QUICK_DURATIONS = [
  { label: "Today Only",  days: 0  },
  { label: "1 Day",       days: 1  },
  { label: "2 Days",      days: 2  },
  { label: "3 Days",      days: 3  },
  { label: "1 Week",      days: 7  },
  { label: "2 Weeks",     days: 14 },
];

function toLocalDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function toDateInput(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface Props {
  open: boolean;
  onClose: () => void;
  locations: Location[];
  tests: Test[];
}

export function NoticeManagementModal({ open, onClose, locations, tests }: Props) {
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const blankForm = {
    title:      "",
    message:    "",
    startDate:  toDateInput(new Date()),
    endDate:    toDateInput(new Date(Date.now() + 86400000)),
    locationId: "",
    testId:     "",
  };
  const [form, setForm] = useState(blankForm);

  const loadNotices = async () => {
    setLoading(true);
    try {
      const data = await api<Notice[]>("/notices/all");
      setNotices(data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    if (open) { loadNotices(); setView("list"); }
  }, [open]);

  const applyDuration = (days: number) => {
    const start = new Date(form.startDate || new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    setForm(f => ({ ...f, endDate: toDateInput(end) }));
  };

  const startEdit = (notice: Notice) => {
    setEditId(notice.id);
    setForm({
      title:      notice.title,
      message:    notice.message,
      startDate:  notice.startDate.slice(0, 10),
      endDate:    notice.endDate.slice(0, 10),
      locationId: notice.location?.id ?? "",
      testId:     notice.test?.id ?? "",
    });
    setView("edit");
  };

  const startCreate = () => {
    setEditId(null);
    setForm(blankForm);
    setError("");
    setView("create");
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.message.trim()) {
      setError("Title and Message are required.");
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError("End date must be on or after start date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        title:      form.title,
        message:    form.message,
        startDate:  new Date(form.startDate).toISOString(),
        endDate:    new Date(form.endDate + "T23:59:59").toISOString(),
        locationId: form.locationId || null,
        testId:     form.testId || null,
      };
      if (editId) {
        await api(`/notices/${editId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/notices", { method: "POST", body: JSON.stringify(payload) });
      }
      await loadNotices();
      setView("list");
    } catch (e: any) {
      setError(e.message || "Failed to save notice.");
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Remove this notice? It will be hidden from all agents immediately.")) return;
    try {
      await api(`/notices/${id}`, { method: "DELETE" });
      setNotices(prev => prev.filter(n => n.id !== id));
    } catch (e: any) {
      alert(e.message || "Failed to delete notice.");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-12 px-4 pb-4">
      <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-slate-200 dark:border-slate-700 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-t-2xl">
          <div className="p-2 bg-white/20 rounded-xl">
            <Bell className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg tracking-tight">
              {view === "list" ? "Notice Management" : view === "create" ? "Post New Notice" : "Edit Notice"}
            </h2>
            <p className="text-xs text-violet-200 mt-0.5">
              {view === "list" ? "Manage alerts sent to all agents" : "Alerts will appear immediately for all agents"}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* === LIST VIEW === */}
          {view === "list" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {notices.length} notice{notices.length !== 1 ? "s" : ""} posted
                </p>
                <button
                  onClick={startCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold rounded-xl transition-colors duration-150"
                >
                  <Plus className="h-4 w-4" /> Post New Notice
                </button>
              </div>

              {loading && (
                <div className="text-center py-8 text-slate-400 text-sm">Loading notices...</div>
              )}
              {!loading && notices.length === 0 && (
                <div className="text-center py-10">
                  <AlertTriangle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 font-medium">No notices posted yet</p>
                  <p className="text-slate-400 text-sm mt-1">Click "Post New Notice" to alert all agents.</p>
                </div>
              )}

              {notices.map(notice => {
                const now = new Date();
                const isExpired = new Date(notice.endDate) < now;
                const isActive = notice.active && !isExpired;
                return (
                  <div
                    key={notice.id}
                    className={`rounded-xl border p-4 transition-all duration-200 ${
                      isActive
                        ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20 opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                            isActive
                              ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                          }`}>
                            {isActive ? "🔴 Active" : isExpired ? "⬜ Expired" : "⬜ Inactive"}
                          </span>
                          {(notice.test || notice.location) && (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {[notice.test?.name, notice.location?.name].filter(Boolean).join(" · ")}
                            </span>
                          )}
                          {(notice.readCount !== undefined) && (
                            <span className="text-xs text-slate-400">
                              {notice.readCount} read
                            </span>
                          )}
                        </div>
                        <p className="font-semibold text-slate-800 dark:text-slate-200 text-sm">{notice.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{notice.message}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          📅 {toLocalDate(notice.startDate)} – {toLocalDate(notice.endDate)} &nbsp;·&nbsp; {notice.createdBy.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => startEdit(notice)}
                          className="p-1.5 hover:bg-violet-100 dark:hover:bg-violet-900/30 text-violet-600 dark:text-violet-400 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(notice.id)}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 dark:text-red-400 rounded-lg transition-colors"
                          title="Remove Notice"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* === CREATE / EDIT VIEW === */}
          {(view === "create" || view === "edit") && (
            <div className="space-y-4">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  Notice Title *
                </label>
                <input
                  className="input w-full"
                  placeholder='e.g. "Doctor Not Available – USG"'
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              {/* Message */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  Message / Details *
                </label>
                <textarea
                  className="input w-full h-28 resize-none"
                  placeholder="Explain the notice to agents. E.g. 'Dr. Sharma is unavailable for USG from 24th–26th July. Please avoid booking USG appointments during this period.'"
                  value={form.message}
                  onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                />
              </div>

              {/* Location & Test */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Target Location
                  </label>
                  <select
                    className="input w-full"
                    value={form.locationId}
                    onChange={e => setForm(f => ({ ...f, locationId: e.target.value }))}
                  >
                    <option value="">All Locations</option>
                    {locations.filter(l => l.active).map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                    Target Test Type
                  </label>
                  <select
                    className="input w-full"
                    value={form.testId}
                    onChange={e => setForm(f => ({ ...f, testId: e.target.value }))}
                  >
                    <option value="">All Tests</option>
                    {tests.filter(t => t.active).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wide">
                  Duration / Date Range *
                </label>
                <div className="flex gap-2 flex-wrap mb-3">
                  {QUICK_DURATIONS.map(qd => (
                    <button
                      key={qd.label}
                      type="button"
                      onClick={() => applyDuration(qd.days)}
                      className="px-3 py-1 text-xs rounded-full border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 font-medium transition-colors"
                    >
                      {qd.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">From</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={form.startDate}
                      onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <span className="block text-xs text-slate-500 mb-1">Until (inclusive)</span>
                    <input
                      type="date"
                      className="input w-full"
                      value={form.endDate}
                      onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(view === "create" || view === "edit") && (
          <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/20">
            <button
              onClick={() => setView("list")}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl transition-colors"
            >
              ← Back to List
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
            >
              {saving ? "Saving..." : view === "create" ? "🚨 Post Notice" : "✓ Save Changes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
