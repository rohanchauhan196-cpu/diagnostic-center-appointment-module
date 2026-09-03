import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";
import { activity, audit } from "../services/audit.js";
import { assertSlotHasCapacity, dayRange, slotAvailability } from "../services/slots.js";
import { emitRealtime } from "../config/socket.js";

export const appointmentsRouter = Router();
appointmentsRouter.use(requireAuth);

const appointmentBody = z.object({
  patientName: z.string().min(2).transform(s => s.trim()),
  phoneNumber: z.string().regex(/^\+?[0-9]{10,15}$/, "Phone must be 10–15 digits").or(z.literal("")).optional().nullable(),
  patientAge: z.string().optional().nullable(),
  testId: z.string(),
  locationId: z.string(),
  appointmentDate: z.string(),
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
  const dateStr = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  const datePart = dateStr.slice(0, 10); // YYYY-MM-DD
  const [year, month, day] = datePart.split("-").map(Number);
  const localAppDate = new Date(year, month - 1, day);
  return localAppDate.getDay() === 6;
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
    const date = (dateQuery && dateQuery !== "undefined") ? dayRange(dateQuery) : undefined;

    const isOperator = req.user?.role === "OPERATOR";
    // For Machine Operator: force date to today's date range (only same day appointments)
    const effectiveDate = isOperator ? dayRange(new Date()) : date;

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

    const where: any = {
      ...(effectiveDate ? { appointmentDate: { gte: effectiveDate.start, lt: effectiveDate.end } } : {}),
      ...statusFilter,
      ...testFilter,
      ...locationFilter,
      ...(req.query.createdById ? { createdById: String(req.query.createdById) } : {}),
      ...(req.query.creatorRole ? { createdBy: { role: req.query.creatorRole as any } } : {}),
      ...(req.query.referredBy ? {
        OR: [
          { referredBy: String(req.query.referredBy) },
          { createdById: String(req.query.referredBy) },
          ...(req.user && String(req.query.referredBy) === req.user.id ? [
            { referredBy: { contains: req.user.name, mode: "insensitive" as const } }
          ] : [])
        ]
      } : {}),
      ...(req.query.futureOnly === "true" ? {
        appointmentDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
      } : {}),
      ...(q ? { OR: [
        { patientName: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q } },
        { bookingId: { contains: q, mode: "insensitive" } },
        { referredBy: { contains: q, mode: "insensitive" } },
        { notes: { contains: q, mode: "insensitive" } }
      ] } : {})
    };

    if (req.query.page) {
      const page = Math.max(Number(req.query.page), 1);
      const limit = Math.max(Number(req.query.limit || 50), 1);
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
              where,
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
            ...where,
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
        } else if (["ARRIVED"].includes(c.status)) {
          completed += count;
        } else if (c.status === "CANCELLED") {
          cancelled += count;
        }
      });

      const responseRows = (isAdmin || req.user?.role === "FRONTDESK" || req.user?.role === "TECHNICIAN")
        ? rows
        : rows.map(r => ({
            ...r,
            totalPrice: null,
            advanceReceived: null
          }));

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
      const responseRows = (req.user?.role === "ADMIN" || req.user?.role === "FRONTDESK" || req.user?.role === "TECHNICIAN")
        ? rows
        : rows.map(r => ({
            ...r,
            totalPrice: null,
            advanceReceived: null
          }));
      res.json(responseRows);
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
    
    if (!testId || !locationId || !date || testId === "undefined" || locationId === "undefined") {
      return res.json([]);
    }
    
    res.json(await slotAvailability(prisma, testId, locationId, date, ignoreAppointmentId));
  } catch (error) {
    next(error);
  }
});

function validateAppointmentDate(dateInput: string | Date) {
  const dateStr = dateInput instanceof Date ? dateInput.toISOString() : String(dateInput);
  const datePart = dateStr.slice(0, 10); // YYYY-MM-DD
  const [year, month, day] = datePart.split("-").map(Number);
  const localAppDate = new Date(year, month - 1, day);

  // Backdate check
  const today = new Date();
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (localAppDate < todayLocal) {
    throw new Error("Bookings cannot be scheduled for past dates.");
  }
}

/** Validate that the selected day is allowed for the test at the given location.
 *  Checks per-center schedule (TestLocationSchedule) first; falls back to
 *  the global TestType.workDays.  If neither restricts, the day is allowed. */
async function validateWorkDayForCenter(testId: string, locationId: string, dateStr: string) {
  const datePart = String(dateStr).slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayName = DAYS[localDate.getDay()];

  // 1. Check per-center override (safe fallback if table not yet on client)
  try {
    const centerSchedule = await (prisma as any).testLocationSchedule.findUnique({
      where: { testId_locationId: { testId, locationId } }
    });

    if (centerSchedule && centerSchedule.workDays.length > 0) {
      if (!centerSchedule.workDays.includes(dayName)) {
        const location = await prisma.location.findUnique({ where: { id: locationId }, select: { name: true } });
        throw new Error(`This test is not available at ${location?.name ?? "this center"} on ${dayName}s.`);
      }
      return; // per-center schedule says OK
    }
  } catch (e: any) {
    // If the error is our own validation error, rethrow it
    if (e?.message?.includes("not available")) throw e;
    // Otherwise table not ready — fall through to global check
  }

  // 2. Fall back to global TestType.workDays
  const test = await prisma.testType.findUnique({ where: { id: testId }, select: { workDays: true, name: true } });
  if (test && test.workDays && test.workDays.length > 0) {
    if (!test.workDays.includes(dayName)) {
      throw new Error(`"${test.name}" is not available on ${dayName}s.`);
    }
  }
}


appointmentsRouter.post("/", async (req, res, next) => {
  try {
    const body = appointmentBody.parse(req.body);
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
    // Validate working day per-center (or fallback to global)
    await validateWorkDayForCenter(body.testId, body.locationId, body.appointmentDate);

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
      await assertSlotHasCapacity(tx, body.testId, body.locationId, body.appointmentDate, body.slot);
      const bookingId = `DC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${Math.floor(100000 + Math.random() * 900000)}`;
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
    emitRealtime("appointment:changed", appointment);
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
  if (!appointment) return res.status(404).json({ message: "Not found" });
  if (req.user?.role !== "ADMIN" && req.user?.role !== "FRONTDESK" && req.user?.role !== "TECHNICIAN") {
    appointment.totalPrice = null;
    appointment.advanceReceived = null;
  }
  res.json(appointment);
});

appointmentsRouter.patch("/:id", async (req, res) => {
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
    const old = await prisma.appointment.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ message: "Not found" });

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
      if (body.status !== "CANCELLED" && (nextTest !== old.testId || String(nextDate) !== String(old.appointmentDate) || nextSlot !== old.slot || nextLocation !== old.locationId)) {
        await assertSlotHasCapacity(tx, nextTest, nextLocation || "", nextDate, nextSlot, old.id);
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
    emitRealtime("appointment:changed", updated);
    emitRealtime("slots:changed", { testId: updated.testId, locationId: updated.locationId, date: updated.appointmentDate });
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "Update failed" });
  }
});

appointmentsRouter.delete("/:id", async (req, res) => {
  const old = await prisma.appointment.findUnique({ where: { id: req.params.id } });
  if (!old) return res.status(404).json({ message: "Not found" });
  await prisma.appointment.delete({ where: { id: old.id } });
  await audit(req, { appointmentId: old.id, action: "APPOINTMENT_DELETED", oldValue: old });
  emitRealtime("appointment:changed", { deleted: old.id });
  emitRealtime("slots:changed", { testId: old.testId, locationId: old.locationId, date: old.appointmentDate });
  res.json({ ok: true });
});
