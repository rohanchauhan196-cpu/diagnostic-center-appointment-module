"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Bell, AlertTriangle, CheckCheck, Clock, Plus, Check } from "lucide-react";
import { api } from "../lib/api";
import { getUser } from "../lib/auth";

interface Notice {
  id: string;
  title: string;
  message: string;
  startDate: string;
  endDate: string;
  isRead: boolean;
  createdBy: { id: string; name: string; role: string };
  location?: { id: string; name: string } | null;
  test?: { id: string; name: string } | null;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function daysLeft(endDate: string) {
  const diff = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  if (diff <= 0) return "Expired";
  if (diff === 1) return "Until tomorrow";
  return `${diff} days remaining`;
}

interface ActiveNoticesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenManageModal?: () => void;
  onNoticesUpdated?: () => void;
}

export function ActiveNoticesModal({ isOpen, onClose, onOpenManageModal, onNoticesUpdated }: ActiveNoticesModalProps) {
  const user = getUser();
  const isTechOrAdmin = user?.role === "TECHNICIAN" || user?.role === "ADMIN";

  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const loadNotices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<Notice[]>("/notices");
      setNotices(data);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadNotices();
    }
  }, [isOpen, loadNotices]);

  const markRead = async (noticeId: string) => {
    try {
      await api(`/notices/${noticeId}/read`, { method: "POST" });
      setNotices(prev => prev.map(n => n.id === noticeId ? { ...n, isRead: true } : n));
      if (onNoticesUpdated) onNoticesUpdated();
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api("/notices/read-all", { method: "POST" });
      setNotices(prev => prev.map(n => ({ ...n, isRead: true })));
      if (onNoticesUpdated) onNoticesUpdated();
    } catch {}
  };

  if (!isOpen) return null;

  const sortedNotices = [...notices].sort((a, b) => {
    if (!a.isRead && b.isRead) return -1;
    if (a.isRead && !b.isRead) return 1;
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });

  const displayNotices = filter === "unread" ? sortedNotices.filter(n => !n.isRead) : sortedNotices;
  const unreadCount = notices.filter(n => !n.isRead).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div 
        className="relative w-full max-w-2xl max-h-[85vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Active Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                System announcements and test updates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-colors duration-150 shadow-sm"
              >
                <CheckCheck className="h-4 w-4" />
                Mark All Read
              </button>
            )}

            {isTechOrAdmin && onOpenManageModal && (
              <button
                onClick={() => { onClose(); onOpenManageModal(); }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100 transition-colors duration-150"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Notice
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="px-6 py-2 bg-slate-100/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs font-semibold">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-md transition-colors ${filter === "all" ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              All ({notices.length})
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-3 py-1 rounded-md transition-colors ${filter === "unread" ? "bg-white dark:bg-slate-700 text-red-600 dark:text-red-400 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          <span className="text-[11px] text-slate-400">
            Red = Unread · Amber = Read
          </span>
        </div>

        {/* List Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">Loading notices...</div>
          ) : displayNotices.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                {filter === "unread" ? "No unread notifications" : "No active notifications"}
              </p>
            </div>
          ) : (
            displayNotices.map((notice) => {
              const isUnread = !notice.isRead;
              return (
                <div
                  key={notice.id}
                  className={`
                    p-4 rounded-xl border transition-all duration-200
                    ${isUnread
                      ? "bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800/60 shadow-sm ring-1 ring-red-400/20"
                      : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
                    }
                  `}
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isUnread ? (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold tracking-wider uppercase bg-red-600 text-white rounded-full">
                          🔴 UNREAD
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded-full">
                          ✓ READ
                        </span>
                      )}

                      <h3 className={`text-base font-bold ${isUnread ? "text-red-950 dark:text-red-100" : "text-amber-950 dark:text-amber-100"}`}>
                        {notice.title}
                      </h3>

                      {(notice.location || notice.test) && (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isUnread ? "bg-red-200/60 text-red-800 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-200/50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"}`}>
                          {[notice.test?.name, notice.location?.name].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>

                    {isUnread && (
                      <button
                        onClick={() => markRead(notice.id)}
                        className="shrink-0 text-xs px-2.5 py-1 rounded-lg font-bold bg-red-600 hover:bg-red-700 text-white flex items-center gap-1 shadow-sm transition-colors"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Mark Read
                      </button>
                    )}
                  </div>

                  <p className={`text-sm leading-relaxed mb-3 whitespace-pre-wrap ${isUnread ? "text-red-900 dark:text-red-200" : "text-slate-700 dark:text-slate-300"}`}>
                    {notice.message}
                  </p>

                  <div className={`flex items-center justify-between text-xs flex-wrap gap-2 pt-2 border-t ${isUnread ? "border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300" : "border-amber-200/60 dark:border-amber-900/30 text-slate-500 dark:text-slate-400"}`}>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{daysLeft(notice.endDate)}</span>
                      <span>({formatDate(notice.startDate)} – {formatDate(notice.endDate)})</span>
                    </div>

                    <div>
                      Posted by <span className="font-semibold">{notice.createdBy.name}</span> ({notice.createdBy.role})
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
