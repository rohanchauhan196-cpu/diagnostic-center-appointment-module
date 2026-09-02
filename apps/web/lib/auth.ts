"use client";

export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "FRONTDESK" | "TECHNICIAN" | "MARKETING" | "ANALYTICS" | "OPERATOR";
  locationId?: string | null;
  testTypes?: { id: string; name: string }[];
  canCreateAppointments?: boolean;
};

export function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token: string, user: User) {
  localStorage.setItem("token", token);
  localStorage.setItem("user", JSON.stringify(user));
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
