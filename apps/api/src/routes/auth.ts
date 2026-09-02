import bcrypt from "bcryptjs";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/db.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({
    where: { email: body.email },
    include: { testTypes: { select: { id: true, name: true } } }
  });
  if (!user || !user.active || !(await bcrypt.compare(body.password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const secret: Secret = process.env.JWT_SECRET || "dev-secret";
  const expiresIn = (process.env.JWT_EXPIRES_IN || "8h") as SignOptions["expiresIn"];
  const options: SignOptions = { expiresIn };
  const token = jwt.sign({ sub: user.id, role: user.role }, secret, options);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      locationId: user.locationId,
      canCreateAppointments: user.canCreateAppointments,
      testTypes: user.testTypes
    }
  });
});

authRouter.get("/me", requireAuth, (req, res) => res.json(req.user));
