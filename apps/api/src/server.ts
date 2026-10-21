import "dotenv/config";
import "./config/asyncErrors.js";
import cors, { type CorsOptions } from "cors";
import compression from "compression";
import express from "express";
import http from "http";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { Server } from "socket.io";
import { ZodError } from "zod";
import { adminRouter } from "./routes/admin.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { authRouter } from "./routes/auth.js";
import { testsRouter } from "./routes/tests.js";
import { usersRouter } from "./routes/users.js";
import { locationsRouter } from "./routes/locations.js";
import { noticesRouter } from "./routes/notices.js";
import { proNamesRouter } from "./routes/pro-names.js";
import { setIo } from "./config/socket.js";
import { JWT_SECRET, requireAuth } from "./middleware/auth.js";
import "./cron/dailyReport.js";

// Production serves the web app and API from the same origin (nginx /api proxy),
// so cross-origin access is only needed for local development (web on :3000)
// or for origins explicitly listed in CORS_ORIGINS.
const allowedOrigins = (process.env.CORS_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
const corsOptions: CorsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    try {
      const { hostname, port } = new URL(origin);
      if (hostname === "localhost" || hostname === "127.0.0.1" || port === "3000") return cb(null, true);
    } catch {
      // malformed Origin header — deny
    }
    cb(null, false);
  }
};

const app = express();
// Behind nginx: trust X-Forwarded-For only from local/private proxies so req.ip is the real client.
app.set("trust proxy", "loopback, uniquelocal");
const server = http.createServer(app);
const io = new Server(server, { cors: corsOptions });
setIo(io);

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
  "application/pdf": ".pdf"
};

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (_req, file, cb) => cb(null, `file-${Date.now()}-${crypto.randomBytes(8).toString("hex")}${UPLOAD_TYPES[file.mimetype]}`)
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (UPLOAD_TYPES[file.mimetype]) return cb(null, true);
    cb(Object.assign(new Error("Only images (JPG, PNG, WEBP, HEIC) or PDF files can be uploaded"), { status: 400 }));
  }
});

app.use(cors(corsOptions));
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(uploadDir, {
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff")
}));

app.post("/upload", requireAuth, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  // The frontend prepends the API base URL to this path.
  res.json({ url: `/uploads/${req.file.filename}` });
});

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/auth", authRouter);
app.use("/appointments", appointmentsRouter);
app.use("/tests", testsRouter);
app.use("/users", usersRouter);
app.use("/admin", adminRouter);
app.use("/locations", locationsRouter);
app.use("/notices", noticesRouter);
app.use("/pro-names", proNamesRouter);

// Global Error Handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ message: "Validation failed", errors: err.errors });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.code === "LIMIT_FILE_SIZE" ? "File is too large (max 10 MB)" : err.message });
  }
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error("API Error:", err);
  res.status(status).json({ message: status >= 500 ? "Internal server error" : err.message });
});

// Realtime events carry patient data, so only logged-in users may connect.
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  try {
    if (typeof token !== "string") throw new Error("Missing token");
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  socket.emit("connected", { id: socket.id });
});

server.listen(Number(process.env.API_PORT || 4000), () => {
  console.log(`API listening on ${process.env.API_PORT || 4000}`);
});
