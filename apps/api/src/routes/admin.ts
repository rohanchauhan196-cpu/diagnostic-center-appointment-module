import { Router } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { dayRange } from "../services/slots.js";
import { 
  sendMidnightAllLocationsReport, 
  sendGreenParkMorningReport, 
  sendPaschimViharMorningReport 
} from "../cron/dailyReport.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole(Role.ADMIN, Role.ANALYTICS));

adminRouter.post("/test-email", requireRole(Role.ADMIN), async (_req, res) => {
  try {
    const result = await sendMidnightAllLocationsReport();
    res.json({ message: "Midnight All Locations email sent successfully!", details: result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send email" });
  }
});

adminRouter.post("/test-green-park-email", requireRole(Role.ADMIN), async (_req, res) => {
  try {
    const result = await sendGreenParkMorningReport();
    res.json({ message: "Green Park morning email sent successfully!", details: result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send email" });
  }
});

adminRouter.post("/test-paschim-vihar-email", requireRole(Role.ADMIN), async (_req, res) => {
  try {
    const result = await sendPaschimViharMorningReport();
    res.json({ message: "Paschim Vihar morning email sent successfully!", details: result });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || "Failed to send email" });
  }
});


adminRouter.get("/analytics", async (req, res) => {
  const today = dayRange(new Date());

  // --- Date range resolution ---
  // Priority: custom startDate/endDate > month/year picker
  const qStartDate  = req.query.startDate  ? String(req.query.startDate)  : null;
  const qEndDate    = req.query.endDate    ? String(req.query.endDate)    : null;
  const qMonth      = req.query.month      ? parseInt(String(req.query.month)) : null;
  const qYear       = req.query.year       ? parseInt(String(req.query.year))  : null;
  const qLocationId = req.query.locationId ? String(req.query.locationId) : null;
  const qTestId     = req.query.testId     ? String(req.query.testId)     : null;

  let rangeStart: Date;
  let rangeEnd: Date;
  let isFiltered = false;

  if (qStartDate || qEndDate) {
    // Custom date range from the top header filters
    rangeStart = qStartDate ? new Date(qStartDate) : new Date(0);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = qEndDate ? new Date(qEndDate) : new Date(8640000000000000);
    rangeEnd.setHours(23, 59, 59, 999);
    isFiltered = true;
  } else if (qMonth !== null && qYear !== null && qMonth >= 1 && qMonth <= 12) {
    rangeStart = new Date(qYear, qMonth - 1, 1, 0, 0, 0, 0);
    rangeEnd   = new Date(qYear, qMonth,     0, 23, 59, 59, 999);
    isFiltered = true;
  } else {
    // Default: current month
    rangeStart = new Date();
    rangeStart.setDate(1);
    rangeStart.setHours(0, 0, 0, 0);
    rangeEnd = new Date(8640000000000000);
  }

  const dateFilter = isFiltered ? { gte: rangeStart, lte: rangeEnd } : undefined;

  // Build base where clause (date + optional location + optional test)
  const baseWhere: any = {};
  if (isFiltered)    baseWhere.appointmentDate = dateFilter;
  if (qLocationId)   baseWhere.locationId      = qLocationId;
  if (qTestId)       baseWhere.testId          = qTestId;
  const hasWhere = isFiltered || !!qLocationId || !!qTestId;

  // Where clause for agent counts (based on creation date: createdAt)
  const createdWhere: any = {
    status: { not: "CANCELLED" },
    ...(qLocationId ? { locationId: qLocationId } : {}),
    ...(qTestId ? { testId: qTestId } : {}),
    createdAt: isFiltered ? dateFilter : { gte: rangeStart }
  };

  const [total, todayCount, monthly, completed, cancelled, byTest, byReferral, byUser, byMarketingRaw] = await Promise.all([
    prisma.appointment.count(hasWhere ? { where: baseWhere } : undefined as any),
    prisma.appointment.count({ where: { appointmentDate: { gte: today.start, lt: today.end }, ...(qLocationId ? { locationId: qLocationId } : {}), ...(qTestId ? { testId: qTestId } : {}) } }),
    prisma.appointment.count({ where: { ...baseWhere, appointmentDate: isFiltered ? dateFilter : { gte: rangeStart } } }),
    prisma.appointment.count({ where: { ...baseWhere, status: "ARRIVED"   } }),
    prisma.appointment.count({ where: { ...baseWhere, status: "CANCELLED" } }),
    prisma.appointment.groupBy({ by: ["testId"],      _count: true, ...(hasWhere ? { where: baseWhere } : {}) }),
    prisma.appointment.groupBy({ by: ["referredBy"],  _count: true, ...(hasWhere ? { where: baseWhere } : {}) }),
    prisma.appointment.groupBy({
      by: ["createdById"],
      where: createdWhere,
      _count: true
    }),
    prisma.appointment.groupBy({
      by: ["createdById"],
      where: {
        ...createdWhere,
        createdBy: { role: Role.MARKETING }
      },
      _count: { id: true }
    })
  ]);


  const mapCount = (x: any, field: string) => {
    if (typeof x._count === "number") return x._count;
    if (x._count && typeof x._count === "object") {
      return x._count[field] ?? x._count._all ?? Object.values(x._count)[0] ?? 0;
    }
    return 0;
  };

  const activeStaffUsers = await prisma.user.findMany({
    where: { active: true, role: { in: [Role.FRONTDESK, Role.ADMIN, Role.MARKETING] } },
    select: { id: true, name: true, role: true }
  });

  const userIds = [...new Set([
    ...activeStaffUsers.map(u => u.id),
    ...byUser.map(x => x.createdById),
    ...byMarketingRaw.map(x => x.createdById)
  ].filter(Boolean))];
  const userRecords = await prisma.user.findMany({
    where: { id: { in: userIds as string[] } },
    select: { id: true, name: true, role: true }
  });
  const userMap = new Map(userRecords.map(u => [u.id, u]));

  const countsMap = new Map<string, number>();
  byUser.forEach(x => {
    if (x.createdById) {
      countsMap.set(x.createdById, mapCount(x, "createdById"));
    }
  });

  const agentMap = new Map<string, { agentId: string; agentName: string; role: string; count: number }>();
  for (const u of activeStaffUsers) {
    agentMap.set(u.id, {
      agentId: u.id,
      agentName: u.name,
      role: u.role,
      count: countsMap.get(u.id) || 0
    });
  }
  for (const x of byUser) {
    if (x.createdById && !agentMap.has(x.createdById)) {
      const u = userMap.get(x.createdById);
      agentMap.set(x.createdById, {
        agentId: x.createdById,
        agentName: u?.name || x.createdById || "Unknown",
        role: u?.role || "FRONTDESK",
        count: mapCount(x, "createdById")
      });
    }
  }
  const byAgentList = Array.from(agentMap.values()).sort((a, b) => b.count - a.count);

  res.json({
    kpis: { total, today: todayCount, monthly, completed, cancelled },
    byTest: byTest.map(x => ({ testId: x.testId, _count: mapCount(x, "testId") })),
    byReferral: byReferral.map(x => ({ referredBy: x.referredBy, _count: mapCount(x, "referredBy") })),
    byUser: byUser.map(x => ({ createdById: x.createdById, _count: mapCount(x, "createdById") })),
    byAgent: byAgentList,
    byMarketing: byMarketingRaw.map(x => ({ agentId: x.createdById, monthly: x._count.id }))
  });
});


adminRouter.get("/audits", async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 500 }));
});

adminRouter.get("/exports/appointments.csv", async (req, res) => {
  const { startDate, endDate, locationId, testId } = req.query;
  const where: any = {};

  if (startDate || endDate) {
    where.appointmentDate = {};
    if (startDate) {
      const start = new Date(String(startDate));
      start.setHours(0, 0, 0, 0);
      where.appointmentDate.gte = start;
    }
    if (endDate) {
      const end = new Date(String(endDate));
      end.setHours(23, 59, 59, 999);
      where.appointmentDate.lte = end;
    }
  }

  if (locationId) {
    where.locationId = String(locationId);
  }

  if (testId) {
    where.testId = String(testId);
  }

  const rows = await prisma.appointment.findMany({
    where,
    include: { test: true, location: true, createdBy: true },
    orderBy: { appointmentDate: "asc" }
  });

  await prisma.exportJob.create({ data: { userId: req.user!.id, format: "CSV", filters: req.query } });
  const header = "Booking ID,Patient,Phone,Test,Location,Date,Slot,Created Date,Referred By,Referred Doctor,Status,Total Price,Advance Received,Pending Payment,Advance Method,Remaining Method,Remarks,Created By\n";
  const body = rows.map((r) => {
    const total = r.totalPrice ?? 0;
    const advance = r.advanceReceived ?? 0;
    const pending = Math.max(total - advance, 0);
    const dateStr = r.appointmentDate.toISOString().slice(0, 10);
    const createdDateStr = r.createdAt ? r.createdAt.toISOString().slice(0, 19).replace("T", " ") : "";
    return [
      r.bookingId,
      r.patientName,
      r.phoneNumber || "",
      (r as any).subTest ? `${r.test.name} (${(r as any).subTest})` : r.test.name,
      r.location?.name || "—",
      dateStr,
      r.slot,
      createdDateStr,
      r.referredBy || "",
      r.referredDoctor || "",
      r.status,
      total,
      advance,
      pending,
      r.advanceMethod || "—",
      r.remainingMethod || "—",
      r.notes || "",
      r.createdBy?.name || "—",
    ].map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
  }).join("\n");
  res.header("Content-Type", "text/csv").send(header + body);
});
