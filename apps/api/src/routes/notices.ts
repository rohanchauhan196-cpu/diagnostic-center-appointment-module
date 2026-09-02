import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

export const noticesRouter = Router();
noticesRouter.use(requireAuth);

const noticeBody = z.object({
  title:      z.string().min(2).max(200),
  message:    z.string().min(2),
  startDate:  z.string(),
  endDate:    z.string(),
  locationId: z.string().optional().nullable(),
  testId:     z.string().optional().nullable(),
});

// GET /notices — active notices valid now
noticesRouter.get("/", async (req, res, next) => {
  try {
    const now = new Date();
    const notices = await prisma.notice.findMany({
      where: {
        active: true,
        startDate: { lte: now },
        endDate:   { gte: now },
      },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        location:  { select: { id: true, name: true } },
        test:      { select: { id: true, name: true } },
        reads:     { where: { userId: req.user!.id }, select: { readAt: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = notices.map(n => ({
      ...n,
      isRead: n.reads.length > 0,
      reads: undefined,
    }));

    res.json(result);
  } catch (err) { next(err); }
});

// GET /notices/all — all notices by this user (for management)
noticesRouter.get("/all", async (req, res, next) => {
  try {
    const isAdmin = req.user!.role === "ADMIN";
    const notices = await prisma.notice.findMany({
      where: isAdmin ? {} : { createdById: req.user!.id },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        location:  { select: { id: true, name: true } },
        test:      { select: { id: true, name: true } },
        reads:     { select: { userId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(notices.map(n => ({ ...n, readCount: n.reads.length, reads: undefined })));
  } catch (err) { next(err); }
});

// POST /notices — create notice (Technician / Admin)
noticesRouter.post("/", async (req, res, next) => {
  try {
    const user = req.user!;
    if (!["TECHNICIAN", "ADMIN"].includes(user.role)) {
      return res.status(403).json({ message: "Only Technicians and Admins can create notices." });
    }
    const body = noticeBody.parse(req.body);
    const notice = await prisma.notice.create({
      data: {
        title:       body.title,
        message:     body.message,
        startDate:   new Date(body.startDate),
        endDate:     new Date(body.endDate),
        locationId:  body.locationId || null,
        testId:      body.testId || null,
        createdById: user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        location:  { select: { id: true, name: true } },
        test:      { select: { id: true, name: true } },
      },
    });
    res.status(201).json(notice);
  } catch (err) { next(err); }
});

// PUT /notices/:id — edit notice
noticesRouter.put("/:id", async (req, res, next) => {
  try {
    const user = req.user!;
    const existing = await prisma.notice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Notice not found." });
    if (existing.createdById !== user.id && user.role !== "ADMIN") {
      return res.status(403).json({ message: "Only the creator or Admin can edit this notice." });
    }
    const body = noticeBody.partial().parse(req.body);
    const updated = await prisma.notice.update({
      where: { id: req.params.id },
      data: {
        ...(body.title     ? { title:     body.title }                  : {}),
        ...(body.message   ? { message:   body.message }                : {}),
        ...(body.startDate ? { startDate: new Date(body.startDate) }    : {}),
        ...(body.endDate   ? { endDate:   new Date(body.endDate) }      : {}),
        ...("locationId" in body ? { locationId: body.locationId ?? null } : {}),
        ...("testId"     in body ? { testId:     body.testId ?? null }     : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, role: true } },
        location:  { select: { id: true, name: true } },
        test:      { select: { id: true, name: true } },
      },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /notices/:id — deactivate notice
noticesRouter.delete("/:id", async (req, res, next) => {
  try {
    const user = req.user!;
    const existing = await prisma.notice.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: "Notice not found." });
    if (existing.createdById !== user.id && user.role !== "ADMIN") {
      return res.status(403).json({ message: "Only the creator or Admin can delete this notice." });
    }
    await prisma.notice.update({
      where: { id: req.params.id },
      data: { active: false },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /notices/read-all — mark all active notices as read for current user
noticesRouter.post("/read-all", async (req, res, next) => {
  try {
    const now = new Date();
    const activeNotices = await prisma.notice.findMany({
      where: {
        active: true,
        startDate: { lte: now },
        endDate:   { gte: now },
      },
      select: { id: true }
    });

    for (const n of activeNotices) {
      await prisma.noticeRead.upsert({
        where:  { noticeId_userId: { noticeId: n.id, userId: req.user!.id } },
        create: { noticeId: n.id, userId: req.user!.id },
        update: { readAt: new Date() },
      });
    }

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /notices/:id/read — mark notice as read for current user
noticesRouter.post("/:id/read", async (req, res, next) => {
  try {
    await prisma.noticeRead.upsert({
      where:  { noticeId_userId: { noticeId: req.params.id, userId: req.user!.id } },
      create: { noticeId: req.params.id, userId: req.user!.id },
      update: { readAt: new Date() },
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
