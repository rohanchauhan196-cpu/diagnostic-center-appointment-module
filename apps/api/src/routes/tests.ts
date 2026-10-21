import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";

export const testsRouter = Router();
testsRouter.use(requireAuth);

testsRouter.get("/", async (req, res) => {
  const locationId = req.query.locationId ? String(req.query.locationId) : undefined;
  const showAll = req.query.all === "true"; // admin can see inactive tests too

  const tests = await prisma.testType.findMany({
    where: showAll ? {} : { active: true },
    include: {
      slots: {
        where: locationId ? { OR: [{ locationId }, { locationId: null }] } : undefined,
        orderBy: { sortOrder: "asc" }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  // If a locationId is given, fetch per-center schedules in a single separate query
  let scheduleMap: Record<string, string[]> = {};
  if (locationId) {
    try {
      const schedules = await (prisma as any).testLocationSchedule.findMany({
        where: { locationId }
      });
      for (const s of schedules) {
        scheduleMap[s.testId] = s.workDays;
      }
    } catch (_) {
      // Table may not exist yet on older deployments — safe fallback
    }
  }

  const result = tests.map((t) => {
    let effectiveSlots = t.slots;
    if (locationId) {
      const centerSlots = t.slots.filter((s) => s.locationId === locationId);
      if (centerSlots.length > 0) {
        effectiveSlots = centerSlots;
      } else {
        effectiveSlots = t.slots.filter((s) => s.locationId === null);
      }
    }
    return {
      ...t,
      slots: effectiveSlots,
      locationWorkDays: locationId && scheduleMap[t.id] ? scheduleMap[t.id] : null
    };
  }).sort((a, b) => {
    const sortA = (a as any).sortOrder ?? 0;
    const sortB = (b as any).sortOrder ?? 0;
    if (sortA !== sortB) return sortA - sortB;
    const aIsPet = a.name.toUpperCase().includes("PET CT");
    const bIsPet = b.name.toUpperCase().includes("PET CT");
    if (aIsPet && !bIsPet) return -1;
    if (!aIsPet && bIsPet) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json(result);
});

testsRouter.post("/reorder", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      orderedIds: z.array(z.string())
    }).parse(req.body);

    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.testType.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

testsRouter.post("/", requireRole(Role.ADMIN), async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    color: z.string().optional(),
    sortOrder: z.number().optional(),
    workDays: z.array(z.string()).optional(),
    instructions: z.string().optional()
  }).parse(req.body);
  const test = await prisma.testType.create({ data: body });
  await audit(req, { action: "TEST_CREATED", newValue: test });
  res.status(201).json(test);
});

const weekDay = z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
const slotDay = z.union([z.literal("All"), weekDay]);

testsRouter.put("/:testId/slots", requireRole(Role.ADMIN), async (req, res) => {
  const body = z.object({
    locationId: z.string(),
    dayOfWeek: slotDay.optional().default("All"),
    // Extra days to receive the same slot set in one save (e.g. copy Monday's slots to Tue–Fri).
    applyToDays: z.array(slotDay).optional().default([]),
    slots: z.array(z.object({
      label: z.string().trim().min(1),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Start time must be HH:mm").nullable().optional(),
      capacity: z.number().int().positive(),
      sortOrder: z.number().int(),
      active: z.boolean().optional().default(true)
    })),
    // Optional per-center working days; null/undefined = inherit from test global setting
    workDays: z.array(weekDay).nullable().optional()
  }).parse(req.body);

  const labels = body.slots.map((s) => s.label.toLowerCase());
  const duplicate = labels.find((l, i) => labels.indexOf(l) !== i);
  if (duplicate) {
    return res.status(400).json({ message: `Duplicate slot label "${body.slots[labels.indexOf(duplicate)].label}". Each slot needs a unique name.` });
  }

  const days = [...new Set([body.dayOfWeek, ...body.applyToDays])];
  await prisma.$transaction(async (tx) => {
    // Replace slot rows for this (test, location) on each selected day
    await tx.slotConfiguration.deleteMany({
      where: { testId: req.params.testId, locationId: body.locationId, dayOfWeek: { in: days } }
    });
    await tx.slotConfiguration.createMany({
      data: days.flatMap((dayOfWeek) => body.slots.map((slot) => ({
        ...slot,
        startTime: slot.startTime || null,
        testId: req.params.testId,
        locationId: body.locationId,
        dayOfWeek
      })))
    });
    if (body.workDays) {
      await tx.testLocationSchedule.upsert({
        where: { testId_locationId: { testId: req.params.testId, locationId: body.locationId } },
        create: { testId: req.params.testId, locationId: body.locationId, workDays: body.workDays },
        update: { workDays: body.workDays }
      });
    }
  });

  await audit(req, { action: "SLOTS_UPDATED", newValue: { ...body, testId: req.params.testId, days } });
  res.json({ ok: true, days });
});

testsRouter.patch("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(2).optional(),
      color: z.string().optional(),
      sortOrder: z.number().optional(),
      active: z.boolean().optional(),
      workDays: z.array(z.string()).optional(),
      instructions: z.string().optional()
    }).parse(req.body);
    const old = await prisma.testType.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ message: "Test not found" });
    const test = await prisma.testType.update({ where: { id: req.params.id }, data: body });
    await audit(req, { action: "TEST_UPDATED", oldValue: old, newValue: test });
    res.json(test);
  } catch (error) {
    next(error);
  }
});



testsRouter.delete("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const test = await prisma.testType.findUnique({ where: { id: req.params.id } });
    if (!test) return res.status(404).json({ message: "Test not found" });

    const bookingCount = await prisma.appointment.count({ where: { testId: req.params.id } });
    if (bookingCount > 0) {
      return res.status(409).json({
        message: `Cannot delete "${test.name}" — it has ${bookingCount} existing booking(s). Deactivate it instead.`
      });
    }

    await prisma.$transaction([
      prisma.slotConfiguration.deleteMany({ where: { testId: req.params.id } }),
      prisma.testType.delete({ where: { id: req.params.id } })
    ]);

    await audit(req, { action: "TEST_DELETED", oldValue: test });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// ─── Date Blocks ────────────────────────────────────────────────────────────
// Block a test from being booked on a specific date (optionally per-center).

/** GET /tests/:testId/date-blocks — list all blocks for a test */
testsRouter.get("/:testId/date-blocks", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const blocks = await prisma.testDateBlock.findMany({
      where: { testId: req.params.testId },
      include: {
        location: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } }
      },
      orderBy: { date: "asc" }
    });
    res.json(blocks);
  } catch (error) {
    next(error);
  }
});

/** POST /tests/:testId/date-blocks — create a date block */
testsRouter.post("/:testId/date-blocks", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
      locationId: z.string().optional().nullable(), // null = all centers
      reason: z.string().max(500).optional().nullable()
    }).parse(req.body);

    const test = await prisma.testType.findUnique({ where: { id: req.params.testId } });
    if (!test) return res.status(404).json({ message: "Test not found" });

    // Parse date as UTC midnight (same as appointmentDate storage)
    const [y, m, d] = body.date.split("-").map(Number);
    const dateUTC = new Date(Date.UTC(y, m - 1, d));
    const locId = body.locationId ?? null;

    // Prisma upsert doesn't support null in compound unique where — use findFirst+update/create instead
    const existing = await prisma.testDateBlock.findFirst({
      where: { testId: req.params.testId, locationId: locId, date: dateUTC }
    });

    let block;
    if (existing) {
      block = await prisma.testDateBlock.update({
        where: { id: existing.id },
        data: { reason: body.reason ?? null, createdById: req.user!.id },
        include: { location: { select: { id: true, name: true } } }
      });
    } else {
      block = await prisma.testDateBlock.create({
        data: {
          testId: req.params.testId,
          locationId: locId,
          date: dateUTC,
          reason: body.reason ?? null,
          createdById: req.user!.id
        },
        include: { location: { select: { id: true, name: true } } }
      });
    }

    await audit(req, {
      action: "TEST_DATE_BLOCKED",
      newValue: { testId: req.params.testId, testName: test.name, date: body.date, locationId: body.locationId, reason: body.reason }
    });
    res.status(201).json(block);
  } catch (error) {
    next(error);
  }
});

/** DELETE /tests/:testId/date-blocks/:blockId — remove a date block */
testsRouter.delete("/:testId/date-blocks/:blockId", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const block = await prisma.testDateBlock.findFirst({
      where: { id: req.params.blockId, testId: req.params.testId }
    });
    if (!block) return res.status(404).json({ message: "Block not found" });

    await prisma.testDateBlock.delete({ where: { id: req.params.blockId } });
    await audit(req, { action: "TEST_DATE_UNBLOCKED", oldValue: block });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
