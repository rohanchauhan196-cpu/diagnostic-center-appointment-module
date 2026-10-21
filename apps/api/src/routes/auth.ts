import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { JWT_SECRET, requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

// Brute-force protection: after MAX_FAILURES wrong passwords for the same
// IP + email, further attempts are refused until the window expires.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

function failureKey(ip: string | undefined, email: string) {
  return `${ip ?? "unknown"}|${email.toLowerCase()}`;
}

authRouter.post("/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const key = failureKey(req.ip, body.email);
  const now = Date.now();
  const entry = failures.get(key);
  if (entry && entry.resetAt > now && entry.count >= MAX_FAILURES) {
    const minutes = Math.ceil((entry.resetAt - now) / 60000);
    return res.status(429).json({ message: `Too many failed login attempts. Try again in ${minutes} minute(s).` });
  }

  const user = await prisma.user.findUnique({
    where: { email: body.email },
    include: { testTypes: { select: { id: true, name: true } } }
  });
  if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
    const fresh = !entry || entry.resetAt <= now;
    failures.set(key, { count: fresh ? 1 : entry.count + 1, resetAt: fresh ? now + WINDOW_MS : entry.resetAt });
    if (failures.size > 10_000) {
      for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
    }
    return res.status(401).json({ message: "Invalid credentials" });
  }
  failures.delete(key);
  const expiresIn = (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"];
  const options: SignOptions = { expiresIn };
  const token = jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, options);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locationId: user.locationId,
      canCreateAppointments: user.canCreateAppointments,
      testTypes: user.testTypes
    }
  });
});

authRouter.get("/me", requireAuth, (req, res) => res.json(req.user));
