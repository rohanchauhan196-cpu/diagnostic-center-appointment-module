import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../config/db.js";

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  name: string;
  locationId?: string | null;
  canCreateAppointments?: boolean;
  testTypes?: { id: string; name: string }[];
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Missing token" });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev-secret") as { sub: string };
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: { testTypes: { select: { id: true, name: true } } }
    });
    if (!user || !user.active) return res.status(401).json({ message: "Inactive or missing user" });
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      locationId: user.locationId,
      canCreateAppointments: user.canCreateAppointments,
      testTypes: user.testTypes
    };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}
