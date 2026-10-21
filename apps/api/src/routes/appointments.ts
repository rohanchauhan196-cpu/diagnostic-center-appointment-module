import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { activity, audit } from "../services/audit.js";
import { assertSlotHasCapacity, slotAvailability, upcomingAvailability } from "../services/slots.js";
import { dayNameOf, dayRange, toDateStr, todayStr } from "../services/time.js";
import { emitRealtime } from "../config/socket.js";
import type { AuthUser } from "../middleware/auth.js";

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const SCAN_STATUSES = ["ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED"] as const;
const READ_ONLY_ROLES = ["ANALYTICS"];

/** Technicians and operators only see appointments for their allotted center and test types. */
function isOutOfScope(user: AuthUser, appt: { locationId: string | null; testId: string }) {
  if (user.role !== "TECHNICIAN" && user.role !== "OPERATOR") return false;
  if (user.locationId && appt.locationId !== user.locationId) return true;
  if (user.testTypes && user.testTypes.length > 0 && !user.testTypes.some((t) => t.id === appt.testId)) return true;
  return false;
}

/** Technicians only see the patient phone when their center allows it. */
function hidePhoneFrom(user: AuthUser, appt: { location?: { showContactToTechnicians: boolean } | null }) {
  return user.role === "TECHNICIAN" && !appt.location?.showContactToTechnicians;
}

function forViewer<T extends { phoneNumber: string | null; totalPrice: number | null; advanceReceived: number | null; location?: { showContactToTechnicians: boolean } | null }>(user: AuthUser, appt: T): T {
  const canSeePayments = user.role === "ADMIN" || user.role === "FRONTDESK" || user.role === "TECHNICIAN";
  return {
    ...appt,
    ...(canSeePayments ? {} : { totalPrice: null, advanceReceived: null }),
    ...(hidePhoneFrom(user, appt) ? { phoneNumber: null } : {})
  };
}

const appointmentBody = z.object({
  patientName: z.string().min(2).transform(s => s.trim()),
  phoneNumber: z.string().regex(/^[0-9]{10}$/, "Phone must be exactly 10 digits").or(z.literal("")).optional().nullable(),
  patientAge: z.string().optional().nullable(),
  testId: z.string(),
  locationId: z.string(),
  appointmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Date must be YYYY-MM-DD"),
  slot: z.string(),
  referredBy: z.string().optional(),
  referredDoctor: z.string().optional().nullable(),
  cityHospital: z.string().optional().nullable(),
  notes: z.string().optional(),
  totalPrice: z.number().int().nonnegative().optional().nullable(),
  advanceReceived: z.number().int().nonnegative().optional().nullable(),
  advanceMethod: z.string().optional().nullable(),
  remainingMethod: z.string().optional().nullable(),
  subTest: z.string().optional().nullable(),
  isPregnant: z.boolean().optional().nullable(),
  preferredDoctor: z.string().optional().nullable(),
  scanName: z.string().max(500).optional().nullable(),
  prescriptionUrl: z.string().max(1000).optional().nullable(),
});

function parseAgeInYears(ageStr: string): number | null {
  const normalized = ageStr.toLowerCase().trim();
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (normalized.includes("month") || normalized.includes("week") || normalized.includes("day") || normalized.endsWith("m") || normalized.endsWith("w") || normalized.endsWith("d")) {
    return num / 12;
  }
  return num;
}

function isSaturdayDate(dateInput: string | Date): boolean {
  return dayNameOf(dateInput) === "Saturday";
}

function include() {
  return {
    test: { select: { id: true, name: true, active: true } },
    location: { select: { id: true, name: true, active: true, qrCodeUrl: true, mapLink: true, address: true, showContactToTechnicians: true } },
    createdBy: { select: { id: true, name: true, email: true } }
  };
}

appointmentsRouter.get("/", async (req, res, next) => {
  try {
    const q = String(req.query.q || "");
    const dateQuery = String(req.query.date || "");
    const date = /^\d{4}-\d{2}-\d{2}/.test(dateQuery) ? dayRange(dateQuery) : undefined;

    const isOperator = req.user?.role === "OPERATOR";
    // For Machine Operator: force date to today's date range (only same day appointments)
    const effectiveDate = isOperator ? dayRange(todayStr()) : date;

    // Enforce locationId for technicians and operators if they have one allotted
    let locationFilter: any = {};
    if ((req.user?.role === "TECHNICIAN" || isOperator) && req.user?.locationId) {
      locationFilter = { locationId: req.user.locationId };
    } else if (req.query.locationId) {
      locationFilter = { locationId: String(req.query.locationId) };
    }

    // Support multiple test IDs in query (e.g. testId=id1,id2)
    let requestedTestIds: string[] = [];
    if (req.query.testId) {
      if (Array.isArray(req.query.testId)) {
        requestedTestIds = (req.query.testId as string[]).flatMap(s => String(s).split(","));
      } else {
        requestedTestIds = String(req.query.testId).split(",");
      }
      requestedTestIds = requestedTestIds.map(s => s.trim()).filter(Boolean);
    }

    // Enforce testType restrictions for technicians and operators if they have specific ones allotted
    let testFilter: any = {};
    if ((req.user?.role === "TECHNICIAN" || isOperator) && req.user?.testTypes && req.user.testTypes.length > 0) {
      const allowedTestIds = req.user.testTypes.map((t: any) => t.id);
      if (requestedTestIds.length > 0) {
        const validIds = requestedTestIds.filter(id => allowedTestIds.includes(id));
        testFilter = { testId: validIds.length > 0 ? { in: validIds } : "none-allowed" };
      } else {
        testFilter = { testId: { in: allowedTestIds } };
      }
    } else if (requestedTestIds.length > 0) {
      if (requestedTestIds.length === 1) {
        testFilter = { testId: requestedTestIds[0] };
      } else {
        testFilter = { testId: { in: requestedTestIds } };
      }
    }

    // Status filter: Machine Operator only sees appointments after status changed to ARRIVED
    let statusFilter: any = {};
    if (isOperator) {
      const allowedOperatorStatuses = ["ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED"];
      if (req.query.status && allowedOperatorStatuses.includes(String(req.query.status))) {
        statusFilter = { status: String(req.query.status) };
      } else {
        statusFilter = { status: { in: allowedOperatorStatuses } };
      }
    } else if (req.query.status) {
      statusFilter = { status: String(req.query.status) };
    }

    // Filters that touch the same field (date ranges, OR groups) are combined
    // with AND so one filter can never silently overwrite another.
    const and: any[] = [];
    if (effectiveDate) {
      and.push({ appointmentDate: { gte: effectiveDate.start, lt: effectiveDate.end } });
    } else if (req.query.month) {
      // Month filter: format "YYYY-MM" — applied only when no specific date is set
      const [yyyy, mm] = String(req.query.month).split("-").map(Number);
      if (!isNaN(yyyy) && !isNaN(mm) && mm >= 1 && mm <= 12) {
        and.push({ appointmentDate: { gte: new Date(Date.UTC(yyyy, mm - 1, 1)), lt: new Date(Date.UTC(yyyy, mm, 1)) } });
      }
    }
    if (req.query.futureOnly === "true") {
      and.push({ appointmentDate: { gte: dayRange(todayStr()).start } });
    }
    if (req.query.referredBy) {
      and.push({
        OR: [
          { referredBy: String(req.query.referredBy) },
          { createdById: String(req.query.referredBy) },
          ...(req.user && String(req.query.referredBy) === req.user.id ? [
            { referredBy: { contains: req.user.name, mode: "insensitive" as const } }
          ] : [])
        ]
      });
    }
    if (q) {
      and.push({
        OR: [
          { patientName: { contains: q, mode: "insensitive" } },
          { phoneNumber: { contains: q } },
          { bookingId: { contains: q, mode: "insensitive" } },
          { referredBy: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } }
        ]
      });
    }

    const creatorRole = String(req.query.creatorRole || "");
    const where: any = {
      ...statusFilter,
      ...testFilter,
      ...locationFilter,
      ...(req.query.createdById ? { createdById: String(req.query.createdById) } : {}),
      ...(Object.values(Role).includes(creatorRole as Role) ? { createdBy: { role: creatorRole as Role } } : {}),
      ...(req.query.proName ? {
        referredBy: { equals: String(req.query.proName), mode: "insensitive" as const }
      } : {}),
      ...(and.length > 0 ? { AND: and } : {})
    };

    if (req.query.page) {
      const page = Math.max(Number(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
      const skip = (page - 1) * limit;

      // Support custom sort for Recent mode
      const sortBy = String(req.query.sortBy || "appointmentDate");
      const sortOrder = String(req.query.sortOrder || "asc") === "desc" ? "desc" : "asc";
      const allowedSortFields = ["appointmentDate", "createdAt", "updatedAt"];
      const orderByField = allowedSortFields.includes(sortBy) ? sortBy : "appointmentDate";
      const orderBy: any[] = orderByField === "appointmentDate"
        ? [{ appointmentDate: sortOrder }, { slot: sortOrder }]
        : [{ [orderByField]: sortOrder }];

      const isAdmin = req.user?.role === "ADMIN";
      const aggregateWhere = where.status ? where : { ...where, status: { not: "CANCELLED" as const } };

      const [total, rows, aggregateResult, statusCounts, advanceCountResult] = await Promise.all([
        prisma.appointment.count({ where }),
        prisma.appointment.findMany({
          where,
          include: include(),
          orderBy,
          skip,
          take: limit
        }),
        isAdmin
          ? prisma.appointment.aggregate({
              where: aggregateWhere,
              _sum: { totalPrice: true, advanceReceived: true }
            })
          : Promise.resolve({ _sum: { totalPrice: null, advanceReceived: null } }),
        prisma.appointment.groupBy({
          by: ["status"],
          where,
          _count: { status: true }
        }),
        prisma.appointment.count({
          where: {
            ...aggregateWhere,
            advanceReceived: { gt: 0 }
          }
        })
      ]);

      let pending = 0;
      let completed = 0;
      let cancelled = 0;
      statusCounts.forEach((c) => {
        const count = c._count.status;
        if (["BOOKED", "CONFIRMED", "ON_THE_WAY"].includes(c.status)) {
          pending += count;
        } else if ((SCAN_STATUSES as readonly string[]).includes(c.status)) {
          completed += count;
        } else if (c.status === "CANCELLED") {
          cancelled += count;
        }
      });

      const responseRows = rows.map((r) => forViewer(req.user!, r));

      const totalRevenue = aggregateResult._sum.totalPrice ?? 0;
      const totalAdvance = aggregateResult._sum.advanceReceived ?? 0;
      const totalPendingPayment = Math.max(totalRevenue - totalAdvance, 0);

      res.json({
        data: responseRows,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary: {
          total,
          pending,
          completed,
          cancelled,
          advanceCount: advanceCountResult,
          totalRevenue: isAdmin ? totalRevenue : null,
          totalPendingPayment: isAdmin ? totalPendingPayment : null
        }
      });
    } else {
      const unpaginatedLimit = req.query.limit ? Math.max(Number(req.query.limit), 1) : (q ? 50 : undefined);
      const rows = await prisma.appointment.findMany({
        where,
        include: include(),
        orderBy: [{ appointmentDate: "asc" }, { slot: "asc" }],
        take: unpaginatedLimit
      });
      res.json(rows.map((r) => forViewer(req.user!, r)));
    }
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/availability", async (req, res, next) => {
  try {
    const testId = String(req.query.testId);
    const locationId = String(req.query.locationId);
    const date = String(req.query.date);
    const ignoreAppointmentId = req.query.ignoreAppointmentId ? String(req.query.ignoreAppointmentId) : undefined;
    
    if (!testId || !locationId || !/^\d{4}-\d{2}-\d{2}/.test(date) || testId === "undefined" || locationId === "undefined") {
      return res.json([]);
    }

    res.json(await slotAvailability(prisma, testId, locationId, date, ignoreAppointmentId));
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.get("/upcoming-availability", async (req, res, next) => {
  try {
    const testId = String(req.query.testId);
    const locationId = String(req.query.locationId);
    const requested = String(req.query.startDate || "");
    // Never start before today in the center's timezone (browser UTC dates can lag by a day).
    const startDate = /^\d{4}-\d{2}-\d{2}/.test(requested) && requested.slice(0, 10) > todayStr() ? requested : todayStr();
    const days = Math.min(Math.max(parseInt(String(req.query.days || "7"), 10) || 7, 1), 14);

    if (!testId || !locationId || testId === "undefined" || locationId === "undefined") {
      return res.json([]);
    }

    res.json(await upcomingAvailability(prisma, testId, locationId, startDate, days));
  } catch (error) {
    next(error);
  }
});

function validateAppointmentDate(dateInput: string | Date) {
  if (toDateStr(dateInput) < todayStr()) {
    throw new HttpError(400, "Bookings cannot be scheduled for past dates.");
  }
}

appointmentsRouter.post("/", async (req, res, next) => {
  try {
    const body = appointmentBody.parse(req.body);
    if (READ_ONLY_ROLES.includes(req.user!.role) || req.user!.role === "OPERATOR") {
      return res.status(403).json({ message: "Your account cannot create appointments." });
    }
    if (req.user?.role !== "ADMIN" && req.user?.role !== "FRONTDESK") {
      delete body.totalPrice;
      delete body.advanceReceived;
    }
    if (req.user?.role === "TECHNICIAN") {
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { testTypes: { select: { id: true } } }
      });
      if (!dbUser?.canCreateAppointments) {
        return res.status(403).json({ message: "You do not have permission to create appointments." });
      }
      if (dbUser.testTypes.length > 0) {
        const allowedIds = dbUser.testTypes.map(t => t.id);
        if (!allowedIds.includes(body.testId)) {
          return res.status(403).json({ message: "You are not authorized to book this test type." });
        }
      }
      if (dbUser.locationId && dbUser.locationId !== body.locationId) {
        return res.status(403).json({ message: "You can only book appointments for your allotted center." });
      }
    }
    validateAppointmentDate(body.appointmentDate);

    // Enforce patientAge if test is DTPA
    const test = await prisma.testType.findUnique({
      where: { id: body.testId },
      select: { name: true }
    });
    if (test && test.name.toLowerCase() === "dtpa") {
      if (!body.patientAge) {
        return res.status(400).json({ message: "Patient age is required for DTPA test" });
      }
      if (isSaturdayDate(body.appointmentDate)) {
        const ageVal = parseAgeInYears(body.patientAge);
        if (ageVal === null || ageVal < 15) {
          return res.status(400).json({ message: "Patient must be older than 15 years to register for a DTPA scan on Saturdays." });
        }
      }
    }

    const isHSG = test ? test.name.toLowerCase().includes("hsg") : false;
    if (isHSG) {
      if (!body.referredDoctor || !body.referredDoctor.trim()) {
        return res.status(400).json({ message: "Referred doctor name is required for HSG test" });
      }
    }

    // Fetch the location name to check if it's Gwalior or Dehradun
    const location = await prisma.location.findUnique({
      where: { id: body.locationId },
      select: { name: true }
    });
    if (!location) {
      return res.status(400).json({ message: "Location center not found" });
    }
    const isSpecialLocation = 
      location.name.toLowerCase().includes("gwalior") || 
      location.name.toLowerCase().includes("dehradun");
    if (!isSpecialLocation && !isHSG) {
      body.referredDoctor = undefined;
    }

    if (body.referredBy) {
      const match = await prisma.proName.findFirst({
        where: { name: { equals: body.referredBy, mode: "insensitive" } }
      });
      if (!match) {
        return res.status(400).json({ message: "Please select a valid PRO Name from the dropdown list. Custom names are not allowed." });
      }
    }

    const range = dayRange(body.appointmentDate);
    // Allow same phone number for multiple bookings (e.g. different family members) on the same day/location

    const appointment = await prisma.$transaction(async (tx) => {
      // Admins may still book a walk-in into a slot whose time has passed today.
      await assertSlotHasCapacity(tx, body.testId, body.locationId, body.appointmentDate, body.slot, { allowPast: req.user!.role === "ADMIN" });
      const bookingId = `DC-${todayStr().replaceAll("-", "")}-${Math.floor(100000 + Math.random() * 900000)}`;
      const created = await tx.appointment.create({
        data: {
          ...body,
          advanceMethod: body.advanceMethod || "UPI",
          remainingMethod: body.remainingMethod || "UPI",
          subTest: body.subTest || null,
          phoneNumber: body.phoneNumber || null,
          appointmentDate: new Date(body.appointmentDate),
          bookingId,
          createdById: req.user!.id
        },
        include: include()
      });
      await tx.statusHistory.create({ data: { appointmentId: created.id, userId: req.user!.id, toStatus: "BOOKED" } });
      return created;
    });
    await activity(req.user!.id, appointment.id, "Appointment Created");
    await audit(req, { appointmentId: appointment.id, action: "APPOINTMENT_CREATED", newValue: appointment });
    emitRealtime("appointment:changed", { id: appointment.id });
    emitRealtime("slots:changed", { testId: body.testId, locationId: body.locationId, date: body.appointmentDate });
    res.status(201).json(appointment);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: error.errors });
    }
    next(error);
  }
});

appointmentsRouter.get("/:id", async (req, res) => {
  const appointment = await prisma.appointment.findUnique({
    where: { id: req.params.id },
    include: {
      ...include(),
      audits: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "desc" }
      },
      activities: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" }
      },
      statusHistory: {
        include: { user: { select: { name: true, role: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  });
  if (!appointment || isOutOfScope(req.user!, appointment)) return res.status(404).json({ message: "Not found" });
  const visible = forViewer(req.user!, appointment);
  if (hidePhoneFrom(req.user!, appointment)) {
    // Audit/activity entries embed the full appointment, including the phone number.
    visible.audits = [];
    visible.activities = visible.activities.map((a) => ({ ...a, message: a.message.replace(/Phone: "[^"]*" -> "[^"]*"(, )?/g, "") }));
  }
  res.json(visible);
});

appointmentsRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = appointmentBody.partial().extend({
      status: z.enum(["BOOKED", "CONFIRMED", "ON_THE_WAY", "ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED", "CANCELLED"]).optional()
    }).parse(req.body);
    if (req.user?.role !== "ADMIN" && req.user?.role !== "FRONTDESK" && req.user?.role !== "TECHNICIAN") {
      delete body.totalPrice;
      delete body.advanceReceived;
      delete body.advanceMethod;
      delete body.remainingMethod;
    }
    if (req.user?.role === "OPERATOR" && body.status) {
      const allowedOperatorStatuses = ["ARRIVED", "SCAN_STARTED", "SCAN_DONE", "REPORT_DELIVERED"];
      if (!allowedOperatorStatuses.includes(body.status)) {
        return res.status(403).json({ message: "Machine Operator accounts can only set scan statuses (Scan Started, Scan Done, Report Delivered)." });
      }
    }
    const user = req.user!;
    if (READ_ONLY_ROLES.includes(user.role)) {
      return res.status(403).json({ message: "Your account has read-only access." });
    }
    if (user.role === "OPERATOR" && Object.keys(body).some((k) => k !== "status")) {
      return res.status(403).json({ message: "Machine Operator accounts can only update the scan status." });
    }

    const old = await prisma.appointment.findUnique({
      where: { id: req.params.id },
      include: { location: { select: { showContactToTechnicians: true } } }
    });
    if (!old || isOutOfScope(user, old)) return res.status(404).json({ message: "Not found" });
    if (user.role === "MARKETING" && old.createdById !== user.id) {
      return res.status(403).json({ message: "You can only update appointments you created." });
    }
    if (isOutOfScope(user, { locationId: body.locationId ?? old.locationId, testId: body.testId ?? old.testId })) {
      return res.status(403).json({ message: "You can only move appointments within your allotted center and tests." });
    }
    if (hidePhoneFrom(user, old)) {
      // The phone was hidden from this technician, so whatever the form sent back is not a real edit.
      delete body.phoneNumber;
    }

    if (body.referredBy) {
      const match = await prisma.proName.findFirst({
        where: { name: { equals: body.referredBy, mode: "insensitive" } }
      });
      if (!match) {
        return res.status(400).json({ message: "Please select a valid PRO Name from the dropdown list. Custom names are not allowed." });
      }
    }

    if (body.appointmentDate) {
      const oldDateStr = old.appointmentDate.toISOString().slice(0, 10);
      const newDateStr = body.appointmentDate.slice(0, 10);
      if (newDateStr !== oldDateStr) {
        validateAppointmentDate(body.appointmentDate);
      }
    }

    const nextTestId = body.testId || old.testId;
    const test = await prisma.testType.findUnique({
      where: { id: nextTestId },
      select: { name: true }
    });
    if (test && test.name.toLowerCase() === "dtpa") {
      const age = body.patientAge !== undefined ? body.patientAge : old.patientAge;
      if (!age) {
        return res.status(400).json({ message: "Patient age is required for DTPA test" });
      }
      const nextDate = body.appointmentDate || old.appointmentDate;
      if (isSaturdayDate(nextDate)) {
        const ageVal = parseAgeInYears(age);
        if (ageVal === null || ageVal < 15) {
          return res.status(400).json({ message: "Patient must be older than 15 years to register for a DTPA scan on Saturdays." });
        }
      }
    }

    const isHSG = test ? test.name.toLowerCase().includes("hsg") : false;
    if (isHSG) {
      const refDoc = body.referredDoctor !== undefined ? body.referredDoctor : (old as any).referredDoctor;
      if (!refDoc || !refDoc.trim()) {
        return res.status(400).json({ message: "Referred doctor name is required for HSG test" });
      }
    }

    const nextLocationId = body.locationId !== undefined ? body.locationId : old.locationId;
    if (nextLocationId) {
      const location = await prisma.location.findUnique({
        where: { id: nextLocationId },
        select: { name: true }
      });
      if (!location) {
        return res.status(400).json({ message: "Location center not found" });
      }
      const isSpecialLocation = 
        location.name.toLowerCase().includes("gwalior") || 
        location.name.toLowerCase().includes("dehradun");
      if (!isSpecialLocation && !isHSG) {
        body.referredDoctor = null as any;
      }
    }
    const updated = await prisma.$transaction(async (tx) => {
      const nextTest = body.testId || old.testId;
      const nextLocation = body.locationId || old.locationId;
      const nextDate = body.appointmentDate || old.appointmentDate;
      const nextSlot = body.slot || old.slot;
      const rescheduled = nextTest !== old.testId || toDateStr(nextDate) !== toDateStr(old.appointmentDate) || nextSlot !== old.slot || nextLocation !== old.locationId;
      if (body.status !== "CANCELLED" && rescheduled) {
        await assertSlotHasCapacity(tx, nextTest, nextLocation || "", nextDate, nextSlot, {
          ignoreAppointmentId: old.id,
          allowPast: user.role === "ADMIN"
        });
      }
      const row = await tx.appointment.update({
        where: { id: old.id },
        data: {
          ...body,
          phoneNumber: body.phoneNumber === undefined ? undefined : (body.phoneNumber || null),
          appointmentDate: body.appointmentDate ? new Date(body.appointmentDate) : undefined
        },
        include: include()
      });
      if (body.status && body.status !== old.status) {
        await tx.statusHistory.create({ data: { appointmentId: old.id, userId: req.user!.id, fromStatus: old.status, toStatus: body.status } });
      }
      return row;
    });

    const changes: string[] = [];
    if (body.patientName && body.patientName !== old.patientName) {
      changes.push(`Name: "${old.patientName}" -> "${body.patientName}"`);
    }
    if (body.phoneNumber !== undefined && body.phoneNumber !== old.phoneNumber) {
      changes.push(`Phone: "${old.phoneNumber || "None"}" -> "${body.phoneNumber || "None"}"`);
    }
    if (body.patientAge !== undefined && body.patientAge !== (old as any).patientAge) {
      changes.push(`Patient Age: "${(old as any).patientAge || ""}" -> "${body.patientAge || ""}"`);
    }
    if (body.referredBy !== undefined && body.referredBy !== old.referredBy) {
      changes.push(`Referred By: "${old.referredBy || ""}" -> "${body.referredBy || ""}"`);
    }
    if (body.referredDoctor !== undefined && body.referredDoctor !== (old as any).referredDoctor) {
      changes.push(`Referred Doctor: "${(old as any).referredDoctor || ""}" -> "${body.referredDoctor || ""}"`);
    }
    if (body.cityHospital !== undefined && body.cityHospital !== (old as any).cityHospital) {
      changes.push(`City/Hospital: "${(old as any).cityHospital || ""}" -> "${body.cityHospital || ""}"`);
    }
    if (body.notes !== undefined && body.notes !== old.notes) {
      changes.push(`Notes: "${old.notes || ""}" -> "${body.notes || ""}"`);
    }
    if (body.appointmentDate) {
      const oldD = new Date(old.appointmentDate).toISOString().slice(0, 10);
      const newD = new Date(body.appointmentDate).toISOString().slice(0, 10);
      if (oldD !== newD) {
        changes.push(`Date: "${oldD}" -> "${newD}"`);
      }
    }
    if (body.slot && body.slot !== old.slot) {
      changes.push(`Slot: "${old.slot}" -> "${body.slot}"`);
    }
    if (body.status && body.status !== old.status) {
      changes.push(`Status: "${old.status}" -> "${body.status}"`);
    }
    if (body.locationId && body.locationId !== old.locationId) {
      const oldLoc = old.locationId ? await prisma.location.findUnique({ where: { id: old.locationId } }) : null;
      const newLoc = await prisma.location.findUnique({ where: { id: body.locationId } });
      changes.push(`Location: "${oldLoc?.name || "None"}" -> "${newLoc?.name || ""}"`);
    }
    if (body.testId && body.testId !== old.testId) {
      const oldTest = await prisma.testType.findUnique({ where: { id: old.testId } });
      const newTest = await prisma.testType.findUnique({ where: { id: body.testId } });
      changes.push(`Test: "${oldTest?.name || ""}" -> "${newTest?.name || ""}"`);
    }
    if (body.totalPrice !== undefined && body.totalPrice !== old.totalPrice) {
      changes.push(`Total Price: ₹${old.totalPrice ?? 0} -> ₹${body.totalPrice}`);
    }
    if (body.advanceReceived !== undefined && body.advanceReceived !== old.advanceReceived) {
      changes.push(`Advance: ₹${old.advanceReceived ?? 0} -> ₹${body.advanceReceived}`);
    }
    if (body.advanceMethod !== undefined && body.advanceMethod !== old.advanceMethod) {
      changes.push(`Advance Method: "${old.advanceMethod || "None"}" -> "${body.advanceMethod || "None"}"`);
    }
    if (body.remainingMethod !== undefined && body.remainingMethod !== old.remainingMethod) {
      changes.push(`Remaining Method: "${old.remainingMethod || "None"}" -> "${body.remainingMethod || "None"}"`);
    }
    if (body.subTest !== undefined && body.subTest !== old.subTest) {
      changes.push(`Specific Test: "${old.subTest || "None"}" -> "${body.subTest || "None"}"`);
    }

    const message = changes.length > 0 ? `Updated: ${changes.join(", ")}` : "Appointment Updated";
    await activity(req.user!.id, old.id, message);
    await audit(req, { appointmentId: old.id, action: "APPOINTMENT_UPDATED", oldValue: old, newValue: updated });
    emitRealtime("appointment:changed", { id: updated.id });
    emitRealtime("slots:changed", { testId: updated.testId, locationId: updated.locationId, date: updated.appointmentDate });
    res.json(forViewer(user, updated));
  } catch (error) {
    next(error);
  }
});

appointmentsRouter.delete("/:id", requireRole(Role.ADMIN), async (req, res) => {
  const old = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!old) return res.status(404).json({ message: "Not found" });
  await prisma.$transaction(async (tx) => {
    // Child rows reference the appointment; audit entries are kept (unlinked) as a trail.
    await tx.activityLog.deleteMany({ where: { appointmentId: old.id } });
    await tx.statusHistory.deleteMany({ where: { appointmentId: old.id } });
    await tx.auditLog.updateMany({ where: { appointmentId: old.id }, data: { appointmentId: null } });
    await tx.appointment.delete({ where: { id: old.id } });
  });
  await audit(req, { action: "APPOINTMENT_DELETED", oldValue: old });
  emitRealtime("appointment:changed", { deleted: old.id });
  emitRealtime("slots:changed", { testId: old.testId, locationId: old.locationId, date: old.appointmentDate });
  res.json({ ok: true });
});
