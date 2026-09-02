import cron from "node-cron";
import nodemailer from "nodemailer";
import { prisma } from "../config/db.js";

function generateCSV(appointments: any[]): string {
  const headers = [
    "Booking ID",
    "Patient Name",
    "Phone",
    "Test",
    "Location",
    "Date",
    "Slot",
    "Referred By",
    "Referred Doctor",
    "Status",
    "Total Price",
    "Advance Received",
    "Pending Payment",
    "Advance Method",
    "Remaining Method",
    "Remarks",
    "Created By"
  ];

  const rows = appointments.map(a => {
    const total   = a.totalPrice      ?? 0;
    const advance = a.advanceReceived ?? 0;
    const pending = Math.max(total - advance, 0);
    const dateStr = new Date(a.appointmentDate).toISOString().slice(0, 10);

    return [
      a.bookingId,
      a.patientName,
      a.phoneNumber     || "",
      a.test?.name      || "",
      a.location?.name  || "",
      dateStr,
      a.slot,
      a.referredBy      || "",
      a.referredDoctor  || "",
      a.status,
      total   > 0 ? total   : "",
      advance > 0 ? advance : "",
      total   > 0 ? pending : "",
      a.advanceMethod   || "—",
      a.remainingMethod || "—",
      a.notes           || "",
      a.createdBy?.name || "—"
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",");
  });

  return "\uFEFF" + [headers.join(","), ...rows].join("\n");
}

function formatDateLabel(dateObj: Date): string {
  return dateObj.toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata"
  }).replace(/ /g, " ");
}

function getISTDateStrings() {
  const nowIST     = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const yyyy       = nowIST.getFullYear();
  const mm         = String(nowIST.getMonth() + 1).padStart(2, "0");
  const dd         = String(nowIST.getDate()).padStart(2, "0");
  const startOfDay = new Date(`${yyyy}-${mm}-${dd}T00:00:00.000+05:30`);
  const endOfDay   = new Date(`${yyyy}-${mm}-${dd}T23:59:59.999+05:30`);
  const dateLabel  = formatDateLabel(nowIST);
  const fileDate   = `${yyyy}-${mm}-${dd}`;
  return { nowIST, startOfDay, endOfDay, dateLabel, fileDate };
}

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("[CRON] SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS) not configured.");
  }

  const isResend = (host && host.includes("resend")) || user === "resend" || pass?.startsWith("re_") || !!process.env.RESEND_API_KEY;
  const finalHost = isResend ? "smtp.resend.com" : host;
  const finalPort = isResend ? 587 : Number(port || 587);
  const finalUser = isResend ? "resend" : user;
  const finalPass = isResend ? (process.env.RESEND_API_KEY || pass) : pass;
  const fromAddress = isResend ? (process.env.SMTP_FROM || '"Molecular Diagnostics" <reports@molecularit.com>') : `"Molecular Diagnostics" <${user}>`;

  const transporter = nodemailer.createTransport({
    host: finalHost,
    port: finalPort,
    secure: finalPort === 465,
    auth: { user: finalUser, pass: finalPass },
    tls: { rejectUnauthorized: false }
  });

  return { transporter, fromAddress };
}

/**
 * Rule 1: Green Park Center — 6:00 AM IST
 * Recipients: moleculargp50@gmail.com, vishal.gupta@molecularit.com
 * Scope: Same day appointments for Green Park center
 */
export async function sendGreenParkMorningReport() {
  console.log("[CRON] Starting Green Park 6 AM appointment report...");
  const recipients = ["moleculargp50@gmail.com", "vishal.gupta@molecularit.com"];
  const { startOfDay, endOfDay, dateLabel, fileDate } = getISTDateStrings();

  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: startOfDay, lte: endOfDay },
      status: { not: "CANCELLED" },
      location: {
        name: { contains: "green", mode: "insensitive" }
      }
    },
    include: { test: true, location: true, createdBy: true },
    orderBy: [{ slot: "asc" }]
  });

  const csvContent = generateCSV(appointments);
  const { transporter, fromAddress } = createTransporter();

  await transporter.sendMail({
    from: fromAddress,
    to: recipients,
    subject: `Green Park Center - Today's Appointment Report (${dateLabel})`,
    text: [
      "Hello,",
      "",
      `Please find attached today's appointment report for the Green Park Center (${dateLabel}).`,
      "",
      `• Total Today's Appointments: ${appointments.length}`,
      "",
      "Regards,",
      "Molecular Diagnostics Appointment System"
    ].join("\n"),
    attachments: [
      {
        filename: `green_park_today_appointments_${fileDate}.csv`,
        content: csvContent,
        contentType: "text/csv; charset=utf-8"
      }
    ]
  });

  console.log(`[CRON] Green Park morning report sent to ${recipients.join(", ")} ✓ (${appointments.length} appts)`);
  return { ok: true, recipients, count: appointments.length };
}

/**
 * Rule 2: All Locations Midnight Report — 12:00 AM IST
 * Recipients: Abhinav.rai@molecularit.com, aviral.gupta@molecularit.com
 * Scope: All locations, all active appointments (today + future) + center-wise breakdown
 */
export async function sendMidnightAllLocationsReport() {
  console.log("[CRON] Starting All Locations Midnight appointment report...");
  const recipients = ["Abhinav.rai@molecularit.com", "aviral.gupta@molecularit.com"];
  const { startOfDay, endOfDay, dateLabel, fileDate } = getISTDateStrings();

  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: startOfDay },
      status: { not: "CANCELLED" }
    },
    include: { test: true, location: true, createdBy: true },
    orderBy: [{ appointmentDate: "asc" }, { slot: "asc" }]
  });

  const todayAppts  = appointments.filter(a => new Date(a.appointmentDate) <= endOfDay);
  const futureAppts = appointments.filter(a => new Date(a.appointmentDate) > endOfDay);

  const todayCsv  = generateCSV(todayAppts);
  const futureCsv = generateCSV(futureAppts);
  const allCsv    = generateCSV(appointments);

  // Center-wise breakdown attachments
  const locations = await prisma.location.findMany({ where: { active: true } });
  const centerAttachments: any[] = [];
  const summaryLines: string[] = [];

  for (const loc of locations) {
    const locAppts = appointments.filter(a => a.locationId === loc.id);
    const locToday = locAppts.filter(a => new Date(a.appointmentDate) <= endOfDay);
    const locFuture = locAppts.filter(a => new Date(a.appointmentDate) > endOfDay);

    if (locAppts.length > 0) {
      summaryLines.push(`• ${loc.name}: ${locToday.length} today, ${locFuture.length} future (Total: ${locAppts.length})`);
      const safeLocName = loc.name.toLowerCase().replace(/[^a-z0-9]/g, "_");
      if (locToday.length > 0) {
        centerAttachments.push({
          filename: `${safeLocName}_today_${fileDate}.csv`,
          content: generateCSV(locToday),
          contentType: "text/csv; charset=utf-8"
        });
      }
    } else {
      summaryLines.push(`• ${loc.name}: No active appointments`);
    }
  }

  const { transporter, fromAddress } = createTransporter();

  await transporter.sendMail({
    from: fromAddress,
    to: recipients,
    subject: `All Locations Daily Appointment Report - ${dateLabel}`,
    text: [
      "Hello,",
      "",
      "Please find attached the daily appointment export reports for all locations.",
      "",
      `• Today's Appointments (${todayAppts.length}): today_appointments_${fileDate}.csv`,
      `• Future Scheduled Appointments (${futureAppts.length}): future_appointments_${fileDate}.csv`,
      `• Total Active Appointments: ${appointments.length}`,
      "",
      "Summary by Center:",
      ...summaryLines,
      "",
      "Regards,",
      "Molecular Diagnostics Appointment System"
    ].join("\n"),
    attachments: [
      {
        filename: `today_appointments_${fileDate}.csv`,
        content: todayCsv,
        contentType: "text/csv; charset=utf-8"
      },
      {
        filename: `future_appointments_${fileDate}.csv`,
        content: futureCsv,
        contentType: "text/csv; charset=utf-8"
      },
      {
        filename: `all_appointments_${fileDate}.csv`,
        content: allCsv,
        contentType: "text/csv; charset=utf-8"
      },
      ...centerAttachments
    ]
  });

  console.log(`[CRON] Midnight report sent to ${recipients.join(", ")} ✓ (${appointments.length} total appts)`);
  return { ok: true, recipients, totalCount: appointments.length };
}

/**
 * Rule 3: Paschim Vihar Center — 6:00 AM IST
 * Recipients: Infomolecularitpv@gmail.com
 * Scope: Same day appointments for Paschim Vihar center
 */
export async function sendPaschimViharMorningReport() {
  console.log("[CRON] Starting Paschim Vihar 6 AM appointment report...");
  const recipients = ["Infomolecularitpv@gmail.com"];
  const { startOfDay, endOfDay, dateLabel, fileDate } = getISTDateStrings();

  const appointments = await prisma.appointment.findMany({
    where: {
      appointmentDate: { gte: startOfDay, lte: endOfDay },
      status: { not: "CANCELLED" },
      location: {
        name: { contains: "paschim", mode: "insensitive" }
      }
    },
    include: { test: true, location: true, createdBy: true },
    orderBy: [{ slot: "asc" }]
  });

  const csvContent = generateCSV(appointments);
  const { transporter, fromAddress } = createTransporter();

  await transporter.sendMail({
    from: fromAddress,
    to: recipients,
    subject: `Paschim Vihar Center - Today's Appointment Report (${dateLabel})`,
    text: [
      "Hello,",
      "",
      `Please find attached today's appointment report for the Paschim Vihar Center (${dateLabel}).`,
      "",
      `• Total Today's Appointments: ${appointments.length}`,
      "",
      "Regards,",
      "Molecular Diagnostics Appointment System"
    ].join("\n"),
    attachments: [
      {
        filename: `paschim_vihar_today_appointments_${fileDate}.csv`,
        content: csvContent,
        contentType: "text/csv; charset=utf-8"
      }
    ]
  });

  console.log(`[CRON] Paschim Vihar morning report sent to ${recipients.join(", ")} ✓ (${appointments.length} appts)`);
  return { ok: true, recipients, count: appointments.length };
}

// Backward compatibility aliases
export const sendDailyReports = sendMidnightAllLocationsReport;
export const sendCenterReports = sendMidnightAllLocationsReport;

// Schedule 1 & 3: 6:00 AM IST (Asia/Kolkata)
cron.schedule("0 6 * * *", () => {
  sendGreenParkMorningReport().catch(err => console.error("[CRON Error - Green Park]:", err));
  sendPaschimViharMorningReport().catch(err => console.error("[CRON Error - Paschim Vihar]:", err));
}, { timezone: "Asia/Kolkata" });

// Schedule 2: 12:00 AM IST (Asia/Kolkata Midnight)
cron.schedule("0 0 * * *", () => {
  sendMidnightAllLocationsReport().catch(err => console.error("[CRON Error - Midnight Report]:", err));
}, { timezone: "Asia/Kolkata" });

console.log("[CRON] Configured 3 mailing cron jobs (12:00 AM All Centers, 6:00 AM Green Park, 6:00 AM Paschim Vihar in Asia/Kolkata).");
