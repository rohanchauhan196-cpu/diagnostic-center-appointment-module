import "dotenv/config";
import cors from "cors";
import compression from "compression";
import express from "express";
import http from "http";
import { Server } from "socket.io";
import { adminRouter } from "./routes/admin.js";
import { appointmentsRouter } from "./routes/appointments.js";
import { authRouter } from "./routes/auth.js";
import { testsRouter } from "./routes/tests.js";
import { usersRouter } from "./routes/users.js";
import { locationsRouter } from "./routes/locations.js";
import { noticesRouter } from "./routes/notices.js";
import { proNamesRouter } from "./routes/pro-names.js";
import { setIo } from "./config/socket.js";
import "./cron/dailyReport.js";

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
setIo(io);

import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads directory exists
const uploadDir = path.join(process.cwd(), "public", "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir)
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ storage: storage })

app.use(cors());
app.use(compression());
app.use(express.json());
app.use("/uploads", express.static(path.join(process.cwd(), "public", "uploads")));

app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });
  // The API runs on a different port/domain in production. 
  // Returning the relative path is safest, but since the frontend expects a full URL or absolute path, 
  // we will return the absolute path starting with /api/uploads because the frontend API proxy routes /api to the backend.
  // Wait, if the frontend is Next.js and API is on a different port, the frontend connects to process.env.NEXT_PUBLIC_API_URL.
  // So we return `/uploads/${req.file.filename}` and the frontend can prepend the API base URL.
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
  console.error("API Error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ message: err.message || "Internal server error" });
});

io.on("connection", (socket) => {
  socket.emit("connected", { id: socket.id });
});

server.listen(Number(process.env.API_PORT || 4000), () => {
  console.log(`API listening on ${process.env.API_PORT || 4000}`);
});

