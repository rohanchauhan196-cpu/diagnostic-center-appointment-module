"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity } from "lucide-react";
import { api } from "../../lib/api";
import { setSession } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await api<{ token: string; user: never }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") })
      });
      setSession(result.token, result.user);
      const role = (result.user as { role: string }).role;
      router.push(role === "TECHNICIAN" ? "/schedule" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    }
  }
  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-b from-medical-50 to-white px-4 dark:from-slate-950 dark:to-slate-900">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <div className="flex flex-col items-center gap-3 mb-2 text-center">
          <img src="/logo.png" alt="Molecular Diagnostics and Therapy" className="h-[7rem] w-auto" />
          <div>
            <h1 className="text-xl font-semibold mt-2">Diagnostic Center Login</h1>
            <p className="text-sm text-slate-500">Secure appointment management</p>
          </div>
        </div>
        <input className="input w-full" name="email" type="email" placeholder="Email" required />
        <input className="input w-full" name="password" type="password" placeholder="Password" required />
        {error && <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <button className="btn w-full">Login</button>
      </form>
    </main>
  );
}
