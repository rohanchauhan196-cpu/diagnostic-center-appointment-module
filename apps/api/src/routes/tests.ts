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
    orderBy: { name: "asc" }
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
    const aIsPet = a.name.toUpperCase().includes("PET CT");
    const bIsPet = b.name.toUpperCase().includes("PET CT");
    if (aIsPet && !bIsPet) return -1;
    if (!aIsPet && bIsPet) return 1;
    return a.name.localeCompare(b.name);
  });

  res.json(result);
});


testsRouter.post("/", requireRole(Role.ADMIN), async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    workDays: z.array(z.string()).optional(),
    instructions: z.string().optional()
  }).parse(req.body);
  const test = await prisma.testType.create({ data: body });
  await audit(req, { action: "TEST_CREATED", newValue: test });
  res.status(201).json(test);
});

testsRouter.put("/:testId/slots", requireRole(Role.ADMIN), async (req, res) => {
  const body = z.object({
    locationId: z.string(),
    dayOfWeek: z.string().optional().default("All"),
    slots: z.array(z.object({
      label: z.string(),
      capacity: z.number().int().positive(),
      sortOrder: z.number().int(),
      active: z.boolean().optional().default(true)
    })),
    // Optional per-center working days; null/undefined = inherit from test global setting
    workDays: z.array(z.string()).nullable().optional()
  }).parse(req.body);
  
  await prisma.$transaction(async (tx) => {
    // Replace slot rows for this (test, location, dayOfWeek)
    await tx.slotConfiguration.deleteMany({
      where: { testId: req.params.testId, locationId: body.locationId, dayOfWeek: body.dayOfWeek }
    });
    await tx.slotConfiguration.createMany({
      data: body.slots.map((slot) => ({
        ...slot,
        testId: req.params.testId,
        locationId: body.locationId,
        dayOfWeek: body.dayOfWeek
      }))
    });
  });

  // Upsert per-center workDays — done outside transaction using dynamic access
  // so it works regardless of whether the Prisma client has been regenerated
  if (body.workDays !== undefined && body.workDays !== null) {
    try {
      await (prisma as any).testLocationSchedule.upsert({
        where: { testId_locationId: { testId: req.params.testId, locationId: body.locationId } },
        create: { testId: req.params.testId, locationId: body.locationId, workDays: body.workDays },
        update: { workDays: body.workDays }
      });
    } catch (_) {
      // Safe fallback if table doesn't exist yet
    }
  }

  await audit(req, { action: "SLOTS_UPDATED", newValue: body });
  res.json({ ok: true });
});

testsRouter.patch("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(2).optional(),
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
