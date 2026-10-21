"use client";

import { getToken } from "./auth";

const getApiUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL && !process.env.NEXT_PUBLIC_API_URL.includes("localhost")) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    if (window.location.port === "3000") {
      return `${window.location.protocol}//${window.location.hostname}:4000`;
    }
    return `${window.location.origin}/api`;
  }
  return "http://localhost:4000";
};

export const API_URL = getApiUrl();

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...init.headers
    }
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Request failed");
  return res.json();
}

export const statuses = ["BOOKED", "CONFIRMED", "ON_THE_WAY", "ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED", "CANCELLED"];

export async function uploadFile(file: File): Promise<{ url: string }> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_URL}/upload`, {
    method: "POST",
    headers: {
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    },
    body: formData
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Upload failed");
  return res.json();
}
