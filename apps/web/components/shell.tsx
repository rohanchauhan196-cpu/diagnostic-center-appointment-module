"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, FlaskConical, LogOut, Megaphone, Shield, Activity, BellRing, Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";
import { getUser, logout } from "../lib/auth";
import { api } from "../lib/api";
import { NoticeBanner } from "./NoticeBanner";
import { NoticeManagementModal } from "./NoticeManagementModal";
import { ActiveNoticesModal } from "./ActiveNoticesModal";

export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = getUser();
  const isTech = user?.role === "TECHNICIAN";
  const isAdmin = user?.role === "ADMIN";
  const pathname = usePathname();

  const [noticeModalOpen, setNoticeModalOpen] = useState(false);
  const [activeNoticesModalOpen, setActiveNoticesModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [locations, setLocations] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const prevUnreadCountRef = useRef<number | null>(null);

  const playNotificationSound = useCallback(() => {
    try {
      const audio = new Audio("/dragon-studio-notification-sound-effect-372475.mp3");
      audio.play().catch(() => {});
    } catch {}
  }, []);

  const loadUnread = useCallback(async () => {
    try {
      const notices = await api<any[]>("/notices");
      const unreads = notices.filter((n: any) => !n.isRead);
      const count = unreads.length;
      
      if (prevUnreadCountRef.current !== null && count > prevUnreadCountRef.current) {
        playNotificationSound();
      }
      prevUnreadCountRef.current = count;
      setUnreadCount(count);
    } catch {}
  }, [playNotificationSound]);

  useEffect(() => {
    loadUnread();
    const iv = setInterval(loadUnread, 30000);
    return () => clearInterval(iv);
  }, [loadUnread]);

  useEffect(() => {
    if ((isTech || isAdmin) && noticeModalOpen) {
      api<any[]>("/locations").then(setLocations).catch(() => {});
      api<any[]>("/tests").then(setTests).catch(() => {});
    }
  }, [isTech, isAdmin, noticeModalOpen]);

  // Prevent scroll wheel from changing number input values across the entire application
  useEffect(() => {
    const handleWheel = () => {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.tagName === "INPUT" && (activeEl as HTMLInputElement).type === "number") {
        (activeEl as HTMLElement).blur();
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  const roleMeta: Record<string, { label: string; color: string }> = {
    ADMIN:      { label: "Admin",            color: "bg-blue-500/15 text-blue-600 dark:text-blue-400 ring-1 ring-blue-400/30" },
    FRONTDESK:  { label: "Frontdesk",        color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-400/30" },
    TECHNICIAN: { label: "Technician",       color: "bg-violet-500/15 text-violet-700 dark:text-violet-400 ring-1 ring-violet-400/30" },
    ANALYTICS:  { label: "Analytics",        color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400 ring-1 ring-indigo-400/30" },
    OPERATOR:   { label: "Machine Operator", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400 ring-1 ring-amber-400/30" },
  };
  const rm = roleMeta[user?.role ?? ""] ?? { label: user?.role ?? "", color: "bg-slate-100 text-slate-600" };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 dark:border-slate-800/60 bg-white/80 dark:bg-surface-900/90 backdrop-blur-md shadow-sm">
        <div className="mx-auto flex max-w-[1920px] items-center justify-between px-4 sm:px-6 lg:px-8 py-3">

          {/* Brand */}
          <Link
            href={isTech ? "/schedule" : "/dashboard"}
            className="flex items-center group"
          >
            <img src="/logo.png" alt="Molecular Diagnostics and Therapy" className="h-[5.5rem] w-auto transition-transform duration-200 group-hover:scale-105" />
          </Link>

          {/* Nav */}
          <nav className="flex items-center gap-0.5 text-sm">
            {isTech ? (
              <Link
                className={`nav-link ${pathname === "/schedule" ? "active" : ""}`}
                href="/schedule"
              >
                <FlaskConical className="h-4 w-4" />
                Today's Schedule
              </Link>
            ) : (
              <>
                <Link
                  className={`nav-link ${pathname?.startsWith("/dashboard") ? "active" : ""}`}
                  href="/dashboard"
                >
                  <ClipboardList className="h-4 w-4" />
                  Dashboard
                </Link>
                {(user?.role === "ADMIN" || user?.role === "FRONTDESK") && (
                  <Link
                    className={`nav-link ${pathname?.startsWith("/marketing") ? "active" : ""}`}
                    href="/marketing"
                  >
                    <Megaphone className="h-4 w-4" />
                    Marketing
                  </Link>
                )}
                {user?.role === "ADMIN" && (
                  <Link
                    className={`nav-link ${pathname?.startsWith("/admin") ? "active" : ""}`}
                    href="/admin"
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </Link>
                )}
                {user?.role === "ANALYTICS" && (
                  <Link
                    className={`nav-link ${pathname?.startsWith("/admin") ? "active" : ""}`}
                    href="/admin"
                  >
                    <Activity className="h-4 w-4" />
                    Analytics
                  </Link>
                )}
              </>
            )}

            {/* Notifications Button — ALWAYS Visible for ALL Agents/Roles */}
            <button
              onClick={() => setActiveNoticesModalOpen(true)}
              className="flex items-center gap-1.5 ml-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-200 dark:border-red-800/60 bg-red-50/80 dark:bg-red-950/30 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all duration-150 shadow-sm"
              title="View Active Notifications"
            >
              {unreadCount > 0 ? (
                <BellRing className="h-4 w-4 text-red-600 animate-bounce" />
              ) : (
                <Bell className="h-4 w-4 text-slate-500" />
              )}
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] font-extrabold bg-red-600 text-white rounded-full ml-0.5">
                  {unreadCount}
                </span>
              )}
            </button>

            {/* Notice Management Button (Technicians & Admins) */}
            {(isTech || isAdmin) && (
              <button
                onClick={() => setNoticeModalOpen(true)}
                className="flex items-center gap-1.5 ml-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition-colors duration-150"
              >
                Manage
              </button>
            )}

            {/* User info */}
            <div className="ml-3 flex items-center gap-2 border-l border-slate-200 dark:border-slate-700 pl-3">
              <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 leading-none">
                  {user?.name}
                </span>
                <span className={`mt-0.5 inline-block text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${rm.color}`}>
                  {rm.label}
                </span>
              </div>
              <button
                className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all duration-200"
                onClick={() => { logout(); router.push("/login"); }}
                title="Log out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </nav>
        </div>

        {/* Gradient accent line at bottom of header */}
        <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, #1557d6, #14b8a6, #1557d6)", backgroundSize: "200% 100%", animation: "gradient-shift 6s ease infinite" }} />

        {/* Notice Banner — appears below header for all logged-in users */}
        <NoticeBanner />
      </header>

      <main className="mx-auto w-full max-w-[1920px] flex-1 px-4 sm:px-6 lg:px-8 py-6 animate-fade-in">
        {children}
      </main>

      {/* Active Notifications Drawer/Modal */}
      <ActiveNoticesModal
        isOpen={activeNoticesModalOpen}
        onClose={() => setActiveNoticesModalOpen(false)}
        onOpenManageModal={() => setNoticeModalOpen(true)}
        onNoticesUpdated={loadUnread}
      />

      {/* Notice Management Modal for Technicians & Admins */}
      {(isTech || isAdmin) && (
        <NoticeManagementModal
          open={noticeModalOpen}
          onClose={() => { setNoticeModalOpen(false); loadUnread(); }}
          locations={locations}
          tests={tests}
        />
      )}
    </div>
  );
}
