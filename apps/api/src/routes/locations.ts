import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";

export const locationsRouter = Router();
locationsRouter.use(requireAuth);

locationsRouter.get("/", async (_req, res, next) => {
  try {
    const list = await prisma.location.findMany({
      orderBy: { name: "asc" }
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

locationsRouter.post("/", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      qrCodeUrl: z.string().nullable().optional(),
      mapLink: z.string().nullable().optional(),
      address: z.string().nullable().optional()
    }).parse(req.body);

    const location = await prisma.location.create({ data: body });
    await audit(req, { action: "LOCATION_CREATED", newValue: location });
    res.status(201).json(location);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: error.errors });
    }
    next(error);
  }
});

locationsRouter.patch("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1).optional(),
      active: z.boolean().optional(),
      showContactToTechnicians: z.boolean().optional(),
      qrCodeUrl: z.string().nullable().optional(),
      mapLink: z.string().nullable().optional(),
      address: z.string().nullable().optional()
    }).parse(req.body);

    const old = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ message: "Location not found" });

    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: body
    });

    await audit(req, { action: "LOCATION_UPDATED", oldValue: old, newValue: location });
    res.json(location);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: error.errors });
    }
    next(error);
  }
});

locationsRouter.delete("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const location = await prisma.location.findUnique({ where: { id: req.params.id } });
    if (!location) return res.status(404).json({ message: "Location not found" });

    // Check if any appointments are linked to this location
    const bookingCount = await prisma.appointment.count({ where: { locationId: req.params.id } });
    if (bookingCount > 0) {
      return res.status(409).json({
        message: `Cannot delete "${location.name}" — it has ${bookingCount} existing booking(s). Deactivate it instead.`
      });
    }

    // Delete slot configurations first, then the location
    await prisma.$transaction([
      prisma.slotConfiguration.deleteMany({ where: { locationId: req.params.id } }),
      prisma.location.delete({ where: { id: req.params.id } })
    ]);

    await audit(req, { action: "LOCATION_DELETED", oldValue: location });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
