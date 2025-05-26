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
require("dotenv").config({ path: "../.env" });

// --- Environment & Initialization ---
const PORT = process.env.PORT || 9000;
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
const COMPLETION_DELAY = 3 * 60 * 1000; // 3 minutes

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;
if (!resendKey && process.env.NODE_ENV === "production") {
  console.warn(
    "WARNING (Socket Server): RESEND_API_KEY is not set. Email reminders will be DISABLED.",
  );
}
const SENDER_EMAIL_SERVER = process.env.SENDER_EMAIL || "onboarding@resend.dev"; // Replace with your actual sender domain
const LOGO_URL_SERVER =
  process.env.LOGO_URL || "https://beautyfeel.net/btfeel-icon.png"; // Replace with your actual logo URL
const PHILIPPINES_TIMEZONE = process.env.TIMEZONE || "Asia/Manila"; // Default to Manila if not set

// Follow-up Recommendation Reminder Configuration
const FOLLOW_UP_REMINDER_WINDOWS_DAYS = [7, 3, 2, 1, 0, -1, -7, -14]; // Added more windows for testing/coverage
const FOLLOW_UP_REMINDER_FIELDS = {
  7: "reminder7DaySentAt",
  3: "reminder3DaySentAt",
  2: "reminder2DaySentAt",
  1: "reminder1DaySentAt",
  0: "reminderTodaySentAt",
  "-1": "reminder1DayAfterSentAt",
  "-7": "reminder7DayAfterSentAt",
  "-14": "reminder14DayAfterSentAt",
};
// Map days to a description phrase for subject
const DAYS_AWAY_PHRASE = {
  7: "in 7 days",
  3: "in 3 days",
  2: "in 2 days",
  1: "Tomorrow",
  0: "Today",
  "-1": "Yesterday",
  "-7": "7 days ago",
  "-14": "2 weeks ago",
};

const FOLLOW_UP_CRON_SCHEDULE =
  process.env.FOLLOW_UP_CRON_SCHEDULE || "0 9 * * *"; // 9:00 AM daily
// const FOLLOW_UP_CRON_SCHEDULE = "*/1 * * * *"; // For testing (every minute)

// Booking (1-Hour) Reminder Configuration
const BOOKING_REMINDER_CRON_SCHEDULE =
  process.env.BOOKING_REMINDER_CRON_SCHEDULE || "*/15 * * * *"; // Every 15 minutes
// const BOOKING_REMINDER_CRON_SCHEDULE = "*/1 * * * *"; // For testing (every minute)

const CRON_ITEM_PROCESSING_DELAY = parseInt(
  process.env.CRON_ITEM_DELAY || "100", // Delay in ms between processing cron items to avoid overwhelming resources
  10,
);
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Asia/Manila"; // Timezone for cron scheduling

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000, // default: 5000
    timeout: 15000, // default: 5000
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

    // Only proceed if the transaction exists and is still PENDING
    if (!transaction || transaction.status !== Status.PENDING) {
      cancelCompletionTimer(transactionId); // Ensure timer is off if status isn't PENDING
      console.log(
        `[Socket TXN Complete Timer ${transactionId}] Status is not PENDING or TXN not found. Timer check aborted.`,
      );
      return;
    }

    const allDone =
      transaction.availedServices.length > 0 &&
      transaction.availedServices.every((as) => as.status === Status.DONE);

    if (allDone) {
      // If all services are done and no timer is running, start one
      if (!transactionCompletionTimers.has(transactionId)) {
        startCompletionTimer(transactionId);
      } else {
        console.log(
          `[Socket TXN Complete Timer ${transactionId}] All services DONE. Timer already active.`,
        );
      }
    } else {
      // If not all services are done, cancel any existing timer
      cancelCompletionTimer(transactionId);
      console.log(
        `[Socket TXN Complete Timer ${transactionId}] Not all services DONE. Timer cancelled/not needed.`,
      );
    }
  } catch (error) {
    console.error(
      `[Socket TXN Complete Timer ${transactionId}] Error in checkAndManageCompletionTimer:`,
      error,
    );
    cancelCompletionTimer(transactionId); // Cancel timer on error
  }
}

function startCompletionTimer(transactionId) {
  // Cancel any existing timer for this transaction first
  cancelCompletionTimer(transactionId);

  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Setting completion timer (${COMPLETION_DELAY / 1000}s).`,
  );
  const timerId = setTimeout(async () => {
    console.log(
      `[Socket TXN Complete Timer ${transactionId}] Timer finished. Attempting auto-completion...`,
    );
    // Remove timer ID from map *before* the async completion process starts
    transactionCompletionTimers.delete(transactionId);
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);

  transactionCompletionTimers.set(transactionId, timerId);
}

async function completeTransactionAndCalculateSalary(transactionId) {
  console.log(
    `[Socket TXN Complete ${transactionId}] Processing final completion and salary calculation (with discount logic).`,
  );
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const transactionData = await tx.transaction.findUnique({ // Renamed for clarity
          where: { id: transactionId },
          select: {
            id: true,
            status: true,
            // amount: true, // REMOVE THIS - 'amount' is not a direct field
            grandTotal: true,
            discount: true, // Keep this if it represents the value of the discount applied
            availedServices: {
              select: {
                id: true,
                servedById: true,
                status: true,
                price: true, // We need this to calculate the original sum
              },
            },
          },
        });

        if (!transactionData) {
          console.warn(
            `[Socket TXN Complete ${transactionId}] Transaction not found. Aborting completion.`
          );
          return null;
        }

        // Calculate the original sum of service prices (this is what 'amount' conceptually was)
        const originalSumOfServicePrices = transactionData.availedServices.reduce(
          (sum, service) => sum + (service.price || 0), // Add (service.price || 0) for safety
          0
        );

        // Final check within the transaction to ensure state hasn't changed
        const allServicesDone =
          transactionData.availedServices.length > 0 &&
          transactionData.availedServices.every((as) => as.status === Status.DONE);

        if (
          transactionData.status !== Status.PENDING ||
          !allServicesDone
        ) {
          console.warn(
            `[Socket TXN Complete ${transactionId}] Final check FAILED within DB transaction. Aborting completion. Status: ${transactionData.status}, AllDone: ${allServicesDone}`,
          );
          return null;
        }

        // --- Commission Calculation Logic ---
        const salaryUpdates = new Map();
        const availedServiceCommissionUpdates = [];

        // Calculate the discount factor based on total transaction amount
        // The 'originalSumOfServicePrices' is the base amount before transaction-level discount
        const discountFactor =
          originalSumOfServicePrices > 0
            ? transactionData.grandTotal / originalSumOfServicePrices
            : 1;

        console.log(
          `[Socket TXN Complete ${transactionId}] Original Sum: ${originalSumOfServicePrices}, Grand Total: ${transactionData.grandTotal}, Discount Applied: ${transactionData.discount}, Discount Factor: ${discountFactor.toFixed(4)}`,
        );

        for (const availedSvc of transactionData.availedServices) {
          if (availedSvc.servedById && availedSvc.status === Status.DONE) {
            // Calculate the effective price after applying the transaction-wide discount factor
            const effectivePrice = (availedSvc.price || 0) * discountFactor;

            // Calculate the commission (10% of the effective price)
            const calculatedCommission = Math.max(0, effectivePrice * 0.1); // 10% rate

            console.log(
              `[Socket TXN Complete ${transactionId}] AS ${availedSvc.id}: Original Price=${availedSvc.price}, Effective Price=${effectivePrice.toFixed(2)}, Calculated Commission=${calculatedCommission.toFixed(2)}`,
            );

            salaryUpdates.set(
              availedSvc.servedById,
              (salaryUpdates.get(availedSvc.servedById) || 0) +
                calculatedCommission,
            );

            availedServiceCommissionUpdates.push({
              id: availedSvc.id,
              commissionValue: calculatedCommission,
            });
          }
        }
        // --- End Commission Calculation ---

        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: Status.DONE },
        });
        console.log(
          `[Socket TXN Complete ${transactionId}] Transaction status set to DONE.`,
        );

        if (availedServiceCommissionUpdates.length > 0) {
          console.log(
            `[Socket TXN Complete ${transactionId}] Updating commission values for ${availedServiceCommissionUpdates.length} availed services.`,
          );
          await Promise.all(
            availedServiceCommissionUpdates.map((updateData) =>
              tx.availedService
                .update({
                  where: { id: updateData.id },
                  data: { commissionValue: updateData.commissionValue },
                })
                .catch((e) => {
                  console.error(
                    `[Socket TXN Complete ${transactionId}] AvailedService commission update failed for AS ${updateData.id} within transaction:`,
                    e,
                  );
                  throw new Error(
                    `AvailedService commission update failed for AS ${updateData.id}: ${e.message}`,
                  );
                }),
            ),
          );
        }

        if (salaryUpdates.size > 0) {
          console.log(
            `[Socket TXN Complete ${transactionId}] Applying salary increments for ${salaryUpdates.size} accounts.`,
          );
          await Promise.all(
            Array.from(salaryUpdates.entries()).map(([accId, salAmount]) => // Renamed 'amount' to 'salAmount' to avoid confusion
              tx.account
                .update({
                  where: { id: accId },
                  data: { salary: { increment: salAmount } },
                })
                .catch((e) => {
                  console.error(
                    `[Socket TXN Complete ${transactionId}] Salary update failed for Account ${accId} within transaction:`,
                    e,
                  );
                  throw new Error(
                    `Salary update failed for Account ${accId}: ${e.message}`,
                  );
                }),
            ),
          );
        }

        console.log(
          `[Socket TXN Complete ${transactionId}] Fetching final transaction state for broadcast.`,
        );
        const finalTransactionState = await tx.transaction.findUnique({
          where: { id: transactionId },
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
        return finalTransactionState;
      },
      {
        timeout: 15000,
      },
    );

    if (result) {
      io.emit("transactionCompleted", result);
      console.log(
        `[Socket TXN Complete ${transactionId}] Transaction successfully completed and broadcasted.`,
      );
    } else {
      console.log(
        `[Socket TXN Complete ${transactionId}] Transaction completion aborted within DB transaction due to state change or not found.`,
      );
    }
  } catch (error) {
    console.error(
      `[Socket TXN Complete ${transactionId}] CRITICAL error during completeTransactionAndCalculateSalary:`,
      error,
    );
  }
}

// --- Generic Email Sending Function using Templates ---

/**
 * Generates the basic HTML structure for an email using a template body HTML.
 * @param {string} templateBodyHtml - The HTML fetched from EmailTemplate.body.
 * @param {string} subjectLine - The final subject line for the <title> tag.
 * @param {string} logoUrl - URL for the logo image.
 * @param {string} bodyContentHtml - The dynamically generated HTML content block.
 * @returns {string} The full HTML for the email.
 */
function generateBaseEmailHtmlFromTemplate(
  templateBodyHtml,
  subjectLine,
  logoUrl,
  bodyContentHtml,
) {
  let processedHtml = templateBodyHtml
    .replace("{{subject}}", subjectLine)
    .replace("{{logoUrl}}", logoUrl)
    .replace("{{emailContent}}", bodyContentHtml);

  // Add other common placeholders if your templates use them directly in the base structure
  // Example: {{shopName}}, {{footerAddress}}, etc.
  // processedHtml = processedHtml.replace("{{shopName}}", "BeautyFeel");

  return processedHtml;
}

/**
 * Generates the dynamic content HTML block for the Follow-up Reminder email.
 * @param {string} customerName - The customer's name.
 * @param {number} daysAway - Difference in days from today to recommended date.
 * @param {Date} recommendedDateUTC - The recommended appointment date (UTC).
 * @returns {string} HTML snippet for the email body content.
 */
function generateFollowUpReminderContentHtml(
  customerName,
  daysAway,
  recommendedDateUTC,
) {
  const dateOptionsIntl = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedRecDate = new Intl.DateTimeFormat(
    "en-US",
    dateOptionsIntl,
  ).format(recommendedDateUTC);

  let intro;
  let timeAdverb;
  let action;

  if (daysAway > 0) {
    intro =
      "Just a friendly reminder that your recommended follow-up date is approaching.";
    timeAdverb = `${DAYS_AWAY_PHRASE[daysAway] || `in ${daysAway} days`}, on ${formattedRecDate}.`;
    action =
      "Booking ensures you maintain optimal results and secure your preferred time.";
  } else if (daysAway === 0) {
    intro = "This is a reminder about your recommended follow-up scheduled for";
    timeAdverb = `<strong>today, ${formattedRecDate}</strong>!`;
    action =
      "Please be on time for your appointment. We look forward to seeing you!";
  } else {
    // daysAway < 0
    intro = "We noticed your recommended follow-up date has passed.";
    timeAdverb = `${DAYS_AWAY_PHRASE[daysAway] || `${Math.abs(daysAway)} days ago`}, on ${formattedRecDate}.`;
    action =
      "It's not too late to get back on track! Contact us to schedule your next visit.";
  }

  return `
<p>Hi ${customerName},</p>
<p>${intro}</p>
<p>Your recommended date ${timeAdverb}</p>
<p>${action}</p>
<p style="margin-top: 20px; margin-bottom: 0;">Best regards,<br>The BeautyFeel Team</p>
  `.trim();
}

/**
 * Generates the dynamic content HTML block for the Booking (1-Hour) Reminder email.
 * @param {string} customerName - The customer's name.
 * @param {Date} bookingDateTimeUTC - The booking date and time (UTC).
 * @param {string[]} serviceNamesList - List of service names.
 * @returns {string} HTML snippet for the email body content.
 */
function generateBookingReminderContentHtml(
  customerName,
  bookingDateTimeUTC,
  serviceNamesList,
) {
  const timeOptionsIntl = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedBookedTime = new Intl.DateTimeFormat(
    "en-US",
    timeOptionsIntl,
  ).format(bookingDateTimeUTC);

  const servicesString =
    serviceNamesList.length > 0
      ? serviceNamesList.join(", ")
      : "your scheduled services";

  return `
<p>Hi ${customerName},</p>
<p>This is a friendly reminder that your appointment for ${servicesString} is in about one hour, at <strong>${formattedBookedTime}</strong> today (Philippine Time).</p>
<p>We look forward to seeing you soon!</p>
<p style="margin-top: 20px; margin-bottom: 0;">Best regards,<br>The BeautyFeel Team</p>
  `.trim();
}

/**
 * Sends an email using a template fetched from the database.
 * @param {string} templateName - The name of the email template in the database.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} customerName - The customer's name (for placeholders).
 * @param {string} dynamicBodyHtml - The dynamically generated HTML content for the body.
 * @param {Record<string, string>} [subjectPlaceholders={}] - Optional map for subject placeholders.
 * @returns {Promise<boolean>} True if the email sending attempt was made (even if Resend returned an error), false if prerequisites failed.
 */
async function sendEmailFromTemplate(
  templateName,
  toEmail,
  customerName,
  dynamicBodyHtml,
  subjectPlaceholders = {},
) {
  if (!resend) {
    console.warn(
      `[Email Sender] Resend instance not initialized. Skipping email for ${toEmail}.`,
    );
    return false;
  }

  if (!toEmail || !toEmail.includes("@")) {
    console.warn(
      `[Email Sender] Invalid or missing recipient email address: "${toEmail}". Skipping email.`,
    );
    return false;
  }

  try {
    // 1. Fetch the email template from the database
    const emailTemplate = await prisma.emailTemplate.findUnique({
      where: { name: templateName },
    });

    if (!emailTemplate || !emailTemplate.isActive) {
      console.warn(
        `[Email Sender] Email template "${templateName}" not found or is inactive. Skipping email for ${toEmail}.`,
      );
      return false;
    }

    // 2. Replace placeholders in the template subject
    let processedSubject = emailTemplate.subject.replace(
      "{{customerName}}",
      customerName,
    );
    // Replace other subject-specific placeholders
    for (const key in subjectPlaceholders) {
      if (subjectPlaceholders.hasOwnProperty(key)) {
        const placeholder = `{{${key}}}`;
        processedSubject = processedSubject.replace(
          placeholder,
          subjectPlaceholders[key],
        );
      }
    }

    // 3. Construct the full HTML body using the template body and the dynamic content
    const fullHtmlBody = generateBaseEmailHtmlFromTemplate(
      emailTemplate.body,
      processedSubject,
      LOGO_URL_SERVER,
      dynamicBodyHtml,
    );

    // 4. Generate plain text fallback
    const plainTextBody = dynamicBodyHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .trim();

    // 5. Send the email
    console.log(
      `[Email Sender] Attempting to send "${templateName}" email to ${toEmail} with subject: "${processedSubject}"`,
    );
    const { data, error: emailSendError } = await resend.emails.send({
      from: SENDER_EMAIL_SERVER,
      to: [toEmail],
      subject: processedSubject,
      html: fullHtmlBody,
      text: plainTextBody,
    });

    if (emailSendError) {
      console.error(
        `[Email Sender] Failed to send "${templateName}" email to ${toEmail}:`,
        emailSendError,
      );
      return false;
    } else {
      console.log(
        `[Email Sender] "${templateName}" email sent successfully to ${toEmail}. Email ID: ${data?.id}`,
      );
      return true;
    }
  } catch (error) {
    console.error(
      `[Email Sender] Exception occurred while sending "${templateName}" email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

// --- Cron Job Scheduling ---
if (resend) {
  // Cron for Follow-up Reminders
  cron.schedule(FOLLOW_UP_CRON_SCHEDULE, checkAndSendFollowUpReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] Follow-up recommendation reminders scheduled: ${FOLLOW_UP_CRON_SCHEDULE} (Timezone: ${CRON_TIMEZONE})`,
  );
  // Run once immediately on startup
  checkAndSendFollowUpReminders();

  // Cron for Booking Reminders
  cron.schedule(BOOKING_REMINDER_CRON_SCHEDULE, checkAndSendBookingReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] 1-hour booking reminders scheduled: ${BOOKING_REMINDER_CRON_SCHEDULE} (Timezone: ${CRON_TIMEZONE})`,
  );
  // Run once immediately on startup
  checkAndSendBookingReminders();
} else {
  console.warn(
    `[Cron] RESEND_API_KEY not set. All email reminder tasks are DISABLED.`,
  );
}

// --- Follow-up Recommendation Email Cron Job ---
async function checkAndSendFollowUpReminders() {
  console.log(
    `[Cron FollowUp] Starting check for follow-up recommendation reminders...`,
  );

  const todayCronTimezone = startOfDay(new Date());

  const targetDates = FOLLOW_UP_REMINDER_WINDOWS_DAYS.map((days) =>
    startOfDay(addDays(todayCronTimezone, days)),
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
        recommendedDate: {
          // Query RAs specifically matching one of the calculated target dates
          in: targetDates.map((date) => date.toISOString()), // Convert Date objects to ISO strings for 'in' query
        },
        customer: { email: { not: null, contains: "@" } }, // Ensure customer exists and has an email
        // Add conditions to ensure the specific reminder field for this date hasn't been sent
        // This requires dynamic WHERE clause based on daysAway, which is complex for findMany.
        // Instead, we filter *after* fetching, which is simpler for a small number of RAs.
      },
      select: {
        id: true,
        recommendedDate: true, // This is a Date object (in UTC from DB)
        customer: { select: { id: true, name: true, email: true } },
        reminder7DaySentAt: true,
        reminder3DaySentAt: true,
        reminder2DaySentAt: true,
        reminder1DaySentAt: true,
        reminderTodaySentAt: true,
        reminder1DayAfterSentAt: true,
        reminder7DayAfterSentAt: true,
        reminder14DayAfterSentAt: true,
      },
    });

    console.log(
      `[Cron FollowUp] Found ${rAsToConsider.length} RAs matching target reminder dates.`,
    );

    for (const ra of rAsToConsider) {
      // Calculate days away relative to today in the cron's timezone
      const daysAway = differenceInDays(
        startOfDay(new Date(ra.recommendedDate)), // Use date-only for comparison
        todayCronTimezone,
      );

      // Find the correct reminder field based on the calculated daysAway
      const reminderFieldToUpdate = FOLLOW_UP_REMINDER_FIELDS[daysAway];

      // Check if this specific reminder has NOT been sent yet AND the field exists in our map
      if (reminderFieldToUpdate && ra[reminderFieldToUpdate] === null) {
        console.log(
          `[Cron FollowUp] Preparing to send ${daysAway}-day reminder for RA ${ra.id} to ${ra.customer.email}`,
        );

        const dynamicBodyHtml = generateFollowUpReminderContentHtml(
          ra.customer.name,
          daysAway,
          new Date(ra.recommendedDate),
        );

        const subjectPlaceholders = {
          daysAwayPhrase:
            DAYS_AWAY_PHRASE[daysAway] ||
            `${Math.abs(daysAway)} days ${daysAway > 0 ? "away" : "ago"}`,
        };

        const emailSentSuccessfully = await sendEmailFromTemplate(
          "Follow-up Reminder",
          ra.customer.email,
          ra.customer.name,
          dynamicBodyHtml,
          subjectPlaceholders,
        );

        if (emailSentSuccessfully) {
          try {
            await prisma.recommendedAppointment.update({
              where: { id: ra.id },
              data: { [reminderFieldToUpdate]: new Date() },
            });
            console.log(
              `[Cron FollowUp] Marked ${reminderFieldToUpdate} for RA ${ra.id}.`,
            );
          } catch (dbUpdateError) {
            console.error(
              `[Cron FollowUp] Failed to update RA ${ra.id} after email send:`,
              dbUpdateError,
            );
          }
        }

        await new Promise((r) => setTimeout(r, CRON_ITEM_PROCESSING_DELAY));
      } else if (reminderFieldToUpdate) {
        console.log(
          `[Cron FollowUp] Skipping ${daysAway}-day reminder for RA ${ra.id}. Already sent.`,
        );
      }
    }

    // Cleanup: Mark old RAs as MISSED
    const furthestNegativeDay = Math.min(
      ...FOLLOW_UP_REMINDER_WINDOWS_DAYS.filter((d) => d < 0),
    );
    // Calculate the cutoff date based on the earliest negative reminder date + some buffer (e.g., 1 day buffer)
    // Using `startOfDay(todayCronTimezone)` ensures we compare dates consistently.
    const missedCutoffDate = subDays(
      startOfDay(todayCronTimezone),
      Math.abs(furthestNegativeDay) + 1,
    );

    const updatedCount = await prisma.recommendedAppointment.updateMany({
      where: {
        status: {
          in: [
            RecommendedAppointmentStatus.RECOMMENDED,
            RecommendedAppointmentStatus.SCHEDULED,
          ],
        },
        recommendedDate: { lt: missedCutoffDate.toISOString() }, // Compare ISO strings
      },
      data: { status: RecommendedAppointmentStatus.MISSED },
    });

    if (updatedCount.count > 0) {
      console.log(
        `[Cron FollowUp] Marked ${updatedCount.count} old RecommendedAppointments as MISSED (recommended before ${missedCutoffDate.toISOString()}).`,
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

// --- Booking (1-Hour) Reminder Email Cron Job ---
async function checkAndSendBookingReminders() {
  console.log(
    `[Cron BookingReminder] Starting check for 1-hour booking reminders...`,
  );

  // Calculate the time window: 50 to 65 minutes from now (UTC)
  const nowUTC = new Date();
  const reminderWindowStartUTC = new Date(nowUTC.getTime() + 50 * 60 * 1000); // Start 50 mins from now
  const reminderWindowEndUTC = new Date(nowUTC.getTime() + 65 * 60 * 1000); // End 65 mins from now

  try {
    // Find transactions that are PENDING, booked for the next hour (approx),
    // haven't had the reminder sent, and the customer has a valid email.
    const transactionsToRemind = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING,
        bookedFor: { gte: reminderWindowStartUTC, lte: reminderWindowEndUTC }, // bookedFor is UTC
        bookingReminderSentAt: null, // Reminder not yet sent
        customer: { email: { not: null, contains: "@" } }, // Customer has email
      },
      include: {
        customer: { select: { name: true, email: true } },
        availedServices: {
          select: {
            service: { select: { title: true } },
            originatingSetTitle: true,
          },
        },
      },
    });

    console.log(
      `[Cron BookingReminder] Found ${transactionsToRemind.length} bookings within the next hour reminder window.`,
    );

    for (const txn of transactionsToRemind) {
      if (!txn.customer?.email) {
        console.warn(
          `[Cron BookingReminder] Skipping reminder for TXN ${txn.id}: Customer or email missing after query.`,
        );
        continue;
      }

      const serviceNames = txn.availedServices
        .map((as) => as.originatingSetTitle || as.service?.title || "a service")
        .filter(Boolean);

      const dynamicBodyHtml = generateBookingReminderContentHtml(
        txn.customer.name,
        new Date(txn.bookedFor),
        serviceNames,
      );

      const subjectPlaceholders = {}; // No specific placeholders needed beyond customerName

      const emailSentSuccessfully = await sendEmailFromTemplate(
        "Booking Reminder (1-Hour)",
        txn.customer.email,
        txn.customer.name,
        dynamicBodyHtml,
        subjectPlaceholders,
      );

      if (emailSentSuccessfully) {
        try {
          await prisma.transaction.update({
            where: { id: txn.id },
            data: { bookingReminderSentAt: new Date() },
          });
          console.log(
            `[Cron BookingReminder] Marked bookingReminderSentAt for TXN ${txn.id}.`,
          );
        } catch (dbUpdateError) {
          console.error(
            `[Cron BookingReminder] Failed to update TXN ${txn.id} after email send:`,
            dbUpdateError,
          );
        }
      }

      await new Promise((r) => setTimeout(r, CRON_ITEM_PROCESSING_DELAY));
    }
  } catch (e) {
    console.error(
      `[Cron BookingReminder] Error during booking reminder check:`,
      e,
    );
  }
  console.log(`[Cron BookingReminder] 1-hour booking reminder check finished.`);
}

// --- Express Route ---
app.get("/", (req, res) =>
  res.status(200).send("BeautyFeel Socket Server is Running"),
);

// --- Socket.IO Connections ---
io.on("connection", (socket) => {
  const clientId = socket.id;
  const connectedAccountId =
    socket.handshake.query &&
    typeof socket.handshake.query.accountId === "string"
      ? socket.handshake.query.accountId
      : "N/A_SocketUser";
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
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              checkedBy: true,
              transaction: { select: { status: true } },
            },
          });

          if (!as) {
            throw new Error("Service item not found.");
          }
          if (as.transaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot check: Transaction status is ${as.transaction?.status}.`,
            );
          }
          if (as.status !== Status.PENDING) {
            throw new Error(`Cannot check: Service status is ${as.status}.`);
          }
          if (as.checkedById && as.checkedById !== accountId) {
            throw new Error(
              `Already checked by ${as.checkedBy?.name || "another user"}.`,
            );
          }
          // If already checked by *this* user, just return the existing object.
          // The client will handle the state appropriately.
          if (as.checkedById === accountId) {
            console.log(
              `[Socket ${clientId}] AS ${availedServiceId} already checked by ${accountId}. No DB update needed.`,
            );
            // Fetch with necessary includes for the client state
            return await tx.availedService.findUnique({
              where: { id: availedServiceId },
              include: {
                service: { select: { title: true } },
                checkedBy: { select: { id: true, name: true } },
                servedBy: { select: { name: true } },
              },
            });
          }

          // Perform the update if conditions are met and it's not already checked by this user
          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING, // Atomic check
              checkedById: null, // Atomic check - ensure it wasn't checked by someone else concurrently
            },
            data: { checkedById: accountId },
            include: {
              service: { select: { title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { name: true } },
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} checked by ${accountId}.`,
          );
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] checkService ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Server error checking service.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot check: Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot check: Service status is"))
          userMsg = error.message;
        else if (error.message.includes("Already checked by"))
          userMsg = error.message;
        else if (error.code === "P2025")
          // Prisma error for record not found in update/delete/etc.
          userMsg =
            "Could not check service due to a data mismatch. Please refresh.";
        else if (error.message) userMsg = `Check failed: ${error.message}`;
        else userMsg = "An unexpected error occurred.";

        socket.emit("serviceCheckError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  // --- uncheckService Handler ---
  socket.on(
    "uncheckService",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX uncheckService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceUncheckError", {
          availedServiceId,
          message: "Invalid request data.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              checkedBy: true,
              servedBy: true,
              transaction: { select: { status: true } },
            },
          });

          if (!as) {
            throw new Error("Service item not found.");
          }
          if (as.transaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot uncheck: Transaction status is ${as.transaction?.status}.`,
            );
          }
          if (as.status !== Status.PENDING) {
            throw new Error(`Cannot uncheck: Service status is ${as.status}.`);
          }
          if (as.checkedById !== accountId) {
            const checkerName = as.checkedBy?.name || "another user";
            throw new Error(
              `Cannot uncheck: Checked by ${as.checkedById ? checkerName : "nobody"}.`,
            );
          }
          if (as.servedById) {
            throw new Error(
              `Cannot uncheck: Already served by ${as.servedBy?.name || "another user"}.`,
            );
          }

          // Perform the update: set checkedById to null
          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING, // Atomic check: must be PENDING
              servedById: null, // Atomic check: must NOT be served
              checkedById: accountId, // Atomic check: must be checked by THIS account
            },
            data: { checkedById: null }, // Set checkedById to null
            include: {
              service: { select: { title: true } },
              checkedBy: { select: { id: true, name: true } }, // Include checkedBy (will be null after update)
              servedBy: { select: { id: true, name: true } }, // Include servedBy
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} unchecked by ${accountId}.`,
          );
          // After unchecking, check/manage the transaction completion timer
          checkAndManageCompletionTimer(transactionId); // This will likely cancel the timer
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] uncheckService ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Server error unchecking service.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (
          error.message.includes("Cannot uncheck: Transaction status is")
        )
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck: Service status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck: Checked by"))
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck: Already served by"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not uncheck service due to a data mismatch. Please refresh.";
        else if (error.message) userMsg = `Uncheck failed: ${error.message}`;
        else userMsg = "An unexpected error occurred.";

        socket.emit("serviceUncheckError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  // --- MarkServiceServed Handler ---
  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX markServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message: "Invalid request.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const parentTransaction = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (parentTransaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot mark: Transaction status is ${parentTransaction?.status}.`,
            );
          }

          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              status: true,
              servedById: true,
              servedBy: { select: { name: true } },
            },
          });

          if (!as) throw new Error("Service item not found.");
          if (as.status !== Status.PENDING)
            throw new Error(`Cannot mark: Service status is ${as.status}.`);
          if (as.servedById)
            throw new Error(
              `Cannot mark: Already served by ${as.servedBy?.name || "another user"}.`,
            );

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING, // Atomic check
              servedById: null, // Atomic check
            },
            data: {
              servedById: accountId,
              status: Status.DONE, // Mark as DONE
              completedAt: new Date(),
            },
            include: {
              service: { select: { title: true } },
              checkedBy: { select: { name: true } },
              servedBy: { select: { id: true, name: true } }, // Include servedBy for broadcast
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} MARKED as served by ${accountId}.`,
          );
          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] markServiceServed ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Could not mark service.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot mark: Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot mark: Service status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot mark: Already served by"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not mark service due to a data mismatch. Please refresh.";
        else if (error.message) userMsg = `Mark failed: ${error.message}`;
        else userMsg = "An unexpected error occurred.";

        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message: userMsg,
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
        const updatedAS = await prisma.$transaction(async (tx) => {
          const parentTransaction = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (parentTransaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot unmark: Transaction status is ${parentTransaction?.status}.`,
            );
          }

          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              status: true,
              servedById: true,
              servedBy: { select: { name: true } },
            },
          });

          if (!as) throw new Error("Service item not found.");
          if (as.status !== Status.DONE)
            throw new Error(`Cannot unmark: Service status is ${as.status}.`);
          if (as.servedById !== accountId)
            throw new Error(
              `Cannot unmark: Not served by you (Served by ${as.servedBy?.name || "N/A"}).`,
            );

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.DONE, // Atomic check
              servedById: accountId, // Atomic check
            },
            data: {
              servedById: null,
              status: Status.PENDING,
              completedAt: null,
            },
            include: {
              service: { select: { title: true } },
              checkedBy: { select: { name: true } },
              servedBy: { select: { id: true, name: true } }, // Include servedBy (will be null after update)
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          cancelCompletionTimer(transactionId); // Cancel timer as service is no longer DONE
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} UNMARKED as served by ${accountId}.`,
          );
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] unmarkServiceServed ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Could not unmark service.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot unmark: Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot unmark: Service status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot unmark: Not served by you"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not unmark service due to a data mismatch. Please refresh.";
        else if (error.message) userMsg = `Unmark failed: ${error.message}`;
        else userMsg = "An unexpected error occurred.";

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
    console.error(
      "🛑 Resend API Key is MISSING. Email functionalities will be impaired or disabled.",
    );
  }
});

// --- Graceful Shutdown ---
const shutdown = (signal) => {
  console.log(`\n${signal} signal received. Starting graceful shutdown...`);
  console.log("Stopping cron jobs... (This may take a moment)");

  const tasks = cron.getTasks();
  tasks.forEach((task) => {
    try {
      task.stop();
      console.log(`Cron task stopped.`);
    } catch (e) {
      console.error("Error stopping a cron task:", e);
    }
  });

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
          process.exit(0);
        })
        .catch((errPrisma) => {
          console.error("Error disconnecting Prisma Client:", errPrisma);
          process.exit(1);
        });
    });
  });

  setTimeout(() => {
    console.error(
      "Graceful shutdown timed out (15s). Forcefully shutting down.",
    );
    process.exit(1);
  }, 15000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
