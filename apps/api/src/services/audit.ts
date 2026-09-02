import type { Request } from "express";
import { prisma } from "../config/db.js";

export async function audit(req: Request, data: { appointmentId?: string; action: string; oldValue?: unknown; newValue?: unknown }) {
  if (!req.user) return;
  await prisma.auditLog.create({
    data: {
      userId: req.user.id,
      appointmentId: data.appointmentId,
      action: data.action,
      oldValue: data.oldValue as object | undefined,
      newValue: data.newValue as object | undefined,
      ipAddress: req.ip,
      browser: req.headers["user-agent"]
    }
  });
}

export async function activity(userId: string, appointmentId: string, message: string) {
  await prisma.activityLog.create({ data: { userId, appointmentId, message } });
}
