"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  BookOpen, 
  ArrowLeft, 
  Search, 
  MapPin, 
  FlaskConical, 
  Building2, 
  ShieldCheck, 
  Truck, 
  Receipt,
  ExternalLink
} from "lucide-react";

const QUICK_SECTIONS = [
  { label: "1. Purpose & Scope", id: "sec-1", icon: BookOpen },
  { label: "2. Locations", id: "sec-2", icon: MapPin },
  { label: "3. Services Offered", id: "sec-3", icon: FlaskConical },
  { label: "4. Test Preparation Guide", id: "sec-4", icon: FlaskConical },
  { label: "5. Centre Protocols", id: "sec-5", icon: Building2 },
  { label: "6. Panel / Insurance", id: "sec-6", icon: ShieldCheck },
  { label: "7. Machines & Equipment", id: "sec-7", icon: Building2 },
  { label: "8. Ambulance Protocol", id: "sec-8", icon: Truck },
  { label: "9. Reports & Billing", id: "sec-9", icon: Receipt },
];

export default function SopPage() {
  const [searchQuery, setSearchQuery] = useState("");

  const handleJump = (sectionId: string) => {
    const iframe = document.getElementById("sop-frame") as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      const el = iframe.contentWindow.document.getElementById(sectionId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    if (!q) return;
    const iframe = document.getElementById("sop-frame") as HTMLIFrameElement;
    if (iframe && iframe.contentWindow) {
      (iframe.contentWindow as any).find?.(q, false, false, true, false, false, false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Document Title */}
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center group" title="Return to Dashboard">
              <img 
                src="/logo.png" 
                alt="Molecular Diagnostics and Therapy" 
                className="h-10 sm:h-12 w-auto transition-transform duration-200 group-hover:scale-105" 
              />
            </Link>
            <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-medical-50 dark:bg-medical-950/60 text-medical-700 dark:text-medical-300 border border-medical-200 dark:border-medical-800 tracking-wider uppercase">
                  Official SOP Manual
                </span>
                <span className="text-xs text-slate-400 font-medium hidden md:inline">Molecular Diagnostics &amp; Therapy</span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 leading-tight">
                Standard Operating Procedure (Patient Booking &amp; Centre Operations)
              </h1>
            </div>
          </div>

          {/* Controls: Search, View Switcher & Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            
            {/* Quick Find */}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Find in document…"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="input h-9 pl-8 pr-3 text-xs w-36 sm:w-48 bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 focus:bg-white focus:w-56 transition-all"
              />
            </div>



            {/* Return to Dashboard */}
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-medical-600 hover:bg-medical-700 text-white shadow-sm transition-all"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Section Quick Jump Bar */}
        <div className="bg-slate-50/90 dark:bg-slate-900/60 border-t border-slate-200/60 dark:border-slate-800/60 px-4 sm:px-6 lg:px-8 py-2 overflow-x-auto scrollbar-none flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap mr-1 flex items-center gap-1">
            <BookOpen className="h-3 w-3" /> Quick Jump:
          </span>
          {QUICK_SECTIONS.map((sec) => (
            <button
              key={sec.id}
              onClick={() => handleJump(sec.id)}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-medical-50 dark:hover:bg-medical-950/40 hover:text-medical-600 dark:hover:text-medical-300 border border-slate-200/80 dark:border-slate-700/80 transition-all whitespace-nowrap shadow-xs"
            >
              {sec.label}
            </button>
          ))}
          <a
            href="/sop_document.html"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-[11px] font-semibold text-medical-600 hover:text-medical-700 dark:text-medical-400 flex items-center gap-1 whitespace-nowrap px-2 py-0.5"
            title="Open standalone document"
          >
            <span>Fullscreen</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </header>

      {/* Main Viewer Area */}
      <main className="flex-1 flex flex-col p-2 sm:p-4 max-w-[1920px] w-full mx-auto">
        <div className="flex-1 w-full bg-slate-200/40 dark:bg-slate-900/40 rounded-xl overflow-hidden shadow-inner border border-slate-200 dark:border-slate-800 flex flex-col">
          <iframe
            id="sop-frame"
            src="/sop_document.html"
            title="Standard Operating Procedure Manual"
            className="w-full h-[calc(100vh-140px)] border-0"
          />
        </div>
      </main>
    </div>
  );
}
