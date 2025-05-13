const express = require("express");
const {
  PrismaClient,
  Status,
  RecommendedAppointmentStatus,
  FollowUpPolicy,
} = require("@prisma/client");
const { createServer } = require("http");
const { Server } = require("socket.io");
const cron = require("node-cron");
const { Resend } = require("resend");
const {
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  differenceInDays,
  isEqual,
} = require("date-fns");
require("dotenv").config({ path: "../.env" }); // Adjust path if your .env is elsewhere

// --- Environment & Initialization ---
const PORT = process.env.PORT || 9000;
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
const COMPLETION_DELAY = 3 * 60 * 1000;

const resendKey =
  process.env.RESEND_API_KEY || "re_2jVrmuDq_ANKBi91TjmsYVj8Gv7VHZfZD";
const resend = resendKey ? new Resend(resendKey) : null;
if (!resendKey && process.env.NODE_ENV === "production") {
  console.warn(
    "WARNING (Socket Server): RESEND_API_KEY is not set. Email reminders will be DISABLED.",
  );
}
const SENDER_EMAIL_SERVER = process.env.SENDER_EMAIL || "clinic@beautyfeel.net";
const LOGO_URL_SERVER =
  process.env.LOGO_URL || "https://beautyfeel.net/btfeel-icon.png"; // Your public logo URL
const PHILIPPINES_TIMEZONE = "Asia/Manila"; // Target timezone for display in emails

// Follow-up Recommendation Reminder Configuration
const FOLLOW_UP_REMINDER_WINDOWS_DAYS = [7, 3, 2, 1, 0, -1]; // Days relative to recommendedDate
const FOLLOW_UP_REMINDER_FIELDS = {
  // Maps daysAway to DB field names
  7: "reminder7DaySentAt",
  3: "reminder3DaySentAt",
  2: "reminder2DaySentAt",
  1: "reminder1DaySentAt",
  0: "reminderTodaySentAt",
  "-1": "reminder1DayAfterSentAt",
};
const FOLLOW_UP_CRON_SCHEDULE =
  process.env.FOLLOW_UP_CRON_SCHEDULE || "0 9 * * *"; // Default: 9 AM daily

// Booking (1-Hour) Reminder Configuration
const BOOKING_REMINDER_CRON_SCHEDULE =
  process.env.BOOKING_REMINDER_CRON_SCHEDULE || "*/15 * * * *"; // Default: Every 15 minutes

const CRON_ITEM_PROCESSING_DELAY = parseInt(
  process.env.CRON_ITEM_DELAY || "100",
  10,
); // Delay in ms between processing items in cron jobs
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Asia/Manila"; // Timezone for cron job scheduling

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000, // Optional: reduce slightly if needed, default is 2s for acquire.
    timeout: 15000, // Set to the maximum allowed by Accelerate for interactive transactions (15 seconds)
  },
});
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else {
        console.error(`CORS: Blocking origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "PUT"],
  },
});

const transactionCompletionTimers = new Map();

// --- Transaction Auto-Completion Helper Functions ---
function cancelCompletionTimer(transactionId) {
  if (transactionCompletionTimers.has(transactionId)) {
    clearTimeout(transactionCompletionTimers.get(transactionId));
    transactionCompletionTimers.delete(transactionId);
    console.log(
      `[Socket TXN Complete Timer ${transactionId}] Timer CANCELLED.`,
    );
  }
}
async function checkAndManageCompletionTimer(transactionId) {
  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Checking status for auto-completion...`,
  );
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { availedServices: { select: { status: true } } },
    });
    if (!transaction || transaction.status !== Status.PENDING) {
      cancelCompletionTimer(transactionId); // Not pending or doesn't exist
      return;
    }
    const allDone =
      transaction.availedServices.length > 0 &&
      transaction.availedServices.every((as) => as.status === Status.DONE);
    if (allDone) {
      if (!transactionCompletionTimers.has(transactionId)) {
        // Start timer only if not already running
        startCompletionTimer(transactionId);
      }
    } else {
      // Not all services are done
      cancelCompletionTimer(transactionId);
    }
  } catch (error) {
    console.error(
      `[Socket TXN Complete Timer ${transactionId}] Error in checkAndManageCompletionTimer:`,
      error,
    );
    cancelCompletionTimer(transactionId); // Cancel on error as a precaution
  }
}
function startCompletionTimer(transactionId) {
  cancelCompletionTimer(transactionId); // Always clear any existing timer first
  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Setting completion timer (${COMPLETION_DELAY / 1000}s).`,
  );
  const timerId = setTimeout(async () => {
    transactionCompletionTimers.delete(transactionId); // Remove from map before async operation
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);
  transactionCompletionTimers.set(transactionId, timerId);
}
async function completeTransactionAndCalculateSalary(transactionId) {
  console.log(
    `[Socket TXN Complete ${transactionId}] Processing final completion and salary calculation.`,
  );
  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          availedServices: {
            select: {
              id: true,
              servedById: true,
              status: true,
              commissionValue: true,
            },
          },
        },
      });
      const allServicesDone =
        transaction?.availedServices?.length > 0 &&
        transaction.availedServices.every((as) => as.status === Status.DONE);
      if (
        !transaction ||
        transaction.status !== Status.PENDING ||
        !allServicesDone
      ) {
        console.warn(
          `[Socket TXN Complete ${transactionId}] Final check FAILED within DB transaction. Aborting. Status: ${transaction?.status}, AllDone: ${allServicesDone}`,
        );
        return null; // Abort and rollback
      }
      const updatedTx = await tx.transaction.update({
        where: { id: transactionId },
        data: { status: Status.DONE },
        include: {
          customer: { select: { id: true, name: true } },
          availedServices: {
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          },
          voucherUsed: { select: { code: true, value: true } },
        },
      });
      const salaryUpdates = new Map(); // accountId -> totalCommission
      for (const availedSvc of updatedTx.availedServices) {
        if (availedSvc.servedById && availedSvc.commissionValue > 0) {
          salaryUpdates.set(
            availedSvc.servedById,
            (salaryUpdates.get(availedSvc.servedById) || 0) +
              availedSvc.commissionValue,
          );
        }
      }
      if (salaryUpdates.size > 0) {
        console.log(
          `[Socket TXN Complete ${transactionId}] Applying salary increments for ${salaryUpdates.size} accounts.`,
        );
        await Promise.all(
          Array.from(salaryUpdates.entries()).map(([accId, amount]) =>
            tx.account
              .update({
                where: { id: accId },
                data: { salary: { increment: amount } },
              })
              .catch((e) => {
                console.error(
                  `[Socket TXN Complete ${transactionId}] Salary update failed for Account ${accId}:`,
                  e,
                );
                throw new Error(
                  `Salary update failed for Account ${accId}: ${e.message}`,
                ); // Propagate error to rollback transaction
              }),
          ),
        );
      }
      return updatedTx; // Return the updated transaction from the DB transaction
    });
    if (result) {
      // If DB transaction was successful (not rolled back)
      io.emit("transactionCompleted", result); // Notify clients
      console.log(
        `[Socket TXN Complete ${transactionId}] Transaction successfully completed and broadcasted.`,
      );
    } else {
      console.log(
        `[Socket TXN Complete ${transactionId}] Transaction completion aborted due to final checks failing within DB transaction.`,
      );
    }
  } catch (error) {
    console.error(
      `[Socket TXN Complete ${transactionId}] CRITICAL error during completeTransactionAndCalculateSalary:`,
      error,
    );
  }
}

// --- General Email HTML Generation Helper ---
function generateStandardEmailHTML(
  bodyContent,
  subjectLine,
  logoUrl = LOGO_URL_SERVER,
) {
  // Using robust inline styles for email client compatibility
  return `
  <!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${subjectLine}</title>
  <style>body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;background-color:#f9f9f9;font-family:Arial,Helvetica,sans-serif;}
  .email-container{max-width:600px;margin:20px auto;padding:25px;background-color:#ffffff;border:1px solid #dddddd;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.05);line-height:1.6;color:#333333;}
  .header{text-align:center;padding-bottom:20px;border-bottom:1px solid #eeeeee;margin-bottom:30px;}.header img{max-width:180px;height:auto;border:0;}
  .content{padding:0 10px;font-size:16px;}.content p{margin:0 0 18px 0;}.content ul{padding-left:20px;margin-top:0;margin-bottom:18px;}.content li{margin-bottom:5px;}
  .footer{text-align:center;font-size:13px;color:#777777;margin-top:30px;padding-top:20px;border-top:1px solid #eeeeee;}
  strong{color:#2c3e50;font-weight:bold;}</style></head>
  <body><table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9"><tr><td align="center" valign="top" style="padding:20px;">
  <div class="email-container"><div class="header"><img src="${logoUrl}" alt="Clinic Logo"></div>
  <div class="content">${bodyContent}</div>
  <div class="footer"><p>This is an automated message from BeautyFeel Services.<br>Please do not reply directly to this email.</p></div>
  </div></td></tr></table></body></html>`;
}

// --- Follow-up Recommendation Email Helpers (using Intl.DateTimeFormat) ---
function generateFollowUpReminderBody(
  customerName,
  daysAway,
  recommendedDateUTC,
) {
  // recommendedDateUTC is a JS Date object (from Prisma, represents UTC)
  const dateOptionsIntl = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedRecDate = new Intl.DateTimeFormat(
    "en-US",
    dateOptionsIntl,
  ).format(new Date(recommendedDateUTC)); // Ensure it's a Date object

  let timeAdverb;
  if (daysAway > 1) timeAdverb = `in ${daysAway} days, on ${formattedRecDate}`;
  else if (daysAway === 1) timeAdverb = `tomorrow, ${formattedRecDate}`;
  else if (daysAway === 0) timeAdverb = `today, ${formattedRecDate}!`;
  else if (daysAway === -1) timeAdverb = `was yesterday, ${formattedRecDate}`;
  else
    timeAdverb = `was ${Math.abs(daysAway)} days ago, on ${formattedRecDate}`;
  const intro =
    daysAway >= 0
      ? "Just a friendly reminder that your recommended follow-up date is approaching."
      : "We noticed your recommended follow-up date has passed.";
  const action =
    daysAway >= 0
      ? "Booking ensures you maintain optimal results and secure your preferred time."
      : "It's not too late to get back on track! Contact us to schedule your next visit.";
  return `<p>Hi ${customerName},</p><p>${intro}</p><p>Your recommended date ${timeAdverb}</p><p>${action}</p><p>We look forward to seeing you!</p><p>Best regards,<br>The BeautyFeel Team</p>`;
}
async function sendFollowUpReminderEmailAndMark(ra, daysAway) {
  if (!resend || !ra.customer?.email) {
    console.warn(
      `[Cron FollowUp] Cannot send RA ${ra.id} reminder: Resend not configured or customer email missing.`,
    );
    return false;
  }
  const subject =
    daysAway >= 0
      ? `BeautyFeel Follow-up Reminder (${daysAway === 0 ? "Today" : daysAway === 1 ? "Tomorrow" : `in ${daysAway} days`})`
      : `BeautyFeel Follow-up Passed`;
  const bodyHtml = generateFollowUpReminderBody(
    ra.customer.name,
    daysAway,
    new Date(ra.recommendedDate),
  );
  const html = generateStandardEmailHTML(bodyHtml, subject);
  try {
    const { data, error } = await resend.emails.send({
      from: SENDER_EMAIL_SERVER,
      to: [ra.customer.email],
      subject,
      html,
      text: bodyHtml.replace(/<br>/g, "\n").replace(/<[^>]*>/g, ""), // Generate plain text from HTML body
    });
    if (error) {
      console.error(
        `[Cron FollowUp] Email send error for RA ${ra.id} to ${ra.customer.email}:`,
        error,
      );
      return false;
    }
    console.log(
      `[Cron FollowUp] Email sent for RA ${ra.id}. Email ID: ${data?.id}`,
    );
    const reminderFieldToUpdate = FOLLOW_UP_REMINDER_FIELDS[daysAway];
    if (reminderFieldToUpdate) {
      await prisma.recommendedAppointment.update({
        where: { id: ra.id },
        data: { [reminderFieldToUpdate]: new Date() },
      });
      console.log(
        `[Cron FollowUp] Marked ${reminderFieldToUpdate} for RA ${ra.id}.`,
      );
    }
    return true;
  } catch (e) {
    console.error(
      `[Cron FollowUp] Exception during email send/DB update for RA ${ra.id}:`,
      e,
    );
    return false;
  }
}
async function checkAndSendFollowUpReminders() {
  console.log(
    `[Cron FollowUp] Starting check for follow-up recommendation reminders...`,
  );
  if (!resend) {
    console.warn(`[Cron FollowUp] Resend client not configured. Skipping.`);
    return;
  }

  const today = startOfDay(new Date());
  const queryRangeStart = addDays(
    today,
    Math.min(...FOLLOW_UP_REMINDER_WINDOWS_DAYS) - 7,
  ); // Widen query for safety
  const queryRangeEnd = addDays(
    today,
    Math.max(...FOLLOW_UP_REMINDER_WINDOWS_DAYS) + 7,
  );

  try {
    const rAsToConsider = await prisma.recommendedAppointment.findMany({
      where: {
        status: {
          in: [
            RecommendedAppointmentStatus.RECOMMENDED,
            RecommendedAppointmentStatus.SCHEDULED,
          ],
        },
        recommendedDate: { gte: queryRangeStart, lte: queryRangeEnd },
        customer: { email: { not: null, contains: "@" } },
      },
      select: {
        // Select all reminder fields to check which one to send
        id: true,
        recommendedDate: true,
        customer: { select: { id: true, name: true, email: true } },
        reminder7DaySentAt: true,
        reminder3DaySentAt: true,
        reminder2DaySentAt: true,
        reminder1DaySentAt: true,
        reminderTodaySentAt: true,
        reminder1DayAfterSentAt: true,
      },
    });

    console.log(
      `[Cron FollowUp] Found ${rAsToConsider.length} RAs in date range to consider for follow-up reminders.`,
    );
    for (const ra of rAsToConsider) {
      const daysAway = differenceInDays(
        startOfDay(new Date(ra.recommendedDate)),
        today,
      );
      const reminderFieldKey = FOLLOW_UP_REMINDER_FIELDS[daysAway]; // e.g., "reminder3DaySentAt"

      if (reminderFieldKey && ra[reminderFieldKey] === null) {
        // If today matches a reminder window and this specific reminder hasn't been sent
        console.log(
          `[Cron FollowUp] Sending ${daysAway}-day reminder for RA ${ra.id} to ${ra.customer.email}`,
        );
        await sendFollowUpReminderEmailAndMark(ra, daysAway); // This function now also updates the DB
        await new Promise((r) => setTimeout(r, CRON_ITEM_PROCESSING_DELAY)); // Stagger emails to avoid rate limits
      }
    }

    // Cleanup: Mark very old, still active RAs (Recommended or Scheduled) as MISSED
    const missedCutoffDate = subDays(
      today,
      Math.abs(
        Math.min(...FOLLOW_UP_REMINDER_WINDOWS_DAYS.filter((d) => d < 0)),
      ) + 14,
    ); // e.g., if last reminder is -1 day, cutoff is 15 days ago
    const updatedCount = await prisma.recommendedAppointment.updateMany({
      where: {
        status: {
          in: [
            RecommendedAppointmentStatus.RECOMMENDED,
            RecommendedAppointmentStatus.SCHEDULED,
          ],
        },
        recommendedDate: { lt: missedCutoffDate },
      },
      data: { status: RecommendedAppointmentStatus.MISSED },
    });
    if (updatedCount.count > 0) {
      console.log(
        `[Cron FollowUp] Marked ${updatedCount.count} old RecommendedAppointments as MISSED.`,
      );
    }
  } catch (e) {
    console.error(
      `[Cron FollowUp] Error during checkAndSendFollowUpReminders:`,
      e,
    );
  }
  console.log(
    `[Cron FollowUp] Follow-up recommendation reminder check finished.`,
  );
}

// --- Booking (1-Hour) Reminder Email Helpers (using Intl.DateTimeFormat) ---
function generateBookingReminderBody(
  customerName,
  bookingDateTimeUTC,
  serviceNamesList,
) {
  // bookingDateTimeUTC is the JS Date object from Prisma (represents UTC)
  const timeOptionsIntl = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedBookedTime = new Intl.DateTimeFormat(
    "en-US",
    timeOptionsIntl,
  ).format(new Date(bookingDateTimeUTC)); // Ensure Date object

  const servicesString =
    serviceNamesList.length > 0
      ? serviceNamesList.join(", ")
      : "your scheduled services";

  return `<p>Hi ${customerName},</p><p>This is a friendly reminder that your appointment for ${servicesString} is in about one hour, at <strong>${formattedBookedTime}</strong> today (Philippine Time).</p><p>We look forward to seeing you soon!</p><p>Best regards,<br>The BeautyFeel Team</p>`;
}
async function checkAndSendBookingReminders() {
  console.log(
    `[Cron BookingReminder] Starting check for 1-hour booking reminders...`,
  );
  if (!resend) {
    console.warn(
      `[Cron BookingReminder] Resend client not configured. Skipping.`,
    );
    return;
  }

  const now = new Date(); // Current server time
  // Define the window for "about 1 hour from now" in UTC.
  // Cron runs every 15 mins, so window should catch appointments within this 15-min execution slot.
  const reminderWindowStartUTC = new Date(now.getTime() + 50 * 60 * 1000); // Approx 50 minutes from now
  const reminderWindowEndUTC = new Date(now.getTime() + 65 * 60 * 1000); // Approx 65 minutes from now

  try {
    const transactionsToRemind = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING, // Only for PENDING 'later' bookings
        bookedFor: { gte: reminderWindowStartUTC, lte: reminderWindowEndUTC }, // Compare against UTC bookedFor
        bookingReminderSentAt: null, // Reminder not yet sent
        customer: { email: { not: null, contains: "@" } }, // Basic email validity check
      },
      include: {
        customer: { select: { name: true, email: true } },
        availedServices: {
          select: {
            service: { select: { title: true } },
            originatingSetTitle: true,
          },
        }, // For service names
      },
    });

    console.log(
      `[Cron BookingReminder] Found ${transactionsToRemind.length} bookings for 1-hour reminders.`,
    );
    for (const txn of transactionsToRemind) {
      if (!txn.customer?.email) continue; // Should be filtered by query, but defensive check

      const serviceNames = txn.availedServices
        .map((as) => as.originatingSetTitle || as.service?.title || "a service")
        .filter(Boolean);
      const subject = "Reminder: Your BeautyFeel Appointment is Soon!";
      const bodyHtml = generateBookingReminderBody(
        // Changed variable name for clarity
        txn.customer.name,
        new Date(txn.bookedFor),
        serviceNames,
      ); // Pass UTC date from DB
      const html = generateStandardEmailHTML(
        bodyHtml,
        subject,
        LOGO_URL_SERVER,
      ); // Use general HTML helper

      console.log(
        `[Cron BookingReminder] Attempting to send 1-hour reminder for TXN ${txn.id} to ${txn.customer.email}`,
      );
      try {
        const { data: emailData, error: emailError } = await resend.emails.send(
          {
            from: SENDER_EMAIL_SERVER,
            to: [txn.customer.email],
            subject,
            html,
            text: bodyHtml.replace(/<br>/g, "\n").replace(/<[^>]*>/g, ""), // Include plain text version
          },
        );
        if (emailError) {
          console.error(
            `[Cron BookingReminder] Failed to send reminder for TXN ${txn.id}:`,
            emailError,
          );
        } else {
          console.log(
            `[Cron BookingReminder] 1-hour reminder sent for TXN ${txn.id}. Email ID: ${emailData?.id}`,
          );
          await prisma.transaction.update({
            where: { id: txn.id },
            data: { bookingReminderSentAt: new Date() },
          });
        }
      } catch (e) {
        console.error(
          `[Cron BookingReminder] Exception sending email for TXN ${txn.id}:`,
          e,
        );
      }
      await new Promise((r) => setTimeout(r, CRON_ITEM_PROCESSING_DELAY)); // Stagger email sending
    }
  } catch (e) {
    console.error(
      `[Cron BookingReminder] Error during booking reminder check:`,
      e,
    );
  }
  console.log(`[Cron BookingReminder] 1-hour booking reminder check finished.`);
}

// NOTE: generateBookingEmailHTMLSA is unused in the cron jobs,
// it appears to be a duplicate of generateStandardEmailHTML.
// This function seems identical to generateStandardEmailHTML.
// Consider consolidating if it's confirmed to be redundant or has no unique usage elsewhere.
function generateBookingEmailHTMLSA(bodyContent, subjectLine, logoUrl) {
  // Using more robust inline styles for better email client compatibility
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${subjectLine}</title>
      <style>
        body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; background-color: #f9f9f9; }
        .email-container { max-width: 600px; margin: 20px auto; padding: 25px; background-color: #ffffff; border: 1px solid #dddddd; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.05); font-family: Arial, sans-serif; line-height: 1.6; color: #333333; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 1px solid #eeeeee; margin-bottom: 30px; }
        .header img { max-width: 180px; height: auto; }
        .content { padding: 0 10px; font-size: 16px; }
        .content p { margin: 0 0 18px 0; }
        .content ul { padding-left: 20px; margin-top: 0; margin-bottom: 18px; }
        .content li { margin-bottom: 5px; }
        .footer { text-align: center; font-size: 13px; color: #777777; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee; }
        strong { color: #2c3e50; }
      </style>
    </head>
    <body>
      <table width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="#f9f9f9">
        <tr>
          <td align="center" valign="top">
            <div class="email-container">
              <div class="header">
                <img src="${logoUrl}" alt="Clinic Logo">
              </div>
              <div class="content">
                ${bodyContent}
              </div>
              <div class="footer">
                <p>This is an automated message from BeautyFeel Services.<br>Please do not reply directly to this email.</p>
              </div>
            </div>
          </td>
        </tr>
      </table>
    </body>
    </html>`;
}

// --- Booking Confirmation Email Body Generation (MODIFIED to include separate reminder blocks) ---
function generateBookingConfirmationBodySA(
  customerName,
  bookingDateTimeUTC, // This is the JavaScript Date object representing the UTC time
  services,
) {
  // bookingDateTimeUTC is the JavaScript Date object representing the UTC time

  // Correctly uses timeZone: PHILIPPINES_TIMEZONE to format the UTC date
  // into the target timezone's date components
  const dateOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE, // Specify the target timezone
  };
  const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(
    bookingDateTimeUTC,
  );

  // Correctly uses timeZone: PHILIPPINES_TIMEZONE to format the UTC date
  // into the target timezone's time components
  const timeOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE, // Specify the target timezone
  };
  const formattedTime = new Intl.DateTimeFormat("en-US", timeOptions).format(
    bookingDateTimeUTC,
  );

  const serviceListHtml =
    services.length > 0
      ? `<ul>${services.map((s) => `<li>${s.name}</li>`).join("")}</ul>`
      : "<p>Details of services will be confirmed upon arrival.</p>";

  // --- HTML for Appointment Reminder Block ---
  const appointmentReminderHtml = `
    <p style="font-weight: bold; margin-top: 20px; margin-bottom: 5px; color: #555;">Appointment Reminder:</p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      To manage your waiting time, we accept pre-booked appointments but walk-ins are also welcome.
      With this, please be on time on your scheduled appointment. A grace period of 15 minutes will be given.
      Afterwards, your appointment will be automatically cancelled and will treat you as walk-in (first come, first serve).
    </p>
  `;

  // --- HTML for Cancellation/No Show Reminder Block ---
  const cancellationReminderHtml = `
    <p style="font-weight: bold; margin-top: 20px; margin-bottom: 5px; color: #555;">Cancellation/No Show Reminder:</p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      All Appointment Cancellations less than 3 hours prior to scheduled time, will result to a <strong>50% charge</strong> of your service cost.
    </p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      All "No Shows" will be charged <strong>100% of your service cost</strong>.
    </p>
  `;

  // --- Optional: Wrap reminders in a section div for better separation ---
  const reminderSectionHtml = `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee;">
        <p style="font-size: 18px; font-weight: bold; margin-bottom: 15px; text-align: center; color: #2c3e50;">Important Reminders</p>
        ${appointmentReminderHtml}
        ${cancellationReminderHtml}
      </div>
    `;

  // Combine the existing body content with the new reminders
  return `
<p>Hi ${customerName},</p>
<p>Thank you for your booking! Your appointment at BeautyFeel is confirmed for:</p>
<p><strong>Date:</strong> ${formattedDate}<br>
<strong>Time:</strong> ${formattedTime} (Philippine Time)</p>
<p><strong>Services Booked:</strong></p>
${serviceListHtml}

${reminderSectionHtml} <!-- Insert the reminder block here -->

<p style="margin-top: 30px;">We look forward to seeing you! If you need to make any changes to your appointment, please contact us as soon as possible.</p>
<p>Best regards,<br>The BeautyFeel Team</p>
  `.trim(); // Trim whitespace from the whole block
}

// --- Cron Job Scheduling ---
if (resend) {
  // For Follow-up Recommendations
  cron.schedule(FOLLOW_UP_CRON_SCHEDULE, checkAndSendFollowUpReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] Follow-up recommendation reminders scheduled: ${FOLLOW_UP_CRON_SCHEDULE} (Timezone: ${CRON_TIMEZONE})`,
  );
  checkAndSendFollowUpReminders(); // Initial run on startup for follow-ups

  // For 1-Hour Booking Reminders
  cron.schedule(BOOKING_REMINDER_CRON_SCHEDULE, checkAndSendBookingReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] 1-hour booking reminders scheduled: ${BOOKING_REMINDER_CRON_SCHEDULE} (Timezone: ${CRON_TIMEZONE})`,
  );
  // checkAndSendBookingReminders(); // Optional: run booking reminders on startup too, but be mindful of window
} else {
  console.warn(
    `[Cron] RESEND_API_KEY not set. All email reminder tasks are DISABLED.`,
  );
}

// --- Express Route ---
app.get("/", (req, res) =>
  res.status(200).send("BeautyFeel Socket Server is Running"),
);

// --- Socket.IO Connections ---
io.on("connection", (socket) => {
  const clientId = socket.id;
  const connectedAccountId =
    socket.handshake.query?.accountId || "N/A_SocketUser";
  console.log(
    `Client connected: ${clientId}, Account: ${connectedAccountId}, IP: ${socket.handshake.address}`,
  );

  // --- checkService Handler ---
  socket.on(
    "checkService",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX checkService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceCheckError", {
          availedServiceId,
          message: "Invalid request data.",
        });
        return;
      }
      try {
        // REMOVED: pendingCheckSelections logic
        // if (
        //   pendingCheckSelections.has(accountId) &&
        //   pendingCheckSelections.get(accountId) !== availedServiceId
        // ) {
        //   socket.emit("serviceCheckError", {
        //     availedServiceId,
        //     message: "You are already checking another service.",
        //   });
        //   return;
        // }
        // pendingCheckSelections.set(accountId, availedServiceId); // REMOVED

        const as = await prisma.availedService.findUnique({
          where: { id: availedServiceId },
          include: { checkedBy: true },
        });

        if (!as) {
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: "Service item not found.",
          });
        } else if (as.checkedById && as.checkedById !== accountId) {
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: `Already checked by ${as.checkedBy?.name || "another user"}.`,
          });
        } else if (as.status === Status.DONE) {
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: `Service already completed.`,
          });
        } else {
          // If as.checkedById === accountId, this is a re-check, which is fine.
          // If as.checkedById is null, this will check it.
          const updatedAS = await prisma.availedService.update({
            where: { id: availedServiceId },
            data: { checkedById: accountId }, // Set checkedById
            include: {
              service: { select: { title: true } },
              checkedBy: { select: { name: true } }, // Will now reflect the current accountId
              servedBy: { select: { name: true } },
            },
          });
          io.emit("availedServiceUpdated", updatedAS); // Broadcast update
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} checked by ${accountId}.`,
          );
          return; // Success
        }
        // REMOVED: pendingCheckSelections.delete(accountId); // Clear if error occurred before successful update
      } catch (error) {
        console.error(
          `[Socket ${clientId}] checkService ERROR for ${availedServiceId}:`,
          error,
        );
        socket.emit("serviceCheckError", {
          availedServiceId,
          message: "Server error checking service.",
        });
        // REMOVED: pendingCheckSelections.delete(accountId);
      }
    },
  );

  // --- uncheckService Handler ---
  socket.on("uncheckService", async ({ availedServiceId, accountId }) => {
    console.log(
      `[Socket ${clientId}] RX uncheckService: AS_ID=${availedServiceId}, ACC_ID=${accountId}`,
    );
    if (!availedServiceId || !accountId) {
      socket.emit("serviceUncheckError", {
        availedServiceId,
        message: "Invalid request.",
      });
      return;
    }
    try {
      // Attempt to update only if it's currently checked by this user and is pending
      const updatedAS = await prisma.availedService.update({
        where: {
          id: availedServiceId,
          checkedById: accountId, // Crucial: only uncheck if checked by this user
          status: Status.PENDING, // Crucial: only uncheck if service is pending
        },
        data: { checkedById: null }, // Set checkedById to null
        include: {
          service: { select: { title: true } },
          // Corrected: Specify what to select. Prisma will return null for 'checkedBy' in the
          // 'updatedAS' object because 'checkedById' is being set to null.
          checkedBy: { select: { id: true, name: true } },
          servedBy: { select: { name: true } },
        },
      });
      io.emit("availedServiceUpdated", updatedAS); // updatedAS.checkedBy will be null
      console.log(
        `[Socket ${clientId}] AvailedService ${availedServiceId} UNCHECKED by ${accountId}.`,
      );
    } catch (error) {
      console.error(
        `[Socket ${clientId}] uncheckService ERROR for ${availedServiceId}:`,
        error, // Log the full error object for better debugging stack traces
      );
      let userMsg = "Could not uncheck service.";
      if (error.code === "P2025") {
        // Prisma's "Record to update not found"
        // Conditions in 'where' were not met (e.g., not checked by this user, or not pending)
        const currentAS = await prisma.availedService.findUnique({
          where: { id: availedServiceId },
          select: {
            status: true,
            checkedById: true,
            checkedBy: { select: { name: true } },
          },
        });
        if (!currentAS) userMsg = "Service not found.";
        else if (currentAS.status !== Status.PENDING)
          userMsg = `Cannot uncheck: Status is ${currentAS.status}.`;
        else if (currentAS.checkedById !== accountId)
          userMsg = `Cannot uncheck: Not checked by you (Checked by ${currentAS.checkedBy?.name || "N/A"}).`;
      } else if (error instanceof TypeError) {
        // Generic message for TypeErrors or other unexpected issues
        userMsg = "An unexpected error occurred. Please try again.";
      }
      // else if ... other specific error handling if needed

      socket.emit("serviceUncheckError", {
        availedServiceId,
        message: userMsg,
      });
    }
  });

  // --- markServiceServed Handler (Final Version with suppressNextFollowUpGeneration logic) ---
  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] MarkServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message: "Invalid data.",
        });
        return;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const updatedAS = await tx.availedService.update({
            where: { id: availedServiceId, status: Status.PENDING }, // Can only mark PENDING services as DONE
            data: {
              servedById: accountId,
              status: Status.DONE,
              completedAt: new Date(),
            },
            include: {
              service: {
                select: {
                  id: true,
                  title: true,
                  recommendFollowUp: true,
                  recommendedFollowUpDays: true,
                  followUpPolicy: true,
                },
              },
              transaction: {
                select: {
                  id: true,
                  customerId: true,
                  attendedAppointment: {
                    select: {
                      id: true,
                      originatingServiceId: true,
                      suppressNextFollowUpGeneration: true,
                    },
                  },
                },
              },
              checkedBy: { select: { id: true, name: true } }, // Keep checkedBy info
              servedBy: { select: { id: true, name: true } }, // Will reflect current accountId
            },
          });

          const svcDetails = updatedAS.service;
          const txnDetails = updatedAS.transaction;
          let suppressedByFulfilledRA = false;
          if (
            txnDetails?.attendedAppointment &&
            svcDetails?.id ===
              txnDetails.attendedAppointment.originatingServiceId &&
            txnDetails.attendedAppointment.suppressNextFollowUpGeneration ===
              true
          ) {
            suppressedByFulfilledRA = true;
            console.log(
              `[Socket ${clientId}] RA gen for "${svcDetails.title}" (AS_ID ${updatedAS.id}) SUPPRESSED by fulfilled RA ${txnDetails.attendedAppointment.id}.`,
            );
          }

          if (suppressedByFulfilledRA) {
            /* Do nothing for RA creation if suppressed */
          } else if (
            !svcDetails?.recommendFollowUp ||
            svcDetails.followUpPolicy === FollowUpPolicy.NONE ||
            !svcDetails.recommendedFollowUpDays ||
            svcDetails.recommendedFollowUpDays <= 0 ||
            !updatedAS.completedAt
          ) {
            console.log(
              `[Socket ${clientId}] No new RA for "${svcDetails?.title}" (AS_ID ${updatedAS.id}) based on service policy/config (Policy: ${svcDetails?.followUpPolicy}, Recommend: ${svcDetails?.recommendFollowUp}, Days: ${svcDetails?.recommendedFollowUpDays}).`,
            );
          } else {
            // Conditions met to potentially create an RA
            let createNewRA = true;
            if (svcDetails.followUpPolicy === FollowUpPolicy.ONCE) {
              const existingAttended =
                await tx.recommendedAppointment.findFirst({
                  where: {
                    customerId: txnDetails.customerId,
                    originatingServiceId: svcDetails.id,
                    status: RecommendedAppointmentStatus.ATTENDED,
                  },
                  select: { id: true },
                });
              if (existingAttended) {
                createNewRA = false;
                console.log(
                  `[Socket ${clientId}] Policy ONCE: Attended RA exists for service type "${svcDetails.title}". Skipping new RA for AS_ID ${updatedAS.id}.`,
                );
              }
            }
            if (createNewRA) {
              const existingRAForInstance =
                await tx.recommendedAppointment.findUnique({
                  where: { originatingAvailedServiceId: updatedAS.id },
                  select: { id: true },
                });
              if (existingRAForInstance) {
                console.warn(
                  `[Socket ${clientId}] RA already exists for this specific AS_ID ${updatedAS.id}. Skipping duplicate creation.`,
                );
              } else {
                const recDate = addDays(
                  new Date(updatedAS.completedAt),
                  svcDetails.recommendedFollowUpDays,
                ); // Ensure Date object
                recDate.setHours(9, 0, 0, 0); // Standardize time (e.g., 9 AM)
                const newRA = await tx.recommendedAppointment.create({
                  data: {
                    customerId: txnDetails.customerId,
                    recommendedDate: recDate,
                    originatingTransactionId: txnDetails.id,
                    originatingAvailedServiceId: updatedAS.id,
                    originatingServiceId: svcDetails.id,
                    status: RecommendedAppointmentStatus.RECOMMENDED,
                  },
                });
                console.log(
                  `[Socket ${clientId}] Created new RA ${newRA.id} for "${svcDetails.title}" (AS_ID ${updatedAS.id}).`,
                );
              }
            }
          }
          // Update Customer.nextAppointment
          const custWithRAs = await tx.customer.findUnique({
            where: { id: txnDetails.customerId },
            select: {
              nextAppointment: true,
              recommendedAppointments: {
                where: {
                  status: {
                    in: [
                      RecommendedAppointmentStatus.RECOMMENDED,
                      RecommendedAppointmentStatus.SCHEDULED,
                    ],
                  },
                  recommendedDate: { gte: startOfDay(new Date()) },
                },
                orderBy: { recommendedDate: "asc" },
                take: 1,
                select: { recommendedDate: true },
              },
            },
          });
          const newNextApptDate =
            custWithRAs?.recommendedAppointments[0]?.recommendedDate || null;
          const currentNextApptDate = custWithRAs?.nextAppointment || null;
          if (
            (newNextApptDate === null && currentNextApptDate !== null) ||
            (newNextApptDate !== null && currentNextApptDate === null) ||
            (newNextApptDate !== null &&
              currentNextApptDate !== null &&
              !isEqual(
                startOfDay(newNextApptDate),
                startOfDay(currentNextApptDate),
              ))
          ) {
            await tx.customer.update({
              where: { id: txnDetails.customerId },
              data: { nextAppointment: newNextApptDate },
            });
            console.log(
              `[Socket ${clientId}] Customer ${txnDetails.customerId} nextAppointment updated to ${newNextApptDate?.toISOString().split("T")[0] || "null"}.`,
            );
          }
          return updatedAS; // Return the updated AvailedService from transaction
        });
        io.emit("availedServiceUpdated", result); // Broadcast result to all clients
        if (transactionId) checkAndManageCompletionTimer(transactionId); // Check if parent transaction can be completed
        // REMOVED: pendingCheckSelections.delete(accountId); // Service served, no longer relevant to pendingCheckSelections
      } catch (e) {
        console.error(
          `[Socket ${clientId}] MarkServed ERROR for AS_ID ${availedServiceId}:`,
          e,
        );
        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message:
            e.code === "P2025"
              ? "Service not found or already served."
              : e.message || "Error marking service as served.",
        });
      }
    },
  );

  // --- unmarkServiceServed Handler ---
  socket.on(
    "unmarkServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX unmarkServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceUnmarkServedError", {
          availedServiceId,
          message: "Invalid request.",
        });
        return;
      }
      try {
        // Ensure the transaction this service belongs to is still PENDING
        const parentTransaction = await prisma.transaction.findUnique({
          where: { id: transactionId },
          select: { status: true },
        });

        if (parentTransaction?.status !== Status.PENDING) {
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: `Cannot unmark: Transaction status is ${parentTransaction?.status}.`,
          });
          return;
        }

        const updatedAS = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            servedById: accountId, // Must have been served by this account
            status: Status.DONE, // Must currently be DONE
          },
          data: { servedById: null, status: Status.PENDING, completedAt: null },
          include: {
            service: { select: { title: true } },
            checkedBy: { select: { name: true } }, // Keep checkedBy info
            servedBy: null, // Will be null
          },
        });
        io.emit("availedServiceUpdated", updatedAS);
        cancelCompletionTimer(transactionId); // Transaction no longer fully done
        console.log(
          `[Socket ${clientId}] AvailedService ${availedServiceId} UNMARKED as served by ${accountId}.`,
        );
      } catch (error) {
        console.error(
          `[Socket ${clientId}] unmarkServiceServed ERROR for ${availedServiceId}:`,
          error.code,
          error.message,
        );
        let userMsg = "Could not unmark service.";
        if (error.code === "P2025") {
          // Record to update not found / conditions not met
          const currentAS = await prisma.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              status: true,
              servedById: true,
              servedBy: { select: { name: true } },
              transaction: { select: { status: true } },
            },
          });
          if (!currentAS) userMsg = "Service not found.";
          else if (currentAS.transaction?.status !== Status.PENDING)
            userMsg = `Cannot unmark: Transaction is ${currentAS.transaction?.status}.`;
          else if (currentAS.status !== Status.DONE)
            userMsg = `Cannot unmark: Service status is ${currentAS.status}.`;
          else if (currentAS.servedById !== accountId)
            userMsg = `Cannot unmark: Not served by you (Served by ${currentAS.servedBy?.name || "N/A"}).`;
        }
        socket.emit("serviceUnmarkServedError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  // --- Disconnect Handler ---
  socket.on("disconnect", (reason) => {
    console.log(
      `Client disconnected: ${clientId}, Account: ${connectedAccountId}, Reason: ${reason}`,
    );
    // REMOVED: pendingCheckSelections logic
    // if (pendingCheckSelections.has(connectedAccountId)) {
    //   pendingCheckSelections.delete(connectedAccountId);
    //   console.log(
    //     `[Socket ${clientId}] Cleared pending selection for ${connectedAccountId} on disconnect.`,
    //   );
    // }
  });

  socket.on("connect_error", (err) => {
    console.error(`Socket connect_error for ${clientId}: ${err.message}`);
  });
});

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`🚀 BeautyFeel Socket Server running on port ${PORT}`);
  console.log(`🔗 Allowed CORS origins: ${allowedOrigins.join(", ")}`);
  if (!resendKey && process.env.NODE_ENV !== "test") {
    // Don't log error in test env if not needed
    console.error(
      "🛑 Resend API Key is MISSING. Email functionalities will be impaired or disabled.",
    );
  }
});

// --- Graceful Shutdown ---
const shutdown = (signal) => {
  console.log(`\n${signal} signal received. Starting graceful shutdown...`);
  console.log("Stopping cron jobs...");
  cron.getTasks().forEach((task) => task.stop());
  console.log("Cron jobs stopped.");

  httpServer.close((errHttp) => {
    if (errHttp) console.error("Error closing HTTP server:", errHttp);
    else console.log("HTTP server closed.");

    io.close((errIo) => {
      if (errIo) console.error("Error closing Socket.IO server:", errIo);
      else console.log("Socket.IO server closed.");

      console.log("Disconnecting Prisma Client...");
      prisma
        .$disconnect()
        .then(() => {
          console.log("Prisma Client disconnected. Shutdown complete.");
          process.exit(0); // Success
        })
        .catch((errPrisma) => {
          console.error("Error disconnecting Prisma Client:", errPrisma);
          process.exit(1); // Failure
        });
    });
  });

  // Force shutdown if graceful period times out
  setTimeout(() => {
    console.error(
      "Graceful shutdown timed out (10s). Forcefully shutting down.",
    );
    process.exit(1);
  }, 10000); // 10 seconds timeout
};
process.on("SIGTERM", () => shutdown("SIGTERM")); // Standard signal for termination from OS/process managers
process.on("SIGINT", () => shutdown("SIGINT")); // Ctrl+C from terminal
