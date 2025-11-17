const express = require("express");
const {
  PrismaClient,
  Status,
  RecommendedAppointmentStatus,
  Role,
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
  format,
  isValid,
} = require("date-fns");
// Assuming date-fns-tz is used for timezones if needed beyond basic date-fns
// const { utcToZonedTime, zonedTimeToUtc } = require('date-fns-tz');

require("dotenv").config({ path: "../.env" });

const PORT = process.env.PORT || 9000;
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
const COMPLETION_DELAY = parseInt(
  process.env.COMPLETION_DELAY_MS || "180000",
  10,
); // Default to 3 minutes

const resendKey = process.env.RESEND_API_KEY;
const resend = resendKey ? new Resend(resendKey) : null;
if (!resendKey && process.env.NODE_ENV === "production") {
  console.warn(
    "WARNING (Socket Server): RESEND_API_KEY is not set. Email functionalities will be DISABLED.",
  );
} else if (resendKey) {
  console.log("Resend API Key detected. Email functionalities ENABLED.");
}
const SENDER_EMAIL_SERVER = process.env.SENDER_EMAIL || "onboarding@resend.dev";
const LOGO_URL_SERVER =
  process.env.LOGO_URL || "https://beautyfeel.net/btfeel-icon.png";
const PHILIPPINES_TIMEZONE = process.env.TIMEZONE || "Asia/Manila";

const FOLLOW_UP_REMINDER_WINDOWS_DAYS = [7, 3, 2, 1, 0, -1, -7, -14];
// Corrected FOLLOW_UP_REMINDER_FIELDS based on schema
const FOLLOW_UP_REMINDER_FIELDS_CORRECTED = {
  7: "reminder7DaySentAt",
  3: "reminder3DaySentAt",
  2: "reminder2DaySentAt",
  1: "reminder1DaySentAt",
  0: "reminderTodaySentAt",
  "-1": "reminder1DayAfterSentAt",
  "-7": "reminder7DayAfterSentAt", // Corrected field name
  "-14": "reminder14DayAfterSentAt",
};

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
  process.env.FOLLOW_UP_CRON_SCHEDULE || "0 9 * * *";
const BOOKING_REMINDER_CRON_SCHEDULE =
  process.env.BOOKING_REMINDER_CRON_SCHEDULE || "*/15 * * * *";

const CRON_ITEM_PROCESSING_DELAY = parseInt(
  process.env.CRON_ITEM_DELAY || "100",
  10,
);
const CRON_TIMEZONE = process.env.CRON_TIMEZONE || "Asia/Manila";

// --- CRON Job Execution Tracking (Prevent Overlapping Executions) ---
const cronJobExecutions = new Map();
const CRON_EXECUTION_TIMEOUT_MS = parseInt(
  process.env.CRON_EXECUTION_TIMEOUT_MS || "300000", // 5 minutes default timeout
  10,
);

// --- Email Retry Configuration ---
const MAX_EMAIL_RETRIES = parseInt(process.env.MAX_EMAIL_RETRIES || "3", 10); // Max attempts after the initial one
const BASE_EMAIL_RETRY_DELAY_MS = parseInt(
  process.env.BASE_EMAIL_RETRY_DELAY_MS || "1000",
  10,
); // Base delay in milliseconds (1 second)
const EMAIL_RETRY_JITTER_MS = parseInt(
  process.env.EMAIL_RETRY_JITTER_MS || "500",
  10,
); // Max random jitter to add to delay

// Assuming SALARY_COMMISSION_RATE is defined globally or imported elsewhere
// For the socket server, you might need to define it here or load it from config
const SALARY_COMMISSION_RATE = parseFloat(
  process.env.SALARY_COMMISSION_RATE || "0.1",
); // Example: 10% default rate

const prisma = new PrismaClient({
  transactionOptions: {
    maxWait: 10000,
    timeout: 15000,
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
  // Connection configuration for better reliability
  pingTimeout: 60000, // 60 seconds - time to wait for pong response
  pingInterval: 25000, // 25 seconds - interval between pings
  transports: ["websocket", "polling"], // Prefer websocket, fallback to polling
  allowEIO3: true, // Allow Engine.IO v3 clients for compatibility
});

// Store timers using transactionId
const transactionCompletionTimers = new Map();
// Store total commissions per AvailedService during core transaction
const availedServiceTotalCommissions = new Map();
// Store salary updates per Account during core transaction
const salaryUpdates = new Map();
// Store any RA processing error to report later
let raProcessingError = null;

// --- Connection Management & Tracking ---
// Track active connections per accountId
const activeConnections = new Map(); // accountId -> Set of socketIds
// Track socketId to accountId mapping for cleanup
const socketToAccountMap = new Map(); // socketId -> accountId
// Track transactionId to socketIds for room management
const transactionRooms = new Map(); // transactionId -> Set of socketIds

// --- Rate Limiting ---
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const RATE_LIMIT_MAX_EVENTS = 30; // Max events per window
const socketEventCounts = new Map(); // socketId -> { count: number, resetAt: number }

/**
 * Check if socket has exceeded rate limit
 * @param {string} socketId
 * @returns {boolean} true if rate limit exceeded
 */
function checkRateLimit(socketId) {
  const now = Date.now();
  const record = socketEventCounts.get(socketId);

  if (!record || now > record.resetAt) {
    // Reset or create new record
    socketEventCounts.set(socketId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return false;
  }

  record.count++;
  if (record.count > RATE_LIMIT_MAX_EVENTS) {
    return true; // Rate limit exceeded
  }

  return false;
}

/**
 * Clean up rate limit records for a socket
 * @param {string} socketId
 */
function cleanupRateLimit(socketId) {
  socketEventCounts.delete(socketId);
}

/**
 * Validate accountId exists in database
 * @param {string} accountId
 * @returns {Promise<boolean>}
 */
async function validateAccountId(accountId) {
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true },
    });
    return !!account;
  } catch (error) {
    console.error(
      `[Socket Auth] Error validating accountId ${accountId}:`,
      error,
    );
    return false;
  }
}

/**
 * Clean up resources for a socket connection
 * @param {string} socketId
 */
function cleanupSocketResources(socketId) {
  const accountId = socketToAccountMap.get(socketId);

  // Remove from active connections
  if (accountId) {
    const accountSockets = activeConnections.get(accountId);
    if (accountSockets) {
      accountSockets.delete(socketId);
      if (accountSockets.size === 0) {
        activeConnections.delete(accountId);
      }
    }
  }

  // Remove from socket mapping
  socketToAccountMap.delete(socketId);

  // Clean up rate limiting
  cleanupRateLimit(socketId);

  // Note: Transaction completion timers are transaction-specific, not socket-specific
  // They will be cleaned up when transactions complete or are cancelled
}

function calculateNextRecommendedDate(baseDate, daysToAdd) {
  const date = new Date(baseDate); // baseDate should be UTC Date object
  if (daysToAdd && parseInt(daysToAdd, 10) > 0) {
    date.setUTCDate(date.getUTCDate() + parseInt(daysToAdd, 10));
  } else {
    // Fallback logic should probably be handled earlier or use a default from schema
    // Let's use service's default recommended days or a hardcoded default like 7
    console.warn(
      `[calculateNextRecommendedDate] Invalid daysToAdd (${daysToAdd}), falling back to 7 days.`,
    );
    date.setUTCDate(date.getUTCDate() + 7); // Default fallback
  }
  // Optionally set to start of day UTC or a specific time UTC for consistency
  // date.setUTCHours(0, 0, 0, 0);
  return date;
}

function formatInstructionsToHtml(instructionsText) {
  if (!instructionsText) return "";

  let html = "";
  const paragraphs = instructionsText.split(/\r?\n\s*\r?\n/);
  paragraphs.forEach((para) => {
    const lines = para.split(/\r?\n/);
    const formattedPara = lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join("<br/>");
    if (formattedPara) {
      html += `<p style="margin: 0 0 1em 0;">${formattedPara}</p>`;
    }
  });

  return `<div style="line-height: 1.6;">${html}</div>`;
}

async function sendCustomHtmlEmail(
  toEmail,
  customerName, // Included for completeness if needed
  subject,
  bodyContentHtml,
) {
  if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
    console.warn(
      `[Email Sender] Invalid or missing recipient email address: "${toEmail}". Skipping custom email.`,
    );
    return false;
  }
  if (!resend) {
    console.warn(
      `[Email Sender] Resend instance not initialized. Skipping custom email to ${toEmail}.`,
    );
    return false;
  }

  try {
    const fullHtmlBody = generateMasterEmailHtml(
      subject,
      bodyContentHtml,
      LOGO_URL_SERVER,
    );

    // Simple HTML to text conversion
    const plainTextBody = bodyContentHtml
      .replace(/<p>.*?<\/p>/gi, "\n\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|ul|ol|li)>/gi, "\n\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    const emailOptions = {
      from: SENDER_EMAIL_SERVER,
      to: [toEmail],
      subject: subject,
      html: fullHtmlBody,
      text: plainTextBody,
    };

    // Use the retry helper
    return attemptSendEmailWithRetry(emailOptions, toEmail, subject);
  } catch (error) {
    console.error(
      `[Email Sender] Exception during custom HTML email preparation for ${toEmail}:`,
      error,
    );
    return false; // Return false if there's an error *before* attempting send
  }
}

function generateMasterEmailHtml(subjectLine, bodyContentHtml, logoUrl) {
  return `
  <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
  <html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <title>${subjectLine}</title>
    <style type="text/css">
      #outlook a { padding:0; }
      body{ width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; margin:0; padding:0; }
      .ExternalClass { width:100%; }
      .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
      #backgroundTable { margin:0; padding:0; width:100% !important; line-height: 100% !important; }
      body { background-color: #F6F4EB; font-family: Arial, sans-serif; color: #2E2A2A; }
      table { border-collapse: collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
      td { margin:0; padding:0; }
      img { outline:none; text-decoration:none; -ms-interpolation-mode: bicubic; border:none; }
      .image_fix { display:block; }
      @media only screen and (max-width: 600px) {
        table[class=full-width] { width: 100% !important; }
        td[class=mobile-padding] { padding: 15px !important; }
      }
      .bg-offwhite { background-color: #F6F4EB; }
      .bg-content { background-color: #FFFFFF; }
      /* Add other common styles from your server action's generateEmailHtml if needed */
      .color-primary-dark { color: #C28583; }
      /* Custom style for the instructions block */
       .instructions-block {
           margin-top: 15px;
           padding: 15px;
           background-color: #f9f9f9;
           border-left: 4px solid #C28583; /* Example accent color */
           font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace; /* Monospace or similar */
           font-size: 13px;
           line-height: 1.6;
           color: #333;
           white-space: pre-wrap; /* Preserve whitespace and break lines */
           word-break: break-word; /* Break long words */
       }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F6F4EB;">
    <center>
      <table border="0" cellpadding="0" cellspacing="0" width="100%" class="bg-offwhite" id="backgroundTable">
        <tr>
          <td align="center" valign="top" style="padding: 20px 0;">
            <table border="0" cellpadding="0" cellspacing="0" width="600" class="full-width" style="max-width: 600px;">
              <tr>
                <td align="center" valign="top" style="padding: 20px 0;">
                  <img src="${logoUrl}" alt="BEAUTYFEEL The Beauty Lounge" width="150" style="display:block; margin-bottom: 5px;" />
                  <p style="font-size: 12px; color: #2E2A2A; margin-top: 0; margin-bottom:0; letter-spacing: 0.5px;">FACE • SKIN • NAILS • MASSAGE</p>
                </td>
              </tr>
              <tr>
                <td align="left" valign="top" class="mobile-padding bg-content" style="padding: 25px; background-color: #FFFFFF; border-radius: 8px; box-shadow: 0px 2px 8px rgba(0, 0, 0, 0.05);">
                  <!-- Main content body -->
                  ${bodyContentHtml}
                </td>
              </tr>
              <tr>
                <td align="center" valign="top" style="padding: 25px 20px;">
                  <p style="font-size: 13px; color: #555555; line-height: 1.5; margin-bottom: 10px;">
                    Best regards,<br/>
                    The BeautyFeel Team
                  </p>
                   <p style="font-size: 11px; color: #777777; margin-top: 15px;">
                    This email was sent from BeautyFeel Services. Please do not reply directly to this email.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </center>
  </body>
  </html>`;
}

/**
 * Attempts to send an email via Resend with retry logic (exponential backoff with jitter).
 * @param {object} emailOptions - The options object for resend.emails.send ({ from, to, subject, html, text }).
 * @param {string} recipientEmail - The recipient's email address (for logging).
 * @param {string} subject - The email subject (for logging).
 * @returns {Promise<boolean>} True if sending was successful after any number of attempts, false otherwise.
 */
async function attemptSendEmailWithRetry(
  emailOptions,
  recipientEmail,
  subject,
) {
  if (!resend) {
    console.warn(
      `[Email Sender] Resend instance not initialized. Skipping email to ${recipientEmail}.`,
    );
    return false;
  }

  let attempts = 0;
  // Total attempts will be 1 (initial) + MAX_EMAIL_RETRIES
  while (attempts <= MAX_EMAIL_RETRIES) {
    if (attempts > 0) {
      // Calculate delay with exponential backoff and jitter
      // Delay = Base * (2^(attempts-1)) + random jitter
      const delay =
        BASE_EMAIL_RETRY_DELAY_MS * Math.pow(2, attempts - 1) +
        Math.random() * EMAIL_RETRY_JITTER_MS;
      console.log(
        `[Email Sender] Retrying send to ${recipientEmail} (Attempt ${attempts}/${MAX_EMAIL_RETRIES}). Waiting ${delay.toFixed(0)}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const { data, error: emailSendError } =
        await resend.emails.send(emailOptions);

      if (emailSendError) {
        console.warn(
          `[Email Sender] Attempt ${attempts}/${MAX_EMAIL_RETRIES} failed for ${recipientEmail}: ${emailSendError.message || emailSendError}`,
        );
        // Continue loop if retries remain
      } else {
        console.log(
          `[Email Sender] Attempt ${attempts}/${MAX_EMAIL_RETRIES} successful for ${recipientEmail}. Email ID: ${data?.id}`,
        );
        return true; // Success!
      }
    } catch (error) {
      // Catch unexpected exceptions during the send process itself
      console.error(
        `[Email Sender] Attempt ${attempts}/${MAX_EMAIL_RETRIES} caught exception for ${recipientEmail}:`,
        error,
      );
      // Continue loop if retries remain
    }

    attempts++;
  }

  // If loop finishes, max retries were reached without success
  console.error(
    `[Email Sender] Failed to send email to ${recipientEmail} after ${MAX_EMAIL_RETRIES + 1} attempts. Giving up.`,
  );
  return false;
}

/**
 * Sends an email using a template fetched from the database.
 * Assumes generateMasterEmailHtml and resend/SENDER_EMAIL_SERVER are available.
 * This is used for cron-based reminders (follow-up, booking).
 * NOW USES RETRY LOGIC via attemptSendEmailWithRetry.
 *
 * @param {string} templateName - The name of the email template in the database.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} customerName - The customer's name, used for the plain text greeting and potentially other general uses.
 * @param {string} dynamicBodyHtml - The dynamically generated HTML content for the body (with placeholders already replaced).
 * @param {string} processedSubject - The final subject line for the email (with placeholders already replaced).
 * @returns {Promise<boolean>} True if the email sending attempt was successful after retries, false otherwise.
 */
async function sendEmailFromTemplate(
  templateName,
  toEmail,
  customerName,
  dynamicBodyHtml,
  processedSubject,
) {
  if (!toEmail || typeof toEmail !== "string" || !toEmail.includes("@")) {
    // Added type check
    console.warn(
      `[Email Sender] Invalid or missing recipient email address: "${toEmail}". Skipping template email (${templateName}).`,
    );
    return false;
  }

  try {
    // Fetch template inside here, as it's specific to this function
    const emailTemplate = await prisma.emailTemplate.findUnique({
      where: { name: templateName },
    });

    if (!emailTemplate || !emailTemplate.isActive) {
      console.warn(
        `[Email Sender] Email template "${templateName}" not found or is inactive. Skipping email for ${toEmail}.`,
      );
      return false;
    }

    // Use the provided processedSubject and dynamicBodyHtml
    const subject =
      processedSubject ||
      emailTemplate.subject ||
      `Templated Email: ${templateName}`; // Fallback subject
    const bodyContentHtml = dynamicBodyHtml; // Already processed

    const fullHtmlBody = generateMasterEmailHtml(
      subject,
      bodyContentHtml,
      LOGO_URL_SERVER,
    );

    // Simple HTML to text conversion - might need a more robust library for complex HTML
    const plainTextBody = bodyContentHtml
      .replace(/<p>Hi .*?,<\/p>/i, `Hi ${customerName || "Customer"},\n\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(div|p|h[1-6]|ul|ol|li)>/gi, "\n\n") // Add newline after block elements
      .replace(/<[^>]*>/g, "")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    const emailOptions = {
      from: SENDER_EMAIL_SERVER,
      to: [toEmail],
      subject: subject,
      html: fullHtmlBody,
      text: plainTextBody,
    };

    // Use the retry helper
    return attemptSendEmailWithRetry(emailOptions, toEmail, subject);
  } catch (error) {
    console.error(
      `[Email Sender] Exception during template email (${templateName}) preparation for ${toEmail}:`,
      error,
    );
    return false; // Return false if there's an error *before* attempting send
  }
}

function cancelCompletionTimer(transactionId) {
  if (transactionCompletionTimers.has(transactionId)) {
    clearTimeout(transactionCompletionTimers.get(transactionId));
    transactionCompletionTimers.delete(transactionId);
    console.log(
      `[Socket TXN Complete Timer ${transactionId}] Timer CANCELLED.`,
    );
  }
}

/**
 * Checks if a transaction is ready for auto-completion based on the status of its units.
 * If all units are DONE, it starts or keeps the completion timer active.
 * Otherwise, it cancels any active timer.
 * @param {string} transactionId
 */
async function checkAndManageCompletionTimer(transactionId) {
  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Checking status for auto-completion...`,
  );
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        status: true,
        availedServices: {
          select: {
            id: true,
            units: {
              select: {
                id: true,
                status: true,
              },
            },
          },
        },
      },
    });

    // Check if the transaction is pending and exists
    if (!transaction || transaction.status !== Status.PENDING) {
      cancelCompletionTimer(transactionId);
      console.log(
        `[Socket TXN Complete Timer ${transactionId}] Status is not PENDING or TXN not found. Timer check aborted.`,
      );
      return;
    }

    // Check if ALL units across ALL availed services are Status.DONE
    const allUnitsDone =
      transaction.availedServices.length > 0 && // Ensure there's at least one AS
      transaction.availedServices.every(
        (as) =>
          as.units.length > 0 && // Ensure this AS has units
          as.units.every((unit) => unit.status === Status.DONE), // Check if all units in this AS are DONE
      );

    if (allUnitsDone) {
      if (!transactionCompletionTimers.has(transactionId)) {
        console.log(
          `[Socket TXN Complete Timer ${transactionId}] All units DONE. Starting auto-completion timer.`,
        );
        startCompletionTimer(transactionId);
      } else {
        console.log(
          `[Socket TXN Complete Timer ${transactionId}] All units DONE. Timer already active.`,
        );
      }
    } else {
      // If not all units are DONE, make sure the timer is cancelled
      cancelCompletionTimer(transactionId);
      console.log(
        `[Socket TXN Complete Timer ${transactionId}] Not all units DONE. Timer cancelled/not needed.`,
      );
    }
  } catch (error) {
    console.error(
      `[Socket TXN Complete Timer ${transactionId}] Error in checkAndManageCompletionTimer:`,
      error,
    );
    // Keep timer state as is on error, or cancel defensively?
    // Cancelling might be safer to avoid stuck timers on transient errors.
    cancelCompletionTimer(transactionId);
  }
}

function startCompletionTimer(transactionId) {
  // Cancel any existing timer for this transaction before starting a new one
  cancelCompletionTimer(transactionId);

  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Setting completion timer (${COMPLETION_DELAY / 1000}s).`,
  );
  const timerId = setTimeout(async () => {
    console.log(
      `[Socket TXN Complete Timer ${transactionId}] Timer finished. Attempting auto-completion...`,
    );

    // Remove the timer from the map BEFORE calling the completion function
    transactionCompletionTimers.delete(transactionId);

    // Call the main completion processing function
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);

  // Store the new timer ID
  transactionCompletionTimers.set(transactionId, timerId);
}

/**
 * Handles the core financial transaction logic (marking transaction done,
 * calculating and assigning unit/availed service commissions, updating account salaries)
 * and then triggers post-transaction operations (RA creation, emails, broadcast).
 * Runs only if the transaction is in a state ready for completion (all units DONE).
 * @param {string} transactionId
 */
async function completeTransactionAndCalculateSalary(transactionId) {
  console.log(
    `[Socket TXN Complete ${transactionId}] START Processing. Phase 1: Core Financials.`,
  );

  // Clear maps for THIS transaction completion cycle
  availedServiceTotalCommissions.clear();
  salaryUpdates.clear();
  raProcessingError = null; // Clear previous error state

  let coreTransactionCommitDetails = null;

  try {
    coreTransactionCommitDetails = await prisma.$transaction(
      async (tx) => {
        // Step 1: Fetch transaction data needed for this phase AND for post-transaction phases
        const transactionDataForCoreOps = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: {
            // Use select for the top level
            id: true,
            status: true,
            grandTotal: true,
            discount: true,
            bookedFor: true,
            customer: { select: { id: true, name: true, email: true } },

            // === FIX APPLIED HERE (if needed based on your schema) ===
            // Ensure 'updatedAt' is selected here if it exists in your schema
            // If your Prisma Client validation error persists here, the 'updatedAt' field
            // might not be correctly recognized by THIS running server process.
            // Double-check schema, re-generate client, and ensure server restart.
            createdAt: true, // Add Transaction createdAt
            updatedAt: true, // Add Transaction updatedAt (if it exists in your schema)
            customerId: true, // Needed for customer relation
            voucherId: true, // Needed for voucher relation
            giftCertificateId: true, // Needed for GC relation
            branchId: true, // Needed for branch relation

            availedServices: {
              select: {
                // Use SELECT here to list scalar fields AND relations
                // List all scalar fields you need from AvailedService
                id: true,
                transactionId: true,
                serviceId: true,
                quantity: true,
                price: true, // Total price for this AS line
                commissionValue: true, // Existing AS commission value (will be overwritten)
                originatingSetId: true,
                originatingSetTitle: true,
                serviceSetId: true, // Include if relevant
                createdAt: true,
                updatedAt: true,
                postTreatmentEmailSentAt: true,

                // Now list the relations you need using include or select nested within this select
                units: {
                  // Include units relation
                  select: {
                    // Use select for units to control fields
                    id: true,
                    status: true,
                    servedById: true,
                    servedBy: { select: { id: true, role: true } }, // Select fields from servedBy
                    checkedById: true,
                    completedAt: true,
                    // Add other unit scalar fields needed if any (like unitIndex, checkedAt, servedAt)
                    unitIndex: true, // Add unitIndex for sorting/display
                    checkedAt: true, // Add checkedAt
                    servedAt: true, // Add servedAt
                    availedServiceId: true, // Add scalar AS ID
                  },
                  orderBy: { unitIndex: "asc" },
                },
                service: {
                  // Include service relation
                  select: {
                    id: true,
                    title: true,
                    price: true, // Need service base price for commission calculation base
                    recommendFollowUp: true,
                    recommendedFollowUpDays: true,
                    followUpPolicy: true,
                    sendPostTreatmentEmail: true,
                    postTreatmentEmailSubject: true,
                    postTreatmentInstructions: true,
                  },
                },
                originatingSet: { select: { id: true, title: true } }, // Select fields from originatingSet
                // serviceSet: { select: { /* ... */ } }, // Include if needed
                // recommendedAppointment: { select: { /* ... */ } }, // Include if needed
              },
              orderBy: { createdAt: "asc" },
            },
            // Relations needed at the Transaction level itself
            voucherUsed: { select: { code: true, value: true } },
            branch: { select: { id: true, title: true, code: true } },
            giftCertificateUsed: { select: { id: true, code: true } }, // Select fields from giftCertificateUsed

            bookingReminderSentAt: true, // Include if relevant
            // originatingRecommendations: { select: { ... } }, // Include if needed for post-ops
            // attendedAppointment: { select: { ... } }, // Include if needed for post-ops
          },
        });

        // --- Check if already DONE ---
        // This prevents attempting to complete a transaction multiple times
        if (
          !transactionDataForCoreOps ||
          transactionDataForCoreOps.status === Status.DONE
        ) {
          console.log(
            `[Socket TXN Complete ${transactionId}] Transaction already DONE or not found. Aborting completion process.`,
          );
          return null; // Indicate that no completion happened
        }

        // ... (rest of the commission calculation logic - it relies on the structure fetched above) ...

        // Calculate discount factor based on original sum of AS prices vs final grandTotal
        // This assumes commission is based on the *discounted* price contribution of the service
        // Use the total price stored on the AS item as the base for the discount factor calculation for that item.
        const originalSumOfAvailedServicePrices =
          transactionDataForCoreOps.availedServices.reduce(
            (sum, as) => sum + (as.price || 0),
            0,
          );

        // IMPORTANT: The discount is applied transaction-wide. Need to distribute it proportionally
        // across AvailedService items based on their contribution to the *original* total.
        // Then, commissions are calculated per unit based on the *discounted* unit price.
        const totalTransactionDiscount =
          originalSumOfAvailedServicePrices > 0
            ? originalSumOfAvailedServicePrices -
              transactionDataForCoreOps.grandTotal
            : 0;

        for (const availedSvc of transactionDataForCoreOps.availedServices) {
          let totalCommissionForAS = 0;
          const serviceBaseUnitPrice = availedSvc.service?.price ?? 0; // Base price from the Service model for a *single unit*
          const availedServiceOriginalPrice = availedSvc.price ?? 0; // The pre-discount total price for THIS AS line item (should be serviceBaseUnitPrice * quantity)

          // Calculate the portion of the transaction discount applicable to this specific AvailedService line item
          const asDiscountContribution =
            originalSumOfAvailedServicePrices > 0
              ? (availedServiceOriginalPrice /
                  originalSumOfAvailedServicePrices) *
                totalTransactionDiscount
              : 0;

          // The effective total price for this AvailedService line item *after* its proportional discount
          const availedServiceEffectivePrice =
            availedServiceOriginalPrice - asDiscountContribution;

          // The effective price *per unit* for commission calculation
          const effectiveUnitPriceForCommission =
            availedSvc.quantity > 0
              ? availedServiceEffectivePrice / availedSvc.quantity
              : 0;

          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: AS ${availedSvc.id} (${availedSvc.service?.title}): Orig Price=${availedServiceOriginalPrice}, Discount Contribution=${asDiscountContribution.toFixed(2)}, Effective Price=${availedServiceEffectivePrice.toFixed(2)}, Effective Unit Price=${effectiveUnitPriceForCommission.toFixed(2)}`,
          );

          for (const unit of availedSvc.units) {
            // Only calculate commission for units marked as DONE and served by someone
            if (
              unit.status === Status.DONE &&
              unit.servedById &&
              unit.servedBy
            ) {
              let commissionRate = SALARY_COMMISSION_RATE; // Default global rate
              if (unit.servedBy.role.some((role) => role === Role.MASSEUSE)) {
                // Check if ANY role is MASSEUSE
                commissionRate = 0.5; // Masseuse rate (50%)
              }
              // Add other role-based rates if necessary

              const calculatedUnitCommission = Math.max(
                0,
                Math.floor(effectiveUnitPriceForCommission * commissionRate), // Calculate per unit commission based on effective unit price
              );

              // Add unit commission to the server's salary update map
              salaryUpdates.set(
                unit.servedById,
                (salaryUpdates.get(unit.servedById) || 0) +
                  calculatedUnitCommission,
              );

              // Accumulate total commission for the parent AvailedService item
              totalCommissionForAS += calculatedUnitCommission;
              console.log(
                `[Socket TXN Complete ${transactionId}] CoreTX: Unit ${unit.id}: ServedBy=${unit.servedById}, Role=${unit.servedBy.role.join(",")}, Rate=${commissionRate}, EffectiveUnit=${effectiveUnitPriceForCommission.toFixed(2)}, Unit Commission=${calculatedUnitCommission}`,
              );
            }
          }
          // Store the calculated total commission for this AvailedService item
          // This will be used to update the AvailedService.commissionValue field
          availedServiceTotalCommissions.set(
            availedSvc.id,
            totalCommissionForAS,
          );
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: Calculated total commission for AS ${availedSvc.id}: ${totalCommissionForAS}`,
          );
        }

        // Step 3: Update Transaction Status
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: Status.DONE },
        });
        console.log(
          `[Socket TXN Complete ${transactionId}] CoreTX: TXN status set to DONE.`,
        );

        // Step 4: Update AvailedService CommissionValue fields
        // Iterate through the calculated total commissions for each AS and update
        const availedServiceCommissionUpdates = Array.from(
          availedServiceTotalCommissions.entries(),
        ).map(([asId, totalCommission]) => {
          // Always update the commissionValue on the AS based on the sum of unit commissions
          // This makes the AS commissionValue a derived field from its units
          return tx.availedService.update({
            where: { id: asId },
            data: { commissionValue: totalCommission },
          });
        });

        if (availedServiceCommissionUpdates.length > 0) {
          await Promise.all(availedServiceCommissionUpdates);
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: Updated ${availedServiceCommissionUpdates.length} AS commission values.`,
          );
        } else {
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: No AS commission values to update.`,
          );
        }

        // Step 5: Update Account Salaries
        if (salaryUpdates.size > 0) {
          await Promise.all(
            Array.from(salaryUpdates.entries()).map(([accId, salAmount]) =>
              tx.account.update({
                where: { id: accId },
                data: { salary: { increment: salAmount } },
              }),
            ),
          );
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: Applied salary increments for ${salaryUpdates.size} accounts.`,
          );
        } else {
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: No salary increments needed.`,
          );
        }

        // Step 6: Return the fetched data (or a subset) for broadcasting and post-treatment emails.
        // This second fetch ensures we have the latest state after updates within the transaction
        const dataForPostOps = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: {
            id: true,
            status: true, // Should be DONE now
            bookedFor: true,
            grandTotal: true,
            discount: true,
            customer: { select: { id: true, name: true, email: true } },
            createdAt: true,
            updatedAt: true, // Include if it exists in your schema
            customerId: true,
            voucherId: true,
            giftCertificateId: true,
            branchId: true,

            availedServices: {
              select: {
                id: true,
                quantity: true,
                price: true,
                commissionValue: true, // This should now be the updated value
                originatingSetId: true,
                originatingSetTitle: true,
                serviceSetId: true,
                createdAt: true,
                updatedAt: true,
                postTreatmentEmailSentAt: true,
                service: {
                  select: {
                    id: true,
                    title: true,
                    price: true,
                    recommendFollowUp: true,
                    recommendedFollowUpDays: true,
                    followUpPolicy: true,
                    sendPostTreatmentEmail: true,
                    postTreatmentEmailSubject: true,
                    postTreatmentInstructions: true,
                  },
                },
                units: {
                  select: {
                    // Select fields for units
                    id: true,
                    status: true,
                    completedAt: true,
                    unitIndex: true,
                    checkedAt: true, // Include checkedAt
                    servedAt: true, // Include servedAt
                    availedServiceId: true, // Include scalar AS ID for relation reference
                    checkedBy: { select: { id: true, name: true } },
                    servedBy: { select: { id: true, name: true } },
                  },
                  orderBy: { unitIndex: "asc" },
                },
              },
              orderBy: { createdAt: "asc" },
            },
            voucherUsed: { select: { code: true, value: true } },
            branch: { select: { id: true, title: true, code: true } },
            giftCertificateUsed: { select: { id: true, code: true } },

            bookingReminderSentAt: true,
          },
        });

        return dataForPostOps; // Return the updated transaction data
      },
      {
        maxWait: 10000,
        timeout: 15000,
      },
    );

    // If coreTransactionCommitDetails is null, it means the transaction was already DONE
    if (!coreTransactionCommitDetails) {
      console.log(
        `[Socket TXN Complete ${transactionId}] Core transaction skipped because TXN was already DONE.`,
      );
      return; // Exit early
    }

    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 1: Core Financials COMMITTED successfully.`,
    );
  } catch (error) {
    console.error(
      `[Socket TXN Complete ${transactionId}] Phase 1: CRITICAL error during CORE financial transaction for ${transactionId}:`,
      error,
    );
    io.emit("transactionCompletionFailed", {
      transactionId,
      message: `Transaction completion failed during core processing: ${error.message || "An unexpected error occurred."}`,
    });
    // Ensure maps are cleared on error before exiting
    availedServiceTotalCommissions.clear();
    salaryUpdates.clear();
    raProcessingError = error; // Store the error
    return;
  }

  // --- Data Check for Post-Transaction Phases ---
  // coreTransactionCommitDetails should NOT be null here due to the check inside the transaction
  const customerForPostOps = coreTransactionCommitDetails.customer;
  const availedServicesForPostOps =
    coreTransactionCommitDetails.availedServices;
  const transactionBookedForDate =
    coreTransactionCommitDetails.bookedFor || new Date(); // Use bookedFor or now

  // --- PHASE 2: RecommendedAppointment Creation (Post-Core-Transaction) ---
  if (customerForPostOps && availedServicesForPostOps) {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 2: START RecommendedAppointment Creation.`,
    );
    try {
      for (const availedSvcData of availedServicesForPostOps) {
        const serviceDef = availedSvcData.service;

        if (
          serviceDef &&
          serviceDef.recommendFollowUp &&
          serviceDef.followUpPolicy !== FollowUpPolicy.NONE &&
          serviceDef.recommendedFollowUpDays !== null &&
          serviceDef.recommendedFollowUpDays !== undefined
        ) {
          let shouldCreateNewRA = false;

          const fulfilledRA = await prisma.recommendedAppointment.findFirst({
            where: {
              attendedTransactionId: transactionId,
              originatingServiceId: serviceDef.id,
              status: RecommendedAppointmentStatus.ATTENDED,
              originatingAvailedServiceId: availedSvcData.id, // Link to the specific AS that fulfilled
            },
            select: {
              id: true,
              suppressNextFollowUpGeneration: true,
              originatingService: {
                select: { followUpPolicy: true, title: true },
              },
            },
          });

          if (fulfilledRA) {
            if (!fulfilledRA.suppressNextFollowUpGeneration) {
              const fulfilledRaPolicy =
                fulfilledRA.originatingService?.followUpPolicy;

              if (
                fulfilledRaPolicy === FollowUpPolicy.EVERY_TIME ||
                fulfilledRaPolicy === FollowUpPolicy.ONCE
              ) {
                shouldCreateNewRA = true;
                console.log(
                  `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): Will generate new RA. Fulfilled RA (${fulfilledRA.id} - ${fulfilledRA.originatingService?.title}) policy (${fulfilledRaPolicy}) allows it.`,
                );
              } else {
                console.log(
                  `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating. Fulfilled RA policy ${fulfilledRaPolicy} does not permit new after fulfilling an existing RA.`,
                );
              }
            } else {
              console.log(
                `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating. Fulfilled RA (${fulfilledRA.id} - ${fulfilledRA.originatingService?.title}) explicitly suppresses.`,
              );
            }
          } else {
            // If this AS did NOT fulfill an existing RA, create a new one based on its own service definition policy
            if (serviceDef.followUpPolicy !== FollowUpPolicy.NONE) {
              shouldCreateNewRA = true;
              console.log(
                `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): Will generate new RA (standard availment, policy: ${serviceDef.followUpPolicy}).`,
              );
            } else {
              console.log(
                `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating. Service policy ${serviceDef.followUpPolicy} does not recommend follow-up.`,
              );
            }
          }

          if (shouldCreateNewRA) {
            const nextRecommendedDate = calculateNextRecommendedDate(
              transactionBookedForDate, // Base the next RA date on the transaction's bookedFor date
              serviceDef.recommendedFollowUpDays,
            );
            await prisma.recommendedAppointment.create({
              data: {
                customerId: customerForPostOps.id,
                recommendedDate: nextRecommendedDate,
                originatingTransactionId: transactionId,
                originatingAvailedServiceId: availedSvcData.id, // Link new RA to the AS that created it
                originatingServiceId: serviceDef.id,
                status: RecommendedAppointmentStatus.RECOMMENDED,
              },
            });
            console.log(
              `[RA Create - PostTX ${transactionId}] CREATED new RA for service ${serviceDef.title} (AS_ID: ${availedSvcData.id}). Date: ${nextRecommendedDate.toISOString()}`,
            );
          }
        } else if (serviceDef) {
          console.log(
            `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating RA. Conditions: recommend=${serviceDef.recommendFollowUp}, policy=${serviceDef.followUpPolicy}, days=${serviceDef.recommendedFollowUpDays}.`,
          );
        } else {
          console.log(
            `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id}: NOT generating RA. Service relation not found.`,
          );
        }
      }
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 2: RecommendedAppointment Creation FINISHED.`,
      );
    } catch (error) {
      raProcessingError = error; // Store the error
      console.error(
        `[Socket TXN Complete ${transactionId}] Phase 2: Error during RecommendedAppointment creation for ${transactionId}:`,
        error,
      );
    }
  } else {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 2 Skipped: Missing required data (customer, availedServices) from core transaction for ${transactionId}.`,
    );
  }

  // --- PHASE 3: Update Customer's nextAppointment (Post-RA-Creation) ---
  if (customerForPostOps) {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 3: START Customer NextAppointment Update.`,
    );
    try {
      const customerId = customerForPostOps.id;
      // Find the earliest RECOMMENDED or SCHEDULED RA date that is today or in the future
      const customerWithRAs = await prisma.customer.findUnique({
        where: { id: customerId },
        select: {
          nextAppointment: true, // Current value
          recommendedAppointments: {
            where: {
              status: {
                in: [
                  RecommendedAppointmentStatus.RECOMMENDED,
                  RecommendedAppointmentStatus.SCHEDULED,
                ],
              },
              // Filter for RAs recommended from the start of today UTC onwards
              recommendedDate: { gte: startOfDay(new Date()) },
            },
            orderBy: { recommendedDate: "asc" },
            take: 1, // Get only the earliest one
            select: { recommendedDate: true },
          },
        },
      });

      if (customerWithRAs) {
        const newEarliestRADate =
          customerWithRAs.recommendedAppointments[0]?.recommendedDate || null;
        const currentNextAppt = customerWithRAs.nextAppointment || null;
        let needsUpdate = false;

        // Compare dates by their start of day to avoid time component issues
        const newDateStart = newEarliestRADate
          ? startOfDay(newEarliestRADate)
          : null;
        const currentDateStart = currentNextAppt
          ? startOfDay(currentNextAppt)
          : null;

        // Check if the new date is different from the current date (considering nulls)
        if (
          (newDateStart === null && currentDateStart !== null) || // If current is not null but new is null
          (newDateStart !== null && currentDateStart === null) || // If current is null but new is not null
          (newDateStart !== null &&
            currentDateStart !== null &&
            !isEqual(newDateStart, currentDateStart)) // If both are not null but the dates are different
        ) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          await prisma.customer.update({
            where: { id: customerId },
            data: { nextAppointment: newEarliestRADate }, // Update to the new earliest date (or null if none)
          });
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 3: Customer ${customerId} nextAppointment set to ${newEarliestRADate?.toISOString() || "null"}.`,
          );
        } else {
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 3: Customer ${customerId} nextAppointment did not require update (Current: ${currentDateStart?.toISOString() || "null"}, New Earliest: ${newDateStart?.toISOString() || "null"}).`,
          );
        }
      } else {
        console.log(
          `[Socket TXN Complete ${transactionId}] Phase 3: Customer ${customerId} not found for nextAppointment update.`,
        );
      }
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 3: Customer NextAppointment Update FINISHED.`,
      );
    } catch (error) {
      console.error(
        `[Socket TXN Complete ${transactionId}] Phase 3: Error updating customer nextAppointment for ${transactionId}:`,
        error,
      );
    }
  } else {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 3 Skipped: Missing customer data from core transaction for ${transactionId}.`,
    );
  }

  // --- PHASE 4: Post-Treatment Email Logic & Broadcasting ---
  if (
    coreTransactionCommitDetails &&
    coreTransactionCommitDetails.customer &&
    coreTransactionCommitDetails.availedServices
  ) {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 4: START Post-Treatment Emails and Broadcast.`,
    );

    const customer = coreTransactionCommitDetails.customer;
    const availedServices = coreTransactionCommitDetails.availedServices;

    if (customer.email) {
      for (const as of availedServices) {
        // Check if the service relation exists and has the necessary properties
        if (
          as.service &&
          as.service.sendPostTreatmentEmail &&
          as.service.postTreatmentInstructions &&
          as.postTreatmentEmailSentAt === null // Only send if not already sent for this AS
        ) {
          const subject =
            as.service.postTreatmentEmailSubject ||
            `Post-Treatment Care for ${as.service.title}`;
          const instructionsHtml = formatInstructionsToHtml(
            as.service.postTreatmentInstructions,
          );
          const bodyContentHtml = `
               <p>Hi ${customer.name || "there"},</p>
               <p>Thank you for your recent visit${availedServices.length > 1 ? "" : " and service"}! Here are care instructions for your service${availedServices.length > 1 ? " (" + as.service.title + ")" : ""}:</p>
               <div class="instructions-block"> ${instructionsHtml} </div>
               <p style="margin-top: 15px;">We look forward to seeing you again!</p>`;

          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 4: Preparing post-treatment email for AS ${as.id} (${as.service.title}) to ${customer.email}`,
          );
          const emailSentSuccessfully = await sendCustomHtmlEmail(
            customer.email,
            customer.name,
            subject,
            bodyContentHtml,
          );

          if (emailSentSuccessfully) {
            try {
              await prisma.availedService.update({
                where: { id: as.id },
                data: { postTreatmentEmailSentAt: new Date() },
              });
              console.log(
                `[Socket TXN Complete ${transactionId}] Phase 4: Marked postTreatmentEmailSentAt for AS ${as.id}.`,
              );
            } catch (dbUpdateError) {
              console.error(
                `[Socket TXN Complete ${transactionId}] Phase 4: Failed to update AS ${as.id} post-email send:`,
                dbUpdateError,
              );
            }
          }
          // Add a small delay between emails if sending multiple for one transaction
          await new Promise((r) =>
            setTimeout(r, CRON_ITEM_PROCESSING_DELAY || 100),
          );
        } else if (as.service) {
          // Log why email was skipped if service exists
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 4: Skipping post-treatment email for AS ${as.id} (${as.service.title}). Conditions: serviceFetched=${!!as.service}, sendEmail=${as.service.sendPostTreatmentEmail}, instructionsPresent=${!!as.service.postTreatmentInstructions}, alreadySent=${!!as.postTreatmentEmailSentAt}.`,
          );
        } else {
          // Log if service relation was missing
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 4: Skipping post-treatment email for AS ${as.id}. Service relation not found.`,
          );
        }
      }
    } else {
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 4: No customer email available for post-treatment messages.`,
      );
    }

    // *** BROADCASTING ***
    // Broadcast the *latest* transaction data fetched after all updates
    // Use transaction room for efficient broadcasting
    const transactionRoom = `transaction:${transactionId}`;
    io.to(transactionRoom).emit(
      "transactionCompleted",
      coreTransactionCommitDetails,
    );
    // Also broadcast to all for dashboard updates (if needed)
    io.emit("transactionCompleted", coreTransactionCommitDetails);
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 4: FINISHED. Transaction processed (RA creation attempted: ${raProcessingError ? "Failed" : "Succeeded/Skipped"}). Broadcasted to transaction room and all clients.`,
    );
  } else {
    console.error(
      `[Socket TXN Complete ${transactionId}] Reached Phase 4 without required data. This indicates a logic flaw for ${transactionId}.`,
    );
    io.emit("transactionCompletionFailed", {
      transactionId,
      message: "Internal server error during post-processing.",
    });
  }
}

// --- Socket Event Handlers (Refactored for AvailedServiceUnit) ---

io.on("connection", async (socket) => {
  const clientId = socket.id;

  // Extract and validate accountId from query
  const accountIdFromQuery =
    socket.handshake.query &&
    typeof socket.handshake.query.accountId === "string" &&
    socket.handshake.query.accountId !== "undefined" &&
    socket.handshake.query.accountId !== "null"
      ? socket.handshake.query.accountId.trim()
      : null;

  // Validate accountId exists
  if (!accountIdFromQuery) {
    console.warn(
      `[Socket ${clientId}] Connection rejected: Missing or invalid accountId in query`,
    );
    socket.emit("connectionError", {
      message: "Invalid connection: Missing account identifier.",
    });
    socket.disconnect(true);
    return;
  }

  // Validate account exists in database
  const accountExists = await validateAccountId(accountIdFromQuery);
  if (!accountExists) {
    console.warn(
      `[Socket ${clientId}] Connection rejected: Account ${accountIdFromQuery} not found`,
    );
    socket.emit("connectionError", {
      message: "Invalid connection: Account not found.",
    });
    socket.disconnect(true);
    return;
  }

  // Store validated accountId on socket for later use
  socket.data.authenticatedAccountId = accountIdFromQuery;

  // Track connection
  if (!activeConnections.has(accountIdFromQuery)) {
    activeConnections.set(accountIdFromQuery, new Set());
  }
  activeConnections.get(accountIdFromQuery).add(clientId);
  socketToAccountMap.set(clientId, accountIdFromQuery);

  console.log(
    `[Socket ${clientId}] Client connected: Account=${accountIdFromQuery}, IP=${socket.handshake.address}, Total connections for account: ${activeConnections.get(accountIdFromQuery).size}`,
  );

  // Emit connection success
  socket.emit("connected", {
    accountId: accountIdFromQuery,
    socketId: clientId,
  });

  socket.on(
    "checkUnit",
    async ({ unitId, availedServiceId, transactionId, accountId }) => {
      // Rate limiting check
      if (checkRateLimit(clientId)) {
        console.warn(`[Socket ${clientId}] Rate limit exceeded for checkUnit`);
        socket.emit("unitActionError", {
          unitId,
          message: "Rate limit exceeded. Please slow down.",
        });
        return;
      }

      console.log(
        `[Socket ${clientId}] RX checkUnit: UNIT_ID=${unitId}, AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );

      // Validate required fields
      if (!unitId || !availedServiceId || !transactionId || !accountId) {
        socket.emit("unitActionError", {
          unitId,
          message: "Invalid request data provided for checkUnit.",
        });
        return;
      }

      if (accountId !== socket.data.authenticatedAccountId) {
        console.warn(
          `[Socket ${clientId}] Security: accountId mismatch. Authenticated: ${socket.data.authenticatedAccountId}, Provided: ${accountId}`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Unauthorized: Account ID mismatch.",
        });
        return;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const unitToUpdate = await tx.availedServiceUnit.findUnique({
            where: { id: unitId },
            include: {
              availedService: {
                select: { transactionId: true, id: true },
              },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });

          if (!unitToUpdate) {
            throw new Error("Unit not found.");
          }
          if (
            unitToUpdate.availedServiceId !== availedServiceId ||
            unitToUpdate.availedService?.transactionId !== transactionId
          ) {
            throw new Error(
              "Data mismatch: Unit does not belong to the provided service or transaction.",
            );
          }

          const parentTxn = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (!parentTxn || parentTxn.status !== Status.PENDING) {
            throw new Error(
              `Cannot check unit: Transaction status is ${parentTxn?.status || "not found"}.`,
            );
          }

          if (unitToUpdate.status !== Status.PENDING) {
            throw new Error(
              `Cannot check unit: Unit status is ${unitToUpdate.status}.`,
            );
          }
          if (unitToUpdate.checkedById) {
            if (unitToUpdate.checkedById === accountId)
              throw new Error("Unit is already checked by you.");
            throw new Error(
              `Unit is already checked by ${unitToUpdate.checkedBy?.name || "someone else"}.`,
            );
          }
          if (unitToUpdate.servedById) {
            throw new Error(
              `Cannot check unit: Unit is already served by ${unitToUpdate.servedBy?.name || "someone else"}.`,
            );
          }

          await tx.availedServiceUnit.update({
            where: { id: unitId },
            data: {
              checkedById: accountId,
              checkedAt: new Date(),
            },
          });
          console.log(
            `[Socket ${clientId}] Unit ${unitId}: Marked as checked by ${accountId}.`,
          );

          // --- MODIFICATION START ---
          // Refetch the parent AvailedService WITH its units,
          // ensuring unit includes the parent AvailedService and its TransactionId for client state sync
          return tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              units: {
                include: {
                  availedService: {
                    // <-- ADDED THIS INCLUDE
                    select: {
                      id: true,
                      transactionId: true,
                    },
                  },
                  checkedBy: { select: { id: true, name: true } },
                  servedBy: { select: { id: true, name: true } },
                },
                orderBy: { unitIndex: "asc" },
              },
              service: { select: { id: true, title: true, price: true } },
              originatingSet: { select: { id: true, title: true } },
              // Include parent Transaction ID directly in the AS object for easier client use
              transaction: { select: { id: true } },
            },
          });
          // --- MODIFICATION END ---
        });

        if (result) {
          // Attach transactionId directly to the AS result if not already included by the query above
          // This redundancy helps ensure the client receives the transactionId along with the AS data
          const availedServiceToSend = {
            ...result,
            transactionId: result.transaction?.id || transactionId, // Use fetched if available, fallback to payload
          };
          // Remove the nested transaction object if added by include
          delete availedServiceToSend.transaction;

          // Join socket to transaction room for efficient broadcasting
          const transactionRoom = `transaction:${transactionId}`;
          socket.join(transactionRoom);
          if (!transactionRooms.has(transactionId)) {
            transactionRooms.set(transactionId, new Set());
          }
          transactionRooms.get(transactionId).add(clientId);

          // Broadcast to transaction room instead of all clients
          io.to(transactionRoom).emit(
            "availedServiceUpdated",
            availedServiceToSend,
          );
          console.log(
            `[Socket ${clientId}] Unit ${unitId} checked by ${accountId}. Broadcasting update for AS ${availedServiceId} to transaction room.`,
          );
          // Check timer unconditionally now. The function itself handles the status check.
          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] checkUnit ERROR for ${unitId}:`,
          error,
        );
        let userMsg = "Server error checking unit.";

        if (error.message.includes("Unit not found"))
          userMsg = "Unit not found.";
        else if (error.message.includes("Data mismatch"))
          userMsg = "Data mismatch: Unit does not belong to the transaction.";
        else if (error.message.includes("Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot check unit:"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not check unit due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("unitActionError", {
          unitId, // Include unitId in error payload
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "uncheckUnit",
    async ({ unitId, availedServiceId, transactionId, accountId }) => {
      // Rate limiting check
      if (checkRateLimit(clientId)) {
        console.warn(
          `[Socket ${clientId}] Rate limit exceeded for uncheckUnit`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Rate limit exceeded. Please slow down.",
        });
        return;
      }

      console.log(
        `[Socket ${clientId}] RX uncheckUnit: UNIT_ID=${unitId}, AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );

      // Validate required fields
      if (!unitId || !availedServiceId || !transactionId || !accountId) {
        socket.emit("unitActionError", {
          unitId,
          message: "Invalid request data provided for uncheckUnit.",
        });
        return;
      }

      // Validate accountId matches authenticated account
      if (accountId !== socket.data.authenticatedAccountId) {
        console.warn(
          `[Socket ${clientId}] Security: accountId mismatch. Authenticated: ${socket.data.authenticatedAccountId}, Provided: ${accountId}`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Unauthorized: Account ID mismatch.",
        });
        return;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const unitToUpdate = await tx.availedServiceUnit.findUnique({
            where: { id: unitId },
            include: {
              availedService: {
                select: { transactionId: true, id: true },
              },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });

          if (!unitToUpdate) {
            throw new Error("Unit not found.");
          }
          if (
            unitToUpdate.availedServiceId !== availedServiceId ||
            unitToUpdate.availedService?.transactionId !== transactionId
          ) {
            throw new Error(
              "Data mismatch: Unit does not belong to the provided service or transaction.",
            );
          }

          const parentTxn = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (!parentTxn || parentTxn.status !== Status.PENDING) {
            throw new Error(
              `Cannot uncheck unit: Transaction status is ${parentTxn?.status || "not found"}.`,
            );
          }

          if (unitToUpdate.status !== Status.PENDING) {
            throw new Error(
              `Cannot uncheck unit: Unit status is ${unitToUpdate.status}.`,
            );
          }
          if (unitToUpdate.checkedById !== accountId) {
            if (!unitToUpdate.checkedById)
              throw new Error("Unit is not currently checked.");
            throw new Error(
              `Cannot uncheck unit: Unit is checked by ${unitToUpdate.checkedBy?.name || "someone else"}.`,
            );
          }
          if (unitToUpdate.servedById) {
            throw new Error(
              `Cannot uncheck unit: Unit is already served by ${unitToUpdate.servedBy?.name || "someone else"}.`,
            );
          }

          await tx.availedServiceUnit.update({
            where: { id: unitId },
            data: {
              checkedById: null,
              checkedAt: null,
            },
          });
          console.log(
            `[Socket ${clientId}] Unit ${unitId}: Marked as unchecked by ${accountId}.`,
          );

          // --- MODIFICATION START ---
          // Refetch the parent AvailedService WITH its units,
          // ensuring unit includes the parent AvailedService and its TransactionId for client state sync
          return tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              units: {
                include: {
                  availedService: {
                    // <-- ADDED THIS INCLUDE
                    select: {
                      id: true,
                      transactionId: true,
                    },
                  },
                  checkedBy: { select: { id: true, name: true } },
                  servedBy: { select: { id: true, name: true } },
                },
                orderBy: { unitIndex: "asc" },
              },
              service: { select: { id: true, title: true, price: true } },
              originatingSet: { select: { id: true, title: true } },
              // Include parent Transaction ID directly in the AS object for easier client use
              transaction: { select: { id: true } },
            },
          });
          // --- MODIFICATION END ---
        });

        if (result) {
          // Attach transactionId directly to the AS result if not already included by the query above
          const availedServiceToSend = {
            ...result,
            transactionId: result.transaction?.id || transactionId, // Use fetched if available, fallback to payload
          };
          // Remove the nested transaction object if added by include
          delete availedServiceToSend.transaction;

          // Broadcast to transaction room
          const transactionRoom = `transaction:${transactionId}`;
          socket.join(transactionRoom);
          if (!transactionRooms.has(transactionId)) {
            transactionRooms.set(transactionId, new Set());
          }
          transactionRooms.get(transactionId).add(clientId);

          io.to(transactionRoom).emit(
            "availedServiceUpdated",
            availedServiceToSend,
          );
          console.log(
            `[Socket ${clientId}] Unit ${unitId} unchecked by ${accountId}. Broadcasting update for AS ${availedServiceId} to transaction room.`,
          );
          // Check timer unconditionally now.
          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] uncheckUnit ERROR for ${unitId}:`,
          error,
        );
        let userMsg = "Could not uncheck unit.";

        if (error.message.includes("Unit not found"))
          userMsg = "Unit not found.";
        else if (error.message.includes("Data mismatch"))
          userMsg = "Data mismatch: Unit does not belong to the transaction.";
        else if (error.message.includes("Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck unit:"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not uncheck unit due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("unitActionError", {
          unitId, // Include unitId in error payload
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "markUnitServed",
    async ({ unitId, availedServiceId, transactionId, accountId }) => {
      // Rate limiting check
      if (checkRateLimit(clientId)) {
        console.warn(
          `[Socket ${clientId}] Rate limit exceeded for markUnitServed`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Rate limit exceeded. Please slow down.",
        });
        return;
      }

      console.log(
        `[Socket ${clientId}] RX markUnitServed: UNIT_ID=${unitId}, AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );

      // Validate required fields
      if (!unitId || !availedServiceId || !transactionId || !accountId) {
        socket.emit("unitActionError", {
          unitId,
          message: "Invalid request data provided for markUnitServed.",
        });
        return;
      }

      // Validate accountId matches authenticated account
      if (accountId !== socket.data.authenticatedAccountId) {
        console.warn(
          `[Socket ${clientId}] Security: accountId mismatch. Authenticated: ${socket.data.authenticatedAccountId}, Provided: ${accountId}`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Unauthorized: Account ID mismatch.",
        });
        return;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const unitToUpdate = await tx.availedServiceUnit.findUnique({
            where: { id: unitId },
            include: {
              availedService: {
                select: { transactionId: true, id: true },
              },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });

          if (!unitToUpdate) {
            throw new Error("Unit not found.");
          }
          if (
            unitToUpdate.availedServiceId !== availedServiceId ||
            unitToUpdate.availedService?.transactionId !== transactionId
          ) {
            throw new Error(
              "Data mismatch: Unit does not belong to the provided service or transaction.",
            );
          }

          const parentTxn = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (!parentTxn || parentTxn.status !== Status.PENDING) {
            throw new Error(
              `Cannot mark unit served: Transaction status is ${parentTxn?.status || "not found"}.`,
            );
          }

          if (unitToUpdate.status !== Status.PENDING) {
            throw new Error(
              `Cannot mark unit served: Unit status is ${unitToUpdate.status}. Only PENDING units can be marked as served.`,
            );
          }

          // Optional: Add backend check that unit is checked by this account?
          // The client already checks this for UI, but backend should be robust.
          // if (unitToUpdate.checkedById !== accountId) {
          //   throw new Error(`Cannot mark unit served: Unit is not checked by you.`);
          // }

          if (unitToUpdate.servedById) {
            if (unitToUpdate.servedById === accountId)
              throw new Error("Unit is already served by you.");
            throw new Error(
              `Cannot mark unit served: Unit is already served by ${unitToUpdate.servedBy?.name || "someone else"}.`,
            );
          }

          await tx.availedServiceUnit.update({
            where: { id: unitId },
            data: {
              servedById: accountId,
              status: Status.DONE,
              completedAt: new Date(),
              servedAt: new Date(), // Set servedAt here
            },
          });
          console.log(
            `[Socket ${clientId}] Unit ${unitId}: Marked as served by ${accountId}.`,
          );

          // --- MODIFICATION START ---
          // Refetch the parent AvailedService WITH its units,
          // ensuring unit includes the parent AvailedService and its TransactionId for client state sync
          return tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              units: {
                include: {
                  availedService: {
                    // <-- ADDED THIS INCLUDE
                    select: {
                      id: true,
                      transactionId: true,
                    },
                  },
                  checkedBy: { select: { id: true, name: true } },
                  servedBy: { select: { id: true, name: true } },
                },
                orderBy: { unitIndex: "asc" },
              },
              service: { select: { id: true, title: true, price: true } },
              originatingSet: { select: { id: true, title: true } },
              // Include parent Transaction ID directly in the AS object for easier client use
              transaction: { select: { id: true } },
            },
          });
          // --- MODIFICATION END ---
        });

        if (result) {
          // Attach transactionId directly to the AS result if not already included by the query above
          const availedServiceToSend = {
            ...result,
            transactionId: result.transaction?.id || transactionId, // Use fetched if available, fallback to payload
          };
          // Remove the nested transaction object if added by include
          delete availedServiceToSend.transaction;

          // Broadcast to transaction room
          const transactionRoom = `transaction:${transactionId}`;
          socket.join(transactionRoom);
          if (!transactionRooms.has(transactionId)) {
            transactionRooms.set(transactionId, new Set());
          }
          transactionRooms.get(transactionId).add(clientId);

          io.to(transactionRoom).emit(
            "availedServiceUpdated",
            availedServiceToSend,
          );
          console.log(
            `[Socket ${clientId}] Unit ${unitId} MARKED as served by ${accountId}. Broadcasting update for AS ${availedServiceId} to transaction room.`,
          );
          // Check timer unconditionally now.
          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] markUnitServed ERROR for ${unitId}:`,
          error,
        );
        let userMsg = "Could not mark unit as served.";

        if (error.message.includes("Unit not found"))
          userMsg = "Unit not found.";
        else if (error.message.includes("Data mismatch"))
          userMsg = "Data mismatch: Unit does not belong to the transaction.";
        else if (error.message.includes("Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot mark unit served:"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not mark unit due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("unitActionError", {
          unitId, // Include unitId in error payload
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "unmarkUnitServed",
    async ({ unitId, availedServiceId, transactionId, accountId }) => {
      // Rate limiting check
      if (checkRateLimit(clientId)) {
        console.warn(
          `[Socket ${clientId}] Rate limit exceeded for unmarkUnitServed`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Rate limit exceeded. Please slow down.",
        });
        return;
      }

      console.log(
        `[Socket ${clientId}] RX unmarkUnitServed: UNIT_ID=${unitId}, AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );

      // Validate required fields
      if (!unitId || !availedServiceId || !transactionId || !accountId) {
        socket.emit("unitActionError", {
          unitId,
          message: "Invalid request data provided for unmarkUnitServed.",
        });
        return;
      }

      // Validate accountId matches authenticated account
      if (accountId !== socket.data.authenticatedAccountId) {
        console.warn(
          `[Socket ${clientId}] Security: accountId mismatch. Authenticated: ${socket.data.authenticatedAccountId}, Provided: ${accountId}`,
        );
        socket.emit("unitActionError", {
          unitId,
          message: "Unauthorized: Account ID mismatch.",
        });
        return;
      }
      try {
        const result = await prisma.$transaction(async (tx) => {
          const unitToUpdate = await tx.availedServiceUnit.findUnique({
            where: { id: unitId },
            include: {
              availedService: {
                select: { transactionId: true, id: true },
              },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });

          if (!unitToUpdate) {
            throw new Error("Unit not found.");
          }
          if (
            unitToUpdate.availedServiceId !== availedServiceId ||
            unitToUpdate.availedService?.transactionId !== transactionId
          ) {
            throw new Error(
              "Data mismatch: Unit does not belong to the provided service or transaction.",
            );
          }

          const parentTxn = await tx.transaction.findUnique({
            where: { id: transactionId },
            select: { status: true },
          });

          if (!parentTxn || parentTxn.status !== Status.PENDING) {
            throw new Error(
              `Cannot unmark unit served: Transaction status is ${parentTxn?.status || "not found"}.`,
            );
          }

          if (unitToUpdate.status !== Status.DONE) {
            throw new Error(
              `Cannot unmark unit served: Unit status is ${unitToUpdate.status}.`,
            );
          }
          if (unitToUpdate.servedById !== accountId) {
            if (!unitToUpdate.servedById)
              throw new Error("Unit is not currently marked as served.");
            throw new Error(
              `Cannot unmark unit served: Unit is served by ${unitToUpdate.servedBy?.name || "someone else"}.`,
            );
          }

          // Note: When unmarking served, the unit status goes back to PENDING
          // This unit might still be 'checked' by someone (the servedById might also be the checkedById)
          // The unmarking served action should *not* automatically uncheck it.
          // So, we only reset servedById, servedAt, status, and completedAt.
          await tx.availedServiceUnit.update({
            where: { id: unitId },
            data: {
              servedById: null,
              status: Status.PENDING, // Status changes back to PENDING
              completedAt: null, // Clear completedAt
              servedAt: null, // Clear servedAt
            },
          });
          console.log(
            `[Socket ${clientId}] Unit ${unitId}: Marked as unserved by ${accountId}.`,
          );

          // --- MODIFICATION START ---
          // Refetch the parent AvailedService WITH its units,
          // ensuring unit includes the parent AvailedService and its TransactionId for client state sync
          return tx.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              units: {
                include: {
                  availedService: {
                    // <-- ADDED THIS INCLUDE
                    select: {
                      id: true,
                      transactionId: true,
                    },
                  },
                  checkedBy: { select: { id: true, name: true } },
                  servedBy: { select: { id: true, name: true } },
                },
                orderBy: { unitIndex: "asc" },
              },
              service: { select: { id: true, title: true, price: true } },
              originatingSet: { select: { id: true, title: true } },
              // Include parent Transaction ID directly in the AS object for easier client use
              transaction: { select: { id: true } },
            },
          });
          // --- MODIFICATION END ---
        });

        if (result) {
          // Attach transactionId directly to the AS result if not already included by the query above
          const availedServiceToSend = {
            ...result,
            transactionId: result.transaction?.id || transactionId, // Use fetched if available, fallback to payload
          };
          // Remove the nested transaction object if added by include
          delete availedServiceToSend.transaction;

          // Broadcast to transaction room
          const transactionRoom = `transaction:${transactionId}`;
          socket.join(transactionRoom);
          if (!transactionRooms.has(transactionId)) {
            transactionRooms.set(transactionId, new Set());
          }
          transactionRooms.get(transactionId).add(clientId);

          io.to(transactionRoom).emit(
            "availedServiceUpdated",
            availedServiceToSend,
          );
          console.log(
            `[Socket ${clientId}] Unit ${unitId} UNMARKED as served by ${accountId}. Broadcasting update for AS ${availedServiceId} to transaction room.`,
          );
          // Check timer unconditionally now.
          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] unmarkUnitServed ERROR for ${unitId}:`,
          error,
        );
        let userMsg = "Could not unmark unit as served.";

        if (error.message.includes("Unit not found"))
          userMsg = "Unit not found.";
        else if (error.message.includes("Data mismatch"))
          userMsg = "Data mismatch: Unit does not belong to the transaction.";
        else if (error.message.includes("Transaction status is"))
          userMsg = error.message;
        else if (error.message.includes("Cannot unmark unit served:"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not unmark unit due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("unitActionError", {
          unitId, // Include unitId in error payload
          message: userMsg,
        });
      }
    },
  );

  socket.on("disconnect", (reason) => {
    const accountId = socket.data.authenticatedAccountId || "unknown";
    console.log(
      `[Socket ${clientId}] Client disconnected: Account=${accountId}, IP=${socket.handshake.address}, Reason=${reason}`,
    );

    // Clean up socket resources
    cleanupSocketResources(clientId);

    // Leave all rooms (Socket.IO handles this automatically, but we clean up our tracking)
    const rooms = Array.from(socket.rooms);
    rooms.forEach((room) => {
      if (room.startsWith("transaction:")) {
        const transactionId = room.replace("transaction:", "");
        const roomSockets = transactionRooms.get(transactionId);
        if (roomSockets) {
          roomSockets.delete(clientId);
          if (roomSockets.size === 0) {
            transactionRooms.delete(transactionId);
          }
        }
      }
    });
  });

  socket.on("connect_error", (err) => {
    console.error(`[Socket ${clientId}] Connection error: ${err.message}`);
  });

  // Add a general listener for unhandled errors from the server
  socket.on("error", (err) => {
    console.error(`[Socket ${clientId}] Unhandled error:`, err);
    socket.emit("generalError", {
      message: "A server error occurred. Please try again.",
    });
  });

  // Handle ping/pong for connection health (Socket.IO handles this, but we can monitor)
  socket.on("ping", () => {
    // Socket.IO automatically handles ping/pong, but we can log if needed
    // This is mainly for monitoring connection health
  });
});

// --- CRON JOBs ---

// Wrapper function to prevent overlapping executions and track timing
async function executeCronJobWithLock(jobName, jobFunction) {
  const now = Date.now();
  const lastExecution = cronJobExecutions.get(jobName);

  // Check if previous execution is still running (with timeout protection)
  if (lastExecution && lastExecution.isRunning) {
    const executionDuration = now - lastExecution.startTime;
    if (executionDuration < CRON_EXECUTION_TIMEOUT_MS) {
      console.warn(
        `[Cron ${jobName}] Previous execution still running (${Math.round(executionDuration / 1000)}s). Skipping this cycle to prevent overlap.`,
      );
      return;
    } else {
      // Previous execution timed out, mark as failed and continue
      console.error(
        `[Cron ${jobName}] Previous execution timed out after ${Math.round(executionDuration / 1000)}s. Forcing new execution.`,
      );
      lastExecution.isRunning = false;
    }
  }

  // Mark as running
  cronJobExecutions.set(jobName, {
    isRunning: true,
    startTime: now,
    lastRunTime: lastExecution?.lastRunTime || null,
    executionCount: (lastExecution?.executionCount || 0) + 1,
  });

  const scheduledTime = new Date();
  const timeDrift = lastExecution
    ? now - (lastExecution.expectedNextRun || now)
    : 0;

  if (Math.abs(timeDrift) > 5000) {
    // Log if drift is more than 5 seconds
    console.warn(
      `[Cron ${jobName}] Time drift detected: ${Math.round(timeDrift / 1000)}s from expected time.`,
    );
  }

  try {
    // Execute the actual job function
    await jobFunction();
  } catch (error) {
    console.error(`[Cron ${jobName}] Error during execution:`, error);
  } finally {
    // Mark as completed
    const execution = cronJobExecutions.get(jobName);
    if (execution) {
      execution.isRunning = false;
      execution.lastRunTime = now;
      execution.lastDuration = now - execution.startTime;
      execution.expectedNextRun = now; // Will be updated by cron scheduler
    }
  }
}

async function checkAndSendFollowUpReminders() {
  if (!resend) {
    console.log(
      `[Cron FollowUp] Resend not configured. Skipping follow-up reminders.`,
    );
    return;
  }

  const jobStartTime = Date.now();
  console.log(
    `[Cron FollowUp] Starting check for follow-up recommendation reminders at ${new Date().toISOString()}...`,
  );

  const now = new Date();
  const todayStartUTC = startOfDay(now); // Start of today in UTC

  // Get the target dates for the current check window (start of day UTC for each target date)
  const targetDatesForQuery = FOLLOW_UP_REMINDER_WINDOWS_DAYS.map((days) =>
    startOfDay(addDays(todayStartUTC, days)),
  );

  // Map the target dates to a format suitable for the Prisma 'OR' query condition on `recommendedDate`
  const recommendedDateConditions = targetDatesForQuery.map(
    (localStartOfDayUTC) => ({
      recommendedDate: {
        gte: localStartOfDayUTC,
        lt: addDays(localStartOfDayUTC, 1), // Check for RAs whose recommendedDate falls within this specific 24hr UTC window
      },
    }),
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
        customer: { email: { not: null, contains: "@" } }, // Ensure the customer has a valid email
        suppressNextFollowUpGeneration: false, // Do not send reminders if suppression is enabled
        // Filter RAs whose recommendedDate falls into one of the target date windows
        OR: recommendedDateConditions,
        // Add condition that the originatingAvailedService is linked to a non-cancelled transaction
        originatingAvailedService: {
          transaction: {
            status: { not: Status.CANCELLED },
          },
        },
      },
      // *** UPDATED SELECT ***
      select: {
        id: true,
        recommendedDate: true, // Needed to calculate daysAway
        customer: { select: { id: true, name: true, email: true } }, // Customer details for email

        // Select all reminder sent fields based on the CORRECTED fields map
        ...Object.values(FOLLOW_UP_REMINDER_FIELDS_CORRECTED).reduce(
          (obj, fieldName) => {
            obj[fieldName] = true;
            return obj;
          },
          {},
        ),

        // Include originatingService to check its policy if needed (already done in creation logic, but useful for double check or logging)
        originatingService: {
          select: { id: true, title: true, followUpPolicy: true },
        },
      },
      orderBy: { recommendedDate: "asc" }, // Process RAs in date order
    });

    console.log(
      `[Cron FollowUp] Found ${rAsToConsider.length} RAs potentially needing reminders today.`,
    );

    for (const ra of rAsToConsider) {
      // Calculate the number of days between the recommended date (start of day UTC) and today (start of day UTC)
      const raRecommendedDateStartUTC = startOfDay(
        new Date(ra.recommendedDate),
      );
      const daysAway = differenceInDays(
        raRecommendedDateStartUTC,
        todayStartUTC,
      );

      const reminderFieldToUpdateKey = String(daysAway); // e.g., "7", "0", "-1"
      // *** Use the CORRECTED fields map ***
      const reminderFieldToUpdate =
        FOLLOW_UP_REMINDER_FIELDS_CORRECTED[reminderFieldToUpdateKey];

      // Check if a reminder field exists for this number of days AND that field is currently null (meaning it hasn't been sent)
      if (reminderFieldToUpdate && ra[reminderFieldToUpdate] === null) {
        // Double-check the policy from the fetched RA data before sending, in case service changed
        if (ra.originatingService?.followUpPolicy === FollowUpPolicy.NONE) {
          console.log(
            `[Cron FollowUp] Skipping RA ${ra.id} (${ra.originatingService?.title}): Service policy is now NONE.`,
          );
          continue; // Skip this RA
        }

        const customerName = ra.customer.name || "Valued Customer";
        const recommendedDateForDisplay = new Date(ra.recommendedDate); // Use the fetched Date object

        const dateOptionsIntl = {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: PHILIPPINES_TIMEZONE, // Explicitly format in the target timezone for display
        };
        const formattedRecDate = new Intl.DateTimeFormat(
          "en-US",
          dateOptionsIntl,
        ).format(recommendedDateForDisplay);

        const daysAwayPhrase =
          DAYS_AWAY_PHRASE[reminderFieldToUpdateKey] ||
          `${Math.abs(daysAway)} day${Math.abs(daysAway) !== 1 ? "s" : ""} ${daysAway >= 0 ? "from now" : "ago"}`;

        let introMessage, timeAdverbAndDate, actionMessage;
        if (daysAway > 0) {
          introMessage =
            "Just a friendly reminder that your recommended follow-up date is approaching.";
          timeAdverbAndDate = `is ${daysAwayPhrase}, on ${formattedRecDate}`;
          actionMessage =
            "Booking ensures you maintain optimal results and secure your preferred time. Please contact us to schedule!";
        } else if (daysAway === 0) {
          introMessage =
            "This is a reminder about your recommended follow-up scheduled for";
          timeAdverbAndDate = `<strong>today, ${formattedRecDate}</strong>`;
          actionMessage =
            "We look forward to seeing you! If you can't make it, please let us know.";
        } else {
          // daysAway < 0
          introMessage =
            "We noticed your recommended follow-up date has passed.";
          timeAdverbAndDate = `was ${daysAwayPhrase}, on ${formattedRecDate}`;
          actionMessage =
            "It's not too late to get back on track! Contact us to schedule your next visit.";
        }

        // Fetch the Follow-up Reminder email template
        const followUpTemplate = await prisma.emailTemplate.findUnique({
          where: { name: "Follow-up Reminder" },
        });

        if (!followUpTemplate || !followUpTemplate.isActive) {
          console.warn(
            `[Cron FollowUp] Template "Follow-up Reminder" not found or inactive for RA ${ra.id}. Skipping email.`,
          );
          continue; // Skip to the next RA
        }

        // Replace placeholders in the template body
        let processedContentBodyHtml = followUpTemplate.body;
        processedContentBodyHtml = processedContentBodyHtml.replace(
          /{{customerName}}/g,
          customerName,
        );
        processedContentBodyHtml = processedContentBodyHtml.replace(
          /{{introMessage}}/g,
          introMessage,
        );
        processedContentBodyHtml = processedContentBodyHtml.replace(
          /{{timeAdverbAndDate}}/g,
          timeAdverbAndDate,
        );
        processedContentBodyHtml = processedContentBodyHtml.replace(
          /{{actionMessage}}/g,
          actionMessage,
        );

        // Replace placeholders in the template subject
        let processedSubject =
          followUpTemplate.subject || "Your Recommended Appointment Reminder";
        processedSubject = processedSubject.replace(
          /{{daysAwayPhrase}}/g,
          daysAwayPhrase,
        );
        processedSubject = processedSubject.replace(
          /{{customerName}}/g,
          customerName,
        );

        console.log(
          `[Cron FollowUp] Preparing to send ${daysAway}-day reminder for RA ${ra.id} to ${ra.customer.email}`,
        );

        // Send the email using the template sender, which now uses the retry helper
        const emailSentSuccessfully = await sendEmailFromTemplate(
          "Follow-up Reminder", // Template name for logging
          ra.customer.email,
          customerName,
          processedContentBodyHtml,
          processedSubject,
        );

        // If email sending was attempted and successful, update the RA record
        if (emailSentSuccessfully) {
          try {
            await prisma.recommendedAppointment.update({
              where: { id: ra.id },
              data: { [reminderFieldToUpdate]: new Date() }, // Update the specific reminder field
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

        // Add a small delay between processing items to avoid overwhelming resources
        await new Promise((r) => setTimeout(r, CRON_ITEM_PROCESSING_DELAY));
      } else if (reminderFieldToUpdate) {
        // Log if the reminder was skipped because the field was already set
        console.log(
          `[Cron FollowUp] Skipping ${daysAway}-day reminder for RA ${ra.id}: ${reminderFieldToUpdate} already set.`,
        );
      } else {
        // Log if there's no configured reminder window for this specific 'daysAway' value
        console.warn(
          `[Cron FollowUp] No reminder field configured for ${daysAway} days away. Skipping RA ${ra.id}.`,
        );
      }
    }

    // --- Cleanup: Mark old RAs as MISSED ---
    // Find the furthest past reminder day configured (e.g., -14). Anything older than this window + 1 day should be MISSED.
    const furthestPastReminderDay = Math.min(
      0,
      ...FOLLOW_UP_REMINDER_WINDOWS_DAYS.filter((d) => d < 0),
    );

    // Calculate the cutoff date (start of day UTC before the furthest past window)
    const missedCutoffDate = startOfDay(
      addDays(todayStartUTC, furthestPastReminderDay - 1),
    );

    // Update RAs that are still RECOMMENDED or SCHEDULED but are older than the cutoff
    const updatedMissedCountResult =
      await prisma.recommendedAppointment.updateMany({
        where: {
          status: {
            in: [
              RecommendedAppointmentStatus.RECOMMENDED,
              RecommendedAppointmentStatus.SCHEDULED,
            ],
          },
          recommendedDate: { lt: missedCutoffDate }, // Where recommended date is before the cutoff
          suppressNextFollowUpGeneration: false, // Don't mark suppressed RAs as missed in this automated process
        },
        data: { status: RecommendedAppointmentStatus.MISSED }, // Set status to MISSED
      });

    if (updatedMissedCountResult.count > 0) {
      console.log(
        `[Cron FollowUp] Marked ${updatedMissedCountResult.count} old RAs as MISSED (recommended before ${missedCutoffDate.toISOString()}).`,
      );
    }
  } catch (e) {
    console.error(
      `[Cron FollowUp] Error during checkAndSendFollowUpReminders:`,
      e,
    );
  }

  const jobDuration = Date.now() - jobStartTime;
  console.log(
    `[Cron FollowUp] Follow-up recommendation reminder check finished in ${Math.round(jobDuration / 1000)}s.`,
  );
}

async function checkAndSendBookingReminders() {
  if (!resend) {
    console.log(
      `[Cron BookingReminder] Resend not configured. Skipping booking reminders.`,
    );
    return;
  }

  const jobStartTime = Date.now();
  console.log(
    `[Cron BookingReminder] Cycle START at ${new Date().toISOString()}. Current UTC: ${new Date().toISOString()}`,
  );

  const nowUTC = new Date();
  // Window: 50 to 65 minutes from now (adjust window based on how cron schedule is set)
  // If cron is every 15 min, checking 50-65min ensures we hit the ~60 min mark.
  const reminderWindowStartUTC = new Date(nowUTC.getTime() + 50 * 60 * 1000);
  const reminderWindowEndUTC = new Date(nowUTC.getTime() + 65 * 60 * 1000);

  console.log(
    `[Cron BookingReminder] Reminder Window UTC: ${reminderWindowStartUTC.toISOString()} to ${reminderWindowEndUTC.toISOString()}`,
  );

  try {
    const transactionsToConsider = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING, // Only remind for PENDING transactions
        bookedFor: {
          gte: reminderWindowStartUTC, // bookedFor is within the time window
          lte: reminderWindowEndUTC,
          not: null, // bookedFor must not be null
        },
        bookingReminderSentAt: null, // Only remind if the reminder hasn't been sent yet
        customer: { email: { not: null, contains: "@" } }, // Ensure the customer has a valid email
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
      `[Cron BookingReminder] Found ${transactionsToConsider.length} transactions needing 1-hour reminder.`,
    );

    for (const txn of transactionsToConsider) {
      // Double-check status and email before sending (redundant due to query, but safe)
      if (
        txn.status !== Status.PENDING ||
        !txn.customer?.email ||
        txn.bookingReminderSentAt !== null
      ) {
        console.log(
          `[Cron BookingReminder] SKIPPING TXN_ID: ${txn.id} - State changed since query or no email.`,
        );
        continue;
      }

      console.log(
        `[Cron BookingReminder] PREPARING email for TXN_ID: ${txn.id} to ${txn.customer.email}`,
      );

      const customerName = txn.customer.name || "Valued Customer";
      // txn.bookedFor is a Date object from Prisma client
      const bookingDateTimeForDisplay = txn.bookedFor;

      const timeOptionsIntl = {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: PHILIPPINES_TIMEZONE, // Use the target timezone for display formatting
      };
      // Use the Date object directly
      const formattedBookedTime = new Intl.DateTimeFormat(
        "en-US",
        timeOptionsIntl,
      ).format(bookingDateTimeForDisplay);

      const servicesListString = txn.availedServices
        .map(
          (as) =>
            as.originatingSetTitle ||
            as.service?.title ||
            "your scheduled service",
        )
        .filter(Boolean) // Remove any null/undefined/empty strings
        .join(", ");

      const bookingReminderTemplate = await prisma.emailTemplate.findUnique({
        where: { name: "Booking Reminder (1-Hour)" },
      });

      if (!bookingReminderTemplate || !bookingReminderTemplate.isActive) {
        console.warn(
          `[Cron BookingReminder] Template "Booking Reminder (1-Hour)" not found or inactive for TXN ${txn.id}. SKIPPING email.`,
        );
        continue;
      }

      // Replace placeholders in the template body
      let processedContentBodyHtml = bookingReminderTemplate.body;
      processedContentBodyHtml = processedContentBodyHtml.replace(
        /{{customerName}}/g,
        customerName,
      );
      processedContentBodyHtml = processedContentBodyHtml.replace(
        /{{servicesList}}/g,
        servicesListString || "your appointment",
      );
      processedContentBodyHtml = processedContentBodyHtml.replace(
        /{{bookingTime}}/g,
        formattedBookedTime,
      );

      // Replace placeholders in the template subject
      let processedSubject =
        bookingReminderTemplate.subject || "Your Upcoming Appointment Reminder";
      // Add any subject placeholder replacements if your template uses them
      // Example: processedSubject = processedSubject.replace(/{{customerName}}/g, customerName);

      // Presuming sendEmailFromTemplate is defined and handles the actual sending via Resend
      // and returns true on success, false on failure.
      const emailSentSuccessfully = await sendEmailFromTemplate(
        "Booking Reminder (1-Hour)", // Template name for logging
        txn.customer.email,
        customerName,
        processedContentBodyHtml,
        processedSubject,
      );

      if (emailSentSuccessfully) {
        console.log(
          `[Cron BookingReminder] SUCCESS sending email for TXN_ID: ${txn.id}. Updating DB...`,
        );
        try {
          await prisma.transaction.update({
            where: { id: txn.id },
            data: { bookingReminderSentAt: new Date() }, // Mark reminder sent
          });
          console.log(
            `[Cron BookingReminder] DB_UPDATE_SUCCESS: Marked bookingReminderSentAt for TXN_ID: ${txn.id}.`,
          );
        } catch (dbUpdateError) {
          console.error(
            `[Cron BookingReminder] DB_UPDATE_ERROR: Failed to mark bookingReminderSentAt for TXN_ID: ${txn.id}:`,
            dbUpdateError,
          );
        }
      } else {
        console.log(
          `[Cron BookingReminder] FAILED sending email attempt for TXN_ID: ${txn.id}. (sendEmailFromTemplate returned false)`,
        );
      }

      // Add a small delay between processing items if you have many emails to send
      await new Promise((r) =>
        setTimeout(r, CRON_ITEM_PROCESSING_DELAY || 100),
      );
    }
  } catch (e) {
    console.error(
      `[Cron BookingReminder] CRITICAL ERROR during booking reminder check:`,
      e,
    );
  }

  const jobDuration = Date.now() - jobStartTime;
  console.log(
    `[Cron BookingReminder] Cycle END in ${Math.round(jobDuration / 1000)}s.`,
  );
}

// --- Socket Server Startup ---

if (resend) {
  // Schedule with execution lock wrapper to prevent overlapping executions
  cron.schedule(
    FOLLOW_UP_CRON_SCHEDULE,
    () => executeCronJobWithLock("FollowUp", checkAndSendFollowUpReminders),
    {
      scheduled: true,
      timezone: CRON_TIMEZONE,
    },
  );
  console.log(
    `[Cron] Follow-up recommendation reminders scheduled: '${FOLLOW_UP_CRON_SCHEDULE}' (Timezone: ${CRON_TIMEZONE})`,
  );

  cron.schedule(
    BOOKING_REMINDER_CRON_SCHEDULE,
    () =>
      executeCronJobWithLock("BookingReminder", checkAndSendBookingReminders),
    {
      scheduled: true,
      timezone: CRON_TIMEZONE,
    },
  );
  console.log(
    `[Cron] 1-hour booking reminders scheduled: '${BOOKING_REMINDER_CRON_SCHEDULE}' (Timezone: ${CRON_TIMEZONE})`,
  );

  // Log CRON job status periodically (every 5 minutes)
  setInterval(
    () => {
      console.log(`[Cron Status] Active jobs:`, {
        FollowUp: cronJobExecutions.get("FollowUp") || { status: "never run" },
        BookingReminder: cronJobExecutions.get("BookingReminder") || {
          status: "never run",
        },
      });
    },
    5 * 60 * 1000,
  ); // Every 5 minutes
} else {
  console.warn(
    `[Cron] RESEND_API_KEY not set. All email reminder tasks are DISABLED.`,
  );
}

app.get("/", (req, res) =>
  res.status(200).send("BeautyFeel Socket Server is Running"),
);

// Socket.IO connection handler is defined earlier

httpServer.listen(PORT, () => {
  console.log(`🚀 BeautyFeel Socket Server running on port ${PORT}`);
  console.log(`🔗 Allowed CORS origins: ${allowedOrigins.join(", ")}`);
  if (resendKey) {
    console.log(
      `📧 Email Retry Config: Max Retries=${MAX_EMAIL_RETRIES}, Base Delay=${BASE_EMAIL_RETRY_DELAY_MS}ms, Jitter=${EMAIL_RETRY_JITTER_MS}ms`,
    );
  } else {
    console.warn(
      `[Email] RESEND_API_KEY not set. Email functionalities DISABLED.`,
    );
  }
});

const shutdown = (signal) => {
  console.log(`\n${signal} signal received. Starting graceful shutdown...`);
  console.log("Stopping cron jobs...");

  const tasks = cron.getTasks();
  tasks.forEach((task) => {
    try {
      task.stop();
    } catch (e) {
      console.error("Error stopping a cron task:", e);
    }
  });
  console.log("All cron jobs stopped.");

  console.log("Closing HTTP server...");
  httpServer.close((errHttp) => {
    if (errHttp) console.error("Error closing HTTP server:", errHttp);
    else console.log("HTTP server closed.");

    console.log("Closing Socket.IO server...");
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
      "Graceful shutdown timed out (20s). Forcefully shutting down.",
    );
    process.exit(1);
  }, 20000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
