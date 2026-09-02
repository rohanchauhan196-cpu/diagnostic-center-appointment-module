import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../config/db.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

export const proNamesRouter = Router();
proNamesRouter.use(requireAuth);

// GET /pro-names — return all pro names sorted alphabetically
proNamesRouter.get("/", async (_req, res, next) => {
  try {
    const names = await prisma.proName.findMany({
      orderBy: { name: "asc" },
    });
    res.json(names);
  } catch (err) {
    next(err);
  }
});

// POST /pro-names — add a new custom pro name (ADMIN ONLY)
proNamesRouter.post("/", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().min(1).max(200) }).parse(req.body);
    const name = await prisma.proName.upsert({
      where: { name: body.name },
      update: {},
      create: { name: body.name, isCustom: true },
    });
    res.status(201).json(name);
  } catch (err) {
    next(err);
  }
});

// PATCH /pro-names/:id — edit/rename a pro name (ADMIN ONLY)
proNamesRouter.patch("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().min(1).max(200) }).parse(req.body);
    const updated = await prisma.proName.update({
      where: { id: req.params.id },
      data: { name: body.name },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /pro-names/:id — delete a pro name (ADMIN ONLY)
proNamesRouter.delete("/:id", requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    await prisma.proName.delete({
      where: { id: req.params.id },
    });
    res.json({ message: "PRO name deleted successfully" });
  } catch (err) {
    next(err);
  }
});
