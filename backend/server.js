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
} = require("date-fns");
require("dotenv").config({ path: "../.env" });

const PORT = process.env.PORT || 9000;
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
const COMPLETION_DELAY = 3 * 60 * 1000;

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
});

const transactionCompletionTimers = new Map();

function calculateNextRecommendedDate(baseDate, daysToAdd) {
  const date = new Date(baseDate); // baseDate should be UTC
  if (daysToAdd && parseInt(daysToAdd, 10) > 0) {
    date.setUTCDate(date.getUTCDate() + parseInt(daysToAdd, 10));
  } else {
    console.warn(
      `[calculateNextRecommendedDate] Invalid daysToAdd (${daysToAdd}), defaulting to 7 days.`,
    );
    date.setUTCDate(date.getUTCDate() + 7);
  }
  // Optionally set to start of day UTC or a specific time UTC
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

/**
 * Generates the full HTML structure for an email, wrapping the provided body content.
 * Assumes LOGO_URL_SERVER is available in scope.
 * @param {string} subjectLine - The final subject line for the <title> tag and email client.
 * @param {string} bodyContentHtml - The dynamically generated HTML content block for the main area.
 * @param {string} logoUrl - URL for the logo image.
 * @returns {string} The full HTML for the email.
 */
function generateMasterEmailHtml(subjectLine, bodyContentHtml, logoUrl) {
  return `
  <!DOCTYPE html PUBLIC "-
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
 * Sends an email using a pre-generated subject and HTML body, wrapped in the master email shell.
 * Assumes generateMasterEmailHtml is defined BEFORE this function.
 * Assumes resend and SENDER_EMAIL_SERVER are available in scope.
 *
 * @param {string} toEmail - The recipient's email address.
 * @param {string} customerName - The customer's name, used for the plain text greeting and potentially other general uses.
 * @param {string} subject - The final subject line for the email.
 * @param {string} bodyContentHtml - The HTML content block for the main area (service-specific content).
 * @returns {Promise<boolean>} True if the email sending attempt was made (even if Resend returned an error), false if prerequisites failed.
 */
async function sendCustomHtmlEmail(
  toEmail,
  customerName,
  subject,
  bodyContentHtml,
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
  if (!subject || !bodyContentHtml) {
    console.warn(
      `[Email Sender] Missing subject or body content for email to ${toEmail}. Skipping email.`,
    );
    return false;
  }

  try {
    const fullHtmlBody = generateMasterEmailHtml(
      subject,
      bodyContentHtml,
      LOGO_URL_SERVER,
    );

    const plainTextBody = bodyContentHtml

      .replace(/<p>Hi .*?,<\/p>/i, `Hi ${customerName || "Customer"},\n\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

    console.log(
      `[Email Sender] Attempting to send custom email to ${toEmail} with subject: "${subject}"`,
    );
    const { data, error: emailSendError } = await resend.emails.send({
      from: SENDER_EMAIL_SERVER,
      to: [toEmail],
      subject: subject,
      html: fullHtmlBody,
      text: plainTextBody,
    });

    if (emailSendError) {
      console.error(
        `[Email Sender] Failed to send custom email to ${toEmail}:`,
        emailSendError,
      );
      return false;
    } else {
      console.log(
        `[Email Sender] Custom email sent successfully to ${toEmail}. Email ID: ${data?.id}`,
      );
      return true;
    }
  } catch (error) {
    console.error(
      `[Email Sender] Exception occurred while sending custom email to ${toEmail}:`,
      error,
    );
    return false;
  }
}

/**
 * Sends an email using a template fetched from the database.
 * Assumes generateMasterEmailHtml and resend/SENDER_EMAIL_SERVER are available.
 * This is used for cron-based reminders (follow-up, booking).
 * @param {string} templateName - The name of the email template in the database.
 * @param {string} toEmail - The recipient's email address.
 * @param {string} customerName - The customer's name, used for the plain text greeting and potentially other general uses.
 * @param {string} dynamicBodyHtml - The dynamically generated HTML content for the body (with placeholders already replaced).
 * @param {string} processedSubject - The final subject line for the email (with placeholders already replaced).
 * @returns {Promise<boolean>} True if the email sending attempt was made (even if Resend returned an error), false if prerequisites failed.
 */
async function sendEmailFromTemplate(
  templateName,
  toEmail,
  customerName,
  dynamicBodyHtml,
  processedSubject,
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
    const emailTemplate = await prisma.emailTemplate.findUnique({
      where: { name: templateName },
    });

    if (!emailTemplate || !emailTemplate.isActive) {
      console.warn(
        `[Email Sender] Email template "${templateName}" not found or is inactive. Skipping email for ${toEmail}.`,
      );
      return false;
    }

    const fullHtmlBody = generateMasterEmailHtml(
      processedSubject,
      dynamicBodyHtml,
      LOGO_URL_SERVER,
    );

    const plainTextBody = dynamicBodyHtml
      .replace(/<p>Hi .*?,<\/p>/i, `Hi ${customerName || "Customer"},\n\n`)
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/\n\s*\n/g, "\n\n")
      .trim();

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

      select: {
        id: true,
        status: true,
        availedServices: { select: { status: true } },
      },
    });

    if (!transaction || transaction.status !== Status.PENDING) {
      cancelCompletionTimer(transactionId);
      console.log(
        `[Socket TXN Complete Timer ${transactionId}] Status is not PENDING or TXN not found. Timer check aborted.`,
      );
      return;
    }

    const allDone =
      transaction.availedServices.length > 0 &&
      transaction.availedServices.every((as) => as.status === Status.DONE);

    if (allDone) {
      if (!transactionCompletionTimers.has(transactionId)) {
        console.log(
          `[Socket TXN Complete Timer ${transactionId}] All services DONE. Starting auto-completion timer.`,
        );
        startCompletionTimer(transactionId);
      } else {
        console.log(
          `[Socket TXN Complete Timer ${transactionId}] All services DONE. Timer already active.`,
        );
      }
    } else {
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
    cancelCompletionTimer(transactionId);
  }
}

function startCompletionTimer(transactionId) {
  cancelCompletionTimer(transactionId);

  console.log(
    `[Socket TXN Complete Timer ${transactionId}] Setting completion timer (${COMPLETION_DELAY / 1000}s).`,
  );
  const timerId = setTimeout(async () => {
    console.log(
      `[Socket TXN Complete Timer ${transactionId}] Timer finished. Attempting auto-completion...`,
    );

    transactionCompletionTimers.delete(transactionId);
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);

  transactionCompletionTimers.set(transactionId, timerId);
}

async function completeTransactionAndCalculateSalary(transactionId) {
  console.log(
    `[Socket TXN Complete ${transactionId}] START Processing. Phase 1: Core Financials.`,
  );

  let coreTransactionCommitDetails = null;
  let customerDataForPostOps = null; // To store { id, name, email }
  let availedServicesDataForPostOps = []; // To store [{ id, service: { id, title, ...raFields } }]
  let transactionBookedForDate = null;

  // --- PHASE 1: Core Financial Transaction ---
  try {
    coreTransactionCommitDetails = await prisma.$transaction(
      async (tx) => {
        // Step 1: Fetch transaction data needed for this phase
        const transactionDataForCoreOps = await tx.transaction.findUnique({
          where: { id: transactionId },
          select: {
            id: true,
            status: true,
            grandTotal: true,
            discount: true,
            bookedFor: true,
            customerId: true,
            // Customer data for post-op RA creation & emails (can't avoid fetching some of it here)
            customer: { select: { id: true, name: true, email: true } },
            availedServices: {
              select: {
                id: true, // For RA linking
                servedById: true,
                status: true,
                price: true,
                commissionValue: true, // To check if update needed
                // Service details needed for salary AND for RA decision later
                service: {
                  select: {
                    id: true,
                    title: true,
                    recommendFollowUp: true,
                    recommendedFollowUpDays: true,
                    followUpPolicy: true,
                  },
                },
                servedBy: { select: { id: true, role: true } }, // For salary
                postTreatmentEmailSentAt: true, // For email logic later
                // Also include fields if service itself has email/instructions for post-treatment
                // e.g., service: { select { ..., sendPostTreatmentEmail, postTreatmentInstructions }}
              },
            },
            // Include voucherUsed if needed for broadcast
            voucherUsed: { select: { code: true, value: true } },
          },
        });

        if (!transactionDataForCoreOps) {
          console.warn(
            `[Socket TXN Complete ${transactionId}] CoreTX: TXN not found. Aborting.`,
          );
          throw new Error("Transaction not found for core processing."); // Will cause rollback
        }

        const allServicesDone =
          transactionDataForCoreOps.availedServices.length > 0 &&
          transactionDataForCoreOps.availedServices.every(
            (as) => as.status === Status.DONE,
          );

        if (
          transactionDataForCoreOps.status !== Status.PENDING ||
          !allServicesDone
        ) {
          console.warn(
            `[Socket TXN Complete ${transactionId}] CoreTX: Final state check FAILED. Status: ${transactionDataForCoreOps.status}, AllDone: ${allServicesDone}. Aborting.`,
          );
          throw new Error("Transaction state not valid for completion."); // Will cause rollback
        }

        // Prepare data for post-transaction operations
        customerDataForPostOps = transactionDataForCoreOps.customer;
        availedServicesDataForPostOps =
          transactionDataForCoreOps.availedServices.map((as) => ({
            id: as.id,
            service: as.service, // Contains service details for RA
          }));
        transactionBookedForDate =
          transactionDataForCoreOps.bookedFor || new Date();

        // Step 2: Salary Calculation Logic
        const salaryUpdates = new Map();
        const availedServiceCommissionUpdates = [];
        const originalSumOfServicePrices =
          transactionDataForCoreOps.availedServices.reduce(
            (sum, service) => sum + (service.price || 0),
            0,
          );
        const discountFactor =
          originalSumOfServicePrices > 0
            ? transactionDataForCoreOps.grandTotal / originalSumOfServicePrices
            : 1;
        console.log(
          `[Socket TXN Complete ${transactionId}] CoreTX: Discount Factor: ${discountFactor.toFixed(4)}`,
        );

        for (const availedSvc of transactionDataForCoreOps.availedServices) {
          if (
            availedSvc.servedById &&
            availedSvc.status === Status.DONE &&
            availedSvc.servedBy
          ) {
            const effectivePrice = (availedSvc.price || 0) * discountFactor;
            let commissionRate = 0.1; // Default
            if (availedSvc.servedBy.role.includes(Role.MASSEUSE))
              commissionRate = 0.5;
            // Add other role-based rates if necessary

            const calculatedCommission = Math.max(
              0,
              Math.floor(effectivePrice * commissionRate),
            );
            salaryUpdates.set(
              availedSvc.servedById,
              (salaryUpdates.get(availedSvc.servedById) || 0) +
                calculatedCommission,
            );

            // Only add to update list if commission actually changed
            if (availedSvc.commissionValue !== calculatedCommission) {
              availedServiceCommissionUpdates.push({
                id: availedSvc.id,
                commissionValue: calculatedCommission,
              });
            }
          }
        }

        // Step 3: Update Transaction Status
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: Status.DONE },
        });
        console.log(
          `[Socket TXN Complete ${transactionId}] CoreTX: TXN status set to DONE.`,
        );

        // Step 4: Update AvailedService Commissions (if changed)
        if (availedServiceCommissionUpdates.length > 0) {
          await Promise.all(
            availedServiceCommissionUpdates.map((upd) =>
              tx.availedService.update({
                where: { id: upd.id },
                data: { commissionValue: upd.commissionValue },
              }),
            ),
          );
          console.log(
            `[Socket TXN Complete ${transactionId}] CoreTX: Updated ${availedServiceCommissionUpdates.length} AS commission values.`,
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
        }

        // Return the fetched data (or a subset) to be used for broadcasting and post-treatment emails
        // This object will be `coreTransactionCommitDetails` outside the $transaction
        return transactionDataForCoreOps;
      },
      {
        maxWait: 10000, // How long the client waits for the transaction to be acquired
        timeout: 15000, // Max execution time (Accelerate's limit)
      },
    ); // End of prisma.$transaction for Core Financials

    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 1: Core Financials COMMITTED successfully.`,
    );
  } catch (error) {
    console.error(
      `[Socket TXN Complete ${transactionId}] Phase 1: CRITICAL error during CORE financial transaction:`,
      error,
    );
    io.emit("transactionCompletionFailed", {
      transactionId,
      message: `Core financial processing failed: ${error.message}`,
    });
    return; // Stop further processing
  }

  // --- PHASE 2: RecommendedAppointment Creation (Post-Core-Transaction) ---
  // This runs only if Phase 1 succeeded.
  let raProcessingError = null;
  if (
    coreTransactionCommitDetails &&
    customerDataForPostOps &&
    availedServicesDataForPostOps.length > 0
  ) {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 2: START RecommendedAppointment Creation.`,
    );
    try {
      for (const availedSvcData of availedServicesDataForPostOps) {
        const serviceDef = availedSvcData.service; // serviceDef now comes from the prepared data

        if (
          serviceDef &&
          serviceDef.recommendFollowUp &&
          serviceDef.followUpPolicy !== FollowUpPolicy.NONE &&
          serviceDef.recommendedFollowUpDays
        ) {
          let shouldCreateNewRA = false;

          // Check if an RA for this service type was *just fulfilled* by THIS transaction
          // This query is now outside the main 'tx' block, using 'prisma.'
          const fulfilledRA = await prisma.recommendedAppointment.findFirst({
            where: {
              attendedTransactionId: transactionId,
              originatingServiceId: serviceDef.id,
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
              if (
                fulfilledRA.originatingService?.followUpPolicy ===
                  FollowUpPolicy.EVERY_TIME ||
                fulfilledRA.originatingService?.followUpPolicy ===
                  FollowUpPolicy.ONCE
              ) {
                shouldCreateNewRA = true;
                console.log(
                  `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): Will generate new RA. Fulfilled RA (${fulfilledRA.id} - ${fulfilledRA.originatingService?.title}) allows it.`,
                );
              } else {
                console.log(
                  `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating. Fulfilled RA (${fulfilledRA.id}) policy ${fulfilledRA.originatingService?.followUpPolicy} does not permit new (e.g. after NONE or if ONCE was already the fulfillment).`,
                );
              }
            } else {
              console.log(
                `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): NOT generating. Fulfilled RA (${fulfilledRA.id} - ${fulfilledRA.originatingService?.title}) explicitly suppresses.`,
              );
            }
          } else {
            shouldCreateNewRA = true;
            console.log(
              `[RA Create - PostTX ${transactionId}] AS ${availedSvcData.id} (${serviceDef.title}): Will generate new RA (standard availment, policy: ${serviceDef.followUpPolicy}).`,
            );
          }

          if (shouldCreateNewRA) {
            const nextRecommendedDate = calculateNextRecommendedDate(
              transactionBookedForDate,
              serviceDef.recommendedFollowUpDays,
            );
            await prisma.recommendedAppointment.create({
              data: {
                customerId: customerDataForPostOps.id,
                recommendedDate: nextRecommendedDate,
                originatingTransactionId: transactionId,
                originatingAvailedServiceId: availedSvcData.id,
                originatingServiceId: serviceDef.id,
                status: RecommendedAppointmentStatus.RECOMMENDED,
              },
            });
            console.log(
              `[RA Create - PostTX ${transactionId}] CREATED new RA for service ${serviceDef.title} (AS_ID: ${availedSvcData.id}). Date: ${nextRecommendedDate.toISOString()}`,
            );
          }
        }
      }
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 2: RecommendedAppointment Creation FINISHED.`,
      );
    } catch (error) {
      raProcessingError = error;
      console.error(
        `[Socket TXN Complete ${transactionId}] Phase 2: Error during RecommendedAppointment creation:`,
        error,
      );
      // Decide on error handling: log, notify admin. Financials are already committed.
    }
  }

  // --- PHASE 3: Update Customer's nextAppointment (Post-RA-Creation) ---
  if (
    coreTransactionCommitDetails &&
    customerDataForPostOps &&
    !raProcessingError
  ) {
    // Proceed if RA creation didn't throw a blocking error
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 3: START Customer NextAppointment Update.`,
    );
    try {
      const customerWithRAs = await prisma.customer.findUnique({
        where: { id: customerDataForPostOps.id },
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

      if (customerWithRAs) {
        const newEarliestRADate =
          customerWithRAs.recommendedAppointments[0]?.recommendedDate || null;
        const currentNextAppt = customerWithRAs.nextAppointment || null;
        let needsUpdate = false;
        if (
          (newEarliestRADate === null && currentNextAppt !== null) ||
          (newEarliestRADate !== null && currentNextAppt === null) ||
          (newEarliestRADate !== null &&
            currentNextAppt !== null &&
            !isEqual(
              startOfDay(newEarliestRADate),
              startOfDay(currentNextAppt),
            ))
        ) {
          needsUpdate = true;
        }

        if (needsUpdate) {
          await prisma.customer.update({
            where: { id: customerDataForPostOps.id },
            data: { nextAppointment: newEarliestRADate },
          });
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 3: Customer ${customerDataForPostOps.id} nextAppointment set to ${newEarliestRADate?.toISOString() || "null"}.`,
          );
        } else {
          console.log(
            `[Socket TXN Complete ${transactionId}] Phase 3: Customer ${customerDataForPostOps.id} nextAppointment did not require update.`,
          );
        }
      }
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 3: Customer NextAppointment Update FINISHED.`,
      );
    } catch (error) {
      console.error(
        `[Socket TXN Complete ${transactionId}] Phase 3: Error updating customer nextAppointment:`,
        error,
      );
    }
  }

  // --- PHASE 4: Post-Treatment Email Logic & Broadcasting ---
  // This uses `coreTransactionCommitDetails` which contains the full transaction details from the end of Phase 1.
  if (coreTransactionCommitDetails) {
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 4: START Post-Treatment Emails and Broadcast.`,
    );
    // Post-Treatment Email Logic (ensure `coreTransactionCommitDetails` has the necessary service fields)
    if (coreTransactionCommitDetails.customer?.email) {
      const customer = coreTransactionCommitDetails.customer;
      for (const as of coreTransactionCommitDetails.availedServices) {
        // Ensure 'as.service' has 'sendPostTreatmentEmail' and 'postTreatmentInstructions' selected in Phase 1 fetch
        if (
          as.service &&
          as.service.sendPostTreatmentEmail &&
          as.service.postTreatmentInstructions &&
          as.postTreatmentEmailSentAt === null
        ) {
          const subject =
            as.service.postTreatmentEmailSubject ||
            `Post-Treatment Care for ${as.service.title}`;
          const instructionsHtml = formatInstructionsToHtml(
            as.service.postTreatmentInstructions,
          ); // Ensure formatInstructionsToHtml is defined
          const bodyContentHtml = `
               <p>Hi ${customer.name || "there"},</p>
               <p>Thank you! Here are care instructions for your service${coreTransactionCommitDetails.availedServices.length > 1 ? " (" + as.service.title + ")" : ""}:</p>
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
          ); // Ensure sendCustomHtmlEmail is defined

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
          await new Promise((r) =>
            setTimeout(r, CRON_ITEM_PROCESSING_DELAY || 100),
          ); // Ensure CRON_ITEM_PROCESSING_DELAY is defined
        }
      }
    } else {
      console.log(
        `[Socket TXN Complete ${transactionId}] Phase 4: No customer email for post-treatment messages.`,
      );
    }

    io.emit("transactionCompleted", coreTransactionCommitDetails); // Broadcast the result of the core transaction
    console.log(
      `[Socket TXN Complete ${transactionId}] Phase 4: FINISHED. Transaction processed (RA creation attempted: ${raProcessingError ? "Failed" : "Succeeded/Skipped"}). Broadcasted.`,
    );
  } else if (!coreTransactionCommitDetails) {
    // This case should have been caught by the return after Phase 1 error
    console.error(
      `[Socket TXN Complete ${transactionId}] Reached Phase 4 without coreTransactionCommitDetails. This indicates a logic flaw.`,
    );
    io.emit("transactionCompletionFailed", {
      transactionId,
      message: "Internal server error after core processing.",
    });
  }
}

async function checkAndSendFollowUpReminders() {
  if (!resend) {
    console.log(
      `[Cron FollowUp] Resend not configured. Skipping follow-up reminders.`,
    );
    return;
  }
  console.log(
    `[Cron FollowUp] Starting check for follow-up recommendation reminders...`,
  );

  const now = new Date();

  const todayStartUTC = startOfDay(now);

  const targetDatesForQuery = FOLLOW_UP_REMINDER_WINDOWS_DAYS.map((days) =>
    startOfDay(addDays(todayStartUTC, days)),
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

        customer: { email: { not: null, contains: "@" } },

        suppressNextFollowUpGeneration: false,

        OR: targetDatesForQuery.map((localStartOfDay) => ({
          recommendedDate: {
            gte: localStartOfDay,

            lt: addDays(localStartOfDay, 1),
          },
        })),
      },

      select: {
        id: true,
        recommendedDate: true,
        customer: { select: { id: true, name: true, email: true } },

        ...Object.values(FOLLOW_UP_REMINDER_FIELDS).reduce((obj, fieldName) => {
          obj[fieldName] = true;
          return obj;
        }, {}),
      },
    });

    console.log(
      `[Cron FollowUp] Found ${rAsToConsider.length} RAs potentially needing reminders today.`,
    );

    for (const ra of rAsToConsider) {
      const raRecommendedDateStartUTC = startOfDay(
        new Date(ra.recommendedDate),
      );
      const daysAway = differenceInDays(
        raRecommendedDateStartUTC,
        todayStartUTC,
      );

      const reminderFieldToUpdateKey = String(daysAway);
      const reminderFieldToUpdate =
        FOLLOW_UP_REMINDER_FIELDS[reminderFieldToUpdateKey];

      if (reminderFieldToUpdate && ra[reminderFieldToUpdate] === null) {
        const customerName = ra.customer.name || "Valued Customer";

        const recommendedDateForDisplay = new Date(ra.recommendedDate);

        const dateOptionsIntl = {
          year: "numeric",
          month: "long",
          day: "numeric",
          timeZone: PHILIPPINES_TIMEZONE,
        };
        const formattedRecDate = new Intl.DateTimeFormat(
          "en-US",
          dateOptionsIntl,
        ).format(recommendedDateForDisplay);

        const daysAwayPhrase =
          DAYS_AWAY_PHRASE[reminderFieldToUpdateKey] ||
          `${Math.abs(daysAway)} days ${daysAway >= 0 ? "from now" : "ago"}`;

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
          introMessage =
            "We noticed your recommended follow-up date has passed.";
          timeAdverbAndDate = `was ${daysAwayPhrase}, on ${formattedRecDate}`;
          actionMessage =
            "It's not too late to get back on track! Contact us to schedule your next visit.";
        }

        const followUpTemplate = await prisma.emailTemplate.findUnique({
          where: { name: "Follow-up Reminder" },
        });

        if (!followUpTemplate || !followUpTemplate.isActive) {
          console.warn(
            `[Cron FollowUp] Template "Follow-up Reminder" not found or inactive for RA ${ra.id}. Skipping email.`,
          );
          continue;
        }

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

        let processedSubject = followUpTemplate.subject;
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

        const emailSentSuccessfully = await sendEmailFromTemplate(
          "Follow-up Reminder",
          ra.customer.email,
          customerName,
          processedContentBodyHtml,
          processedSubject,
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
          `[Cron FollowUp] Skipping ${daysAway}-day reminder for RA ${ra.id}: ${reminderFieldToUpdate} already set at ${ra[reminderFieldToUpdate]}.`,
        );
      } else {
        console.warn(
          `[Cron FollowUp] No reminder field configured for ${daysAway} days away. Skipping RA ${ra.id}.`,
        );
      }
    }

    const furthestPastReminderDay = Math.min(
      0,
      ...FOLLOW_UP_REMINDER_WINDOWS_DAYS.filter((d) => d < 0),
    );

    const missedCutoffDate = startOfDay(
      addDays(todayStartUTC, furthestPastReminderDay - 1),
    );

    const updatedMissedCountResult =
      await prisma.recommendedAppointment.updateMany({
        where: {
          status: {
            in: [
              RecommendedAppointmentStatus.RECOMMENDED,
              RecommendedAppointmentStatus.SCHEDULED,
            ],
          },
          recommendedDate: { lt: missedCutoffDate },
          suppressNextFollowUpGeneration: false,
        },
        data: { status: RecommendedAppointmentStatus.MISSED },
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
  console.log(
    `[Cron FollowUp] Follow-up recommendation reminder check finished.`,
  );
}

async function checkAndSendBookingReminders() {
  if (!resend) {
    console.log(
      `[Cron BookingReminder] Resend not configured. Skipping booking reminders.`,
    );
    return;
  }
  console.log(
    `[Cron BookingReminder] Starting check for 1-hour booking reminders...`,
  );

  const nowUTC = new Date();

  const reminderWindowStartUTC = new Date(nowUTC.getTime() + 50 * 60 * 1000);
  const reminderWindowEndUTC = new Date(nowUTC.getTime() + 65 * 60 * 1000);

  try {
    const transactionsToRemind = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING,
        bookedFor: { gte: reminderWindowStartUTC, lte: reminderWindowEndUTC },
        bookingReminderSentAt: null,
        customer: { email: { not: null, contains: "@" } },
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
      `[Cron BookingReminder] Found ${transactionsToRemind.length} bookings for reminder in the next hour window.`,
    );

    for (const txn of transactionsToRemind) {
      if (!txn.customer?.email) {
        console.warn(
          `[Cron BookingReminder] Skipping reminder for TXN ${txn.id}: Customer or email missing.`,
        );
        continue;
      }

      const customerName = txn.customer.name || "Valued Customer";
      const bookingDateTimeForDisplay = new Date(txn.bookedFor);

      const timeOptionsIntl = {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: PHILIPPINES_TIMEZONE,
      };
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
        .filter(Boolean)
        .join(", ");

      const bookingReminderTemplate = await prisma.emailTemplate.findUnique({
        where: { name: "Booking Reminder (1-Hour)" },
      });

      if (!bookingReminderTemplate || !bookingReminderTemplate.isActive) {
        console.warn(
          `[Cron BookingReminder] Template "Booking Reminder (1-Hour)" not found or inactive for TXN ${txn.id}. Skipping email.`,
        );
        continue;
      }

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

      let processedSubject = bookingReminderTemplate.subject;

      console.log(
        `[Cron BookingReminder] Preparing to send 1-hour reminder for TXN ${txn.id} to ${txn.customer.email}`,
      );

      const emailSentSuccessfully = await sendEmailFromTemplate(
        "Booking Reminder (1-Hour)",
        txn.customer.email,
        customerName,
        processedContentBodyHtml,
        processedSubject,
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

if (resend) {
  cron.schedule(FOLLOW_UP_CRON_SCHEDULE, checkAndSendFollowUpReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] Follow-up recommendation reminders scheduled: '${FOLLOW_UP_CRON_SCHEDULE}' (Timezone: ${CRON_TIMEZONE})`,
  );

  cron.schedule(BOOKING_REMINDER_CRON_SCHEDULE, checkAndSendBookingReminders, {
    scheduled: true,
    timezone: CRON_TIMEZONE,
  });
  console.log(
    `[Cron] 1-hour booking reminders scheduled: '${BOOKING_REMINDER_CRON_SCHEDULE}' (Timezone: ${CRON_TIMEZONE})`,
  );
} else {
  console.warn(
    `[Cron] RESEND_API_KEY not set. All email reminder tasks are DISABLED.`,
  );
}

app.get("/", (req, res) =>
  res.status(200).send("BeautyFeel Socket Server is Running"),
);

io.on("connection", (socket) => {
  const clientId = socket.id;

  const connectedAccountId =
    socket.handshake.query &&
    typeof socket.handshake.query.accountId === "string" &&
    socket.handshake.query.accountId !== "undefined" &&
    socket.handshake.query.accountId !== "null"
      ? socket.handshake.query.accountId
      : "N/A_SocketUser";

  console.log(
    `Client connected: ${clientId}, Account: ${connectedAccountId}, IP: ${socket.handshake.address}`,
  );

  socket.on(
    "checkService",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX checkService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceCheckError", {
          availedServiceId,
          message: "Invalid request data provided for checkService.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              id: true,
              status: true,
              checkedById: true,
              servedById: true,
              checkedBy: { select: { id: true, name: true } },
              transaction: { select: { id: true, status: true } },
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

          if (as.servedById) {
            throw new Error(`Cannot check: Service already marked as served.`);
          }

          if (as.checkedById && as.checkedById !== accountId) {
            throw new Error(
              `Already checked by ${as.checkedBy?.name || "another user"}.`,
            );
          }

          if (as.checkedById === accountId) {
            console.log(
              `[Socket ${clientId}] AS ${availedServiceId} already checked by ${accountId}. No DB update needed.`,
            );

            return await tx.availedService.findUnique({
              where: { id: availedServiceId },
              include: {
                service: { select: { id: true, title: true } },
                checkedBy: { select: { id: true, name: true } },
                servedBy: { select: { id: true, name: true } },
              },
            });
          }

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING,
              servedById: null,
              checkedById: null,
            },
            data: { checkedById: accountId },
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} checked by ${accountId}. Broadcasting update.`,
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
        else if (error.message.includes("Cannot check:"))
          userMsg = error.message;
        else if (error.message.includes("Already checked by"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not check service due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("serviceCheckError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "uncheckService",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX uncheckService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceUncheckError", {
          availedServiceId,
          message: "Invalid request data provided for uncheckService.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              id: true,
              status: true,
              checkedById: true,
              servedById: true,
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
              transaction: { select: { id: true, status: true } },
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

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING,
              servedById: null,
              checkedById: accountId,
            },
            data: { checkedById: null },
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} unchecked by ${accountId}. Broadcasting update.`,
          );

          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] uncheckService ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Server error unchecking service.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot uncheck:"))
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck: Checked by"))
          userMsg = error.message;
        else if (error.message.includes("Cannot uncheck: Already served by"))
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not uncheck service due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("serviceUncheckError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX markServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message: "Invalid request data provided for markServiceServed.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              id: true,
              status: true,
              checkedById: true,
              servedById: true,
              servedBy: { select: { id: true, name: true } },
              transaction: { select: { id: true, status: true } },
            },
          });

          if (!as) throw new Error("Service item not found.");

          if (as.transaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot mark served: Transaction status is ${as.transaction?.status}.`,
            );
          }

          if (as.status !== Status.PENDING)
            throw new Error(
              `Cannot mark served: Service status is ${as.status}.`,
            );

          if (as.servedById)
            throw new Error(
              `Cannot mark served: Already served by ${as.servedBy?.name || "another user"}.`,
            );

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.PENDING,
              servedById: null,
            },
            data: {
              servedById: accountId,
              status: Status.DONE,
              completedAt: new Date(),
            },
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} MARKED as served by ${accountId}. Broadcasting update.`,
          );

          checkAndManageCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] markServiceServed ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Could not mark service as served.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot mark served:"))
          userMsg = error.message;
        else if (
          error.message.includes("Cannot mark served: Already served by")
        )
          userMsg = error.message;
        else if (
          error.message.includes(
            "Cannot mark served: Service must be checked first",
          )
        )
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not mark service due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("serviceMarkServedError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  socket.on(
    "unmarkServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      console.log(
        `[Socket ${clientId}] RX unmarkServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      if (!availedServiceId || !transactionId || !accountId) {
        socket.emit("serviceUnmarkServedError", {
          availedServiceId,
          message: "Invalid request data provided for unmarkServiceServed.",
        });
        return;
      }
      try {
        const updatedAS = await prisma.$transaction(async (tx) => {
          const as = await tx.availedService.findUnique({
            where: { id: availedServiceId },
            select: {
              id: true,
              status: true,
              checkedById: true,
              servedById: true,
              servedBy: { select: { id: true, name: true } },
              transaction: { select: { id: true, status: true } },
            },
          });

          if (!as) throw new Error("Service item not found.");

          if (as.transaction?.status !== Status.PENDING) {
            throw new Error(
              `Cannot unmark served: Transaction status is ${as.transaction?.status}.`,
            );
          }

          if (as.status !== Status.DONE)
            throw new Error(
              `Cannot unmark served: Service status is ${as.status}.`,
            );

          if (as.servedById !== accountId)
            throw new Error(
              `Cannot unmark served: Not served by you (Served by ${as.servedBy?.name || "N/A"}).`,
            );

          return tx.availedService.update({
            where: {
              id: availedServiceId,
              status: Status.DONE,
              servedById: accountId,
            },
            data: {
              servedById: null,
              status: Status.PENDING,
              completedAt: null,
            },
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          });
        });

        if (updatedAS) {
          io.emit("availedServiceUpdated", updatedAS);
          console.log(
            `[Socket ${clientId}] AvailedService ${availedServiceId} UNMARKED as served by ${accountId}. Broadcasting update.`,
          );

          cancelCompletionTimer(transactionId);
        }
      } catch (error) {
        console.error(
          `[Socket ${clientId}] unmarkServiceServed ERROR for ${availedServiceId}:`,
          error,
        );
        let userMsg = "Could not unmark service as served.";

        if (error.message.includes("Service item not found."))
          userMsg = "Service not found.";
        else if (error.message.includes("Cannot unmark served:"))
          userMsg = error.message;
        else if (
          error.message.includes("Cannot unmark served: Not served by you")
        )
          userMsg = error.message;
        else if (error.code === "P2025")
          userMsg =
            "Could not unmark service due to a data mismatch. Please refresh.";
        else userMsg = `An unexpected error occurred: ${error.message}`;

        socket.emit("serviceUnmarkServedError", {
          availedServiceId,
          message: userMsg,
        });
      }
    },
  );

  socket.on("disconnect", (reason) => {
    console.log(
      `Client disconnected: ${clientId}, Account: ${connectedAccountId}, Reason: ${reason}`,
    );
  });

  socket.on("connect_error", (err) => {
    console.error(`Socket connect_error for ${clientId}: ${err.message}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`🚀 BeautyFeel Socket Server running on port ${PORT}`);
  console.log(`🔗 Allowed CORS origins: ${allowedOrigins.join(", ")}`);
  if (!resendKey && process.env.NODE_ENV !== "test") {
    console.error(
      "🛑 Resend API Key is MISSING. Email functionalities will be impaired or disabled.",
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
