"use client";

import { useState, useEffect, useCallback } from "react";
import { X, AlertTriangle, ChevronDown, ChevronUp, Clock, ChevronLeft, ChevronRight, CheckCheck } from "lucide-react";
import { api } from "../lib/api";

interface Notice {
  id: string;
  title: string;
  message: string;
  startDate: string;
  endDate: string;
  isRead: boolean;
  createdBy: { name: string; role: string };
  location?: { name: string } | null;
  test?: { name: string } | null;
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

export function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isHovered, setIsHovered] = useState(false);

  const loadNotices = useCallback(async () => {
    try {
      const data = await api<Notice[]>("/notices");
      setNotices(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadNotices();
    // Refresh every 2 minutes
    const interval = setInterval(loadNotices, 120000);
    return () => clearInterval(interval);
  }, [loadNotices]);

  // Filter visible notices
  const visible = notices.filter(n => !dismissed.has(n.id));
  
  // Sort: Unread first, then newest read
  const sortedNotices = [...visible].sort((a, b) => {
    if (!a.isRead && b.isRead) return -1;
    if (a.isRead && !b.isRead) return 1;
    return 0;
  });

  const unreadCount = sortedNotices.filter(n => !n.isRead).length;

  // Auto scroll timer (6 seconds, pauses on hover or if expanded)
  useEffect(() => {
    if (sortedNotices.length <= 1 || isHovered || expanded !== null) return;
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % sortedNotices.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [sortedNotices.length, isHovered, expanded]);

  // Keep index within range if notices count changes
  useEffect(() => {
    if (currentIndex >= sortedNotices.length && sortedNotices.length > 0) {
      setCurrentIndex(0);
    }
  }, [sortedNotices.length, currentIndex]);

  const markRead = async (noticeId: string) => {
    try {
      await api(`/notices/${noticeId}/read`, { method: "POST" });
      setNotices(prev => prev.map(n => n.id === noticeId ? { ...n, isRead: true } : n));
    } catch {}
  };

  const markAllRead = async () => {
    try {
      await api("/notices/read-all", { method: "POST" });
      setNotices(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch {}
  };

  const dismiss = (noticeId: string) => {
    setDismissed(prev => new Set([...prev, noticeId]));
  };

  if (sortedNotices.length === 0) return null;

  const activeNotice = sortedNotices[currentIndex] || sortedNotices[0];
  const isUnread = !activeNotice.isRead;
  const isExpand = expanded === activeNotice.id;

  const handlePrev = () => {
    setCurrentIndex(prev => (prev - 1 + sortedNotices.length) % sortedNotices.length);
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % sortedNotices.length);
  };

  return (
    <div 
      className="w-full"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`
          relative overflow-hidden border-b transition-all duration-300
          ${isUnread
            ? "bg-red-600 border-red-700 text-white animate-pulse-subtle"
            : "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-700/50 text-amber-900 dark:text-amber-100"
          }
        `}
        style={isUnread ? { backgroundImage: "linear-gradient(135deg, #dc2626 0%, #b91c1c 50%, #991b1b 100%)" } : {}}
      >
        {/* Decorative stripe for unread */}
        {isUnread && (
          <div
            className="absolute inset-y-0 left-0 w-1.5"
            style={{ background: "repeating-linear-gradient(45deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 4px, transparent 4px, transparent 8px)" }}
          />
        )}

        <div className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-8 py-2.5 pl-5">
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`shrink-0 mt-0.5 ${isUnread ? "text-red-100" : "text-amber-600 dark:text-amber-400"}`}>
              <AlertTriangle className="h-4 w-4" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {isUnread ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-widest bg-red-800/80 border border-white/30 text-white px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                    🔴 NEW NOTICE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200 px-2 py-0.5 rounded-full">
                    ✓ READ
                  </span>
                )}

                <span className={`text-sm font-bold ${isUnread ? "text-white" : "text-amber-900 dark:text-amber-100"}`}>
                  {activeNotice.title}
                </span>

                {(activeNotice.location || activeNotice.test) && (
                  <span className={`text-xs ${isUnread ? "text-red-200" : "text-amber-700 dark:text-amber-300"}`}>
                    {[activeNotice.test?.name, activeNotice.location?.name].filter(Boolean).join(" · ")}
                  </span>
                )}

                <span className={`inline-flex items-center gap-1 text-xs ${isUnread ? "text-red-200" : "text-amber-600 dark:text-amber-400"}`}>
                  <Clock className="h-3 w-3" />
                  {daysLeft(activeNotice.endDate)}
                </span>
              </div>

              {/* Expandable message */}
              {isExpand && (
                <div className={`mt-2 text-sm rounded-lg p-3 leading-relaxed shadow-sm ${isUnread ? "bg-white/15 text-white" : "bg-amber-100 dark:bg-amber-900/30 text-amber-900 dark:text-amber-100"}`}>
                  <p className="whitespace-pre-wrap font-medium">{activeNotice.message}</p>
                  <div className={`mt-2 text-xs font-medium ${isUnread ? "text-red-200" : "text-amber-600 dark:text-amber-400"}`}>
                    📅 {formatDate(activeNotice.startDate)} – {formatDate(activeNotice.endDate)} &nbsp;·&nbsp; Posted by {activeNotice.createdBy.name} ({activeNotice.createdBy.role})
                  </div>
                </div>
              )}
            </div>

            {/* Navigation & Action Controls */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {/* Carousel Controls when > 1 notices */}
              {sortedNotices.length > 1 && (
                <div className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold ${isUnread ? "bg-white/20 text-white" : "bg-amber-200/60 dark:bg-amber-800/40 text-amber-800 dark:text-amber-200"}`}>
                  <button 
                    onClick={handlePrev} 
                    className="hover:opacity-75 p-0.5" 
                    title="Previous Notice"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 text-[11px]">
                    {currentIndex + 1}/{sortedNotices.length}
                  </span>
                  <button 
                    onClick={handleNext} 
                    className="hover:opacity-75 p-0.5" 
                    title="Next Notice"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Details Expand/Collapse */}
              <button
                onClick={() => setExpanded(isExpand ? null : activeNotice.id)}
                className={`text-xs px-2.5 py-1 rounded-md font-medium flex items-center gap-1 transition-colors duration-150
                  ${isUnread
                    ? "bg-white/20 hover:bg-white/30 text-white"
                    : "bg-amber-200/50 hover:bg-amber-200 text-amber-800 dark:bg-amber-800/30 dark:hover:bg-amber-800/50 dark:text-amber-200"
                  }`}
              >
                {isExpand ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {isExpand ? "Less" : "Details"}
              </button>

              {/* Single Mark Read */}
              {isUnread && (
                <button
                  onClick={async () => { await markRead(activeNotice.id); }}
                  className="text-xs px-2.5 py-1 rounded-md font-bold bg-white text-red-700 hover:bg-red-50 transition-colors duration-150 shadow-sm"
                >
                  ✓ Mark Read
                </button>
              )}

              {/* Bulk Read All Button */}
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs px-2.5 py-1 rounded-md font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1 transition-colors duration-150 shadow-sm"
                  title="Mark all notices as read"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  Read All ({unreadCount})
                </button>
              )}

              {/* Dismiss button */}
              <button
                onClick={() => dismiss(activeNotice.id)}
                className={`p-1 rounded-md transition-colors duration-150
                  ${isUnread ? "hover:bg-white/20 text-red-200 hover:text-white" : "hover:bg-amber-200 text-amber-600 dark:hover:bg-amber-800/50"}`}
                title="Dismiss (this session)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.94; }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
