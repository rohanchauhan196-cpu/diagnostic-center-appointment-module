"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type ProNameEntry = { id: string; name: string; isCustom: boolean };

interface ProNameAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  /** For uncontrolled usage inside <form> — sets the hidden input name */
  name?: string;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function ProNameAutocomplete({
  value,
  onChange,
  name,
  placeholder = "Select PRO name...",
  className = "",
  id,
}: ProNameAutocompleteProps) {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Sync controlled value
  useEffect(() => {
    setInputVal(value);
    if (!value) setSearchText("");
  }, [value]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (open && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  }, [open]);

  const { data: proNames = [] } = useQuery<ProNameEntry[]>({
    queryKey: ["pro-names"],
    queryFn: () => api<ProNameEntry[]>("/pro-names"),
    staleTime: 5 * 60 * 1000,
  });

  // Exclude the "Others" sentinel from the selectable list
  const regularNames = proNames.filter((p) => p.name !== "Others (Not Available - NA)");

  const filtered =
    searchText.trim().length === 0
      ? regularNames
      : regularNames.filter((p) =>
          p.name.toLowerCase().includes(searchText.toLowerCase())
        );

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setSearchText("");
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleSelect(selectedName: string) {
    setInputVal(selectedName);
    onChange(selectedName);
    setOpen(false);
    setSearchText("");
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setInputVal("");
    onChange("");
    setSearchText("");
  }

  // ── Strict list-only selector for ALL roles ──
  return (
    <div ref={wrapperRef} className="relative">
      {/* Hidden input for form submission */}
      {name && <input type="hidden" name={name} value={inputVal} />}

      {/* Clickable display — no free typing allowed */}
      <div
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        tabIndex={0}
        className={`input w-full flex items-center justify-between cursor-pointer select-none ${className}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <span className={inputVal ? "text-slate-800 dark:text-slate-100 font-medium truncate" : "text-slate-400"}>
          {inputVal || placeholder}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {inputVal && (
            <button
              type="button"
              tabIndex={-1}
              onClick={handleClear}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded"
              title="Clear selection"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-slate-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Dropdown with embedded search */}
      {open && (
        <div
          className="absolute z-50 left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl"
          style={{ top: "100%" }}
        >
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              ref={searchInputRef}
              className="input w-full text-sm py-1.5"
              placeholder="Search PRO name…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setOpen(false); setSearchText(""); }
              }}
            />
          </div>
          <ul className="max-h-56 overflow-y-auto" role="listbox">
            {filtered.length > 0 ? (
              filtered.map((p) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={inputVal === p.name}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(p.name);
                  }}
                  className={`px-3 py-2 text-sm cursor-pointer text-slate-700 dark:text-slate-200 hover:bg-blue-50 dark:hover:bg-slate-700 ${inputVal === p.name ? "bg-blue-50 dark:bg-slate-700 font-medium" : ""}`}
                >
                  {p.name}
                </li>
              ))
            ) : (
              <li className="px-3 py-2 text-xs text-slate-400 italic select-none">
                No PRO name found. Please refine your search.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
