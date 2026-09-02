import bcrypt from "bcryptjs";
import { Router } from "express";
import { Role, Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { audit } from "../services/audit.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole(Role.ADMIN));

usersRouter.get("/", async (_req, res, next) => {
  try {
    const list = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        location: { select: { id: true, name: true } },
        testTypes: { select: { id: true, name: true } }
      }
    });
    res.json(list);
  } catch (error) {
    next(error);
  }
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      role: z.nativeEnum(Role),
      password: z.string().min(8),
      locationId: z.string().optional().nullable(),
      testTypeIds: z.array(z.string()).optional(),
      canCreateAppointments: z.boolean().optional()
    }).parse(req.body);

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await bcrypt.hash(body.password, 12),
        locationId: body.locationId || null,
        canCreateAppointments: body.canCreateAppointments ?? false,
        testTypes: body.testTypeIds ? {
          connect: body.testTypeIds.map(id => ({ id }))
        } : undefined
      },
      include: {
        location: { select: { id: true, name: true } },
        testTypes: { select: { id: true, name: true } }
      }
    });

    await audit(req, { action: "USER_CREATED", newValue: { id: user.id, email: user.email, role: user.role, locationId: user.locationId, canCreateAppointments: user.canCreateAppointments } });
    res.status(201).json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: error.errors });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ message: "A user with this email already exists" });
    }
    next(error);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const body = z.object({
      name: z.string().optional(),
      role: z.nativeEnum(Role).optional(),
      active: z.boolean().optional(),
      password: z.string().min(8).optional(),
      locationId: z.string().optional().nullable(),
      testTypeIds: z.array(z.string()).optional(),
      canCreateAppointments: z.boolean().optional()
    }).parse(req.body);

    const data: any = {
      name: body.name,
      role: body.role,
      active: body.active,
      passwordHash: body.password ? await bcrypt.hash(body.password, 12) : undefined,
      locationId: body.locationId === undefined ? undefined : (body.locationId || null),
      canCreateAppointments: body.canCreateAppointments,
      testTypes: body.testTypeIds ? {
        set: body.testTypeIds.map(id => ({ id }))
      } : undefined
    };

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data,
      include: {
        location: { select: { id: true, name: true } },
        testTypes: { select: { id: true, name: true } }
      }
    });
    await audit(req, { action: "USER_UPDATED", newValue: { id: user.id, active: user.active, role: user.role, locationId: user.locationId } });
    res.json(user);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Validation failed", errors: error.errors });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ message: "A user with this email already exists" });
    }
    next(error);
  }
});

usersRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!user) return res.status(404).json({ message: "User not found" });
    
    // Prevent deleting primary admin
    if (user.role === Role.ADMIN && user.email === "admin@diagnostic.local") {
      return res.status(400).json({ message: "Cannot delete primary administrator" });
    }

    // Find fallback admin user to reassign appointments/logs to - NEVER delete bookings!
    const adminUser = await prisma.user.findFirst({
      where: { role: Role.ADMIN, active: true },
      orderBy: { createdAt: "asc" }
    });
    const fallbackUserId = adminUser?.id || req.user?.id;

    if (fallbackUserId && fallbackUserId !== req.params.id) {
      // Reassign all appointments created by this user so they are NEVER deleted
      await prisma.appointment.updateMany({
        where: { createdById: req.params.id },
        data: { createdById: fallbackUserId }
      });
      await prisma.activityLog.updateMany({
        where: { userId: req.params.id },
        data: { userId: fallbackUserId }
      });
      await prisma.statusHistory.updateMany({
        where: { userId: req.params.id },
        data: { userId: fallbackUserId }
      });
      await prisma.auditLog.updateMany({
        where: { userId: req.params.id },
        data: { userId: fallbackUserId }
      });
    }

    await prisma.user.delete({ where: { id: req.params.id } });
    await audit(req, { action: "USER_DELETED", oldValue: { id: user.id, email: user.email, role: user.role } });
    res.json({ ok: true, message: "User deleted and all bookings safely preserved" });
  } catch (error) {
    next(error);
  }
});

