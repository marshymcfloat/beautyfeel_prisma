"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import {
  PrismaClient,
  PaymentMethod,
  Status,
  GiftCertificate,
  Service,
  Role,
  DiscountRule,
  ServiceSet,
  AvailedItemType,
  Prisma,
  Customer,
  Voucher,
  DiscountType,
  Branch,
  PayslipStatus,
  Account,
  FollowUpPolicy,
  PayslipRequestStatus,
  RecommendedAppointmentStatus,
  EmailTemplate,
  ExpenseCategory,
} from "@prisma/client";

import {
  getCachedData,
  setCachedData,
  CacheKey,
  invalidateCache,
} from "./cache";

import {
  subDays,
  startOfDay,
  endOfDay,
  getDate,
  getMonth,
  getYear,
  isValid,
  startOfMonth,
  endOfMonth,
  addDays,
  isBefore,
  isAfter,
  isEqual,
  subMonths,
  format,
  setDate,
} from "date-fns"; // Import date-fns functions

import { withAccelerate } from "@prisma/extension-accelerate";
import {
  MonthlySalesWithPaymentBreakdown,
  SalesDataDetailed,
  PaymentMethodTotals,
  MonthlySales,
  PayslipRequestData,
  TransactionForManagement,
  ServerActionResponse,
  CheckGCResult,
  UIDiscountRuleWithServices,
  AccountForManagement,
  TransactionSubmissionResponse,
  AttendanceRecord,
  GetTransactionsFilters,
  CurrentSalaryDetailsData,
  CustomerProp,
  AvailedServicesProps,
  AccountInfo,
  TransactionProps,
  SelectOption,
  AccountData,
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE,
  BranchForSelect,
  PayslipData,
  MonthlyExpensesTotal,
  EmployeeForAttendance,
  PayslipStatusOption,
  AvailedItem,
  BasicAccountInfo,
  DetailedTransactionWithBranch,
  CustomerWithRecommendations,
  CustomerForEmail,
  ServiceInfo,
} from "./Types";
import { CashierState } from "./Slices/CashierSlice";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ParamValue } from "next/dist/server/request/params";
import { Resend } from "resend";

interface GcCreationData {
  code: string;
  itemIds: string[];
  itemType: "service" | "set";
  recipientCustomerId: string | null;
  recipientName: string | null;
  purchaserCustomerId: string | null;
  recipientEmail: string | null;
  expiresAt: string | null;
}

interface ActionResult {
  success: boolean;
  message: string;
}

interface ActionResult {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>; // For field-specific errors
  account?: {
    // Return minimal, non-sensitive info
    id: string;
    username: string;
    email: string | null; // email is nullable in schema, but required by this action
    name: string;
  };
}

export type GCValidationDetails = GiftCertificate & {
  services: Pick<Service, "id" | "title" | "price">[];
  serviceSets: Pick<ServiceSet, "id" | "title" | "price">[];
  purchaserCustomer?: Pick<Customer, "id" | "name" | "email"> | null; // Include if you want to prefill
};

interface GCValidationResult {
  success: boolean;
  message: string;
  gcDetails?: GCValidationDetails;
  errorCode?: "NOT_FOUND" | "USED" | "EXPIRED" | "INVALID_DATA";
}

interface UpdateTransactionInput {
  transactionId: string;
  status?: Status; // Make fields optional for partial updates
  paymentMethod?: PaymentMethod | null; // Allow setting to null
  // Add other fields you want to be able to edit here
}

const CUSTOMERS_CACHE_KEY: CacheKey = "customers_SendEmail";
const TEMPLATES_CACHE_KEY: CacheKey = "emailTemplates_ManageEmailTemplates";
const MANAGE_CUSTOMERS_CACHE_KEY: CacheKey = "customers_ManageCustomers";

const getStartOfTodayTargetTimezoneUtc = () => {
  const nowUtc = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const targetDateString = formatter.format(nowUtc); // e.g., "YYYY-MM-DD"
  const [yearStr, monthStr, dayStr] = targetDateString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // Month is 0-indexed
  const day = parseInt(dayStr, 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

const CustomerSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required.")
    .max(50, "Name cannot exceed 50 characters."),
  email: z
    .string()
    .email("Invalid email address.")
    .nullable()
    .optional()
    .or(z.literal("")), // Allow null, undefined, or empty string, but validate if present
});

const isEmailUnique = async (
  email: string,
  currentId: string | null = null,
): Promise<boolean> => {
  if (!email) return true; // If no email, it's "unique" in this context
  const whereClause: Prisma.CustomerWhereInput = {
    email: email,
  };
  if (currentId) {
    whereClause.id = { not: currentId };
  }
  const existing = await prisma.customer.findFirst({ where: whereClause });
  return !existing;
};

export interface CustomerForDisplay {
  id: string;
  name: string;
  email: string | null;
  totalPaid: number;
  nextAppointment: Date | null;
}

const prisma = new PrismaClient().$extends(withAccelerate());

const PHILIPPINES_TIMEZONE = "Asia/Manila";
const MANILA_OFFSET_HOURS = 8;
const PHT_TIMEZONE_OFFSET_HOURS = 8;

const resendApiKeySA =
  process.env.RESEND_API_KEY || "re_2jVrmuDq_ANKBi91TjmsYVj8Gv7VHZfZD";
const resendInstanceSA = resendApiKeySA ? new Resend(resendApiKeySA) : null;
if (!resendInstanceSA && process.env.NODE_ENV === "production") {
  // Log warning in production if Resend isn't configured
  console.warn(
    "WARNING (ServerAction): RESEND_API_KEY is not set. Booking confirmation emails will NOT be sent.",
  );
}
const SENDER_EMAIL_SA = process.env.SENDER_EMAIL || "clinic@beautyfeel.net";
const LOGO_URL_SA =
  process.env.LOGO_URL || "https://beautyfeel.net/btfeel-icon.png"; // Your public logo URL

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}

function generateRandomPassword(length: number = 12): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

function convertErrorsToStringArrays(
  errorObj: Record<string, string>,
): Record<string, string[]> {
  const newErrors: Record<string, string[]> = {};
  for (const key in errorObj) {
    if (Object.prototype.hasOwnProperty.call(errorObj, key)) {
      newErrors[key] = [errorObj[key]]; // Wrap the string message in an array
    }
  }
  return newErrors;
}

function replacePlaceholders(
  template: string,
  customer: CustomerForEmail,
): string {
  let result = template;
  result = result.replace(/{{customerName}}/g, customer.name || "");
  result = result.replace(/{{customerEmail}}/g, customer.email || "");
  // Add more placeholder replacements here if needed, e.g.:
  // result = result.replace(/{{lastVisitDate}}/g, customer.lastVisitDate || 'N/A');
  return result;
}

function generateBookingConfirmationBodySA(
  customerName: string,
  bookingDateTimeUTC: Date, // This is the JavaScript Date object representing the UTC time
  services: { name: string }[],
): string {
  // bookingDateTimeUTC is the JavaScript Date object representing the UTC time

  // Correctly uses timeZone: PHILIPPINES_TIMEZONE to format the UTC date
  // into the target timezone's date components
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE, // Specify the target timezone (string)
  };
  const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(
    bookingDateTimeUTC,
  );

  // Correctly uses timeZone: PHILIPPINES_TIMEZONE to format the UTC date
  // into the target timezone's time components
  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE, // Specify the target timezone (string)
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
<strong>Time:</strong> ${formattedTime}</p>
<p><strong>Services Booked:</strong></p>
${serviceListHtml}

${reminderSectionHtml} <!-- Insert the reminder block here -->

<p style="margin-top: 30px;">We look forward to seeing you! If you need to make any changes to your appointment, please contact us as soon as possible.</p>
<p>Best regards,<br>The BeautyFeel Team</p>
  `.trim(); // Trim whitespace from the whole block
}

function generateBookingEmailHTMLSA(
  bodyContent: string, // Expects the HTML body content generated by a function like generateBookingConfirmationBodySA
  subjectLine: string,
  logoUrl: string,
): string {
  // Using more robust inline styles for better email client compatibility
  // This looks identical to generateStandardEmailHTML, consider consolidating.
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

function generateBookingDetailsHtml(
  bookingDateTimeUTC: Date,
  services: { name: string }[],
): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(
    bookingDateTimeUTC,
  );

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedTime = new Intl.DateTimeFormat("en-US", timeOptions).format(
    bookingDateTimeUTC,
  );

  const serviceListItemsHtml =
    services.length > 0
      ? services.map((s) => `<li>${s.name}</li>`).join("")
      : "<li>Details of services will be confirmed upon arrival.</li>";

  // Returns only the HTML block for these details
  return `
<p><strong>Date:</strong> ${formattedDate}<br>
<strong>Time:</strong> ${formattedTime}</p>
<p><strong>Services Booked:</strong></p>
<ul>${serviceListItemsHtml}</ul>
  `.trim();
}

// --- Updated Async Function to Send Email using Template ---
async function sendBookingConfirmationEmail(
  customerName: string,
  customerEmail: string,
  bookingDateTimeUTC: Date,
  services: { name: string }[],
  logoUrl: string,
) {
  if (!resendInstanceSA) {
    console.warn(
      "sendBookingConfirmationEmail: Resend instance not initialized. Skipping email.",
    );
    return;
  }

  if (!customerEmail) {
    console.warn(
      `sendBookingConfirmationEmail: Customer "${customerName}" has no email. Skipping email.`,
    );
    return;
  }

  try {
    // 1. Fetch the email template from the database
    const emailTemplate = await prisma.emailTemplate.findUnique({
      where: { name: "Booking Confirmation" },
    });

    if (!emailTemplate || !emailTemplate.isActive) {
      console.warn(
        "sendBookingConfirmationEmail: 'Booking Confirmation' email template not found or is inactive. Skipping email.",
      );
      return;
    }

    // 2. Generate the dynamic HTML block for booking details (Date, Time, Services List)
    const bookingDetailsHtml = generateBookingDetailsHtml(
      bookingDateTimeUTC,
      services,
    );

    // 3. Replace placeholders in the subject and body
    // Replace {{customerName}} in the subject string first
    let processedSubject = emailTemplate.subject.replace(
      "{{customerName}}",
      customerName,
    );

    // Replace placeholders in the HTML body
    let processedHtmlBody = emailTemplate.body
      .replace("{{subject}}", processedSubject) // Replace title placeholder in <head>
      .replace("{{logoUrl}}", logoUrl) // Replace logo placeholder
      .replace("{{customerName}}", customerName) // Replace customer name placeholder in body
      .replace("{{bookingDetailsHtml}}", bookingDetailsHtml); // Insert the generated booking details HTML block

    // Optional: Generate plain text fallback
    const plainTextBody = `
Hi ${customerName},

Thank you for your booking! Your appointment at BeautyFeel is confirmed for:

Date: ${new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: PHILIPPINES_TIMEZONE,
    }).format(bookingDateTimeUTC)}
Time: ${new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: PHILIPPINES_TIMEZONE,
    }).format(bookingDateTimeUTC)}

Services Booked:
${services.map((s) => `- ${s.name}`).join("\n")}

Important Reminders:
To manage your waiting time, we accept pre-booked appointments but walk-ins are also welcome.
With this, please be on time on your scheduled appointment. A grace period of 15 minutes will be given.
Afterwards, your appointment will be automatically cancelled and will treat you as walk-in (first come, first serve).

Cancellation/No Show Reminder:
All Appointment Cancellations less than 3 hours prior to scheduled time, will result to a 50% charge of your service cost.
All "No Shows" will be charged 100% of your service cost.

We look forward to seeing you! If you need to make any changes to your appointment, please contact us as soon as possible.

Best regards,
The BeautyFeel Team
    `.trim();

    // 4. Send the email
    const { data: emailSentData, error: emailSendError } =
      await resendInstanceSA.emails.send({
        from: SENDER_EMAIL_SA,
        to: [customerEmail],
        subject: processedSubject, // Use the subject with the customer name replaced
        html: processedHtmlBody,
        text: plainTextBody,
      });

    if (emailSendError) {
      console.error(
        "sendBookingConfirmationEmail: Failed to send email:",
        emailSendError,
      );
    } else {
      console.log(
        "sendBookingConfirmationEmail: Email sent successfully. ID:",
        emailSentData?.id,
      );
    }
  } catch (error: any) {
    console.error(
      "sendBookingConfirmationEmail: Exception occurred:",
      error.message,
      error,
    );
  }
}

function formatGCExpiryDate(date: Date | null): string {
  if (!date) return "Never";
  try {
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      // timeZone: PHILIPPINES_TIMEZONE // Optional: Add if you want PHT interpretation
    });
  } catch (e) {
    console.error("Error formatting GC expiry date:", e, date);
    return "Invalid Date";
  }
}

function generateGiftCertificateBodySA(
  recipientName: string | null,
  gcCode: string,
  includedItems: { name: string }[],
  expiresAt: Date | null,
): string {
  const customerGreeting = recipientName ? `Hi ${recipientName},` : "Hello,";
  const expiryInfo = formatGCExpiryDate(expiresAt);

  const itemListHtml =
    includedItems.length > 0
      ? `<ul>${includedItems.map((item) => `<li>${item.name}</li>`).join("")}</ul>`
      : "<p>Applicable services/sets will be confirmed upon redemption.</p>";

  return `
<p>${customerGreeting}</p>
<p>Great news! You've received a Gift Certificate for BeautyFeel!</p>
<p>Use the code below when booking or visiting us to redeem your services:</p>
<p style="text-align: center; font-size: 24px; font-weight: bold; color: #C28583; background-color: #f8f8f8; padding: 15px; border-radius: 5px; border: 1px dashed #dddddd; margin: 20px 0; font-family: monospace;">
  ${gcCode}
</p>
<p><strong>Applicable To:</strong></p>
${itemListHtml}
<p><strong>Expires:</strong> ${expiryInfo}</p>
<p style="margin-top: 30px;">We look forward to pampering you! Please present this code (or email) upon arrival.</p>
<p>Best regards,<br>The BeautyFeel Team</p>
  `.trim();
}

function generateGiftCertificateEmailHTMLSA(
  bodyContent: string,
  subjectLine: string,
  logoUrl: string,
): string {
  // Reusing the booking email structure.
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
        /* Specific GC Code Style */
        .gc-code { text-align: center; font-size: 24px; font-weight: bold; color: #C28583; background-color: #f8f8f8; padding: 15px; border-radius: 5px; border: 1px dashed #dddddd; margin: 20px 0; font-family: monospace; }
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

function generateDynamicBookingContentHtml(
  customerName: string,
  bookingDateTimeUTC: Date,
  services: { name: string }[],
): string {
  const dateOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedDate = new Intl.DateTimeFormat("en-US", dateOptions).format(
    bookingDateTimeUTC,
  );

  const timeOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: PHILIPPINES_TIMEZONE,
  };
  const formattedTime = new Intl.DateTimeFormat("en-US", timeOptions).format(
    bookingDateTimeUTC,
  );

  const serviceListHtml =
    services.length > 0
      ? `<ul>${services.map((s) => `<li>${s.name}</li>`).join("")}</ul>`
      : "<p>Details of services will be confirmed upon arrival.</p>";

  // Reminder texts are assumed to be part of the template's static HTML structure now,
  // placed around the {{emailContent}} placeholder.
  // This function just generates the core booking details block.

  return `
<p>Hi ${customerName},</p>
<p>Thank you for your booking! Your appointment at BeautyFeel is confirmed for:</p>
<p><strong>Date:</strong> ${formattedDate}<br>
<strong>Time:</strong> ${formattedTime}</p>
<p><strong>Services Booked:</strong></p>
${serviceListHtml}
<p style="margin-top: 30px;">We look forward to seeing you! If you need to make any changes to your appointment, please contact us as soon as possible.</p>
<p>Best regards,<br>The BeautyFeel Team</p>
  `.trim();
}

const EmailTemplateSchema = z.object({
  name: z.string().min(1, "Name is required."),
  subject: z.string().min(1, "Subject is required."),
  body: z.string().min(1, "Body is required."),
  placeholders: z.array(z.string()).optional().default([]),
  isActive: z.boolean().default(true),
});

const baseServiceFormDataSchema = z.object({
  // title: Accept string or null from form, treat empty string as null, trim, then ensure non-empty string after pipe
  title: z
    .union([z.string(), z.null()])
    .transform((v) =>
      v === null || v === undefined || v === "" ? null : v.trim(),
    ) // Normalize null and trim
    .pipe(z.string().min(1, "Title is required.")), // Ensures the output is a non-empty string

  // description: Accept string or null, treat empty string as null, trim, ensure string or null after pipe
  description: z
    .union([z.string(), z.null()])
    .transform((v) =>
      v === null || v === undefined || v === "" ? null : v.trim(),
    ) // Normalize null and trim
    .pipe(z.string().nullable()), // Ensures the output is string or null

  // price: Accept string or null, treat empty string as null, ensure non-empty string then transform to number via pipe
  price: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v)) // Normalize null
    .pipe(
      z
        .string()
        .min(1, "Price is required.")
        .transform((v) => Number(v)),
    ), // Ensures input is non-empty string, then transforms to number

  // Branch ID: Accept string or null, treat empty string as null, ensure non-empty string via pipe
  branchId: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v)) // Normalize null
    .pipe(z.string().min(1, "Branch is required.")), // Ensures the output is a non-empty string

  // recommendedFollowUpDays: Accept string or null, treat empty string as null, transform to number or null
  recommendedFollowUpDays: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const val = v === null || v === undefined || v === "" ? null : v; // Normalize null
      if (val === null) return null; // Keep null
      const num = Number(val);
      return isNaN(num) ? null : num; // Transform valid number strings, invalid ones become null
    })
    .pipe(z.number().nullable()), // Ensures the output is number or null

  // followUpPolicy: Accept string or null, treat empty string as null, ensure non-empty string then transform to enum via pipe
  followUpPolicy: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v)) // Normalize null
    .pipe(
      z.nativeEnum(FollowUpPolicy, {
        errorMap: () => ({ message: "Invalid follow-up policy selected." }),
      }),
    ), // Ensures the output is a valid enum member
});

// --- FULL Schema for CREATE operations ---
// Applies validation and conditional logic after base transformations.
// All fields are expected based on the base schema's pipe outputs.
const serviceSchema = baseServiceFormDataSchema.superRefine((data, ctx) => {
  // At this point, data contains the transformed values based on pipes in baseSchema:
  // title: string, description: string | null, price: number, branchId: string,
  // recommendedFollowUpDays: number | null, followUpPolicy: FollowUpPolicy

  // Validate price after transformation to number
  // Check if it's a non-negative integer. isInteger handles NaN as well.
  if (!Number.isInteger(data.price) || data.price < 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Price must be a non-negative integer.",
      path: ["price"],
    });
  }

  // Validation for recommendedFollowUpDays based on the policy
  if (data.followUpPolicy !== FollowUpPolicy.NONE) {
    // If policy is not NONE, recommendedDays MUST be a positive integer number
    const recommendedDays = data.recommendedFollowUpDays;

    if (recommendedDays === null) {
      // Check for null specifically (base schema transform handles empty/invalid strings to null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recommended days is required for this policy.",
        path: ["recommendedFollowUpDays"],
      });
    } else if (!Number.isInteger(recommendedDays) || recommendedDays <= 0) {
      // Check if the number is a positive integer
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recommended days must be a positive integer.",
        path: ["recommendedFollowUpDays"],
      });
    }
  }
  // If policy IS NONE, recommendedDays can be null (which base schema handles if input is empty/invalid) or a valid number.
  // We don't add an error if it's a number when policy is NONE, as Prisma handles setting it to null based on our action logic.
});

// --- PARTIAL Schema for UPDATE operations ---
// Applies partial() to baseSchema, then adds superRefine for conditional validation.
// Fields in `data` inside superRefine will be transformedType | undefined if the field was missing or invalid.
const partialServiceSchema = baseServiceFormDataSchema
  .partial()
  .superRefine((data, ctx) => {
    // At this point, data contains the transformed values from baseSchema.partial():
    // title: string | undefined, description: string | null | undefined, price: number | undefined,
    // branchId: string | undefined, recommendedFollowUpDays: number | null | undefined,
    // followUpPolicy: FollowUpPolicy | undefined

    const {
      title,
      description,
      price,
      branchId,
      recommendedFollowUpDays,
      followUpPolicy,
    } = data;

    // Validate price if it's present and successfully transformed to a number
    if (price !== undefined) {
      // Check if price was provided and passed initial string->number transform
      if (!Number.isInteger(price) || price < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Price must be a non-negative integer.",
          path: ["price"],
        });
      }
    }
    // Note: baseSchema handles the 'required' check (min(1) string length) if price is provided.
    // This superRefine validates the *number* format if it was provided.

    // Validate branchId if it's present (base schema already validated it's a non-empty string if present)
    // No extra validation needed here as base pipe z.string().min(1) is sufficient if key is present.

    // Validate title if it's present (base schema already validated it's a non-empty string if present)
    // No extra validation needed here as base pipe z.string().min(1) is sufficient if key is present.

    // Validation for recommendedFollowUpDays based on the policy IF the policy was provided
    if (
      followUpPolicy !== undefined &&
      followUpPolicy !== FollowUpPolicy.NONE
    ) {
      // If policy is specified and requires days, recommendedDays must be present and a positive integer
      if (
        recommendedFollowUpDays === null ||
        recommendedFollowUpDays === undefined
      ) {
        // Check for null or undefined
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days is required for this policy.",
          path: ["recommendedFollowUpDays"],
        });
      } else if (
        !Number.isInteger(recommendedFollowUpDays) ||
        recommendedFollowUpDays <= 0
      ) {
        // Check if the number is a positive integer
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days must be a positive integer.",
          path: ["recommendedFollowUpDays"],
        });
      }
    }
    // If policy IS NONE (and provided), recommendedDays can be null or undefined (no error needed).
    // If policy is UNDEFINED (not provided), we don't validate days based on policy.
  });

const branchSchema = z.object({
  title: z.string().min(1, "Title is required"),
  code: z
    .string()
    .min(1, "Code is required")
    .max(6, "Code must be 6 characters or less"),
});

const updateBranchSchema = z.object({
  title: z.string().min(1, "Title is required"),
});

const TARGET_TIMEZONE = "Asia/Manila";

/* function aggregateMonthlyBranchSales(
  availedServices: {
    price: number;
    quantity: number;
    service: { branch: { id: string; title: string } | null } | null;
  }[],
): BranchSalesDataPoint[] {
  const branchSalesMap = new Map<
    string,
    { branchTitle: string; totalSales: number }
  >();

  availedServices.forEach((item) => {
    // Only include items linked to a service and a branch
    if (item.service?.branch) {
      const branchId = item.service.branch.id;
      const branchTitle = item.service.branch.title;
      const itemSales = item.price * item.quantity;

      if (branchSalesMap.has(branchId)) {
        branchSalesMap.get(branchId)!.totalSales += itemSales;
      } else {
        branchSalesMap.set(branchId, {
          branchTitle,
          totalSales: itemSales,
        });
      }
    }
  });

  // Convert map to array and sort by total sales descending
  const aggregatedArray = Array.from(branchSalesMap.values());
  aggregatedArray.sort((a, b) => b.totalSales - a.totalSales);

  return aggregatedArray;
} */

export async function generatePayslipData(
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  baseSalary: number;
  totalCommissions: number;
  totalDeductions: number; // Placeholder - Implement actual logic later
  totalBonuses: number; // Placeholder - Implement actual logic later
  netPay: number;
}> {
  // Log the input parameters clearly
  console.log(
    `[generatePayslipData] Calculating payslip data for Account ID: ${accountId}`,
  );
  console.log(`[generatePayslipData] Received Period Start Date: ${startDate}`);
  console.log(`[generatePayslipData] Received Period End Date: ${endDate}`);
  // Format dates for clarity in logs if needed (optional)
  // console.log(`[generatePayslipData] Period: ${format(startDate, "yyyy-MM-dd")} to ${format(endDate, "yyyy-MM-dd")}`);

  try {
    // 1. Fetch Account details (specifically dailyRate)
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { dailyRate: true, name: true }, // Select name for better logging
    });

    if (!account) {
      // Throw an error if the account doesn't exist to prevent further processing
      throw new Error(
        `Account not found for payslip generation (ID: ${accountId}).`,
      );
    }
    // Safely handle potential null dailyRate, default to 0
    const dailyRate = account.dailyRate ?? 0;
    console.log(
      `[generatePayslipData] Account: ${account.name}, Daily Rate fetched: ${dailyRate}`,
    );

    // 2. Fetch Attendance records for the period & Calculate Base Salary
    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId: accountId, // Match the employee
        date: {
          gte: startDate, // Date is on or after the start date
          lte: endDate, // Date is on or before the end date
        },
        isPresent: true, // Only count days marked as present
      },
      select: {
        // Select only necessary fields if needed for optimization
        id: true,
        date: true,
      },
    });
    const presentDays = attendanceRecords.length;
    const baseSalary = presentDays * dailyRate; // Base salary calculation
    console.log(
      `[generatePayslipData] Found ${presentDays} present days in period.`,
    );
    console.log(
      `[generatePayslipData] Calculated Base Salary: ${presentDays} days * ${dailyRate} rate = ${baseSalary}`,
    );

    // 3. Fetch Completed Services & Calculate Total Commissions
    // --- Corrected End Date Handling for Commission Query ---
    const inclusiveEndDate = endOfDay(endDate); // Calculate the very end of the endDate
    console.log(
      `[generatePayslipData] Fetching served/completed items between ${startDate} (inclusive start) and ${inclusiveEndDate} (inclusive end)`,
    );

    const servedItems = await prisma.availedService.findMany({
      where: {
        servedById: accountId, // Must be served by this employee
        status: Status.DONE, // Service status must be DONE
        completedAt: {
          // Completion timestamp must fall within the period
          gte: startDate, // On or after the start of the periodStartDate
          lte: inclusiveEndDate, // On or before the end of the periodEndDate
        },
        commissionValue: {
          // Only include if there's a commission value
          gt: 0, // Greater than 0
        },
      },
      select: {
        commissionValue: true, // Need the value for calculation
        service: { select: { title: true } }, // Include service title for logging
        completedAt: true, // Include completion timestamp for logging
      },
    });

    // Calculate the total commission by summing up commissionValue
    const totalCommissions = servedItems.reduce((sum, item) => {
      // Safely handle potential null commissionValue, default to 0
      return sum + (item.commissionValue ?? 0);
    }, 0); // Start sum at 0

    console.log(
      `[generatePayslipData] Found ${servedItems.length} served items with commission completed in period.`,
    );
    console.log(
      `[generatePayslipData] Calculated Total Commissions: ${totalCommissions}`,
    );
    // Optional: Log details of each commission item found
    if (servedItems.length > 0) {
      console.log("[generatePayslipData] Commission Breakdown Items Found:");
      servedItems.forEach((item) =>
        console.log(
          `  - Service: ${item.service?.title || "Unknown Service"}, Commission: ${item.commissionValue}, Completed At: ${item.completedAt}`,
        ),
      );
    }

    // 4. Fetch/Calculate Deductions (Placeholder)
    // TODO: Implement your specific deduction logic here.
    // This might involve fetching deduction records linked to the employee/period,
    // calculating statutory contributions based on salary, etc.
    const totalDeductions = 0; // Replace with actual calculation
    console.log(
      `[generatePayslipData] Calculated Total Deductions: ${totalDeductions} (Placeholder - Implement logic)`,
    );

    // 5. Fetch/Calculate Bonuses (Placeholder)
    // TODO: Implement your specific bonus logic here.
    // This might involve fetching bonus records or applying performance-based rules.
    const totalBonuses = 0; // Replace with actual calculation
    console.log(
      `[generatePayslipData] Calculated Total Bonuses: ${totalBonuses} (Placeholder - Implement logic)`,
    );

    // 6. Calculate the final Net Pay
    const netPay =
      baseSalary + totalCommissions + totalBonuses - totalDeductions;
    console.log(
      `[generatePayslipData] Calculated Net Pay: (${baseSalary} Base + ${totalCommissions} Comm + ${totalBonuses} Bonus) - ${totalDeductions} Deduct = ${netPay}`,
    );

    // 7. Return the calculated data object
    console.log("[generatePayslipData] Calculation complete. Returning data.");
    return {
      baseSalary,
      totalCommissions,
      totalDeductions,
      totalBonuses,
      netPay,
    };
  } catch (error: any) {
    // Log any errors that occur during the process
    console.error(
      `[generatePayslipData] Error calculating payslip data for Account ID ${accountId}:`,
      error,
    );
    // Re-throw the error to be handled by the calling function (e.g., approvePayslipRequest)
    // Add more context to the error message
    throw new Error(
      `Failed to generate payslip data for account ${accountId}. Reason: ${error.message}`,
    );
  }
}

export interface MonthlySalesData {
  month: string; // e.g., "Jan 24"
  ewallet: number;
  cash: number;
  bank: number;
  total: number;
}

type AccountForComponent = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role[];
  dailyRate: number; // Ensure Prisma returns number
  branchId: string | null;
  branch: {
    id: string;
    title: string;
  } | null; // Include branch details
};

type ServiceProps = {
  id: string;
  title: string;
  price: number;
  quantity: number;
};

type ServiceAvailed = {
  id: string;
  title: string; // Include title if needed, or just id/quantity/price
  quantity: number;
  price: number;
};
export const getAllBranches = async (): Promise<Branch[]> => {
  // Add authentication/authorization check if needed based on your setup
  // e.g., const session = await auth(); if (!session || !session.user) throw new Error("Not authenticated");

  try {
    const branches = await prisma.branch.findMany({
      orderBy: { title: "asc" }, // Optional: order alphabetically
    });
    console.log("[ServerAction] Fetched branches:", branches.length);
    return branches;
  } catch (error) {
    console.error("[ServerAction] Error fetching branches:", error);
    // Rethrow the error or return a specific error structure as per your server action pattern
    throw new Error("Failed to fetch branches.");
  }
};

export async function getServicesAndSetsForGC(
  serviceType: "service" | "set",
  branchId: string,
): Promise<SelectOption[]> {
  console.log(
    `[ServerAction] Fetching items for GC: Type='${serviceType}', Branch='${branchId}'`,
  );
  try {
    if (serviceType === "service") {
      // Fetch Services
      const services = await prisma.service.findMany({
        where: {
          // Apply branch filter only if branchId is not 'all'
          branchId: branchId !== "all" ? branchId : undefined,
          // Add any other relevant filters if needed (e.g., isActive?)
        },
        orderBy: {
          title: "asc", // Order alphabetically
        },
        select: {
          id: true, // = value
          title: true, // = label
          price: true, // Needed to construct the label with price
        },
      });
      console.log(
        `[ServerAction] Found ${services.length} services for Type='${serviceType}', Branch='${branchId}'`,
      );
      // Map to SelectOption format, including price in the label
      return services.map((service) => ({
        value: service.id,
        label: `${service.title} - ₱${service.price.toLocaleString()}`, // Example label with price
      }));
    } else if (serviceType === "set") {
      // Fetch Service Sets
      // NOTE: Assuming ServiceSets are NOT tied to a specific branch in your schema.
      // If they ARE, you'll need a relation or filter criteria here.
      const serviceSets = await prisma.serviceSet.findMany({
        orderBy: {
          title: "asc",
        },
        select: {
          id: true, // = value
          title: true, // = label
          price: true, // Needed for label
        },
      });
      console.log(
        `[ServerAction] Found ${serviceSets.length} service sets for Type='${serviceType}'`,
      );
      // Map to SelectOption format
      return serviceSets.map((set) => ({
        value: set.id,
        label: `${set.title} - ₱${set.price.toLocaleString()}`, // Example label with price
      }));
    } else {
      // Invalid service type provided
      console.warn(
        `[ServerAction] Invalid serviceType provided to getServicesAndSetsForGC: ${serviceType}`,
      );
      return [];
    }
  } catch (error) {
    console.error(
      `[ServerAction] Error fetching items for GC (Type='${serviceType}', Branch='${branchId}'):`,
      error,
    );
    // Depending on your error handling strategy, you might want to:
    // 1. Return empty array (as done here)
    // 2. Throw the error to be caught by the calling component
    // throw new Error(`Failed to fetch ${serviceType}s.`);
    return []; // Return empty array on error
  }
}

export async function getCustomer(
  query: string,
): Promise<CustomerWithRecommendations[] | null> {
  console.log("Server: getCustomer called with query:", query);
  if (!query || query.trim() === "") {
    console.log("Server: Query is empty, returning null.");
    return null;
  }
  const searchTerm = query.trim().toLowerCase();

  try {
    const customers = await prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: searchTerm, mode: "insensitive" } },
          { email: { contains: searchTerm, mode: "insensitive" } },
        ],
      },
      include: {
        recommendedAppointments: {
          where: {
            status: {
              in: [
                RecommendedAppointmentStatus.RECOMMENDED,
                RecommendedAppointmentStatus.SCHEDULED,
              ],
            },
            // Optional: Add date filtering here if you only want to show recent/upcoming RAs in the UI dropdown
            // recommendedDate: {
            //   gte: startOfDay(addDays(new Date(), -90)), // e.g., show RAs from the last 90 days onwards
            // },
          },
          orderBy: {
            recommendedDate: "asc",
          },
          select: {
            id: true,
            recommendedDate: true,
            status: true,
            originatingService: {
              // Include originating service for context
              select: {
                id: true,
                title: true,
                // --- Include the new field in the select ---
                followUpPolicy: true, // Select the policy
                // --- End Include ---
              },
            },
            // Add other fields if needed in the UI
          },
        },
      },
      take: 10,
    });

    console.log(
      "Server: Prisma fetched customers:",
      JSON.stringify(customers, null, 2),
    );

    // Convert Prisma results to the client-friendly type, converting Date to string and including policy
    const result: CustomerWithRecommendations[] = customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      recommendedAppointments: customer.recommendedAppointments.map((ra) => ({
        id: ra.id,
        recommendedDate: ra.recommendedDate.toISOString(), // Convert Date to ISO string
        status: ra.status,
        originatingService: ra.originatingService
          ? {
              id: ra.originatingService.id,
              title: ra.originatingService.title,
              // --- Include the policy in the mapped object ---
              followUpPolicy: ra.originatingService.followUpPolicy, // Include the policy
              // --- End Include ---
            }
          : null,
      })),
    }));

    console.log(
      "Server: Formatted results for client:",
      JSON.stringify(result, null, 2),
    );
    return result;
  } catch (error) {
    console.error(
      "Server: Error fetching customers with recommendations:",
      error,
    );
    return null;
  }
}

export async function getVoucher(code: string) {
  // --- Authentication Check ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    // You could return the specific error format, but throwing might be clearer
    // return { status: false, error: "Authentication required." };
    throw new Error("Authentication required to check voucher.");
  }
  // --- End Auth Check ---

  // Original logic remains if authenticated
  try {
    const upperCode = code.trim().toUpperCase(); // Sanitize input
    const foundCode = await prisma.voucher.findUnique({
      // Use findUnique for code
      where: { code: upperCode },
    });

    if (!foundCode) {
      return { status: false, error: "Invalid voucher code" };
    }

    if (foundCode.usedAt) {
      return { status: false, error: "Voucher has already been used" };
    }

    // Return only necessary info, value is sensitive if not used immediately
    return { status: true, value: foundCode.value, code: foundCode.code };
  } catch (error) {
    console.error("Error fetching voucher:", error);
    return {
      status: false,
      error: "An error occurred while checking the voucher",
    };
  }
}

export async function getAllVouchers(): Promise<Voucher[]> {
  // --- Authentication & Authorization Check ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required.");
  }
  // Example: Only allow OWNER or CASHIER roles
  const allowedRoles: Role[] = [Role.OWNER, Role.CASHIER]; // Define allowed roles
  if (!session.user.role?.some((role) => allowedRoles.includes(role))) {
    throw new Error(
      "Unauthorized: You do not have permission to view all vouchers.",
    );
  }
  // --- End Auth Check ---

  console.log("Server Action: getAllVouchers executing...");
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: {
        usedAt: "asc", // nulls first (Active)
      },
    });
    console.log(
      `Server Action: Fetched ${vouchers.length} vouchers successfully.`,
    );
    return vouchers;
  } catch (error) {
    console.error("Server Action Error [getAllVouchers]:", error);
    throw new Error("Failed to fetch vouchers via server action.");
  }
}

export async function getAllServices(): Promise<Service[]> {
  // --- Authentication Check (Example: Allow any logged-in staff) ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view services.");
  }
  // Optional: Add a basic role check if needed (e.g., ensure they are not just a 'CUSTOMER' role if you had one)
  // const minimumRequiredRoles: Role[] = [Role.OWNER, Role.CASHIER, Role.WORKER];
  // if (!session.user.role?.some(role => minimumRequiredRoles.includes(role))) {
  //    throw new Error("Unauthorized: Insufficient permissions to view all services.");
  // }
  // --- End Auth Check ---

  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      include: { branch: { select: { title: true } } }, // Example: Include branch title
    });
    return services;
  } catch (error) {
    console.error("Error fetching services:", error);
    return []; // Return empty array on error for this specific function maybe? Or throw.
  }
}

// Assuming same access level as getAllServices
export async function getAllServicesOnly(): Promise<Service[]> {
  // --- Authentication Check (Example: Allow any logged-in staff) ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view services.");
  }
  // Optional: Add role check similar to getAllServices if needed
  // --- End Auth Check ---

  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      // No includes needed for 'Only' version
    });
    return services;
  } catch (error) {
    console.error("Error fetching only services:", error);
    return [];
  }
}

export async function getAllServiceSets(): Promise<ServiceSet[]> {
  // --- Auth Check (Allow any logged-in staff) ---
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view service sets.");
  }
  // Optional: Add role check if needed
  // const requiredRoles: Role[] = [Role.OWNER, Role.CASHIER, Role.WORKER];
  // if (!session.user.role?.some(role => requiredRoles.includes(role))) {
  //    throw new Error("Unauthorized to view service sets.");
  // }
  // --- End Auth Check ---

  try {
    const serviceSets = await prisma.serviceSet.findMany({
      orderBy: { title: "asc" },
      include: {
        services: { select: { id: true, title: true } },
      },
    });
    return serviceSets;
  } catch (error) {
    console.error("Error fetching service sets:", error);
    return [];
  }
}

const GiftCertificateCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(4, "Code must be at least 4 characters")
    .toUpperCase(),
  serviceIds: z
    .array(z.string().uuid("Invalid service ID format"))
    .min(1, "At least one service must be selected"),
  expiresAt: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Invalid expiry date",
    }),
  recipientName: z.string().trim().optional().nullable(),
  // --- Make email optional, but validate if present ---
  recipientEmail: z
    .string()
    .trim()
    .email({ message: "Invalid email format provided." })
    .optional() // Makes the field itself optional
    .or(z.literal("")) // Allow empty string ''
    .nullable(), // Allow null
});

const DiscountRuleSchema = z
  .object({
    description: z.string().nullable().optional(),
    discountType: z.nativeEnum(DiscountType),
    discountValue: z.preprocess(
      (val) => (typeof val === "string" ? parseFloat(val) : val),
      z.number().min(0),
    ),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format (YYYY-MM-DD)"), // YYYY-MM-DD
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format (YYYY-MM-DD)"), // YYYY-MM-DD
    applyTo: z.enum(["all", "specific"]),
    serviceIds: z.array(z.string()).optional(), // Optional if applyTo is 'all'
  })
  .refine(
    (data) => {
      // Custom refinement for start/end date logic
      if (data.startDate && data.endDate && data.startDate > data.endDate) {
        return false;
      }
      return true;
    },
    {
      message: "End date cannot be before start date.",
      path: ["endDate"], // Path of the error
    },
  );

export async function transactionSubmission(
  transactionForm: CashierState,
): Promise<TransactionSubmissionResponse> {
  let bookingDateTimeForConfirmationEmail: Date | null = null; // Still needed to capture the time
  let servicesForConfirmationEmail: { name: string }[] = []; // Still needed to capture service names

  const transactionProcessingStartTimeUTC = new Date();

  try {
    const {
      name,
      date: dateString,
      time: timeString,
      serveTime,
      email,
      servicesAvailed,
      voucherCode,
      paymentMethod,
      grandTotal,
      totalDiscount,
      selectedRecommendedAppointmentId,
      generateNewFollowUpForFulfilledRA,
    } = transactionForm;

    const errors: Record<string, string> = {};
    if (!name || !name.trim()) errors.name = "Customer name is required.";
    const trimmedEmail = email?.trim() || null;
    if (
      trimmedEmail &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(trimmedEmail)
    ) {
      errors.email = "Invalid email format.";
    }
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service or set must be selected.";
    }
    if (!paymentMethod) {
      errors.paymentMethod = "Payment method is required.";
    }
    if (serveTime === "later" && (!dateString || !timeString)) {
      errors.serveTime = "Date and time are required for later service.";
    }

    if (Object.keys(errors).length > 0) {
      return {
        success: false,
        message: "Validation failed. Please check the form.",
        errors: convertErrorsToStringArrays(errors),
      };
    }

    const customerNameFormatted = formatName(name);

    let finalBookingDateTimeUTC = transactionProcessingStartTimeUTC;

    if (serveTime === "later") {
      if (dateString && timeString) {
        try {
          const [year, month, day] = dateString.split("-").map(Number);
          const [hours, minutes] = timeString.split(":").map(Number);

          // Important: Assume input date/time strings are in the Philippines Timezone
          const phtDate = new Date(year, month - 1, day, hours, minutes); // This creates a Date object in the server's local time zone
          // To get a UTC representation of a specific time in a specific timezone without ambiguity:
          // Use a library like `date-fns-tz` or format carefully.
          // A simple approach if server is UTC: Create date parts in PHT, calculate UTC timestamp
          const phtTimestampMs =
            Date.UTC(year, month - 1, day, hours, minutes) -
            MANILA_OFFSET_HOURS * 60 * 60 * 1000;
          finalBookingDateTimeUTC = new Date(phtTimestampMs);

          if (isNaN(finalBookingDateTimeUTC.getTime())) {
            throw new Error(
              "Invalid date/time string resulted in an invalid Date object after time zone adjustment.",
            );
          }
          // Keep this assignment for the email sending call later
          bookingDateTimeForConfirmationEmail = finalBookingDateTimeUTC;
        } catch (e: any) {
          console.error(
            "Server Action: Error parsing or converting date/time for 'later' booking:",
            e.message,
            e,
          );
          return {
            success: false,
            message: "Invalid date or time format for 'later' booking.",
            errors: {
              serveTime: [
                "Invalid date or time format provided or time zone conversion failed.",
              ],
            },
          };
        }
      }
    }

    // Modify the transaction to return the customer record needed for the email sending function
    const transactionResult = await prisma.$transaction(
      async (tx) => {
        let customerRecord;
        const existingCustomer = await tx.customer.findFirst({
          where: { name: customerNameFormatted },
        });
        if (existingCustomer) {
          customerRecord = existingCustomer;
          if (trimmedEmail && customerRecord.email !== trimmedEmail) {
            try {
              customerRecord = await tx.customer.update({
                where: { id: customerRecord.id },
                data: { email: trimmedEmail },
              });
            } catch (e: any) {
              if (e.code === "P2002" && e.meta?.target?.includes("email"))
                throw new Error(
                  `The email "${trimmedEmail}" is already associated with another customer.`,
                );
              throw e;
            }
          }
        } else {
          try {
            customerRecord = await tx.customer.create({
              data: { name: customerNameFormatted, email: trimmedEmail },
            });
          } catch (e: any) {
            if (e.code === "P2002" && e.meta?.target?.includes("email"))
              throw new Error(
                `The email "${trimmedEmail}" is already in use by another customer.`,
              );
            throw e;
          }
        }

        let processedVoucherId: string | null = null;
        if (voucherCode && voucherCode.trim()) {
          const voucher = await tx.voucher.findUnique({
            where: { code: voucherCode.trim() },
          });
          if (!voucher)
            throw new Error(`Invalid voucher code: "${voucherCode.trim()}."`);
          if (voucher.usedAt)
            throw new Error(
              `Voucher "${voucherCode.trim()}" has already been used.`,
            );
          await tx.voucher.update({
            where: { id: voucher.id },
            data: { usedAt: new Date() },
          });
          processedVoucherId = voucher.id;
        }

        const newTransactionRecord = await tx.transaction.create({
          data: {
            customerId: customerRecord.id,
            paymentMethod: paymentMethod,
            grandTotal,
            discount: totalDiscount,
            status: Status.PENDING, // Or maybe set to DONE if paymentMethod is cash and serveTime is now? Check your business logic.
            bookedFor: finalBookingDateTimeUTC,
            voucherId: processedVoucherId,
            createdAt: transactionProcessingStartTimeUTC,
            // Assuming branchId is available in transactionForm if needed
            // branchId: transactionForm.branchId,
          },
        });

        // Use the outer scope variable to collect service names
        servicesForConfirmationEmail = [];
        for (const item of servicesAvailed) {
          // Ensure you capture the *display name* from the form item, not just the ID
          servicesForConfirmationEmail.push({ name: item.name });

          if (item.type === "service") {
            // Fetching service details just for commission calculation and price snapshot
            const serviceDetails = await tx.service.findUnique({
              where: { id: item.id },
              select: { price: true }, // Price is needed for commission
            });
            // Use the price from the form item as the snapshot price,
            // commission is based on the service's standard price for consistency
            const commission = serviceDetails
              ? Math.floor(serviceDetails.price * SALARY_COMMISSION_RATE)
              : 0;

            await tx.availedService.create({
              data: {
                transactionId: newTransactionRecord.id,
                serviceId: item.id, // Use the service ID from the form item
                quantity: item.quantity, // Should be 1 for a single service item
                price: item.originalPrice, // Use the price snapshot from the form item
                commissionValue: commission,
                status: Status.PENDING, // Default status
              },
            });
          } else if (item.type === "set") {
            // For sets, you need to fetch the included services to create AvailedService records
            const setDetails = await tx.serviceSet.findUnique({
              where: { id: item.id }, // Use the set ID from the form item
              include: {
                services: { select: { id: true, price: true, title: true } },
              }, // Need service id, price (for commission), and title
            });

            if (setDetails?.services) {
              // Create an AvailedService record for EACH service WITHIN the set
              for (const serviceInSet of setDetails.services) {
                const commission = Math.floor(
                  serviceInSet.price * SALARY_COMMISSION_RATE,
                );
                await tx.availedService.create({
                  data: {
                    transactionId: newTransactionRecord.id,
                    serviceId: serviceInSet.id, // Link to the actual Service model
                    quantity: 1, // Each service in the set is quantity 1
                    price: 0, // Price of individual service within a set is typically 0 unless specified otherwise in your logic
                    commissionValue: commission,
                    originatingSetId: setDetails.id,
                    originatingSetTitle: setDetails.title, // Use the set's title
                    status: Status.PENDING, // Default status
                  },
                });
                // Also add the name of the service *within the set* to the email list if desired,
                // or just the set name is sufficient depending on desired email detail level.
                // servicesForConfirmationEmail.push({ name: serviceInSet.title }); // If you want *all* services listed
              }
            }
            // If you only want the SET name in the email list:
            // servicesForConfirmationEmail.push({ name: item.name }); // This is already done above before the loop
          }
        }

        if (selectedRecommendedAppointmentId) {
          const raToLink = await tx.recommendedAppointment.findUnique({
            where: { id: selectedRecommendedAppointmentId },
            include: {
              originatingService: { select: { followUpPolicy: true } },
            },
          });
          // Ensure RA exists, belongs to the customer, and hasn't been linked/attended already
          if (
            raToLink &&
            raToLink.customerId === customerRecord.id &&
            raToLink.status !== RecommendedAppointmentStatus.ATTENDED &&
            !raToLink.attendedTransactionId
          ) {
            let suppressNextGenFlag = false;
            // Determine if we should suppress the *next* follow-up generation
            // based on the original service's policy and the form selection.
            // If policy is NONE, always suppress future follow-ups for this specific type.
            // If policy is ONCE or EVERY_TIME, suppress only if the user explicitly chose NOT to generate one.
            if (
              raToLink.originatingService?.followUpPolicy ===
              FollowUpPolicy.NONE
            ) {
              suppressNextGenFlag = true; // Never recommend this service again from any transaction
            } else {
              // If the policy allows follow-ups (ONCE/EVERY_TIME), only suppress
              // the generation from *this specific attended appointment* if the flag is false.
              // The next time they get this service, a new RA might still be generated
              // depending on the policy and the suppressNextFollowUpGeneration flag on the RA itself.
              // This flag on the RA specifically controls if *this attended appointment* triggers the *next* RA.
              // Let's align the flag to mean "Do NOT generate the next RA linked to *this fulfilled RA*".
              suppressNextGenFlag = !generateNewFollowUpForFulfilledRA;
            }

            await tx.recommendedAppointment.update({
              where: { id: selectedRecommendedAppointmentId },
              data: {
                status: RecommendedAppointmentStatus.ATTENDED,
                attendedTransactionId: newTransactionRecord.id,
                // This flag now controls if the fulfillment of *this* RA triggers a *new* RA (if policy allows)
                suppressNextFollowUpGeneration: suppressNextGenFlag,
              },
            });
            console.log(
              `Server Action: Linked RecommendedAppointment ${selectedRecommendedAppointmentId} to Transaction ${newTransactionRecord.id}`,
            );
          } else {
            console.warn(
              `Server Action: Skipped linking RecommendedAppointment ${selectedRecommendedAppointmentId} to transaction ${newTransactionRecord.id}. Conditions not met: RA found=${!!raToLink}, customerMatch=${raToLink?.customerId === customerRecord.id}, notAttended=${raToLink?.status !== RecommendedAppointmentStatus.ATTENDED}, notLinked=${!raToLink?.attendedTransactionId}`,
            );
            // TODO: Handle potential race conditions or stale data - maybe the RA was just attended in another transaction?
            // For now, a warning is sufficient.
          }
        }

        await tx.customer.update({
          where: { id: customerRecord.id },
          data: { totalPaid: { increment: grandTotal } }, // Assuming grandTotal is in the smallest currency unit
        });

        // Update nextAppointment logic
        const customerAfterRAsUpdate = await tx.customer.findUnique({
          where: { id: customerRecord.id },
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
                recommendedDate: { gte: startOfDay(new Date()) }, // Only consider future RAs
              },
              orderBy: { recommendedDate: "asc" },
              take: 1,
              select: { recommendedDate: true },
            },
          },
        });
        const newEarliestActiveRADate =
          customerAfterRAsUpdate?.recommendedAppointments[0]?.recommendedDate ||
          null;
        const currentNextApptDate =
          customerAfterRAsUpdate?.nextAppointment || null;

        // Only update if the earliest date has changed or is newly null/not null
        if (
          (newEarliestActiveRADate === null && currentNextApptDate !== null) ||
          (newEarliestActiveRADate !== null && currentNextApptDate === null) ||
          (newEarliestActiveRADate !== null &&
            currentNextApptDate !== null &&
            !isEqual(
              startOfDay(newEarliestActiveRADate),
              startOfDay(currentNextApptDate),
            ))
        ) {
          await tx.customer.update({
            where: { id: customerRecord.id },
            data: { nextAppointment: newEarliestActiveRADate },
          });
          console.log(
            `Server Action: Updated customer ${customerRecord.id} nextAppointment to ${newEarliestActiveRADate}`,
          );
        } else if (
          newEarliestActiveRADate === null &&
          currentNextApptDate !== null
        ) {
          // If no future RAs, but nextAppointment was set, clear it
          await tx.customer.update({
            where: { id: customerRecord.id },
            data: { nextAppointment: null },
          });
          console.log(
            `Server Action: Cleared customer ${customerRecord.id} nextAppointment as no future RAs exist.`,
          );
        }

        // Return customer details for email sending outside transaction
        return {
          transaction: newTransactionRecord,
          customerForEmail: {
            name: customerRecord.name,
            email: customerRecord.email,
          },
          // servicesForConfirmationEmail is populated in the outer scope
          // bookingDateTimeForConfirmationEmail is populated in the outer scope
        };
      },
      {
        timeout: 15000, // 15 seconds timeout
      },
    );
    // --- End of prisma.$transaction ---

    // *** Capture returned data ***
    const {
      transaction: createdTransaction,
      customerForEmail: customerForEmailConfirmationData,
    } = transactionResult;

    // --- Send Booking Confirmation Email (AFTER successful DB transaction) ---
    // Only send email if it was a 'later' booking AND customer has an email
    if (
      serveTime === "later" &&
      customerForEmailConfirmationData?.email && // Safely check if customerForEmailConfirmationData and its email exist
      bookingDateTimeForConfirmationEmail // Check if booking time was set for later booking
    ) {
      // Call the new dedicated email sending function
      await sendBookingConfirmationEmail(
        customerForEmailConfirmationData.name,
        customerForEmailConfirmationData.email,
        bookingDateTimeForConfirmationEmail,
        servicesForConfirmationEmail, // Use the variable populated during transaction
        LOGO_URL_SA, // Pass the logo URL
      );
    } else if (serveTime === "later") {
      console.log(
        "Server Action: Skipping booking confirmation email because customer has no email or it wasn't a 'later' booking.",
      );
    }

    return { success: true, transactionId: createdTransaction.id };
  } catch (error: unknown) {
    console.error(
      "--- Transaction Submission Failed (Outer Catch - Server Action) ---",
      error,
    );
    let message =
      "An unexpected error occurred during the transaction process.";
    const fieldErrors: Record<string, string[]> = {};

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2028"
    ) {
      message =
        "The transaction took too long to complete and was timed out. Please try again or contact support if the issue persists.";
      fieldErrors.general = [message];
    } else if (error instanceof Error) {
      message = error.message;
      // Improve error mapping based on common messages
      if (message.includes("voucher") && message.includes("used"))
        fieldErrors.voucherCode = [message];
      else if (message.includes("Invalid voucher code"))
        fieldErrors.voucherCode = [message];
      else if (
        message.includes("email") &&
        (message.includes("already in use") ||
          message.includes("associated with another customer"))
      )
        fieldErrors.email = [message];
      else if (
        message.includes("Invalid date or time format") ||
        message.includes("time zone conversion failed")
      )
        fieldErrors.serveTime = [message];
      else fieldErrors.general = [message]; // Catch-all for other specific errors
    } else {
      fieldErrors.general = [message]; // Handle non-Error exceptions
    }
    return { success: false, message, errors: fieldErrors };
  }
}

export async function createGiftCertificateAction(
  data: GcCreationData,
): Promise<{
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}> {
  console.log("[ServerAction] Received GC Creation Data:", data);

  // --- Validation ---
  const errors: Record<string, string[]> = {};
  if (!data.code || data.code.trim().length < 4) {
    errors.code = ["Code is required (min 4 chars)."];
  } else {
    data.code = data.code.trim().toUpperCase();
  }
  if (!data.itemIds || data.itemIds.length === 0) {
    errors.serviceIds = ["Please select at least one service or set."];
  }
  if (!data.itemType || !["service", "set"].includes(data.itemType)) {
    errors.itemType = ["Invalid item type specified."];
  }
  // Validate recipient email format if provided
  const trimmedRecipientEmail = data.recipientEmail?.trim() || null;
  if (
    trimmedRecipientEmail &&
    !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(trimmedRecipientEmail)
  ) {
    errors.recipientEmail = ["Please enter a valid email address."];
  } else {
    // Use the trimmed email if valid, otherwise null
    data.recipientEmail = trimmedRecipientEmail;
  }

  // Validate expiry date
  const expiresAtDate = data.expiresAt ? new Date(data.expiresAt) : null;
  if (
    expiresAtDate &&
    // Compare against start of day in *a* consistent timezone, ideally server's UTC
    expiresAtDate < new Date(new Date().setUTCHours(0, 0, 0, 0))
  ) {
    errors.expiresAt = ["Expiry date cannot be in the past."];
  }

  if (Object.keys(errors).length > 0) {
    console.error("[ServerAction] GC Validation Failed:", errors);
    return { success: false, message: "Validation failed.", errors };
  }
  // --- End Validation ---

  const {
    code,
    itemIds,
    itemType,
    purchaserCustomerId, // This is the ID of the *existing* customer who is *buying* it
    recipientName,
    recipientEmail, // This is the email string provided for the recipient
    expiresAt,
  } = data;

  try {
    // Use a transaction for the core DB operations
    const createdGC = await prisma.$transaction(async (tx) => {
      // 1. Check for existing GC code (important inside transaction for race conditions)
      const existing = await tx.giftCertificate.findUnique({ where: { code } });
      if (existing) {
        throw new Error(`Code "${code}" already exists.`); // Throw to rollback transaction
      }

      // 2. Handle Recipient Customer (Find or Create by email)
      let recipientCustomerRecord = null;
      if (recipientEmail) {
        recipientCustomerRecord = await tx.customer.findUnique({
          where: { email: recipientEmail },
        });

        if (!recipientCustomerRecord) {
          // Create new customer if no existing customer found with this email
          try {
            // Ensure name is not an empty string if provided, use null if empty or not provided
            const nameToCreate = recipientName?.trim() || null;
            if (!nameToCreate) {
              console.warn(
                `[ServerAction] No recipient name provided for new customer with email: ${recipientEmail}. Creating with default name.`,
              );
            }
            recipientCustomerRecord = await tx.customer.create({
              data: {
                name: nameToCreate || "Unknown", // Use provided name or 'Unknown' if none
                email: recipientEmail,
              },
            });
            console.log(
              `[ServerAction] Created new customer for GC recipient: ${recipientCustomerRecord.id}`,
            );
          } catch (e: any) {
            // Handle potential race condition if another request just created this customer
            if (e.code === "P2002" && e.meta?.target?.includes("email")) {
              console.warn(
                `[ServerAction] Race condition: Customer with email ${recipientEmail} created concurrently. Fetching existing.`,
              );
              // Try finding again - it *must* exist now
              recipientCustomerRecord = await tx.customer.findUnique({
                where: { email: recipientEmail },
              });
              if (!recipientCustomerRecord) {
                // This scenario is highly unlikely after a P2002, but included as safeguard
                throw new Error(
                  `Failed to retrieve customer with email ${recipientEmail} after conflict.`,
                );
              }
            } else {
              // Re-throw other errors encountered during customer creation
              console.error(
                `[ServerAction] Error creating new customer for GC recipient:`,
                e,
              );
              throw e;
            }
          }
        } else {
          console.log(
            `[ServerAction] Found existing customer for GC recipient: ${recipientCustomerRecord.id}`,
          );
          // Optional: Update existing customer's name if recipientName is provided
          // and existing name is null or differs? Let's skip this for now to keep logic simple.
        }
      }

      // 3. Prepare data for Gift Certificate creation
      const prismaCreateData: any = {
        code,
        // Link to the *purchaser* customer if purchaserCustomerId is provided
        purchaserCustomer: purchaserCustomerId
          ? { connect: { id: purchaserCustomerId } }
          : undefined,
        // Store recipient details as strings based on input data
        recipientName: recipientName || null,
        recipientEmail: recipientEmail || null,
        expiresAt: expiresAtDate, // Use the validated Date object
      };

      // Link the included services or sets
      if (itemType === "service") {
        prismaCreateData.services = { connect: itemIds.map((id) => ({ id })) };
      } else if (itemType === "set") {
        prismaCreateData.serviceSets = {
          connect: itemIds.map((id) => ({ id })),
        };
      }

      // 4. Create the Gift Certificate
      // Include relations needed for the email data
      const includeRelationsForEmail = {
        services: { select: { title: true } },
        serviceSets: { select: { title: true } },
      };

      const newGC = await tx.giftCertificate.create({
        data: prismaCreateData,
        include: includeRelationsForEmail, // Include relations for fetching titles for the email
      });

      console.log("[ServerAction] GC Created within transaction:", newGC.id);

      // Return the created GC object (with included relations) from the transaction
      return newGC;
    }); // End of prisma.$transaction

    // --- Send Gift Certificate Email (OUTSIDE the transaction) ---
    // Use the createdGC object returned from the transaction
    // Only attempt to send email if recipient has an email and Resend is configured
    if (createdGC.recipientEmail && resendInstanceSA && SENDER_EMAIL_SA) {
      console.log(
        `[ServerAction] Attempting to send GC email to ${createdGC.recipientEmail} for code ${createdGC.code}`,
      );

      try {
        // 1. Fetch the Gift Certificate Email Template
        const gcEmailTemplate = await prisma.emailTemplate.findFirst({
          where: {
            name: "Gift Certificate Notification", // <<< NAME OF YOUR TEMPLATE
            isActive: true,
          },
        });

        if (!gcEmailTemplate) {
          console.warn(
            `[ServerAction] Gift Certificate email template "Gift Certificate Notification" not found or not active. Email not sent for GC ${createdGC.code}.`,
          );
          // Proceed without sending email, but log the warning
        } else {
          console.log(
            `[ServerAction] Using template "${gcEmailTemplate.name}" for GC email.`,
          );

          // 2. Prepare placeholder values
          // Use recipientName from the createdGC record for the email personalization
          const customerName = createdGC.recipientName || "Valued Customer";
          // Format expiry date using your helper
          const expiryInfo = formatGCExpiryDate(createdGC.expiresAt);

          // Build the HTML list for included items using the included relations
          const includedItems =
            itemType === "service"
              ? createdGC.services.map((s) => ({ name: s.title }))
              : createdGC.serviceSets.map((s) => ({ name: s.title }));

          const itemsListHtml =
            includedItems.length > 0
              ? includedItems.map((item) => `<li>${item.name}</li>`).join("")
              : "<li>Details will be confirmed upon redemption.</li>";

          // 3. Start with the raw template HTML and replace placeholders directly
          let finalEmailHtml = gcEmailTemplate.body;
          let finalSubject = gcEmailTemplate.subject;

          // Replace placeholders in the Subject
          finalSubject = finalSubject.replace(
            /{{customerName}}/g,
            customerName,
          );
          finalSubject = finalSubject.replace(/{{gcCode}}/g, createdGC.code); // If subject includes code placeholder

          // Replace placeholders in the HTML Body
          finalEmailHtml = finalEmailHtml.replace(/{{subject}}/g, finalSubject); // Replace title placeholder in <head>
          finalEmailHtml = finalEmailHtml.replace(/{{logoUrl}}/g, LOGO_URL_SA); // Replace logo placeholder
          finalEmailHtml = finalEmailHtml.replace(
            /{{customerName}}/g,
            customerName,
          ); // Replace customer name placeholder in body
          finalEmailHtml = finalEmailHtml.replace(
            /{{gcCode}}/g,
            createdGC.code,
          ); // Replace GC code
          finalEmailHtml = finalEmailHtml.replace(
            /{{itemsList}}/g,
            itemsListHtml,
          ); // Replace items list HTML
          finalEmailHtml = finalEmailHtml.replace(
            /{{expiryInfo}}/g,
            expiryInfo,
          ); // Replace expiry info

          // 4. Generate a plain text version (simple extraction/formatting)
          const plainTextBody = `
Hi ${customerName},

This email confirms the details of your Gift Certificate for BeautyFeel.
Your unique Gift Certificate code is: ${createdGC.code}

It is applicable to the following:
${includedItems.map((item) => `- ${item.name}`).join("\n")}

Expires: ${expiryInfo}

Please present this code (or email) upon arrival. We look forward to providing your services soon!

Best regards,
The BeautyFeel Team
         `
            .replace(/\n\s+/g, "\n")
            .trim(); // Basic cleanup

          // 5. Send the email
          const { data: emailSentData, error: emailSendError } =
            await resendInstanceSA.emails.send({
              from: SENDER_EMAIL_SA,
              to: [createdGC.recipientEmail], // Resend expects an array
              subject: finalSubject, // Use the subject with placeholders replaced
              html: finalEmailHtml, // Use the full, processed HTML directly
              text: plainTextBody, // Include plain text version
            });

          if (emailSendError) {
            console.error(
              `[ServerAction] Failed to send GC email for ${createdGC.code} using template:`,
              emailSendError,
            );
          } else {
            console.log(
              `[ServerAction] GC email sent successfully for ${createdGC.code} using template. Email ID:`,
              emailSentData?.id,
            );
          }
        } // End if (gcEmailTemplate)
      } catch (error: any) {
        console.error(
          `[ServerAction] Exception during GC email sending process for ${createdGC.code}:`,
          error,
        );
        // Log the error, but the GC creation was successful, so continue
      }
    } else {
      // Log why email was skipped
      let reason = "";
      if (!createdGC.recipientEmail) reason += "No recipient email. ";
      if (!resendInstanceSA) reason += "Resend not configured. ";
      if (!SENDER_EMAIL_SA) reason += "Sender email not configured.";
      console.log(
        `[ServerAction] Skipping GC email for ${createdGC.code}. Reason: ${reason.trim()}`,
      );
    }
    // --- End Email Sending ---

    // Revalidate necessary paths
    revalidatePath("/dashboard/settings/gift-certificates"); // Revalidate GC list page
    // Revalidate customer path potentially, if GC purchase history is shown there
    if (createdGC.purchaserCustomerId) {
      revalidatePath(`/dashboard/customers/${createdGC.purchaserCustomerId}`);
    }
    // If a *new* customer was created, you might also want to revalidate the customer list or search endpoints
    // if the recipientEmail was used to create a new customer. This is harder to track directly here
    // unless you return the created customer ID or a flag from the transaction.
    // For simplicity, let's skip revalidating general customer lists for now.

    return {
      success: true,
      message: `Gift Certificate ${code} created successfully.`,
    };
  } catch (error: any) {
    // --- DB Error Handling for Transaction ---
    console.error(
      "[ServerAction] Error creating Gift Certificate (in transaction):",
      error,
    );
    let message = "Database error creating Gift Certificate.";
    const fieldErrors: Record<string, string[]> = {};

    // Check for specific errors thrown within the transaction
    if (error.message.includes(`Code "${code}" already exists`)) {
      message = error.message;
      fieldErrors.code = [message];
    }
    // Catch errors related to customer email unique constraint during creation
    else if (
      error.message.includes(`Failed to create customer with email`) ||
      (error.code === "P2002" && error.meta?.target?.includes("email"))
    ) {
      message = error.message.includes("Failed to create customer with email")
        ? error.message
        : `The email "${recipientEmail}" is already in use by another customer.`;
      fieldErrors.recipientEmail = [message];
    }
    // Handle foreign key constraint errors (P2003) for purchaserCustomerId or itemIds
    else if (error.code === "P2003") {
      // You might need to inspect error.meta for target field to be more specific
      console.error(
        "[ServerAction] Foreign key constraint failed:",
        error.meta,
      );
      message = `Invalid ID provided for purchaser or selected ${itemType}(s).`;
      fieldErrors.general = [`One or more selected IDs do not exist.`];
    }
    // Catch any other uncaught transaction errors
    else {
      fieldErrors.general = [
        error.message ||
          "An unexpected error occurred during database operation.",
      ];
    }

    return {
      success: false,
      message: message,
      errors: fieldErrors,
    };
  }
}

// --- Action to check a GC code ---
export async function checkGiftCertificateAction(
  code: string,
): Promise<CheckGCResult> {
  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return {
      status: "error",
      message: "Gift Certificate code cannot be empty.",
    };
  }
  const upperCode = code.trim().toUpperCase();
  try {
    const gc = await prisma.giftCertificate.findUnique({
      where: { code: upperCode },
      include: { services: { select: { id: true, title: true } } },
    });
    if (!gc) return { status: "not_found", code: upperCode };
    if (gc.usedAt)
      return { status: "used", code: upperCode, usedAt: gc.usedAt };
    if (gc.expiresAt && gc.expiresAt < new Date())
      return { status: "expired", code: upperCode, expiresAt: gc.expiresAt };
    return {
      status: "valid",
      id: gc.id,
      services: gc.services,
      expiresAt: gc.expiresAt,
    };
  } catch (error) {
    console.error(
      `Error checking Gift Certificate code "${upperCode}":`,
      error,
    );
    return {
      status: "error",
      message: "Database error checking Gift Certificate.",
    };
  }
}
export async function getActiveTransactions(): Promise<TransactionProps[]> {
  console.log("Server Action: Fetching active transactions (simplified)...");
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING,
      },
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
        availedServices: {
          // Now always contains individual service items
          include: {
            service: {
              // Always include the linked service
              select: { id: true, title: true },
            },
            // Still include checkedBy/servedBy
            checkedBy: {
              select: { id: true, name: true },
            },
            servedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { service: { title: "asc" } }, // Optional: Order services alphabetically
        },
      },
      orderBy: {
        bookedFor: "asc",
      },
    });
    console.log(
      `Server Action: Found ${transactions.length} active transactions.`,
    );

    // Map Prisma result to your TransactionProps[] type
    const mappedTransactions: TransactionProps[] = transactions.map((tx) => {
      const customerProp: CustomerProp = {
        id: tx.customerId,
        name: tx.customer?.name ?? "Unknown Customer",
        email: tx.customer?.email ?? null,
      };

      return {
        id: tx.id,
        createdAt: tx.createdAt,
        bookedFor: tx.bookedFor,
        customerId: tx.customerId,
        voucherId: tx.voucherId,
        discount: tx.discount,
        paymentMethod: tx.paymentMethod,
        grandTotal: tx.grandTotal,
        status: tx.status,
        customer: customerProp,
        // Map AvailedService[] to AvailedServicesProps[]
        availedServices: tx.availedServices.map((as): AvailedServicesProps => {
          const checkedByInfo: AccountInfo | null = as.checkedBy
            ? { id: as.checkedBy.id, name: as.checkedBy.name }
            : null;
          const servedByInfo: AccountInfo | null = as.servedBy
            ? { id: as.servedBy.id, name: as.servedBy.name }
            : null;

          // Use ServiceInfo as determined in Fix 1
          const serviceDetails: ServiceInfo = as.service
            ? { id: as.service.id, title: as.service.title }
            : null; // Use null if service relation might be missing

          // Construct the final AvailedServicesProps object
          return {
            id: as.id,
            transactionId: as.transactionId, // Added transactionId
            serviceId: as.serviceId,
            service: serviceDetails, // Use the ServiceInfo object
            quantity: as.quantity,
            price: as.price, // Price snapshot for this item
            // --- ADD MISSING FIELDS ---
            commissionValue: as.commissionValue, // Include commission value
            status: as.status, // Include status
            completedAt: as.completedAt, // Include completedAt (make sure it's selected if needed)
            createdAt: as.createdAt, // Include createdAt
            updatedAt: as.updatedAt, // Include updatedAt
            // --- END ADDED FIELDS ---
            originatingSetId: as.originatingSetId,
            originatingSetTitle: as.originatingSetTitle,
            checkedById: as.checkedById,
            checkedBy: checkedByInfo,
            servedById: as.servedById,
            servedBy: servedByInfo,
          };
        }),
      };
    });
    return mappedTransactions;
  } catch (error) {
    console.error(
      "Server Action Error: Failed to fetch active transactions:",
      error,
    );
    throw new Error("Could not retrieve active transactions.");
  }
}

export async function loggingIn(formData: FormData) {
  try {
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    console.log(username, password);

    if (username && password) {
      const foundAcc = await prisma.account.findFirst({
        where: {
          username,
        },
      });

      if (foundAcc) {
        const isPasswordValid = await compare(password, foundAcc.password); // Compare the hashed password

        if (isPasswordValid) {
          console.log("Login successful");
          return {
            success: true,
            message: "Login successful",
            accountID: foundAcc.id,
          };
        } else {
          console.log("Invalid password");
          return { success: false, message: "Invalid password" };
        }
      } else {
        console.log("User not found");
        return { success: false, message: "User not found" };
      }
    } else {
      console.log("Missing credentials");
      return { success: false, message: "Username and password are required" };
    }
  } catch (e) {
    console.error("Error during login:", e);
    return { success: false, message: "An error occurred during login" };
  }
}
/* export async function getSalaryBreakdown(
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
): Promise<SalaryBreakdownItem[]> {
  if (!accountId || !periodStartDate || !periodEndDate) {
    console.error("getSalaryBreakdown: Missing required parameters.");
    return [];
  }

  const queryStartDate = new Date(periodStartDate);
  queryStartDate.setHours(0, 0, 0, 0);
  const queryEndDate = new Date(periodEndDate);
  queryEndDate.setHours(23, 59, 59, 999);

  console.log(
    `Server Action: Fetching salary breakdown for Account ${accountId}`,
    `\nPeriod Dates (Input): Start=${periodStartDate.toISOString()}, End=${periodEndDate.toISOString()}`,
    `\nQuery Dates (Adjusted): Start=${queryStartDate.toISOString()}, End=${queryEndDate.toISOString()}`,
  );

  try {
    const completedServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId, // Must be served by this account
        commissionValue: { gt: 0 }, // Must have earned commission
        status: Status.DONE, // <<< Filter by status directly on AvailedService
        completedAt: {
          // <<< Filter by completedAt directly on AvailedService
          gte: queryStartDate,
          lte: queryEndDate,
          not: null, // Ensure completedAt is not null
        },
        // You might still want to ensure the overall transaction isn't cancelled,
        // though usually if an AvailedService is DONE, the Transaction is too.
        transaction: {
          status: { not: Status.CANCELLED }, // Example: Optional check on parent transaction
        },
      },
      include: {
        service: {
          select: { title: true, price: true },
        },
        transaction: {
          // Still include transaction to get customer name
          select: {
            // We no longer need the date from here
            customer: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: {
        completedAt: "desc", // <<< Order by AvailedService completion date
      },
    });

    console.log(
      `Server Action: Found ${completedServices.length} relevant completed services.`,
    );

    const breakdownItems: SalaryBreakdownItem[] = completedServices
      // completedAt check in where clause makes this safer, but filter remains good practice
      .filter(
        (as) =>
          as.transaction &&
          as.service &&
          as.commissionValue != null &&
          as.completedAt != null,
      )
      .map((as) => {
        const commission = as.commissionValue!;
        const originalServicePrice = as.service!.price;
        const completionDate = as.completedAt!; // <<< Use completedAt from AvailedService

        return {
          id: as.id,
          serviceTitle: as.service!.title,
          customerName: as.transaction?.customer?.name ?? "N/A",
          transactionDate: new Date(completionDate), // <<< Use date from AvailedService
          servicePrice: originalServicePrice,
          commissionEarned: commission,
        };
      });

    console.log(
      `Server Action: Mapped ${breakdownItems.length} items for salary breakdown.`,
    );
    return breakdownItems;
  } catch (error) {
    console.error(
      `Server Action Error: Failed to fetch salary breakdown for Account ${accountId}:`,
      error,
    );
    return [];
  }
}
 */

export async function getSalaryBreakdown(
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
): Promise<SalaryBreakdownItem[]> {
  if (!accountId || !periodStartDate || !periodEndDate) {
    console.error("getSalaryBreakdown: Missing required parameters.");
    return [];
  }

  // Clone dates and set time for range query (using system's local time zone)
  // It's generally better to work with UTC or zoned times consistently if possible,
  // but for simple date ranges within a single timezone, this can work.
  // For robustness, ensure your Prisma schema handles dates as UTC or adjust query accordingly.
  const queryStartDate = new Date(periodStartDate);
  queryStartDate.setHours(0, 0, 0, 0);
  const queryEndDate = new Date(periodEndDate);
  queryEndDate.setHours(23, 59, 59, 999);

  console.log(
    `Server Action: Fetching salary breakdown for Account ${accountId}`,
    `\nPeriod Dates (Input): Start=${periodStartDate.toISOString()}, End=${periodEndDate.toISOString()}`,
    `\nQuery Dates (Adjusted): Start=${queryStartDate.toISOString()}, End=${queryEndDate.toISOString()}`,
  );

  try {
    const completedServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId, // Must be served by this account
        commissionValue: { gt: 0 }, // Must have earned commission
        status: Status.DONE, // Filter by status directly on AvailedService
        completedAt: {
          // Filter by completedAt directly on AvailedService within the period
          gte: queryStartDate,
          lte: queryEndDate,
          not: null, // Ensure completedAt is not null
        },
        // Optional: Ensure the overall transaction isn't cancelled.
        // If an AvailedService is DONE, its transaction is likely complete too,
        // but adding this provides an extra layer of data consistency.
        transaction: {
          status: { not: Status.CANCELLED },
        },
      },
      include: {
        service: {
          // Include service details needed for mapping
          select: { title: true, price: true },
        },
        transaction: {
          // Include transaction to get customer name
          select: {
            customer: {
              select: { name: true },
            },
          },
        },
      },
      // Order by the completion date of the service
      orderBy: {
        completedAt: "desc",
      },
    });

    console.log(
      `Server Action: Found ${completedServices.length} relevant completed services.`,
    );

    const breakdownItems: SalaryBreakdownItem[] = completedServices
      // Filter out any services where critical included data is missing
      // (shouldn't happen with typical data integrity, but adds robustness)
      // Also filters out items where completedAt or commissionValue is null,
      // which aligns with the `where` clause but is a safe double-check before non-null assertion
      .filter(
        (as) =>
          as.transaction &&
          as.service &&
          as.commissionValue != null && // Check commissionValue explicitly
          as.completedAt != null, // Check completedAt explicitly
      )
      .map((as) => {
        // Use non-null assertion (!) because the filter ensures these are not null or undefined
        const commission = as.commissionValue!;
        const originalServicePrice = as.service!.price;
        const completionDate = as.completedAt!; // Use completedAt from AvailedService

        // *** FIX APPLIED HERE ***
        // Construct the object exactly matching the SalaryBreakdownItem type
        return {
          id: as.id, // AvailedService ID (string)
          // Use optional chaining ?. and nullish coalescing ?? null to map to string | null
          serviceTitle: as.service?.title ?? null, // Service title (string | null)
          customerName: as.transaction?.customer?.name ?? null, // Customer name (string | null)
          // Add the required completedAt property
          completedAt: completionDate, // Completed timestamp (Date | null, guaranteed Date here by filter)
          servicePrice: originalServicePrice, // Service price (number)
          commissionEarned: commission, // Calculated commission (number)
          // Add the required originating set properties, which can be null on AvailedService
          originatingSetId: as.originatingSetId ?? null, // Originating set ID (string | null)
          originatingSetTitle: as.originatingSetTitle ?? null, // Originating set title (string | null)
          // Ensure no other properties are included if they are not in SalaryBreakdownItem type
          // For example, 'transactionDate' from previous attempts should NOT be here
        };
      });

    console.log(
      `Server Action: Mapped ${breakdownItems.length} items for salary breakdown.`,
    );
    return breakdownItems;
  } catch (error) {
    console.error(
      `Server Action Error: Failed to fetch salary breakdown for Account ${accountId}:`,
      error,
    );
    // Return empty array in case of error as per function signature
    return [];
  }
}
export async function getCurrentPayPeriodDatesForAccount(
  accountId: string,
  periodDurationDays: number = 7, // Default to 7 days for weekly
  defaultStartDate: Date = new Date("2024-01-01"), // Sensible global default start
): Promise<{ startDate: Date; endDate: Date }> {
  if (!accountId) {
    throw new Error("Account ID is required to calculate pay period.");
  }

  console.log(
    `[getCurrentPayPeriodDatesForAccount] Calculating pay period for Account ID: ${accountId}`,
  );
  console.log(
    `[getCurrentPayPeriodDatesForAccount] Period duration: ${periodDurationDays} days`,
  );

  // Find the end date of the most recently RELEASED payslip for this account
  const lastReleasedPayslip = await prisma.payslip.findFirst({
    where: {
      accountId: accountId,
      status: PayslipStatus.RELEASED, // Must be successfully released
    },
    orderBy: {
      periodEndDate: "desc", // Get the one with the latest end date
    },
    select: {
      periodEndDate: true,
    },
  });

  let startDate: Date;

  // Check if a payslip was found AND its date is valid
  if (
    lastReleasedPayslip?.periodEndDate &&
    isValid(new Date(lastReleasedPayslip.periodEndDate))
  ) {
    // If found and valid, the new period starts the day AFTER the last one ended
    const lastEnd = new Date(lastReleasedPayslip.periodEndDate);
    startDate = startOfDay(addDays(lastEnd, 1));
    console.log(
      `[getCurrentPayPeriodDatesForAccount] Found last released payslip ending on ${format(lastEnd, "yyyy-MM-dd")}. New period starts: ${format(startDate, "yyyy-MM-dd")}`,
    );
  } else {
    // If no previous released payslip, or date is invalid, use the default start date
    startDate = startOfDay(defaultStartDate);
    console.log(
      `[getCurrentPayPeriodDatesForAccount] No valid previous released payslip found. Using default start date: ${format(startDate, "yyyy-MM-dd")}`,
    );
  }

  // The end date is calculated by adding (duration - 1) days to the start date
  // Example: 7-day period starting Sunday (day 0) ends Saturday (day 6 -> 0 + 7 - 1)
  const endDate = endOfDay(addDays(startDate, periodDurationDays - 1));

  console.log(
    `[getCurrentPayPeriodDatesForAccount] Calculated Period Start Date: ${startDate}`,
  );
  console.log(
    `[getCurrentPayPeriodDatesForAccount] Calculated Period End Date: ${endDate}`,
  );

  return { startDate, endDate };
}

function getCurrentPayPeriodDates(today: Date = new Date()): {
  startDate: Date;
  endDate: Date;
} {
  const dayOfMonth = getDate(today);
  const currentMonth = getMonth(today);
  const currentYear = getYear(today);

  let startDate: Date;
  let endDate: Date;

  if (dayOfMonth <= 15) {
    // First half of the month (1st to 15th)
    startDate = startOfDay(setDate(today, 1));
    endDate = endOfDay(setDate(today, 15));
  } else {
    // Second half of the month (16th to end of month)
    startDate = startOfDay(setDate(today, 16));
    endDate = endOfDay(endOfMonth(today)); // endOfMonth handles different month lengths
  }

  return { startDate, endDate };
}
/* export async function getCurrentAccountData(
  accountId: string,
): Promise<AccountData | null> {
  if (!accountId) return null;
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      // Select all fields needed for AccountData type
      select: {
        id: true,
        name: true,
        role: true,
        salary: true,
        dailyRate: true,
      },
    });
    return account; // This now matches AccountData
  } catch (error) {
    console.error(`Error fetching account data for ${accountId}:`, error);
    return null;
  }
} */

/* export async function getCurrentAccountData(
  accountId: string,
): Promise<AccountData | null> {
  // Return null if not found or error
  if (!accountId) return null;
  console.log(`Server Action: Fetching account data for ${accountId}`);
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        role: true,
        salary: true,
        dailyRate: true, // <<< Ensure dailyRate is selected
      },
    });
    if (!account) {
      console.warn(`Server Action: Account not found: ${accountId}`);
      return null;
    }
    console.log(`Server Action: Account data found for ${account.name}`);
    // Prisma should return correct types, casting might not be strictly needed
    // but ensures alignment with AccountData interface
    return account as AccountData;
  } catch (error) {
    console.error(
      `Server Action Error: Error fetching account data for ${accountId}:`,
      error,
    );
    return null; // Return null on error
  }
}
 */
export async function createBranchAction(formData: FormData) {
  const data = {
    title: formData.get("title") as string,
    code: formData.get("code") as string,
  };

  const validationResult = branchSchema.safeParse(data);
  if (!validationResult.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  const { title, code } = validationResult.data;

  try {
    // Check for uniqueness before creating
    const existingCode = await prisma.branch.findUnique({
      where: { code: code.toUpperCase() },
    });
    if (existingCode) {
      return {
        success: false,
        message: `Branch code "${code}" already exists.`,
      };
    }
    const existingTitle = await prisma.branch.findUnique({
      where: { title: title },
    });
    if (existingTitle) {
      return {
        success: false,
        message: `Branch title "${title}" already exists.`,
      };
    }

    const newBranch = await prisma.branch.create({
      data: {
        title: title,
        code: code.toUpperCase(),
      },
    });

    revalidatePath("/customize"); // Revalidate the customize page path
    return {
      success: true,
      data: newBranch,
      message: "Branch created successfully.",
    };
  } catch (error) {
    console.error("Create Branch Action Error:", error);
    return {
      success: false,
      message: "Database error: Failed to create branch.",
    };
  }
}

// --- Update Branch Action ---
export async function updateBranchAction(id: string, formData: FormData) {
  if (!id) return { success: false, message: "Branch ID is required." };

  const data = {
    title: formData.get("title") as string,
  };

  const validationResult = updateBranchSchema.safeParse(data);
  if (!validationResult.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }
  const { title } = validationResult.data;

  try {
    // Check if new title conflicts with *other* branches
    const existingTitle = await prisma.branch.findFirst({
      where: {
        title: title,
        id: { not: id },
      },
    });
    if (existingTitle) {
      return {
        success: false,
        message: `Another branch with the title "${title}" already exists.`,
      };
    }

    const updatedBranch = await prisma.branch.update({
      where: { id },
      data: { title },
    });

    revalidatePath("/customize");
    return {
      success: true,
      data: updatedBranch,
      message: "Branch updated successfully.",
    };
  } catch (error: any) {
    console.error(`Update Branch Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      // Prisma code for record not found
      return { success: false, message: "Branch not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to update branch.",
    };
  }
}

// --- Delete Branch Action ---
export async function deleteBranchAction(id: string) {
  if (!id) return { success: false, message: "Branch ID is required." };

  try {
    // Check for dependencies before deleting
    const accountCount = await prisma.account.count({
      where: { branchId: id },
    });
    const serviceCount = await prisma.service.count({
      where: { branchId: id },
    });
    // Add more checks if necessary (e.g., Transactions)

    if (accountCount > 0 || serviceCount > 0) {
      return {
        success: false,
        message:
          "Cannot delete branch. It has associated accounts or services.",
      };
    }

    await prisma.branch.delete({ where: { id } });

    revalidatePath("/customize");
    return { success: true, message: "Branch deleted successfully." };
  } catch (error: any) {
    console.error(`Delete Branch Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Branch not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to delete branch.",
    };
  }
}

export async function createServiceAction(formData: FormData) {
  console.log("Server: createServiceAction called.");

  // Collect raw data from FormData (will be string | null)
  const rawData = Object.fromEntries(formData.entries());
  console.log("Server: Raw data from form:", rawData);

  // Validate using the serviceSchema (full schema)
  const validationResult = serviceSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.error(
      "Server: Create validation failed:",
      validationResult.error.flatten(),
    );
    return {
      success: false,
      message: "Validation failed.",
      errors: validationResult.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // Validated and transformed data object ready for Prisma
  const data = validationResult.data;
  console.log("Server: Validated data for Prisma create:", data);

  try {
    const newService = await prisma.service.create({
      data: {
        title: data.title,
        description: data.description, // string | null
        price: data.price, // number (guaranteed non-negative integer by schema)
        branchId: data.branchId, // string
        followUpPolicy: data.followUpPolicy, // FollowUpPolicy enum
        // recommendedFollowUpDays is number | null (validated by schema)
        recommendedFollowUpDays: data.recommendedFollowUpDays,
        // recommendFollowUp is derived from the validated policy
        recommendFollowUp: data.followUpPolicy !== FollowUpPolicy.NONE,
      },
    });

    console.log("Server: Service created successfully:", newService.id);
    // revalidatePath("/customize"); // Adjust path as needed
    // Consider revalidating a more specific path if possible
    revalidatePath(`/customize/${newService.branchId}`);

    return {
      success: true,
      data: newService,
      message: "Service created successfully.",
    };
  } catch (error: any) {
    console.error("Server: Create Service Action Error:", error);
    // Handle specific Prisma errors
    if (error.code === "P2002") {
      // Unique constraint failed
      const target = error.meta?.target;
      if (
        Array.isArray(target) &&
        target.includes("title") &&
        target.includes("branchId")
      ) {
        return {
          success: false,
          message: "A service with this title already exists in this branch.",
          errors: {
            title: ["Duplicate title in branch"],
            branchId: ["Duplicate service in branch"],
          },
        };
      } else if (Array.isArray(target) && target.includes("title")) {
        // Less likely for service without branch, but good fallback
        return {
          success: false,
          message: "A service with this title already exists.",
          errors: { title: ["Duplicate title"] },
        };
      }
      // Generic P2002 fallback
      return {
        success: false,
        message: "Duplicate entry.",
        errors: { general: ["Duplicate entry."] },
      };
    }
    if (error.code === "P2003") {
      // Foreign key constraint failed
      const fieldName = error.meta?.field_name;
      if (fieldName === "branchId") {
        return {
          success: false,
          message: "Selected Branch does not exist.",
          errors: { branchId: ["Branch not found"] },
        };
      }
      // Generic P2003 fallback
      return {
        success: false,
        message: "Invalid relation.",
        errors: { general: ["Invalid relation."] },
      };
    }
    // Generic fallback for other errors
    return {
      success: false,
      message: "Database error: Failed to create service.",
      errors: { general: ["Database error: Failed to create service."] },
    };
  }
}

export async function updateServiceAction(id: string, formData: FormData) {
  console.log(`Server: updateServiceAction called for ID: ${id}`);
  if (!id) {
    console.warn("Server: Service ID is missing for update.");
    return { success: false, message: "Service ID is required." };
  }

  // Collect raw data from FormData (will be string | null)
  // Use Object.fromEntries for easier handling of potential nulls/missing keys
  const rawData = Object.fromEntries(formData.entries());
  console.log("Server: Raw data from form for update:", rawData);

  // Validate using the partialServiceSchema
  const validationResult = partialServiceSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.error(
      "Server: Update validation failed:",
      validationResult.error.flatten(),
    );
    return {
      success: false,
      message: "Validation failed.",
      errors: validationResult.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }

  // Validated and transformed data object for update (partial)
  // This object only contains keys that were present in rawData AND successfully validated
  const data = validationResult.data;
  console.log("Server: Validated partial data for Prisma update:", data);

  // Prepare data for Prisma update based on validated fields present in `data`
  const dataToUpdate: any = {};

  // Add fields from validated data if they exist
  if (data.title !== undefined) dataToUpdate.title = data.title; // string | undefined -> string
  if (data.description !== undefined)
    dataToUpdate.description = data.description; // string | null | undefined -> string | null
  if (data.price !== undefined) dataToUpdate.price = data.price; // number | undefined -> number
  if (data.branchId !== undefined) dataToUpdate.branchId = data.branchId; // string | undefined -> string

  // Handle policy and dependent fields (recommendedFollowUp & recommendedFollowUpDays)
  // IF policy was provided in the form and successfully validated
  if (data.followUpPolicy !== undefined) {
    dataToUpdate.followUpPolicy = data.followUpPolicy; // Policy enum | undefined -> Policy enum
    // recommendFollowUp is derived from policy when policy is updated
    dataToUpdate.recommendFollowUp =
      data.followUpPolicy !== FollowUpPolicy.NONE;
    console.log(
      "Server: Setting recommendFollowUp based on provided policy:",
      dataToUpdate.recommendFollowUp,
    );

    // recommendedFollowUpDays depends on policy when policy is updated
    if (data.followUpPolicy === FollowUpPolicy.NONE) {
      // If policy is NONE, days must be null, regardless of what recommendedDays input was
      // (schema validation ensures days isn't *required* when policy is NONE)
      dataToUpdate.recommendedFollowUpDays = null;
      console.log(
        "Server: Setting recommendedFollowUpDays to null because policy is NONE.",
      );
    } else {
      // If policy requires days (ONCE or EVERY_TIME)
      // Use the validated days value IF it was provided and valid (i.e., exists in `data`)
      // The schema validation should have caught if it was required but missing/invalid.
      if (data.recommendedFollowUpDays !== undefined) {
        dataToUpdate.recommendedFollowUpDays = data.recommendedFollowUpDays; // number | null | undefined -> number | null
        console.log(
          "Server: Setting recommendedFollowUpDays based on provided value for requiring policy.",
        );
      }
      // else: recommendedFollowUpDays was either not provided, or was provided but invalid
      // (e.g., non-numeric string) and failed schema validation. If the policy requires
      // days, the schema superRefine would have added an error for this case, and validation would fail.
      // If validation succeeded, it means days were either provided and valid (handled above)
      // or the policy didn't require them (which isn't this 'else' branch), or days weren't provided/updated
      // while policy wasn't updated (handled in the 'else' below).
    }
  } else {
    // If policy was NOT provided in the form, we ONLY update recommendedFollowUpDays
    // if it was provided and validated. We do NOT touch recommendFollowUp based on policy.
    if (data.recommendedFollowUpDays !== undefined) {
      dataToUpdate.recommendedFollowUpDays = data.recommendedFollowUpDays; // number | null | undefined -> number | null
      console.log(
        "Server: Setting recommendedFollowUpDays based on provided value (policy not updated).",
      );
    }
    // We do NOT touch recommendFollowUp if policy wasn't provided.
  }

  console.log("Server: Data to update for Prisma:", dataToUpdate);

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn(`Server: No valid data provided for update for ID: ${id}.`);
    return { success: false, message: "No valid data provided for update." };
  }

  try {
    // Before updating, potentially fetch the service to get its branchId
    // This is needed for revalidation path if branchId wasn't updated.
    // If branchId *is* updated, we'll use the new one from dataToUpdate.
    let oldBranchId = null;
    if (!dataToUpdate.branchId) {
      const existingService = await prisma.service.findUnique({
        where: { id },
        select: { branchId: true },
      });
      if (existingService) {
        oldBranchId = existingService.branchId;
      }
    }

    const updatedService = await prisma.service.update({
      where: { id },
      data: dataToUpdate,
    });

    console.log("Server: Service updated successfully:", updatedService.id);

    // Determine the branchId for revalidation
    const branchIdForRevalidate = dataToUpdate.branchId || oldBranchId;
    if (branchIdForRevalidate) {
      // revalidatePath("/customize"); // Adjust path as needed
      revalidatePath(`/customize/${branchIdForRevalidate}`);
      // If branchId *changed*, also revalidate the old branch's page? Depends on UI needs.
      // For simplicity, revalidating the *new* branch path is usually sufficient.
    } else {
      // Fallback if no branchId is available (shouldn't happen if service exists)
      revalidatePath("/customize");
    }

    return {
      success: true,
      data: updatedService,
      message: "Service updated successfully.",
    };
  } catch (error: any) {
    console.error(`Server: Update Service Action Error (ID: ${id}):`, error);
    // Handle specific Prisma errors
    if (error.code === "P2025") {
      // Record not found
      return {
        success: false,
        message: "Service not found.",
        errors: { general: ["Service not found."] },
      };
    }
    if (error.code === "P2002") {
      // Unique constraint failed
      const target = error.meta?.target;
      if (
        Array.isArray(target) &&
        target.includes("title") &&
        target.includes("branchId")
      ) {
        return {
          success: false,
          message: "A service with this title already exists in this branch.",
          errors: {
            title: ["Duplicate title in branch"],
            branchId: ["Duplicate service in branch"],
          },
        };
      } else if (Array.isArray(target) && target.includes("title")) {
        // Less likely for service without branch update
        return {
          success: false,
          message: "A service with this title already exists.",
          errors: { title: ["Duplicate title"] },
        };
      }
      // Generic P2002 fallback
      return {
        success: false,
        message: "Duplicate entry.",
        errors: { general: ["Duplicate entry."] },
      };
    }
    if (error.code === "P2003") {
      // Foreign key constraint failed
      const fieldName = error.meta?.field_name;
      if (fieldName === "branchId") {
        return {
          success: false,
          message: "Selected Branch does not exist.",
          errors: { branchId: ["Branch not found"] },
        };
      }
      // Generic P2003 fallback
      return {
        success: false,
        message: "Invalid relation.",
        errors: { general: ["Invalid relation."] },
      };
    }
    // Generic fallback for other errors
    return {
      success: false,
      message: "Database error: Failed to update service.",
      errors: { general: ["Database error: Failed to update service."] },
    };
  }
}

// --- Delete Service Action ---
export async function deleteServiceAction(id: string) {
  if (!id) return { success: false, message: "Service ID is required." };

  try {
    // Check for dependencies (AvailedService)
    const availedCount = await prisma.availedService.count({
      where: { serviceId: id },
    });
    if (availedCount > 0) {
      return {
        success: false,
        message: "Cannot delete service. It has been used in transactions.",
      };
    }

    await prisma.service.delete({ where: { id } });

    revalidatePath("/customize");
    return { success: true, message: "Service deleted successfully." };
  } catch (error: any) {
    console.error(`Delete Service Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Service not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to delete service.",
    };
  }
}

export async function cancelRecommendedAppointmentAction(
  recommendedAppointmentId: string,
) {
  console.log(
    `Server: Received request to cancel Recommended Appointment: ${recommendedAppointmentId}`,
  );

  if (!recommendedAppointmentId) {
    console.warn(
      "Server: Recommended Appointment ID is missing for cancellation.",
    );
    return {
      success: false,
      message: "Recommended Appointment ID is required.",
    };
  }

  try {
    // Find the appointment to ensure it exists and is in a cancellable state (optional check)
    const existingAppointment = await prisma.recommendedAppointment.findUnique({
      where: { id: recommendedAppointmentId },
      select: { id: true, status: true, customerId: true }, // Select customerId to potentially revalidate customer paths
    });

    if (!existingAppointment) {
      console.warn(
        `Server: Recommended Appointment ${recommendedAppointmentId} not found.`,
      );
      return { success: false, message: "Recommended Appointment not found." };
    }

    // Check if it's already a final status (optional, prevent redundant updates)
    if (
      existingAppointment.status === RecommendedAppointmentStatus.CANCELLED ||
      existingAppointment.status === RecommendedAppointmentStatus.ATTENDED ||
      existingAppointment.status === RecommendedAppointmentStatus.MISSED
    ) {
      console.log(
        `Server: Recommended Appointment ${recommendedAppointmentId} is already in a final status (${existingAppointment.status}). Skipping update.`,
      );
      return {
        success: true,
        message: `Appointment is already ${existingAppointment.status}.`,
      }; // Return success as no action needed
    }

    // Update the status to CANCELLED
    const cancelledAppointment = await prisma.recommendedAppointment.update({
      where: { id: recommendedAppointmentId },
      data: {
        status: RecommendedAppointmentStatus.CANCELLED,
        // Optional: Set a timestamp for when it was cancelled
        // cancelledAt: new Date(),
      },
    });

    console.log(
      `Server: Recommended Appointment ${recommendedAppointmentId} status updated to CANCELLED.`,
    );

    // Revalidate paths that might display this recommendation (e.g., customer profile, lists)
    revalidatePath(`/customers/${cancelledAppointment.customerId}`); // Assuming a customer details page path
    revalidatePath(`/recommended-appointments`); // Assuming a list page path
    // You might need to revalidate other relevant paths

    return {
      success: true,
      message: "Recommended Appointment cancelled successfully.",
    };
  } catch (error: any) {
    console.error(
      `Server: Error cancelling Recommended Appointment ${recommendedAppointmentId}:`,
      error,
    );
    // Handle specific Prisma errors if necessary
    if (error.code === "P2025") {
      // Not Found error
      return { success: false, message: "Recommended Appointment not found." };
    }
    return {
      success: false,
      message: error.message || "Failed to cancel Recommended Appointment.",
    };
  }
}

const ALL_ROLES = Object.values(Role); // For validation

const createAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(20, "Username too long"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().trim().min(1, "Name required"),
  email: z
    .string()
    .trim()
    .email("Invalid email format")
    .nullable()
    .optional()
    .or(z.literal("")),
  dailyRate: z.coerce // Use coerce for FormData which sends strings
    .number({ invalid_type_error: "Daily Rate must be a number" })
    .int("Daily Rate must be a whole number")
    .nonnegative("Daily Rate must be non-negative") // Use non-negative shorthand
    .optional(), // Keep optional if you rely on Prisma default
  branchId: z.string().uuid("Invalid Branch ID format").nullable().optional(),
  role: z.array(z.nativeEnum(Role)).min(1, "At least one role required"),
});

const updateAccountSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, "Username required")
    .max(20, "Username too long"),
  name: z.string().trim().min(1, "Name required"),
  email: z
    .string()
    .trim()
    .email("Invalid email format")
    .nullable()
    .optional()
    .or(z.literal("")),
  dailyRate: z.coerce
    .number({ invalid_type_error: "Daily Rate must be a number" })
    .int("Daily Rate must be a whole number")
    .nonnegative("Daily Rate must be non-negative")
    .optional(),
  branchId: z.string().uuid("Invalid Branch ID format").nullable().optional(),
  role: z.array(z.nativeEnum(Role)).min(1, "At least one role required"),
});

// --- NEW: Server Action to Fetch Accounts ---
// Define the specific type we want to return to the client

export async function getAccountSalary(
  accountId: string,
): Promise<{ salary: number } | null> {
  if (!accountId) return null;
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { salary: true },
    });
    // Return type here is simpler, no change needed based on AccountData update
    return account ? { salary: account.salary } : null;
  } catch (error) {
    console.error(`Error fetching salary for ${accountId}:`, error);
    return null;
  }
}

export async function getAccountsAction(): Promise<AccountForManagement[]> {
  console.log("Server Action: getAccountsAction executing...");
  try {
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        dailyRate: true, // *** Include dailyRate ***
        branchId: true,
        branch: {
          // Include related branch data
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        name: "asc", // Example ordering
      },
    });
    console.log(
      `Server Action: Fetched ${accounts.length} accounts successfully.`,
    );
    // Prisma's return type with the select should match AccountForManagement
    // but we cast for clarity/safety, ensure `select` is correct.
    // Need to handle potential null dailyRate from DB if schema allows it,
    // but the component type expects number. Let's ensure it's number or default.
    return accounts.map((acc) => ({
      ...acc,
      // Ensure dailyRate is a number, falling back to 0 if somehow null/undefined in DB
      // although your schema has a default, this is safer.
      dailyRate: acc.dailyRate ?? 0,
    })) as AccountForManagement[]; // Map to ensure type conformity before casting
  } catch (error) {
    console.error("Server Action Error [getAccountsAction]:", error);
    // In a real app, you might want to throw a more specific error
    // or return an object indicating failure, e.g., { success: false, error: 'message' }
    // For simplicity here, we re-throw, which the client component needs to handle.
    throw new Error("Failed to fetch accounts via server action.");
  }
}

// --- NEW: Server Action to Fetch Branches for Select Dropdown ---

export async function getBranchesForSelectAction(): Promise<BranchForSelect[]> {
  console.log("Server Action: getBranchesForSelectAction executing...");
  try {
    const branches = await prisma.branch.findMany({
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        title: "asc", // Good practice to order dropdowns
      },
    });
    console.log(
      `Server Action: Fetched ${branches.length} branches successfully.`,
    );
    return branches;
  } catch (error) {
    console.error("Server Action Error [getBranchesForSelectAction]:", error);
    throw new Error("Failed to fetch branches via server action.");
  }
}

/* export async function createAccountAction(formData: FormData) {
  console.log("Raw FormData:", Object.fromEntries(formData.entries()));

  const roles = ALL_ROLES.filter(
    (role) => formData.get(`role-${role}`) === "on",
  );

  let branchIdFromForm = formData.get("branchId") as string | null;
  let branchIdForZod: string | null = null;
  if (branchIdFromForm) {
    const trimmedId = branchIdFromForm.trim();
    if (
      trimmedId.length > 0 &&
      trimmedId.match(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
      )
    ) {
      branchIdForZod = trimmedId;
    } else if (trimmedId.length > 0) {
      console.warn(
        `Branch ID from form "${trimmedId}" is not a valid UUID format, treating as null.`,
      );
    }
  }
  console.log(
    `Branch ID from form: "${branchIdFromForm}", Processed for Zod: "${branchIdForZod}"`,
  );
  // --- End CORRECTED Branch ID Handling ---

  const rawData = {
    username: formData.get("username"),
    password: formData.get("password"),
    name: formData.get("name"),
    email: formData.get("email"),
    dailyRate: formData.get("dailyRate"), // Let Zod coerce this
    branchId: branchIdForZod, // Use the correctly processed value
    role: roles,
  };
  // 2. Log Raw Data for Zod
  console.log("Raw Data for Zod:", rawData);

  const validationResult = createAccountSchema.safeParse(rawData);

  // 3. Log Zod Validation Result
  console.log(
    "Zod Validation Result:",
    JSON.stringify(validationResult, null, 2),
  );

  if (!validationResult.success) {
    console.error(
      "Zod Validation Errors:",
      validationResult.error.flatten().fieldErrors,
    );
    // Refine error message construction
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
      .join("; ");
    return {
      success: false,
      message: `Validation failed. ${messages}`, // Provide specific Zod errors
      errors: fieldErrors,
    };
  }

  // Destructure validated data
  const { password, email, branchId, dailyRate, ...restData } =
    validationResult.data;
  // 4. Log Validated Data
  console.log("Validated Data:", {
    passwordExists: !!password,
    email,
    branchId, // This is now correctly validated (UUID string or null)
    dailyRate, // This is now correctly coerced or undefined
    restData,
  });

  try {
    // Check uniqueness (keep this logic)
    const existingUsername = await prisma.account.findUnique({
      where: { username: restData.username },
    });
    if (existingUsername)
      return {
        success: false,
        message: `Username "${restData.username}" is already taken.`,
        errors: { username: ["Username already taken."] },
      };
    if (email) {
      // Check only if email is provided and not null/empty
      const existingEmail = await prisma.account.findUnique({
        where: { email },
      });
      if (existingEmail)
        return {
          success: false,
          message: `Email "${email}" is already registered.`,
          errors: { email: ["Email already registered."] },
        };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Construct the payload for Prisma
    const createPayload: any = {
      ...restData, // includes username, name, role
      password: hashedPassword,
      email: email || null, // Ensure empty string becomes null if it wasn't already
      branchId: branchId, // Use validated branchId (UUID string or null)
      salary: 0, // Initialize salary
    };

    // Only add dailyRate if it was provided and validated (not undefined)
    if (dailyRate !== undefined && dailyRate !== null) {
      createPayload.dailyRate = dailyRate; // Add the number
    }
    // If dailyRate is undefined/null here, Prisma will use the schema default (@default(350))

    // 5. Log Prisma Create Payload
    console.log("Data being sent to Prisma Create:", createPayload);

    const newAccount = await prisma.account.create({ data: createPayload });

    // 6. Log Prisma Success Result
    console.log("Prisma Create Successful:", newAccount);

    revalidatePath("/customize"); // Adjust path as needed
    const { password: _, ...returnData } = newAccount; // Exclude password from response
    return {
      success: true,
      data: returnData,
      message: "Account created successfully.",
    };
  } catch (error: any) {
    // 7. Log Prisma Error
    console.error("Prisma Create Error:", error);
    // Log details ONLY if they exist to avoid crashing on access
    if (error.code) console.error("Prisma Error Code:", error.code);
    if (error.meta) console.error("Prisma Error Meta:", error.meta);

    // Handle specific Prisma errors (keep this logic)
    if (
      error.code === "P2003" && // Foreign Key constraint failed
      error.meta?.field_name?.includes("branchId")
    ) {
      return {
        success: false,
        message: `Selected Branch (ID: ${branchId}) does not exist or is invalid. Please refresh and try again.`,
        errors: { branchId: ["Selected Branch does not exist or is invalid."] },
      };
    }
    if (error.code === "P2002") {
      // Unique constraint violation
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes("username"))
        return {
          success: false,
          message: "Username already taken.",
          errors: { username: ["Username already taken."] },
        };
      if (target?.includes("email"))
        return {
          success: false,
          message: "Email already registered.",
          errors: { email: ["Email already registered."] },
        };
    }
    return {
      success: false,
      message: `Database error: Failed to create account. ${error.message || "Unknown error"}`,
    };
  }
} */

export async function getAttendanceForPeriod(
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<AttendanceRecord[]> {
  console.log(
    `[getAttendanceForPeriod] Fetching for ${accountId} from ${startDate} to ${endDate}`,
  );
  const records = await prisma.attendance.findMany({
    where: {
      accountId: accountId,
      date: {
        gte: startDate, // Use the passed start date
        lte: endDate, // Use the passed end date
      },
    },
    // Include necessary fields for AttendanceRecord type
    select: {
      id: true,
      date: true,
      isPresent: true,
      notes: true /* ... other fields */,
    },
  });
  // Map to AttendanceRecord type if necessary
  return records as AttendanceRecord[]; // Adjust mapping if needed
}

export async function updateAccountAction(id: string, formData: FormData) {
  // ... (keep your existing updateAccountAction implementation)
  console.log(`--- Updating Account ${id} ---`);
  // 1. Log Raw FormData
  console.log("Raw FormData:", Object.fromEntries(formData.entries()));

  if (!id) return { success: false, message: "Account ID is required." };

  const roles = ALL_ROLES.filter(
    (role) => formData.get(`role-${role}`) === "on",
  );

  // --- CORRECTED Branch ID Handling ---
  let branchIdFromForm = formData.get("branchId") as string | null;
  let branchIdForZod: string | null = null; // Default to null
  if (branchIdFromForm) {
    const trimmedId = branchIdFromForm.trim();
    if (
      trimmedId.length > 0 &&
      trimmedId.match(
        /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i,
      )
    ) {
      // Basic UUID check
      // Only use non-empty, valid-looking UUID strings
      branchIdForZod = trimmedId;
    } else if (trimmedId.length > 0) {
      console.warn(
        `Branch ID from form "${trimmedId}" is not a valid UUID format, treating as null.`,
      );
    }
  }
  console.log(
    `Branch ID from form: "${branchIdFromForm}", Processed for Zod: "${branchIdForZod}"`,
  );
  // --- End CORRECTED Branch ID Handling ---

  const rawData = {
    username: formData.get("username"),
    name: formData.get("name"),
    email: formData.get("email"),
    dailyRate: formData.get("dailyRate"), // Let Zod coerce
    branchId: branchIdForZod, // Use the correctly processed value
    role: roles,
  };
  // 2. Log Raw Data for Zod
  console.log("Raw Data for Zod:", rawData);

  // Use the update schema
  const validationResult = updateAccountSchema.safeParse(rawData);
  // 3. Log Zod Validation Result
  console.log(
    "Zod Validation Result:",
    JSON.stringify(validationResult, null, 2),
  );

  if (!validationResult.success) {
    console.error(
      "Zod Validation Errors:",
      validationResult.error.flatten().fieldErrors,
    );
    // Refine error message construction
    const fieldErrors = validationResult.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
      .join("; ");
    return {
      success: false,
      message: `Validation failed. ${messages}`, // Provide specific Zod errors
      errors: fieldErrors,
    };
  }
  // 4. Log Validated Data
  console.log("Validated Data:", validationResult.data);

  // Create dataToUpdate carefully from VALIDATED data
  const dataToUpdate: { [key: string]: any } = {};
  const { email, branchId, dailyRate, ...restValidatedData } =
    validationResult.data;

  // Assign validated non-nullable fields
  Object.assign(dataToUpdate, restValidatedData);

  // Handle nullable fields carefully based on validated data
  if ("email" in validationResult.data) {
    // Check if email was part of the validated data
    dataToUpdate.email = email === "" ? null : email; // Convert "" to null
  }
  if ("branchId" in validationResult.data) {
    // Check if branchId was part of the validated data
    dataToUpdate.branchId = branchId; // Will be UUID string or null
  }
  // Only include dailyRate if it was provided and validated (is a number)
  if (dailyRate !== undefined && dailyRate !== null) {
    dataToUpdate.dailyRate = dailyRate;
  } else if (
    formData.has("dailyRate") &&
    (formData.get("dailyRate") === null || formData.get("dailyRate") === "")
  ) {
    // Explicitly handle case where user clears the field, maybe set to default? Or allow Prisma default?
    // If we want to force Prisma default if cleared, don't add dailyRate to dataToUpdate.
    // If we want to set it to 0 if cleared, then:
    // dataToUpdate.dailyRate = 0; // Or handle based on business logic
    // Current logic: If optional and not provided/invalid, Zod makes it undefined, so we don't update it.
    // If provided and valid number (incl 0), we update it.
  }

  // 5. Log Prisma Update Payload
  console.log("Data being sent to Prisma Update:", dataToUpdate);

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn("No changes detected after validation to update.");
    // Find the existing account to return it
    const existingAccount = await prisma.account.findUnique({ where: { id } });
    if (!existingAccount)
      return { success: false, message: "Account not found." };
    const { password: _, ...returnData } = existingAccount;
    return { success: true, message: "No changes detected.", data: returnData };
  }

  try {
    // Check uniqueness constraints if username/email are being updated
    if (dataToUpdate.username) {
      const existingUsername = await prisma.account.findFirst({
        where: { username: dataToUpdate.username, id: { not: id } },
      });
      if (existingUsername)
        return {
          success: false,
          message: `Username "${dataToUpdate.username}" is already taken.`,
          errors: { username: ["Username already taken."] },
        };
    }
    // Check email uniqueness only if email is being set to a non-null value
    if (dataToUpdate.email) {
      // Check if email is truthy (not null, not empty string)
      const existingEmail = await prisma.account.findFirst({
        where: { id: { not: id }, email: dataToUpdate.email },
      });
      if (existingEmail)
        return {
          success: false,
          message: `Email "${dataToUpdate.email}" is already registered.`,
          errors: { email: ["Email already registered."] },
        };
    }

    // Update the account
    const updatedAccount = await prisma.account.update({
      where: { id },
      data: dataToUpdate,
    });
    // 6. Log Prisma Success Result
    console.log("Prisma Update Successful:", updatedAccount);

    revalidatePath("/customize");
    const { password: _, ...returnData } = updatedAccount;
    return {
      success: true,
      data: returnData,
      message: "Account updated successfully.",
    };
  } catch (error: any) {
    // 7. Log Prisma Error
    console.error(`Prisma Update Error for ID ${id}:`, error);
    if (error.code) console.error("Prisma Error Code:", error.code);
    if (error.meta) console.error("Prisma Error Meta:", error.meta);

    // Handle specific Prisma errors (keep this logic)
    if (error.code === "P2025") {
      // Record to update not found
      return { success: false, message: "Account not found." };
    }
    if (
      error.code === "P2003" && // Foreign key constraint failed
      error.meta?.field_name?.includes("branchId")
    ) {
      return {
        success: false,
        message: `Selected Branch (ID: ${dataToUpdate.branchId}) does not exist or is invalid. Please refresh the branch list.`,
        errors: { branchId: ["Selected Branch does not exist or is invalid."] },
      };
    }
    if (error.code === "P2002") {
      // Unique constraint failed
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes("username"))
        return {
          success: false,
          message: "Username already taken.",
          errors: { username: ["Username already taken."] },
        };
      if (target?.includes("email"))
        return {
          success: false,
          message: "Email already registered.",
          errors: { email: ["Email already registered."] },
        };
    }
    // General fallback
    return {
      success: false,
      message: `Database error: Failed to update account. ${error.message || "Unknown error"}`,
    };
  }
}

export async function deleteAccountAction(
  accountId: string,
): Promise<{ success: boolean; message: string }> {
  // ... (keep your existing deleteAccountAction implementation)
  console.log(`Attempting to delete account: ${accountId}`);
  if (!accountId) return { success: false, message: "Account ID required." };
  try {
    // Basic Check: Prevent deleting OWNER (example safeguard)
    const accountToDelete = await prisma.account.findUnique({
      where: { id: accountId },
      select: { role: true }, // Only select necessary field
    });

    if (!accountToDelete) {
      return { success: false, message: "Account not found." };
    }

    if (accountToDelete.role.includes(Role.OWNER)) {
      return {
        success: false,
        message: "Cannot delete an account with the OWNER role.",
      };
    }

    // Add more checks if needed (e.g., check related records)
    // Example: Check dependent records before deletion
    const relatedAttendance = await prisma.attendance.count({
      where: { OR: [{ accountId: accountId }, { checkedById: accountId }] },
    });
    const relatedServicesServed = await prisma.availedService.count({
      where: { servedById: accountId },
    });
    const relatedServicesChecked = await prisma.availedService.count({
      where: { checkedById: accountId },
    });

    if (
      relatedAttendance > 0 ||
      relatedServicesServed > 0 ||
      relatedServicesChecked > 0
    ) {
      return {
        success: false,
        message:
          "Cannot delete account. It has related attendance or service records. Consider deactivating instead.",
      };
    }

    await prisma.account.delete({ where: { id: accountId } });
    console.log(`Account ${accountId} deleted successfully.`);
    revalidatePath("/customize"); // Revalidate relevant pages
    return { success: true, message: "Account deleted successfully." };
  } catch (error: any) {
    console.error(`Error deleting account ${accountId}:`, error);
    if (error.code === "P2025") {
      // Record to delete not found (already handled above, but keep as fallback)
      return { success: false, message: "Account not found." };
    }
    // Handle foreign key constraints if checks above missed something (shouldn't happen with checks)
    if (error.code === "P2003" || error.code === "P2014") {
      return {
        success: false,
        message:
          "Cannot delete account due to existing related records (Prisma constraint). Consider deactivating.",
      };
    }
    return { success: false, message: "Database error deleting account." };
  }
}

const voucherSchema = z.object({
  code: z.string().min(1, "Code is required"),
  // Use preprocess for value
  value: z.preprocess(
    (val) => {
      if (typeof val === "string") return parseInt(val, 10);
      if (typeof val === "number") return val;
      return NaN;
    },
    z
      .number({ invalid_type_error: "Value must be a number" })
      .int()
      .min(1, "Value must be at least 1"),
  ),
});

// --- Create Voucher Action ---
export async function createVoucherAction(formData: FormData) {
  const rawData = {
    code: formData.get("code"),
    value: formData.get("value"),
  };
  const validationResult = voucherSchema.safeParse(rawData);

  if (!validationResult.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }
  const { code, value } = validationResult.data;

  try {
    // Check uniqueness
    const upperCode = code.toUpperCase();
    const existing = await prisma.voucher.findUnique({
      where: { code: upperCode },
    });
    if (existing) {
      return {
        success: false,
        message: `Voucher code "${upperCode}" already exists.`,
      };
    }

    const newVoucher = await prisma.voucher.create({
      data: { code: upperCode, value }, // Store code consistently
    });

    revalidatePath("/customize");
    return {
      success: true,
      data: newVoucher,
      message: "Voucher created successfully.",
    };
  } catch (error: any) {
    console.error("Create Voucher Action Error:", error);
    return {
      success: false,
      message: "Database error: Failed to create voucher.",
    };
  }
}

// --- Update Voucher Action ---
// Typically only value is updated for unused vouchers
export async function updateVoucherAction(id: string, formData: FormData) {
  if (!id) return { success: false, message: "Voucher ID is required." };

  const rawData = { value: formData.get("value") };
  const validationResult = voucherSchema
    .pick({ value: true })
    .safeParse(rawData); // Only validate value

  if (!validationResult.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }
  const { value } = validationResult.data;

  try {
    // Prevent updating used vouchers
    const voucher = await prisma.voucher.findUnique({ where: { id } });
    if (!voucher) {
      return { success: false, message: "Voucher not found." };
    }
    if (voucher.usedAt) {
      return {
        success: false,
        message: "Cannot update a voucher that has already been used.",
      };
    }

    const updatedVoucher = await prisma.voucher.update({
      where: { id },
      data: { value },
    });

    revalidatePath("/customize");
    return {
      success: true,
      data: updatedVoucher,
      message: "Voucher updated successfully.",
    };
  } catch (error: any) {
    console.error(`Update Voucher Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      // Should be caught above, but good fallback
      return { success: false, message: "Voucher not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to update voucher.",
    };
  }
}

// --- Delete Voucher Action ---
export async function deleteVoucherAction(id: string) {
  if (!id) return { success: false, message: "Voucher ID is required." };

  try {
    // Optional: Check if used. Deleting used vouchers might break historical data links.
    // const voucher = await prisma.voucher.findUnique({ where: { id } });
    // if (voucher && voucher.usedAt) {
    //     // Maybe disallow or warn strongly
    // }

    // Check for associated transactions
    const transactionCount = await prisma.transaction.count({
      where: { voucherId: id },
    });
    if (transactionCount > 0) {
      return {
        success: false,
        message:
          "Cannot delete voucher. It is linked to existing transactions.",
      };
    }

    await prisma.voucher.delete({ where: { id } });

    revalidatePath("/customize");
    return { success: true, message: "Voucher deleted successfully." };
  } catch (error: any) {
    console.error(`Delete Voucher Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Voucher not found." };
    }
    if (error.code === "P2003") {
      // Foreign key constraint violation
      return {
        success: false,
        message:
          "Cannot delete voucher. It might be linked to other records (e.g., transactions).",
      };
    }
    return {
      success: false,
      message: "Database error: Failed to delete voucher.",
    };
  }
}

const serviceSetSchema = z.object({
  title: z.string().min(1, "Set title is required"),
  price: z.preprocess(
    // Handle string input from FormData
    (val) => (typeof val === "string" ? parseInt(val, 10) : val),
    z
      .number({ invalid_type_error: "Price must be a number" })
      .int()
      .min(0, "Price must be non-negative"),
  ),
  // Expect an array of service IDs (UUIDs)
  serviceIds: z
    .array(z.string().uuid("Invalid Service ID format"))
    .min(1, "At least one service must be selected for the set"),
});

// --- Create Service Set Action ---
export async function createServiceSetAction(formData: FormData) {
  const rawData = {
    title: formData.get("title"),
    price: formData.get("price"),
    serviceIds: formData.getAll("serviceIds"), // Use getAll for multiple values with same name
  };

  const validationResult = serviceSetSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.log("Validation Errors:", validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  const { title, price, serviceIds } = validationResult.data;

  try {
    // Check uniqueness of title
    const existing = await prisma.serviceSet.findUnique({ where: { title } });
    if (existing) {
      return {
        success: false,
        message: `A service set with the title "${title}" already exists.`,
      };
    }

    // Verify all selected service IDs actually exist (optional but recommended)
    const existingServices = await prisma.service.count({
      where: { id: { in: serviceIds } },
    });
    if (existingServices !== serviceIds.length) {
      return {
        success: false,
        message: "One or more selected services do not exist.",
      };
    }

    // Create the set and connect the services
    const newServiceSet = await prisma.serviceSet.create({
      data: {
        title,
        price,
        services: {
          connect: serviceIds.map((id) => ({ id })), // Connect using service IDs
        },
      },
      include: { services: { select: { id: true, title: true } } }, // Include services in response
    });

    revalidatePath("/customize"); // Revalidate the page
    return {
      success: true,
      data: newServiceSet,
      message: "Service Set created successfully.",
    };
  } catch (error: any) {
    console.error("Create Service Set Action Error:", error);
    return {
      success: false,
      message: "Database error: Failed to create service set.",
    };
  }
}

// --- Update Service Set Action ---
export async function updateServiceSetAction(
  setId: string,
  formData: FormData,
) {
  if (!setId) return { success: false, message: "Service Set ID is required." };

  const rawData = {
    title: formData.get("title"),
    price: formData.get("price"),
    serviceIds: formData.getAll("serviceIds"),
  };

  // Use .partial() for update validation
  const validationResult = serviceSetSchema.partial().safeParse(rawData);

  if (!validationResult.success) {
    console.log("Validation Errors:", validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  const { title, price, serviceIds } = validationResult.data;

  // Prepare data, only include fields that were actually provided
  const dataToUpdate: { title?: string; price?: number; services?: any } = {};
  if (title !== undefined) dataToUpdate.title = title;
  if (price !== undefined) dataToUpdate.price = price;
  // If serviceIds were provided, update the connections using 'set'
  if (serviceIds !== undefined) {
    if (serviceIds.length === 0) {
      return {
        success: false,
        message: "A service set must contain at least one service.",
      };
    }
    // Verify new service IDs exist before setting
    const existingServices = await prisma.service.count({
      where: { id: { in: serviceIds } },
    });
    if (existingServices !== serviceIds.length) {
      return {
        success: false,
        message: "One or more selected services do not exist.",
      };
    }
    dataToUpdate.services = {
      set: serviceIds.map((id) => ({ id })), // 'set' replaces all existing connections
    };
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return { success: false, message: "No valid data provided for update." };
  }

  try {
    // Check uniqueness if title is being updated
    if (dataToUpdate.title) {
      const existing = await prisma.serviceSet.findFirst({
        where: { title: dataToUpdate.title, id: { not: setId } },
      });
      if (existing) {
        return {
          success: false,
          message: `Another service set with the title "${dataToUpdate.title}" already exists.`,
        };
      }
    }

    const updatedServiceSet = await prisma.serviceSet.update({
      where: { id: setId },
      data: dataToUpdate,
      include: { services: { select: { id: true, title: true } } },
    });

    revalidatePath("/customize");
    return {
      success: true,
      data: updatedServiceSet,
      message: "Service Set updated successfully.",
    };
  } catch (error: any) {
    console.error(`Update Service Set Action Error (ID: ${setId}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Service Set not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to update service set.",
    };
  }
}

// --- Delete Service Set Action ---
export async function deleteServiceSetAction(setId: string) {
  if (!setId) return { success: false, message: "Service Set ID is required." };

  try {
    // Add checks here if service sets can be part of transactions later
    // e.g., const transactionCount = await prisma.transaction.count({ where: { serviceSetId: setId } });
    // if (transactionCount > 0) return { success: false, message: 'Cannot delete set linked to transactions.' };

    await prisma.serviceSet.delete({
      where: { id: setId },
    });

    revalidatePath("/customize");
    return { success: true, message: "Service Set deleted successfully." };
  } catch (error: any) {
    console.error(`Delete Service Set Action Error (ID: ${setId}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Service Set not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to delete service set.",
    };
  }
}

export async function getActiveGiftCertificates(): Promise<GiftCertificate[]> {
  try {
    const now = new Date();
    const activeGCs = await prisma.giftCertificate.findMany({
      where: {
        usedAt: null, // Not used
        OR: [
          // Either no expiry OR expiry is in the future
          { expiresAt: null },
          { expiresAt: { gte: now } },
        ],
      },
      orderBy: {
        issuedAt: "desc", // Show newest first
      },
      // Optionally include services if you want to display them in the list
      // include: { services: { select: { title: true } } }
      // Include ServiceSets as well if you need their titles in the list view
      // include: { serviceSets: { select: { title: true } } }
    });
    return activeGCs;
  } catch (error) {
    console.error("Error fetching active gift certificates:", error);
    return []; // Return empty on error
  }
}

export async function toggleDiscountRuleAction(
  id: string,
  currentStatus: boolean,
): Promise<{ success: boolean; message: string }> {
  console.log(
    `Toggling discount rule ${id} from isActive=${currentStatus} to ${!currentStatus}`,
  );

  // Basic validation for ID
  if (!id || typeof id !== "string") {
    console.error("Invalid ID provided for toggling discount rule.");
    return { success: false, message: "Invalid discount rule ID." };
  }

  try {
    // Find the rule first to ensure it exists (optional but good practice)
    const existingRule = await prisma.discountRule.findUnique({
      where: { id },
      select: { id: true }, // Only select id to check existence
    });

    if (!existingRule) {
      console.error(`Discount rule with ID ${id} not found.`);
      return { success: false, message: "Discount rule not found." };
    }

    // Perform the update to toggle the isActive status
    await prisma.discountRule.update({
      where: { id: id },
      data: {
        isActive: !currentStatus, // Set to the opposite of the current status
      },
    });

    // Revalidate the path where discounts are displayed/managed
    revalidatePath("/customize"); // Adjust this path if needed

    const newMessage = `Discount rule ${!currentStatus ? "activated" : "deactivated"} successfully.`;
    console.log(newMessage);
    return { success: true, message: newMessage };
  } catch (error: any) {
    console.error(`Error toggling discount rule status for ID ${id}:`, error);
    // Provide a generic error message for database issues
    return {
      success: false,
      message: "Database error updating discount status. Please try again.",
    };
  }
}
export async function createDiscountRuleAction(formData: FormData) {
  const rawData = {
    description: formData.get("description") as string | null, // Cast for Zod if needed
    discountType: formData.get("discountType") as DiscountType, // Cast for Zod
    discountValue: formData.get("discountValue") as string, // Keep as string for Zod preprocess
    startDate: formData.get("startDate") as string,
    endDate: formData.get("endDate") as string,
    applyTo: formData.get("applyTo") as "all" | "specific", // Cast for Zod
    serviceIds: formData.getAll("serviceIds") as string[],
  };

  const validation = DiscountRuleSchema.safeParse(rawData);

  if (!validation.success) {
    console.error(
      "Discount Validation Failed:",
      validation.error.flatten().fieldErrors,
    );
    return {
      success: false,
      message: "Validation failed. Please check the form.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const {
    discountType,
    discountValue,
    startDate: rawPhtStartDateString, // "YYYY-MM-DD" from form, representing PHT day
    endDate: rawPhtEndDateString, // "YYYY-MM-DD" from form, representing PHT day
    applyTo,
    serviceIds,
    description,
  } = validation.data;

  try {
    // --- CRITICAL: Convert PHT day strings to PHT-aware UTC Date objects ---
    const [startYear, startMonth, startDay] = rawPhtStartDateString
      .split("-")
      .map(Number);
    // UTC timestamp that corresponds to PHT midnight on the start day
    const startDateUTC = new Date(
      Date.UTC(startYear, startMonth - 1, startDay) -
        PHT_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000,
    );

    const [endYear, endMonth, endDay] = rawPhtEndDateString
      .split("-")
      .map(Number);
    // UTC timestamp that corresponds to PHT end-of-day (inclusive) on the end day
    const endOfDayPHTinUTCms =
      Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999) -
      PHT_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
    const endDateUTC = new Date(endOfDayPHTinUTCms);
    // --- End Date Conversion ---

    console.log("[Server Action] createDiscountRule:");
    console.log("  Raw PHT Start Date (from form):", rawPhtStartDateString);
    console.log(
      "  Converted Start Date (UTC for DB):",
      startDateUTC.toISOString(),
    );
    console.log("  Raw PHT End Date (from form):", rawPhtEndDateString);
    console.log(
      "  Converted End Date (UTC for DB, inclusive end):",
      endDateUTC.toISOString(),
    );

    const createData: {
      description?: string | null;
      discountType: DiscountType;
      discountValue: number;
      startDate: Date; // Will be the PHT-aware UTC Date
      endDate: Date; // Will be the PHT-aware UTC Date
      isActive: boolean;
      applyToAll: boolean;
      services?: { connect: { id: string }[] };
    } = {
      description: description ?? null, // Use validated description
      discountType,
      discountValue,
      startDate: startDateUTC, // Use the converted UTC date
      endDate: endDateUTC, // Use the converted UTC date
      isActive: true,
      applyToAll: applyTo === "all",
    };

    if (applyTo === "specific" && serviceIds && serviceIds.length > 0) {
      createData.services = { connect: serviceIds.map((id) => ({ id })) };
    }

    await prisma.discountRule.create({ data: createData });

    revalidatePath("/customize"); // Or your relevant path
    return { success: true, message: "Discount rule created successfully." };
  } catch (error: any) {
    console.error("Error creating discount rule in Prisma:", error);
    let message = "Failed to create discount rule due to a server error.";
    if (error.code === "P2002") {
      // Example: Handle unique constraint violation
      message =
        "A discount rule with similar unique properties already exists.";
    }
    return {
      success: false,
      message: message,
      // Optionally, you can try to map Prisma errors to specific fields if appropriate
      // errors: { general: [message] }
    };
  }
}
// --- Action to FETCH Active/Inactive Discount Rules ---
export async function getDiscountRules(): Promise<
  UIDiscountRuleWithServices[]
> {
  console.log("Fetching all discount rules...");
  try {
    const rulesFromDb = await prisma.discountRule.findMany({
      orderBy: { startDate: "desc" }, // Or any other preferred order
      include: {
        services: { select: { id: true, title: true } },
      },
    });

    // --- Convert Dates to ISO Strings before returning ---
    const rulesWithIsoDates = rulesFromDb.map((rule) => ({
      ...rule,
      // Convert each date field to ISO string format
      startDate: rule.startDate.toISOString(),
      endDate: rule.endDate.toISOString(),
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      // Ensure services array exists
      services: rule.services || [],
    }));

    // Now the structure matches UIDiscountRuleWithServices (with string dates)
    return rulesWithIsoDates;
  } catch (error) {
    console.error("Error fetching all discount rules:", error);
    return []; // Return empty array on error
  }
}

export async function getActiveDiscountRules(): Promise<
  UIDiscountRuleWithServices[]
> {
  const now = new Date();
  console.log(
    "Fetching active discount rules effective now:",
    now.toISOString(),
  );
  try {
    const rulesFromDb = await prisma.discountRule.findMany({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      orderBy: [{ discountValue: "desc" }, { createdAt: "desc" }],
      include: { services: { select: { id: true, title: true } } },
    });
    console.log(`Found ${rulesFromDb.length} active discount rules.`);
    // --- Convert Dates to ISO Strings ---
    const rulesWithIsoDates = rulesFromDb.map((rule) => ({
      ...rule,
      startDate: rule.startDate.toISOString(),
      endDate: rule.endDate.toISOString(),
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
      services: rule.services || [],
    }));
    return rulesWithIsoDates;
  } catch (error) {
    /* ... error handling ... */ return [];
  }
}
// --- Action to DELETE Discount Rule (Use with caution) ---
export async function deleteDiscountRuleAction(id: string) {
  try {
    // Need to disconnect relations before deleting if using implicit many-to-many
    await prisma.discountRule.update({
      where: { id },
      data: {
        services: { set: [] }, // Disconnect all services first
      },
    });
    await prisma.discountRule.delete({ where: { id } });

    revalidatePath("/customize");
    return { success: true, message: "Discount rule deleted." };
  } catch (error) {
    console.error("Error deleting discount rule:", error);
    return {
      success: false,
      message: "Database error deleting discount rule.",
    };
  }
}

export async function getEmployeesForAttendanceAction(): Promise<
  EmployeeForAttendance[]
> {
  console.log("Server Action: getEmployeesForAttendanceAction executing...");
  try {
    const startOfTargetDayUtc = getStartOfTodayTargetTimezoneUtc();

    console.log(
      `Server Action: Fetching employees and attendance for the date (UTC representation of target day): ${startOfTargetDayUtc.toISOString()}`,
    );

    const accounts = await prisma.account.findMany({
      where: {
        // This filter ensures that accounts where the 'role' array contains 'OWNER' are excluded.
        NOT: {
          role: {
            has: Role.OWNER,
          },
        },
      },
      select: {
        id: true,
        name: true,
        dailyRate: true,
        branch: {
          select: { title: true },
        },
        attendances: {
          where: {
            date: startOfTargetDayUtc,
          },
          select: {
            id: true,
            date: true,
            isPresent: true,
            notes: true,
            checkedById: true,
            checkedAt: true,
          },
          take: 1,
        },
        payslips: {
          where: {
            status: "RELEASED", // Assuming 'RELEASED' is a valid PayslipStatus enum member
          },
          orderBy: {
            periodEndDate: "desc",
          },
          select: {
            periodEndDate: true,
          },
          take: 1,
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    console.log(
      `Server Action: Fetched ${accounts.length} accounts (excluding OWNERS).`,
    );

    const employeesWithAttendance: EmployeeForAttendance[] = accounts.map(
      (acc) => ({
        id: acc.id,
        name: acc.name,
        dailyRate: acc.dailyRate ?? 0, // Use nullish coalescing for safety
        branchTitle: acc.branch?.title ?? null,
        todaysAttendance:
          acc.attendances.length > 0 ? acc.attendances[0] : null,
        lastPayslipEndDate:
          acc.payslips.length > 0 ? acc.payslips[0].periodEndDate : null,
      }),
    );

    return employeesWithAttendance;
  } catch (error: any) {
    console.error(
      "Server Action Error [getEmployeesForAttendanceAction]:",
      error,
    );
    // Re-throw a generic error for security and to be handled by the caller
    throw new Error("Failed to fetch employees for attendance.");
  }
}

export async function markAttendanceAction(
  accountId: string,
  isPresent: boolean,
  notes: string | null,
  checkerId: string,
): Promise<{
  success: boolean;
  message: string;
  updatedSalary?: number;
  // === NEW: Return the updated attendance record for client-side granular update ===
  updatedAttendance?: { id: string; isPresent: boolean; notes: string | null }; // Or whatever shape ServerTodaysAttendance is
  // === END NEW ===
}> {
  const checkTimestampUtc = new Date();

  console.log(
    `[Server Action] markAttendanceAction called for Account ${accountId}, isPresent: ${isPresent}, by Checker: ${checkerId} at UTC: ${checkTimestampUtc.toISOString()}`,
  );

  if (!accountId || !checkerId) {
    console.error(
      `[Server Action Error] Missing required IDs. accountId: ${accountId}, checkerId: ${checkerId}`,
    );
    return {
      success: false,
      message: "Account ID and Checker ID are required.",
    };
  }

  try {
    const attendanceDateForRecord = getStartOfTodayTargetTimezoneUtc();

    console.log(
      `[Server Action] Using date ${attendanceDateForRecord.toISOString().split("T")[0]} for attendance.`,
    );

    // --- Transaction with increased timeout ---
    const result = await prisma.$transaction(
      async (tx) => {
        const account = await tx.account.findUnique({
          where: { id: accountId },
          select: {
            id: true,
            dailyRate: true,
            salary: true,
            payslips: {
              where: { status: "RELEASED" },
              orderBy: { periodEndDate: "desc" },
              select: { periodEndDate: true },
              take: 1,
            },
          },
        });

        if (!account) {
          throw new Error(`Account with ID ${accountId} not found.`);
        }

        const dailyRate = account.dailyRate ?? 0;
        const currentSalary = account.salary ?? 0;
        const lastPayslipEndDate =
          account.payslips.length > 0
            ? account.payslips[0].periodEndDate
            : null;

        const existingAttendance = await tx.attendance.findUnique({
          where: {
            date_accountId: {
              date: attendanceDateForRecord,
              accountId,
            },
          },
          select: { isPresent: true, id: true }, // Select id to return if needed
        });

        const wasPreviouslyPresent = existingAttendance?.isPresent ?? null;
        let salaryChange = 0;
        let preventSalaryDecrease = false;

        if (
          lastPayslipEndDate !== null &&
          attendanceDateForRecord.getTime() <= lastPayslipEndDate.getTime()
        ) {
          preventSalaryDecrease = true;
        }

        if (
          isPresent === true &&
          (wasPreviouslyPresent === null || wasPreviouslyPresent === false)
        ) {
          salaryChange = dailyRate;
        } else if (isPresent === false && wasPreviouslyPresent === true) {
          if (!preventSalaryDecrease) {
            salaryChange = -dailyRate;
          }
        }

        let finalNewSalary = currentSalary;
        if (salaryChange !== 0) {
          const potentialNewSalary = currentSalary + salaryChange;
          if (salaryChange > 0) {
            finalNewSalary = potentialNewSalary;
          } else {
            if (!preventSalaryDecrease) {
              finalNewSalary = Math.max(0, potentialNewSalary);
            }
          }
        }

        const attendanceDataForUpsert = {
          date: attendanceDateForRecord,
          accountId,
          isPresent,
          notes,
          checkedById: checkerId,
          checkedAt: checkTimestampUtc,
        };

        const upsertedAttendance = await tx.attendance.upsert({
          where: {
            date_accountId: {
              date: attendanceDateForRecord,
              accountId,
            },
          },
          create: attendanceDataForUpsert,
          update: {
            isPresent: isPresent,
            // notes: notes, // Consider if notes should always update or only on creation/if different
            checkedById: checkerId,
            checkedAt: checkTimestampUtc,
          },
          select: { id: true, isPresent: true, notes: true }, // Select fields for return
        });

        if (salaryChange !== 0) {
          await tx.account.update({
            where: { id: accountId },
            data: { salary: finalNewSalary },
          });
          console.log(
            `[Server Action] Account salary updated to ${finalNewSalary}.`,
          );
        }

        return {
          success: true,
          message:
            `Attendance marked successfully for ${attendanceDateForRecord.toISOString().split("T")[0]}.` +
            (preventSalaryDecrease && !isPresent
              ? " (Salary not decreased as day is in last payslip period)."
              : ""),
          updatedSalary: salaryChange !== 0 ? finalNewSalary : undefined,
          // === NEW: Return the relevant parts of the upserted attendance record ===
          updatedAttendance: {
            id: upsertedAttendance.id,
            isPresent: upsertedAttendance.isPresent,
            notes: upsertedAttendance.notes, // This will be the new notes value
          },
          // === END NEW ===
        };
      },
      {
        maxWait: 10000, // Max time Prisma Client waits to acquire a connection from the pool (default 2000ms)
        timeout: 10000, // Max time the transaction can run (default 5000ms) - INCREASE THIS
      },
    );

    revalidatePath(`/dashboard`); // Revalidate a general path
    if (accountId) {
      revalidatePath(`/account/${accountId}`); // Specific account if applicable
    }

    return result;
  } catch (error: any) {
    console.error("[Server Action Error] Failed to mark attendance:", error);
    let dateStringForError = "the current date";
    try {
      const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TARGET_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      dateStringForError = formatter.format(checkTimestampUtc);
    } catch (formatError) {
      dateStringForError =
        checkTimestampUtc.toISOString().split("T")[0] + " (UTC)";
    }

    return {
      success: false,
      message: `Failed to mark attendance for ${dateStringForError}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
export async function requestPayslipGeneration(
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
): Promise<{
  success: boolean;
  message: string;
  payslipId?: string;
  status?: PayslipStatus;
}> {
  if (!accountId || !periodStartDate || !periodEndDate) {
    return {
      success: false,
      message: "Missing required account ID or period dates.",
    };
  }
  // Basic date validation
  if (
    !(periodStartDate instanceof Date) ||
    isNaN(periodStartDate.getTime()) ||
    !(periodEndDate instanceof Date) ||
    isNaN(periodEndDate.getTime())
  ) {
    return { success: false, message: "Invalid date format provided." };
  }

  console.log(
    `SERVER ACTION: Payslip request for ${accountId} from ${periodStartDate.toISOString().split("T")[0]} to ${periodEndDate.toISOString().split("T")[0]}`,
  );

  try {
    // 1. Check if a payslip already exists
    const existingPayslip = await prisma.payslip.findUnique({
      where: {
        accountId_periodStartDate_periodEndDate: {
          accountId,
          periodStartDate,
          periodEndDate,
        },
      },
      select: { id: true, status: true },
    });

    if (existingPayslip) {
      console.log(
        `Payslip already exists (ID: ${existingPayslip.id}, Status: ${existingPayslip.status})`,
      );
      // Use existing status to provide accurate feedback
      const statusMessage =
        existingPayslip.status === PayslipStatus.PENDING
          ? "requested and pending processing"
          : "already generated/released";
      return {
        success: true, // Technically not an error, just informing
        message: `Payslip for this period has already been ${statusMessage}.`,
        payslipId: existingPayslip.id,
        status: existingPayslip.status,
      };
    }

    // 2. Calculate Salary Components (REPLACE PLACEHOLDERS)
    // --- Base Salary Calculation ---
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { dailyRate: true },
    });
    if (!account) throw new Error("Employee account not found.");

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId: accountId,
        date: { gte: periodStartDate, lte: periodEndDate },
        isPresent: true,
      },
      select: { date: true }, // Only need dates to count
    });
    // Simple count for this example, refine if needed (e.g., based on work schedule)
    const presentDaysCount = attendanceRecords.length;
    const baseSalary = (account.dailyRate || 0) * presentDaysCount; // Assumes dailyRate is in smallest unit

    // --- Commission Calculation ---
    const availedServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId, // Commission for services SERVED by this account
        status: "DONE", // Only count completed services
        completedAt: {
          // Ensure completion date is within the period
          gte: periodStartDate,
          lte: periodEndDate, // Check end date inclusively if needed
        },
        // Add transaction date filter if commission is based on transaction date instead of completion date
        // transaction: {
        //    createdAt: { gte: periodStartDate, lte: periodEndDate }
        // }
      },
      select: { commissionValue: true }, // Select pre-calculated commission
    });
    const totalCommissions = availedServices.reduce(
      (sum, service) => sum + (service.commissionValue || 0),
      0,
    );

    // TODO: Implement fetching/calculation for deductions and bonuses if applicable
    const totalDeductions = 0; // Placeholder
    const totalBonuses = 0; // Placeholder

    // Calculate Net Pay
    const netPay =
      baseSalary + totalCommissions + totalBonuses - totalDeductions;

    // 3. Create the new Payslip record
    const newPayslip = await prisma.payslip.create({
      data: {
        accountId,
        periodStartDate,
        periodEndDate,
        baseSalary, // Use calculated value
        totalCommissions, // Use calculated value
        totalDeductions, // Use calculated value
        totalBonuses, // Use calculated value
        netPay, // Use calculated value
        status: PayslipStatus.PENDING, // Initial status
      },
    });

    console.log(
      `SERVER ACTION: Created new PENDING payslip (ID: ${newPayslip.id})`,
    );

    // Optional: Revalidate paths where admins view pending payslips
    // revalidatePath('/admin/payroll'); // Example

    return {
      success: true,
      message: "Payslip requested successfully! It's now pending processing.",
      payslipId: newPayslip.id,
      status: newPayslip.status, // Return the PENDING status
    };
  } catch (error: any) {
    console.error("Error requesting payslip generation:", error);
    // Return a generic error or a more specific one if possible
    return {
      success: false,
      message: `Failed to request payslip: ${error.message || "An unexpected error occurred."}`,
    };
  }
}

/* export async function getPayslips(
  filterStatus: string | null,
): Promise<PayslipData[]> {
  console.log("SERVER ACTION: Fetching payslips with filter:", filterStatus);
  try {
    const whereClause: Prisma.PayslipWhereInput = {};
    if (filterStatus && filterStatus !== "ALL") {
      if (
        Object.values(PayslipStatus).includes(filterStatus as PayslipStatus)
      ) {
        whereClause.status = filterStatus as PayslipStatus;
      } else {
        console.warn(`Invalid filter status: ${filterStatus}. Fetching all.`);
      }
    }

    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      include: {
        account: {
          // Include ALL fields needed for the AccountData type within PayslipData
          select: {
            id: true,
            name: true,
            role: true,
            salary: true,
            dailyRate: true,
          }, // <-- Added role, salary
        },
      },
      orderBy: [
        { status: "asc" },
        { periodEndDate: "desc" },
        { account: { name: "asc" } },
      ],
    });

    // Map Prisma result to PayslipData type
    const payslipDataList: PayslipData[] = payslips.map((p) => ({
      id: p.id,
      employeeId: p.accountId,
      employeeName: p.account.name,
      periodStartDate: p.periodStartDate,
      periodEndDate: p.periodEndDate,
      baseSalary: p.baseSalary,
      totalCommissions: p.totalCommissions,
      totalDeductions: p.totalDeductions,
      totalBonuses: p.totalBonuses,
      netPay: p.netPay,
      status: p.status,
      releasedDate: p.releasedDate,
      // Construct the nested accountData including role and salary
      accountData: {
        id: p.account.id,
        name: p.account.name,
        role: p.account.role, // <-- Include role
        salary: p.account.salary, // <-- Include salary
        dailyRate: p.account.dailyRate,
      },
    }));
    // This mapping now satisfies the PayslipData type, including the nested AccountData

    return payslipDataList;
  } catch (error) {
    console.error("Error fetching payslips:", error);
    throw new Error("Failed to fetch payslips.");
  }
} */

export async function getPayslips(
  filterStatus: string | null,
): Promise<PayslipData[]> {
  console.log("SERVER ACTION: Fetching payslips with filter:", filterStatus);
  try {
    const whereClause: Prisma.PayslipWhereInput = {};
    if (filterStatus && filterStatus !== "ALL") {
      // Ensure filterStatus is a valid PayslipStatus enum value before using it
      if (
        Object.values(PayslipStatus).includes(filterStatus as PayslipStatus)
      ) {
        whereClause.status = filterStatus as PayslipStatus;
      } else {
        console.warn(`Invalid filter status: ${filterStatus}. Fetching all.`);
        // Optionally, throw an error or return an empty array for invalid input
        // throw new Error(`Invalid filter status: ${filterStatus}`);
      }
    }

    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      include: {
        account: {
          // *** FIX START: Include missing fields from AccountData ***
          select: {
            id: true,
            name: true,
            role: true,
            salary: true,
            dailyRate: true,
            email: true, // Add email
            branchId: true, // Add branchId
            canRequestPayslip: true, // Add canRequestPayslip
          },
          // *** FIX END ***
        },
      },
      orderBy: [
        { status: "asc" },
        { periodEndDate: "desc" },
        { account: { name: "asc" } },
      ],
    });

    // Map Prisma result to PayslipData type
    const payslipDataList: PayslipData[] = payslips.map((p) => ({
      id: p.id,
      employeeId: p.accountId, // Assuming Prisma model uses accountId
      employeeName: p.account.name, // Access from included account
      periodStartDate: p.periodStartDate,
      periodEndDate: p.periodEndDate,
      baseSalary: p.baseSalary,
      totalCommissions: p.totalCommissions,
      totalDeductions: p.totalDeductions,
      totalBonuses: p.totalBonuses,
      netPay: p.netPay,
      status: p.status,
      releasedDate: p.releasedDate,
      // *** FIX START: Construct the nested accountData including all fields from AccountData type ***
      accountData: {
        id: p.account.id,
        name: p.account.name,
        role: p.account.role,
        salary: p.account.salary,
        dailyRate: p.account.dailyRate,
        email: p.account.email, // Include email
        branchId: p.account.branchId, // Include branchId
        canRequestPayslip: p.account.canRequestPayslip, // Include canRequestPayslip
      },
      // *** FIX END ***
    }));

    console.log(
      `SERVER ACTION: Successfully fetched ${payslipDataList.length} payslips.`,
    );
    return payslipDataList;
  } catch (error) {
    console.error("Error fetching payslips:", error);
    // Re-throw or return a specific error response depending on your pattern
    throw new Error("Failed to fetch payslips.");
  }
}

export async function approvePayslipRequest(
  requestId: string,
  adminAccountId: string, // Pass the ID of the admin performing the action
): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log(
    `[ServerAction] Approving Payslip Request ID: ${requestId} by Admin ID: ${adminAccountId}`,
  );

  // --- Authorization Check ---
  // Verify adminAccountId has OWNER role
  const adminAccount = await prisma.account.findUnique({
    where: { id: adminAccountId },
    select: { role: true },
  });
  if (!adminAccount || !adminAccount.role.includes(Role.OWNER)) {
    console.warn(
      `[ServerAction] Unauthorized attempt to approve request ${requestId} by non-owner ${adminAccountId}`,
    );
    return { success: false, error: "Unauthorized action." };
  }
  // ---

  try {
    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Find the request, ensure it's PENDING
      const request = await tx.payslipRequest.findUnique({
        where: { id: requestId },
      });

      if (!request) throw new Error("Payslip request not found.");
      if (request.status !== PayslipRequestStatus.PENDING) {
        throw new Error(
          `Request is not pending (Status: ${request.status}). Cannot approve.`,
        );
      }

      // 2. Generate the payslip data
      console.log(
        `[ServerAction] Generating payslip data for request ${requestId} (Account: ${request.accountId})...`,
      );
      const payslipInputData = await generatePayslipData(
        request.accountId,
        request.periodStartDate,
        request.periodEndDate,
      );
      if (!payslipInputData)
        throw new Error("Failed to generate payslip data.");
      console.log(`[ServerAction] Payslip data generated.`);

      // 3. Create the actual Payslip record
      console.log(`[ServerAction] Creating PENDING Payslip record...`);
      const newPayslip = await tx.payslip.create({
        data: {
          accountId: request.accountId,
          periodStartDate: request.periodStartDate,
          periodEndDate: request.periodEndDate,
          baseSalary: payslipInputData.baseSalary,
          totalCommissions: payslipInputData.totalCommissions,
          totalDeductions: payslipInputData.totalDeductions,
          totalBonuses: payslipInputData.totalBonuses,
          netPay: payslipInputData.netPay,
          status: PayslipStatus.PENDING, // Create as PENDING, release is separate
          // Link it to the request
          payslipRequest: { connect: { id: requestId } },
        },
      });
      console.log(
        `[ServerAction] PENDING Payslip created (ID: ${newPayslip.id}).`,
      );

      // 4. Update the PayslipRequest status
      console.log(
        `[ServerAction] Updating PayslipRequest ${requestId} status to PROCESSED...`,
      );
      await tx.payslipRequest.update({
        where: { id: requestId },
        data: {
          status: PayslipRequestStatus.PROCESSED, // Mark as processed
          processedById: adminAccountId,
          processedTimestamp: new Date(),
          relatedPayslipId: newPayslip.id, // Link to the created payslip
        },
      });
      console.log(`[ServerAction] PayslipRequest ${requestId} updated.`);

      return { payslipId: newPayslip.id }; // Return ID of created payslip
    }); // End transaction

    console.log(
      `[ServerAction] Payslip Request ${requestId} approved and processed successfully. New Payslip ID: ${result.payslipId}`,
    );
    return {
      success: true,
      message: "Request approved and pending payslip generated.",
    };
  } catch (error: any) {
    console.error(
      `[ServerAction] Error approving payslip request ${requestId}:`,
      error,
    );
    return {
      success: false,
      error: error.message || "Failed to approve payslip request.",
    };
  }
}

export async function rejectPayslipRequest(
  requestId: string,
  adminAccountId: string, // Pass the ID of the admin performing the action
  reason?: string, // Optional reason for rejection
): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log(
    `[ServerAction] Rejecting Payslip Request ID: ${requestId} by Admin ID: ${adminAccountId}`,
  );

  // --- Authorization Check ---
  const adminAccount = await prisma.account.findUnique({
    where: { id: adminAccountId },
    select: { role: true },
  });
  if (!adminAccount || !adminAccount.role.includes(Role.OWNER)) {
    console.warn(
      `[ServerAction] Unauthorized attempt to reject request ${requestId} by non-owner ${adminAccountId}`,
    );
    return { success: false, error: "Unauthorized action." };
  }
  // ---

  try {
    // 1. Find the request, ensure it's PENDING
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true }, // Select only needed fields
    });

    if (!request) throw new Error("Payslip request not found.");
    if (request.status !== PayslipRequestStatus.PENDING) {
      throw new Error(
        `Request is not pending (Status: ${request.status}). Cannot reject.`,
      );
    }

    // 2. Update the PayslipRequest status
    await prisma.payslipRequest.update({
      where: { id: requestId },
      data: {
        status: PayslipRequestStatus.REJECTED, // Mark as rejected
        processedById: adminAccountId,
        processedTimestamp: new Date(),
        notes: reason || "Rejected by administrator.", // Add rejection reason if provided
      },
    });

    console.log(
      `[ServerAction] Payslip Request ${requestId} rejected successfully.`,
    );
    // Optionally notify the employee who requested it
    return { success: true, message: "Payslip request rejected." };
  } catch (error: any) {
    console.error(
      `[ServerAction] Error rejecting payslip request ${requestId}:`,
      error,
    );
    return {
      success: false,
      error: error.message || "Failed to reject payslip request.",
    };
  }
}

export async function getPayslipRequests(
  statusFilter: string = "PENDING", // Default to PENDING
): Promise<PayslipRequestData[]> {
  console.log(
    `[ServerAction] Fetching payslip requests with status: ${statusFilter}`,
  );
  try {
    const whereClause: any = {};
    if (statusFilter !== "ALL") {
      // Validate the status filter against the enum
      if (
        Object.values(PayslipRequestStatus).includes(
          statusFilter as PayslipRequestStatus,
        )
      ) {
        whereClause.status = statusFilter as PayslipRequestStatus;
      } else {
        console.warn(
          `[ServerAction] Invalid status filter ignored: ${statusFilter}. Fetching PENDING.`,
        );
        whereClause.status = PayslipRequestStatus.PENDING; // Default fallback
      }
    }

    const requests = await prisma.payslipRequest.findMany({
      where: whereClause,
      include: {
        account: {
          // Include requester info
          select: {
            id: true,
            name: true,
            // Add other fields if needed by PayslipRequestData
          },
        },
        // Optionally include processedBy if needed later
      },
      orderBy: {
        requestTimestamp: "asc", // Show oldest requests first
      },
    });

    console.log(`[ServerAction] Found ${requests.length} payslip requests.`);
    // Map to the PayslipRequestData type
    return requests.map((req) => ({
      id: req.id,
      accountId: req.accountId,
      employeeName: req.account.name, // Get name from included relation
      requestTimestamp: req.requestTimestamp,
      periodStartDate: req.periodStartDate,
      periodEndDate: req.periodEndDate,
      status: req.status,
      notes: req.notes,
      // Add other fields as needed for PayslipRequestData type
    }));
  } catch (error: any) {
    console.error("[ServerAction] Error fetching payslip requests:", error);
    throw new Error("Failed to load payslip requests.");
  }
}

/* export async function getPayslips(
  filterStatus: string | null,
): Promise<PayslipData[]> {
  console.log("SERVER ACTION: Fetching payslips with filter:", filterStatus);
  try {
    const whereClause: any = {};
    if (filterStatus && filterStatus !== "ALL") {
      // Ensure filterStatus matches your enum values (PENDING, RELEASED)
      if (
        Object.values(PayslipStatus).includes(filterStatus as PayslipStatus)
      ) {
        whereClause.status = filterStatus as PayslipStatus;
      } else {
        console.warn(
          `Invalid filter status received: ${filterStatus}. Fetching all.`,
        );
      }
    }

    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      include: {
        account: {
          // Include employee name
          select: { name: true },
        },
        // Add include for breakdown items if you store them related to Payslip
        // OR fetch/calculate breakdown separately if needed inside the modal
      },
      orderBy: [
        { periodEndDate: "desc" }, // Example ordering
        { account: { name: "asc" } },
      ],
    });

    // Map Prisma result to your PayslipData type
    const payslipDataList: PayslipData[] = payslips.map((p) => ({
      id: p.id,
      employeeId: p.accountId,
      employeeName: p.account.name, // Get name from related account
      periodStartDate: p.periodStartDate,
      periodEndDate: p.periodEndDate,
      baseSalary: p.baseSalary,
      totalCommissions: p.totalCommissions,
      totalDeductions: p.totalDeductions,
      totalBonuses: p.totalBonuses,
      netPay: p.netPay,
      status: p.status,
      releasedDate: p.releasedDate,
      // breakdownItems: [], // Populate this if needed/fetched
    }));

    return payslipDataList;
  } catch (error) {
    console.error("Error fetching payslips:", error);
    throw new Error("Failed to fetch payslips."); // Throw error for client handling
  }
} */

export async function getPayslipStatusForPeriod(
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
): Promise<PayslipStatusOption> {
  // Use the specific type defined in lib/Types.ts
  if (
    !accountId ||
    !periodStartDate ||
    !periodEndDate ||
    !(periodStartDate instanceof Date) ||
    isNaN(periodStartDate.getTime()) ||
    !(periodEndDate instanceof Date) ||
    isNaN(periodEndDate.getTime())
  ) {
    console.warn("getPayslipStatusForPeriod: Invalid input provided.");
    return null; // Indicate error or invalid input
  }

  try {
    const payslip = await prisma.payslip.findUnique({
      where: {
        accountId_periodStartDate_periodEndDate: {
          accountId,
          periodStartDate,
          periodEndDate,
        },
      },
      select: { status: true },
    });
    // If payslip exists, return its status, otherwise return 'NOT_FOUND'
    return payslip?.status ?? "NOT_FOUND";
  } catch (error: any) {
    console.error("Error fetching payslip status:", error);
    return null; // Indicate error fetching status
  }
}

export async function releaseSalary(
  payslipId: string,
  adminAccountId: string, // ID of the admin/user performing the release
): Promise<void> {
  console.log(
    `SERVER ACTION: Releasing salary for payslip ID: ${payslipId} by admin: ${adminAccountId}`,
  );
  if (!payslipId) {
    throw new Error("Payslip ID is required.");
  }
  if (!adminAccountId) {
    throw new Error("Admin account ID performing the release is required.");
  }

  try {
    await prisma.$transaction(async (tx) => {
      const payslip = await tx.payslip.findUnique({
        where: { id: payslipId },
        select: {
          status: true,
          accountId: true,
          netPay: true, // Needed for Expense amount
          periodStartDate: true, // For Expense description
          periodEndDate: true, // For Expense description
          account: {
            // To get employee's name and branch for Expense
            select: {
              name: true,
              branchId: true,
            },
          },
        },
      });

      if (!payslip) {
        throw new Error("Payslip not found.");
      }
      if (!payslip.account) {
        // Should not happen if DB constraints are fine, but good to check
        throw new Error(
          `Account details for payslip ${payslipId} could not be found.`,
        );
      }
      if (payslip.status !== PayslipStatus.PENDING) {
        throw new Error("Payslip is not in PENDING status.");
      }

      // 1. Update Payslip status
      await tx.payslip.update({
        where: { id: payslipId },
        data: { status: PayslipStatus.RELEASED, releasedDate: new Date() },
      });

      // 2. Update Account (e.g., reset accumulated salary if that's your logic)
      // Your original code resets 'salary'. Ensure this field name 'salary' on Account model is intended for this purpose.
      await tx.account.update({
        where: { id: payslip.accountId },
        data: { salary: 0 }, // Resetting the 'salary' field on the Account model
      });

      // 3. Create an Expense record for this salary release
      const expenseDescription = `Salary payment for ${payslip.account.name} (Acct: ${payslip.accountId}) for period ${payslip.periodStartDate.toISOString().split("T")[0]} to ${payslip.periodEndDate.toISOString().split("T")[0]}. Payslip ID: ${payslipId}.`;

      await tx.expense.create({
        data: {
          date: new Date(), // The current date for the expense; @db.Date will store YYYY-MM-DD
          amount: payslip.netPay, // The net pay from the payslip
          category: ExpenseCategory.SALARIES, // Fixed category for salary expenses
          description: expenseDescription,
          recordedById: adminAccountId, // ID of the admin/user who released the salary
          branchId: payslip.account.branchId, // Associate with the employee's branch, if any
          // createdAt and updatedAt are handled by @default(now()) and @updatedAt
        },
      });

      console.log(
        `SERVER ACTION: Successfully released payslip ${payslipId}, reset salary for account ${payslip.accountId}, and created salary expense record.`,
      );
    });

    // Revalidate paths if necessary.
    // Consider if you need to revalidate paths related to expenses as well.
    // Example: revalidatePath("/dashboard/expenses");
    revalidatePath("/dashboard/[accountID]/manage"); // Existing revalidation
    // Potentially add revalidatePath for a general expenses view if you have one.
    // revalidatePath("/admin/expenses");
  } catch (error: any) {
    console.error(
      `Error releasing salary for ${payslipId} by admin ${adminAccountId}:`,
      error,
    );
    if (error.message.includes("PENDING status")) {
      throw new Error(
        "Cannot release: Payslip is already released or in an unexpected state.",
      );
    } else if (error.message.includes("not found")) {
      // This could be payslip not found or account not found during update.
      throw new Error(
        "Cannot release: Payslip or related Account record not found.",
      );
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025" // "An operation failed because it depends on one or more records that were required but not found."
    ) {
      // This error code is more specific for "record not found" during operations like update/delete.
      throw new Error(
        "Cannot release: A required record (Payslip or Account) was not found during the update.",
      );
    }
    // Fallback for other errors
    throw new Error(`Failed to release salary: ${getErrorMessage(error)}`);
  }
}

export async function getTransactionsAction(
  filters: GetTransactionsFilters = {},
): Promise<ServerActionResponse<TransactionForManagement[]>> {
  try {
    const whereClause: any = {};

    if (filters.startDate) {
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        gte: new Date(filters.startDate),
      };
    }
    if (filters.endDate) {
      const endOfDay = new Date(filters.endDate);
      endOfDay.setDate(endOfDay.getDate() + 1);
      whereClause.createdAt = {
        ...(whereClause.createdAt || {}),
        lt: endOfDay,
      };
    }
    if (filters.status) {
      whereClause.status = filters.status;
    }

    const transactions = await prisma.transaction.findMany({
      where: whereClause,
      include: {
        customer: { select: { name: true, email: true } },
        // Removed: branch: { select: { title: true } },
        voucherUsed: { select: { code: true } },
        availedServices: {
          include: {
            service: { select: { title: true } },
            servedBy: { select: { name: true } },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const typedTransactions: TransactionForManagement[] = transactions as any;

    return { success: true, data: typedTransactions };
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

export async function cancelTransactionAction(
  transactionId: string,
): Promise<ServerActionResponse> {
  if (!transactionId) {
    return { success: false, message: "Transaction ID is required." };
  }
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      select: { status: true },
    });

    if (!transaction) {
      return { success: false, message: "Transaction not found." };
    }
    if (
      transaction.status === Status.CANCELLED ||
      transaction.status === Status.DONE
    ) {
      return {
        success: false,
        message: `Transaction is already ${transaction.status.toLowerCase()}.`,
      };
    }
    await prisma.transaction.update({
      where: { id: transactionId },
      data: { status: Status.CANCELLED },
    });
    revalidatePath("/dashboard");
    return { success: true, message: "Transaction cancelled successfully." };
  } catch (error) {
    console.error("Error cancelling transaction:", error);
    return { success: false, message: getErrorMessage(error) };
  }
}

/* export async function getCommissionBreakdownForPeriod(
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<SalaryBreakdownItem[]> {
  console.log(
    `[getCommissionBreakdownForPeriod] Fetching for ${accountId} from ${startDate} to ${endDate}`,
  );
  const inclusiveEndDate = endOfDay(endDate); // Use endOfDay for commission check
  const items = await prisma.availedService.findMany({
    where: {
      servedById: accountId,
      status: Status.DONE, // Assuming Status enum is imported
      completedAt: {
        gte: startDate,
        lte: inclusiveEndDate, // Use inclusive end date
      },
      commissionValue: { gt: 0 },
    },
    // Include necessary fields for SalaryBreakdownItem type
    select: {
      id: true,
      commissionValue: true,
      service: { select: { title: true } },
      transaction: {
        select: { customer: { select: { name: true } }, createdAt: true },
      },
      originatingSetTitle: true,
      completedAt: true, // Include completedAt if needed by SalaryBreakdownItem
      // Map fields correctly below
    },
  });
  // Map to SalaryBreakdownItem type
  return items.map((item) => ({
    id: item.id,
    commissionEarned: item.commissionValue ?? 0,
    serviceTitle: item.service?.title ?? "Unknown Service",
    customerName: item.transaction?.customer?.name ?? "N/A",
    transactionDate: item.completedAt ?? item.transaction?.createdAt, // Prefer completedAt if available
    originatingSetTitle: item.originatingSetTitle,
  })) as SalaryBreakdownItem[]; // Adjust mapping as needed
} */

export async function getCommissionBreakdownForPeriod(
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<SalaryBreakdownItem[]> {
  console.log(
    `[getCommissionBreakdownForPeriod] Fetching for ${accountId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
  );

  // Use endOfDay for the query filter to include the entire last day
  const inclusiveEndDate = endOfDay(endDate);

  try {
    const items = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE, // Filter by completed services
        completedAt: {
          gte: startDate,
          lte: inclusiveEndDate, // Use the inclusive end date
          not: null, // Explicitly require completedAt to not be null
        },
        commissionValue: { gt: 0 }, // Only include items with commission earned
      },
      // *** FIX START: Include necessary fields for SalaryBreakdownItem type in select ***
      select: {
        id: true,
        commissionValue: true,
        // Select the service title AND price
        service: { select: { title: true, price: true } }, // *** MODIFIED: Added price: true ***
        transaction: {
          select: {
            customer: { select: { name: true } },
            // We only need createdAt if completedAt can genuinely be null and you use it as a fallback
            // Given the `completedAt: { not: null }` filter above, completedAt should always be non-null in the result.
            // createdAt: true, // Remove if you only use completedAt
          },
        },
        // Include originatingSetId and originatingSetTitle
        originatingSetId: true, // *** MODIFIED: Added originatingSetId: true ***
        originatingSetTitle: true,
        completedAt: true, // Include completedAt
      },
      // *** FIX END ***
      orderBy: {
        completedAt: "desc", // Order by completion date
      },
    });

    console.log(
      `[getCommissionBreakdownForPeriod] Found ${items.length} relevant items.`,
    );

    // Map to SalaryBreakdownItem type
    const breakdownItems: SalaryBreakdownItem[] = items
      // Add a filter based on selected fields if needed, though Prisma's where/select makes this less critical here.
      // Example: .filter(item => item.service && item.transaction?.customer && item.completedAt != null)
      .map((item) => {
        // Use nullish coalescing (??) or optional chaining (?.) for potentially null relationships/fields
        const commission = item.commissionValue ?? 0; // Fallback commission to 0 if it could somehow be null

        // *** FIX START: Construct the object exactly matching SalaryBreakdownItem type ***
        return {
          id: item.id,
          // Access price from the included service. Use optional chaining and nullish coalescing.
          servicePrice: item.service?.price ?? 0, // *** MODIFIED: Added servicePrice ***
          commissionEarned: commission,
          // Use optional chaining and nullish coalescing for title and name
          serviceTitle: item.service?.title ?? null, // Map to null if service/title is missing
          customerName: item.transaction?.customer?.name ?? null, // Map to null if transaction/customer/name is missing
          // Use the completedAt property name and value. It's non-null due to the `where` filter.
          completedAt: item.completedAt!, // *** MODIFIED: Changed property name from transactionDate to completedAt ***
          // Use the fetched originatingSetId and originatingSetTitle. These can be null.
          originatingSetId: item.originatingSetId, // *** MODIFIED: Added originatingSetId ***
          originatingSetTitle: item.originatingSetTitle, // Already present
        };
        // *** FIX END ***
      });

    console.log(
      `[getCommissionBreakdownForPeriod] Mapped ${breakdownItems.length} breakdown items.`,
    );

    // Remove the 'as SalaryBreakdownItem[]' cast - the map output now matches the type
    return breakdownItems;
  } catch (error) {
    console.error(
      `[getCommissionBreakdownForPeriod] Error fetching commission breakdown for ${accountId}:`,
      error,
    );
    // Return an empty array in case of error
    return [];
  } finally {
    // Ensure prisma client is connected before trying to disconnect
    // Check if prisma is defined and has a disconnect method
    if (prisma && typeof (prisma as any).$disconnect === "function") {
      await prisma.$disconnect();
    }
  }
}
export async function getCurrentSalaryDetails(
  accountId: string,
): Promise<CurrentSalaryDetailsData | null> {
  if (!accountId) {
    console.error("[getCurrentSalaryDetails] accountId is required.");
    return null;
  }

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        salary: true,
        dailyRate: true,
        branchId: true,
        canRequestPayslip: true,
      },
    });

    if (!account) {
      console.error(
        `[getCurrentSalaryDetails] Account not found with ID: ${accountId}`,
      );
      return null;
    }

    const accountData: AccountData = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role as Role[],
      salary: account.salary,
      dailyRate: account.dailyRate,
      branchId: account.branchId,
      canRequestPayslip: account.canRequestPayslip,
    };

    const lastReleasedPayslip = await prisma.payslip.findFirst({
      where: {
        accountId: accountId,
        status: PayslipStatus.RELEASED,
      },
      orderBy: {
        releasedDate: "desc",
      },
      select: {
        periodEndDate: true, // Date, or start of day UTC
        releasedDate: true, // UTC timestamp
      },
    });

    const lastReleasedPayslipEndDate =
      lastReleasedPayslip?.periodEndDate || null;
    const lastReleasedTimestamp = lastReleasedPayslip?.releasedDate || null; // This is the crucial UTC timestamp

    // Determine the start date for fetching *attendance* records.
    // Attendance is day-based.
    let attendancePeriodStartDate: Date;
    if (
      lastReleasedPayslipEndDate &&
      isValid(new Date(lastReleasedPayslipEndDate))
    ) {
      attendancePeriodStartDate = startOfDay(
        addDays(new Date(lastReleasedPayslipEndDate), 1), // Day after last payout period end, UTC midnight
      );
    } else {
      // If no last payout, attendance for the current month
      attendancePeriodStartDate = startOfMonth(new Date()); // Start of current server month, UTC
    }

    // The overall period end is always the end of the current day (server time)
    const currentPeriodEndDate = endOfDay(new Date()); // End of current server day, UTC

    // Determine the start timestamp for fetching *commission* items.
    // Commissions are time-based, starting strictly *after* the last release.
    let commissionQueryStartDate: Date;
    if (lastReleasedTimestamp && isValid(new Date(lastReleasedTimestamp))) {
      // If a last released timestamp exists, commissions should be fetched *from that exact moment onwards*.
      // Prisma's gte on DateTime fields is inclusive, so using lastReleasedTimestamp directly is correct
      // if we want items ON OR AFTER that timestamp.
      // However, "after the TIME of the last payslip release" means strictly greater.
      // For simplicity and to align with client's `isAfter`, we can pass `lastReleasedTimestamp`
      // and let the client handle the strict "after".
      // OR, to be more precise on the server:
      // commissionQueryStartDate = new Date(lastReleasedTimestamp.getTime() + 1); // 1 millisecond after
      // For now, let's use lastReleasedTimestamp directly for gte and let client's `isAfter` do its job.
      // A more robust server-side "strictly after" might involve more complex date math or a specific DB function if needed.
      // The most straightforward for now is:
      commissionQueryStartDate = new Date(lastReleasedTimestamp);
    } else {
      // If no last payslip release, fetch commissions from the start of the attendance period.
      // Or, if attendance starts much earlier (e.g. start of month) and you only want recent commissions,
      // you might choose a different default, e.g., attendancePeriodStartDate or start of the current day.
      // Let's align with attendance period start for consistency if no last release.
      commissionQueryStartDate = attendancePeriodStartDate;
    }

    // console.log(
    //   `[getCurrentSalaryDetails] Attendance Query Period (UTC): ${attendancePeriodStartDate.toISOString()} to ${currentPeriodEndDate.toISOString()}`,
    // );
    // console.log(
    //   `[getCurrentSalaryDetails] Commission Query Start (UTC gte): ${commissionQueryStartDate.toISOString()}, End (UTC lte): ${currentPeriodEndDate.toISOString()}`,
    // );

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId: accountId,
        date: {
          // attendance.date is @db.Date
          gte: attendancePeriodStartDate,
          lte: currentPeriodEndDate,
        },
      },
      select: { id: true, date: true, isPresent: true, notes: true },
      orderBy: { date: "asc" },
    });

    const commissionItems = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE,
        completedAt: {
          // completedAt is DateTime, stored in UTC
          // Fetch commissions completed ON or AFTER commissionQueryStartDate
          // AND ON or BEFORE currentPeriodEndDate.
          // The client-side `isAfter(itemDate, filterCommissionTimestampAfter)` will ensure
          // only items strictly *after* lastReleasedTimestamp are shown if that timestamp is used.
          gte: commissionQueryStartDate,
          lte: currentPeriodEndDate,
        },
        commissionValue: { gt: 0 }, // Only include items with positive commission
      },
      select: {
        id: true,
        price: true,
        quantity: true,
        commissionValue: true,
        completedAt: true, // UTC timestamp
        transaction: {
          select: {
            createdAt: true,
            customer: { select: { name: true } },
          },
        },
        service: { select: { title: true } },
        originatingSetTitle: true,
        originatingSetId: true,
      },
      orderBy: { completedAt: "asc" },
    });

    const breakdownItems: SalaryBreakdownItem[] = commissionItems.map(
      (item) => ({
        id: item.id,
        serviceTitle: item.service?.title || "Unknown Service",
        servicePrice: item.price,
        commissionEarned: item.commissionValue,
        customerName: item.transaction?.customer?.name || "N/A",
        completedAt: item.completedAt || null, // UTC timestamp
        originatingSetId: item.originatingSetId,
        originatingSetTitle: item.originatingSetTitle,
      }),
    );

    const result: CurrentSalaryDetailsData = {
      attendanceRecords: attendanceRecords as AttendanceRecord[],
      breakdownItems: breakdownItems,
      accountData: accountData,
      // These represent the *overall period* for which data might be relevant,
      // primarily driven by attendance if no last payslip.
      currentPeriodStartDate: attendancePeriodStartDate, // UTC
      currentPeriodEndDate: currentPeriodEndDate, // UTC
      lastReleasedPayslipEndDate: lastReleasedPayslipEndDate, // Date, or start of day UTC
      lastReleasedTimestamp: lastReleasedTimestamp, // UTC timestamp (this is key for client-side commission filtering)
    };

    // console.log("[getCurrentSalaryDetails] Data prepared and returned.");
    return result;
  } catch (error) {
    console.error(
      "[getCurrentSalaryDetails] Error fetching salary details:",
      error,
    );
    throw new Error(
      "Failed to load current salary details due to a server error.",
    );
  }
}

export const getCurrentAccountData = async (
  accountId: string,
): Promise<AccountData | null> => {
  // --- Authentication/Authorization Check (Crucial) ---
  // Ensure ONLY the account owner (accountId) OR an OWNER can access this data
  // Example:
  // const session = await auth(); // Assuming you have auth()
  // if (!session || (session.user.id !== accountId && !session.user.role.includes(Role.OWNER))) {
  //    console.warn(`[ServerAction] Unauthorized access attempt to account data for ID ${accountId}`);
  //    throw new Error('Unauthorized'); // Or return null, depending on desired strictness
  // }
  // --- End Authentication/Authorization Check ---

  try {
    console.log(
      `[ServerAction] Fetching current account data for ${accountId}`,
    );
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      // Select specific fields that match the AccountData type
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        salary: true, // Assuming salary is stored as Int in smallest unit
        dailyRate: true, // Assuming dailyRate is stored as Int in smallest unit
        branchId: true,
        canRequestPayslip: true,
      },
    });
    console.log(
      `[ServerAction] Account data found for ${accountId}: ${account?.name}`,
    );
    // Cast the result to AccountData | null as it matches the select structure
    return account as AccountData | null;
  } catch (error) {
    console.error(
      `[ServerAction] Error fetching account data for ${accountId}:`,
      error,
    );
    // Depending on your error handling pattern, you might rethrow
    throw new Error("Failed to fetch account data."); // Rethrow a standard error
    // return null; // Or return null on error
  }
};

export const getCompletedTransactionsWithDetails = async (): Promise<
  DetailedTransactionWithBranch[]
> => {
  const sixMonthsAgo = startOfDay(subMonths(new Date(), 6));
  const now = endOfDay(new Date());

  try {
    console.log(
      `[ServerAction] Fetching completed transactions with details since ${sixMonthsAgo.toISOString()}`,
    );
    const transactions = (await prisma.transaction.findMany({
      where: {
        status: Status.DONE,
        createdAt: {
          // Using createdAt for filtering date range
          gte: sixMonthsAgo,
          lte: now,
        },
      },
      // Use `select` at the top level to get specific transaction fields
      // AND include the relations you need.
      select: {
        id: true,
        createdAt: true, // Needed for date filtering/context
        bookedFor: true, // Might be useful, check which date is actually used for sales period logic
        grandTotal: true, // The total amount of the transaction
        status: true, // Already in where, but good to select

        // *** This is the crucial part: Select the relation and then define nested includes/selects ***
        availedServices: {
          select: {
            // Select specific fields from the AvailedService model itself
            id: true,
            quantity: true, // Needed for aggregation calculation
            price: true, // Needed for aggregation calculation
            // Include other AvailedService fields you might need for the type
            // commissionValue: true,
            // originatingSetId: true,
            // originatingSetTitle: true,
            // status: true, // This status is for the availed service item, transaction.status is for the overall TX
            // completedAt: true,
            // createdAt: true,
            // updatedAt: true,

            // Now, within the availedServices select, select the service relation
            service: {
              select: {
                // Select specific fields from the Service model
                id: true,
                title: true, // Might be useful, but not strictly needed for aggregation itself
                branch: {
                  // Select the branch relation within the service
                  select: {
                    // Select specific fields from the Branch model
                    id: true, // Needed for aggregation map key
                    title: true, // Needed for aggregation map value (branchTitle)
                  },
                },
              },
            },
            // Select other relations on AvailedService if needed for the Type
            // servedBy: { select: { id: true, name: true } },
            // checkedBy: { select: { id: true, name: true } },
          },
        },
        // Select other top-level relations or fields needed for the Type
        // customer: { select: { id: true, name: true } },
        // voucherUsed: { select: { id: true, code: true } },
        // branchId: true, // The branch ID associated with the transaction itself
      },
      orderBy: {
        createdAt: "desc", // Order by transaction creation date
      },
    })) as DetailedTransactionWithBranch[]; // Cast to your type

    console.log(
      `[ServerAction] Successfully fetched ${transactions.length} completed transactions with required details.`,
    );
    // Add a log to inspect the structure of the fetched data
    if (transactions.length > 0) {
      console.log(
        "[ServerAction] Sample fetched transaction structure:",
        JSON.stringify(transactions[0], null, 2),
      );
      if (transactions[0].availedServices?.length > 0) {
        console.log(
          "[ServerAction] Sample availedService structure:",
          JSON.stringify(transactions[0].availedServices[0], null, 2),
        );
        if (transactions[0].availedServices[0].service) {
          console.log(
            "[ServerAction] Sample service structure:",
            JSON.stringify(transactions[0].availedServices[0].service, null, 2),
          );
          if (transactions[0].availedServices[0].service.branch) {
            console.log(
              "[ServerAction] Sample branch structure:",
              JSON.stringify(
                transactions[0].availedServices[0].service.branch,
                null,
                2,
              ),
            );
          } else {
            console.log(
              "[ServerAction] Sample service has no branch included.",
            );
          }
        } else {
          console.log(
            "[ServerAction] Sample availedService has no service included.",
          );
        }
      } else {
        console.log(
          "[ServerAction] Sample transaction has no availed services.",
        );
      }
    }

    return transactions;
  } catch (error) {
    console.error(
      "[ServerAction] Error fetching completed transactions with details:",
      error,
    );
    // Depending on how you handle errors upstream, you might return empty or throw
    // Returning empty will show the "No data" message, throwing might show a different error UI
    // Let's return empty array for now to match the current rendering behavior on error/no data
    return [];
    // If you prefer throwing: throw new Error("Failed to fetch detailed transaction data.");
  }
};

export const updateAccountCanRequestPayslip = async (
  accountId: string,
  canRequest: boolean,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  // --- Authentication/Authorization Check (Crucial) ---
  // Ensure ONLY the OWNER role can call this action
  // Example: const session = await auth(); if (!session || !session.user.role.includes('OWNER')) return { success: false, error: "Unauthorized action." };
  // As is, this check is missing. Add it based on your auth system.
  // --- End Authentication/Authorization Check ---
  try {
    console.log(
      `[ServerAction] Setting canRequestPayslip for ${accountId} to ${canRequest}`,
    );
    await prisma.account.update({
      where: { id: accountId },
      data: { canRequestPayslip: canRequest },
    });
    console.log(
      `[ServerAction] Successfully updated canRequestPayslip for ${accountId}`,
    );
    return { success: true, message: "Permission updated successfully." };
  } catch (error: any) {
    console.error(
      `[ServerAction] Error updating canRequestPayslip for ${accountId}:`,
      error,
    );
    return {
      success: false,
      error: error.message || "Failed to update permission.",
    };
  }
};

export const getAllAccountsWithBasicInfo = async (): Promise<
  BasicAccountInfo[]
> => {
  // --- Authentication/Authorization Check (Crucial) ---
  // Ensure ONLY the OWNER role can access this list
  // Example:
  // const session = await auth();
  // if (!session || !session.user.role.includes(Role.OWNER)) {
  //    console.warn("[ServerAction] Unauthorized attempt to access all accounts basic info.");
  //    throw new Error('Unauthorized'); // Or return []
  // }
  // --- End Authentication/Authorization Check ---
  try {
    console.log(
      "[ServerAction] Fetching all accounts with basic info (excluding OWNER via hasSome).",
    );
    // Use hasSome with the list of non-OWNER roles
    const nonOwnerRoles = [Role.CASHIER, Role.WORKER, Role.ATTENDANCE_CHECKER];
    const accounts = await prisma.account.findMany({
      where: {
        role: {
          hasSome: nonOwnerRoles, // Check if the role array contains AT LEAST ONE of these roles
        },
        // OPTIONAL: If an account can be OWNER *and* another role, the above includes it.
        // If you strictly want accounts that *never* have OWNER, the 'NOT: { has: OWNER }' was correct
        // BUT if that's not working due to Prisma, and you accept the limitation, use hasSome.
        // An alternative might be to fetch all, then filter in JS, but less efficient for DB.
      },
      select: {
        id: true,
        name: true,
        role: true,
        canRequestPayslip: true,
      },
      orderBy: { name: "asc" },
    });
    console.log(
      `[ServerAction] Found ${accounts.length} non-owner accounts (using hasSome).`,
    );
    // The returned structure matches BasicAccountInfo[]
    return accounts as BasicAccountInfo[];
  } catch (error: any) {
    console.error("[ServerAction] Error fetching accounts basic info:", error);
    // Return empty array or rethrow
    throw new Error("Failed to fetch accounts."); // Rethrow a standard error
    // return [];
  }
};

export const requestPayslipRelease = async (
  accountId: string,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  console.log(
    `[ServerAction] Initiating payslip release request CREATION for account ID: ${accountId}`,
  );

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, canRequestPayslip: true, role: true },
    });

    if (!account) {
      console.warn(
        `[ServerAction] Payslip request failed: Account not found for ID ${accountId}`,
      );
      return { success: false, error: "Account not found." };
    }
    if (account.role.includes(Role.OWNER)) {
      console.log(
        `[ServerAction] Payslip request skipped for Owner ${account.name}.`,
      );
      return {
        success: false,
        error: "Owners cannot request payslips this way.",
      };
    }
    if (!account.canRequestPayslip) {
      console.warn(
        `[ServerAction] Payslip request DENIED: User ${account.name} (ID: ${accountId}) does not have canRequestPayslip permission.`,
      );
      return {
        success: false,
        error: "Payslip requests are currently disabled for your account.",
      };
    }
    console.log(
      `[ServerAction] Permission check PASSED for ${account.name} (ID: ${accountId}).`,
    );

    // 2. Identify the current period needing release
    const lastReleasedPayslip = await prisma.payslip.findFirst({
      where: { accountId: accountId, status: PayslipStatus.RELEASED },
      orderBy: { periodEndDate: "desc" },
      select: { periodEndDate: true },
    });
    console.log(
      `[ServerAction] Last released payslip end date found: ${lastReleasedPayslip?.periodEndDate}`,
    );

    const startOfCurrentPeriod =
      lastReleasedPayslip?.periodEndDate &&
      isValid(new Date(lastReleasedPayslip.periodEndDate))
        ? startOfDay(addDays(new Date(lastReleasedPayslip.periodEndDate), 1))
        : // **** IMPORTANT: Define a sensible global start date if no payslip history exists ****
          startOfDay(new Date("2024-01-01")); // Example: Default to Jan 1st, 2024

    // End date is usually today
    const endOfCurrentPeriod = endOfDay(new Date());

    console.log(
      `[ServerAction] Calculated period for request: ${format(startOfCurrentPeriod, "yyyy-MM-dd")} to ${format(endOfCurrentPeriod, "yyyy-MM-dd")}`,
    );

    // Prevent requesting if the current period is invalid
    if (isBefore(endOfCurrentPeriod, startOfCurrentPeriod)) {
      console.log(
        `[ServerAction] Payslip request skipped for ${account.name}: Current period is empty or invalid (${format(startOfCurrentPeriod, "PP")} to ${format(endOfCurrentPeriod, "PP")}).`,
      );
      return {
        success: false,
        message: "No new period data available since the last payout.",
      };
    }

    // 3. CHECK FOR EXISTING PENDING *REQUEST* FOR THIS PERIOD
    const existingPendingRequest = await prisma.payslipRequest.findFirst({
      where: {
        accountId: accountId,
        status: PayslipRequestStatus.PENDING,
        periodStartDate: startOfCurrentPeriod,
        periodEndDate: endOfCurrentPeriod,
      },
      select: { id: true },
    });

    if (existingPendingRequest) {
      console.log(
        `[ServerAction] Request skipped: Pending request (ID: ${existingPendingRequest.id}) already exists for this exact period.`,
      );
      return {
        success: false,
        message: "You already have a pending request for this period.",
      };
    }
    console.log(
      `[ServerAction] No existing PENDING request found for this period.`,
    );

    // 4. CREATE THE PAYSLIP REQUEST RECORD
    console.log(
      `[ServerAction] Creating PENDING PayslipRequest record in database...`,
    );
    try {
      const newRequest = await prisma.payslipRequest.create({
        data: {
          accountId: accountId,
          periodStartDate: startOfCurrentPeriod,
          periodEndDate: endOfCurrentPeriod,
          status: PayslipRequestStatus.PENDING,
        },
      });
      console.log(
        `[ServerAction] PayslipRequest record created successfully (ID: ${newRequest.id}) for account ${accountId}`,
      );
    } catch (dbError: any) {
      console.error(
        `[ServerAction] Failed to CREATE PayslipRequest record for ${accountId}:`,
        dbError,
      );
      return {
        success: false,
        error: "Failed to save your request due to a database issue.",
      };
    }

    // 5. Notify Admin (Placeholder)
    console.log(
      `[ServerAction] >>> NOTIFICATION NEEDED: User ${account.name} (ID: ${accountId}) submitted payslip request for period ${format(startOfCurrentPeriod, "PP")} - ${format(endOfCurrentPeriod, "PP")}.`,
    );
    // Example: await sendAdminNotificationEmail(...);

    // 6. Return success
    console.log(
      `[ServerAction] Payslip request submitted successfully for ${account.name}.`,
    );
    return {
      success: true,
      message:
        "Payslip request submitted successfully. Please wait for owner review.",
    };
  } catch (error: any) {
    console.error(
      `[ServerAction] CRITICAL error during payslip request submission for ${accountId}:`,
      error,
    );
    return {
      success: false,
      error:
        "An unexpected server error occurred while submitting your request.",
    };
  }
};

export async function getMyReleasedPayslips(
  accountId: string,
): Promise<PayslipData[]> {
  if (!accountId) {
    // It's generally better to return a specific error response type
    // instead of throwing a generic error if this is a server action.
    // But following your current pattern:
    throw new Error("Account ID is required.");
  }
  console.log(`SERVER ACTION: Fetching RELEASED payslips for Acc ${accountId}`);
  try {
    const payslips = await prisma.payslip.findMany({
      where: { accountId: accountId, status: PayslipStatus.RELEASED },
      include: {
        account: {
          // *** FIX START: Select ALL fields needed for the AccountData type ***
          select: {
            id: true,
            name: true,
            role: true, // Assuming role is required by AccountData
            salary: true, // Assuming salary is required by AccountData
            dailyRate: true, // Assuming dailyRate is required by AccountData
            canRequestPayslip: true, // Assuming canRequestPayslip is required by AccountData
            email: true, // *** MODIFIED: Added email ***
            branchId: true, // *** MODIFIED: Added branchId ***
          },
          // *** FIX END ***
        },
      },
      orderBy: [{ periodEndDate: "desc" }],
    });

    // Map Prisma result to PayslipData type
    const payslipDataList: PayslipData[] = payslips.map((p) => ({
      id: p.id,
      employeeId: p.accountId,
      employeeName: p.account.name, // Access name from included account
      periodStartDate: p.periodStartDate,
      periodEndDate: p.periodEndDate,
      baseSalary: p.baseSalary,
      totalCommissions: p.totalCommissions,
      totalDeductions: p.totalDeductions,
      totalBonuses: p.totalBonuses,
      netPay: p.netPay,
      status: p.status,
      releasedDate: p.releasedDate,
      // *** FIX START: Construct nested accountData including all fields from AccountData type ***
      // Note: p.account might be null if your Prisma schema allows account relation to be optional
      // and there was data inconsistency. However, based on common Payslip setups, account is required.
      // If account could be null, you might need a check here: p.account ? { ... } : null
      accountData: {
        id: p.account.id,
        name: p.account.name,
        role: p.account.role,
        salary: p.account.salary,
        dailyRate: p.account.dailyRate,
        canRequestPayslip: p.account.canRequestPayslip, // Use value from fetched data
        email: p.account.email, // *** MODIFIED: Include email ***
        branchId: p.account.branchId, // *** MODIFIED: Include branchId ***
      },
      // *** FIX END ***
    }));

    console.log(
      `SERVER ACTION: Successfully fetched ${payslipDataList.length} released payslips.`,
    );
    return payslipDataList;
  } catch (error) {
    console.error(
      `SERVER ACTION: Error fetching released payslips for account ${accountId}:`,
      error,
    );
    // Re-throw a new error for the frontend to handle, keeping the original message if possible
    if (error instanceof Error) {
      throw new Error(`Failed to fetch payslip history: ${error.message}`);
    } else {
      // Handle potential non-Error objects or other unknown errors
      console.error("Unknown error type:", error);
      throw new Error(
        "Failed to fetch payslip history due to an unknown error.",
      );
    }
  } finally {
    // Disconnecting Prisma client in server actions depends on your setup (e.g., Next.js edge vs Node.js).
    // If you need to disconnect, add the check:
    // if (prisma && typeof (prisma as any).$disconnect === 'function') {
    //   await prisma.$disconnect();
    // }
  }
}

export async function getServedServicesTodayByUser(
  userId: string,
): Promise<AvailedServicesProps[]> {
  if (!userId) {
    console.error(
      "[ServerAction|getServedServicesTodayByUser] User ID is required.",
    );
    return []; // Return empty array immediately if userId is missing
  }

  try {
    const timeZone = "Asia/Manila";
    const now = new Date(); // Current date/time

    // Calculate the start and end of today in Asia/Manila timezone, then convert to UTC Date objects
    // This logic uses Intl.DateTimeFormat to get local date components and then constructs a UTC date.
    // While this often works for fixed offsets, using a library like date-fns-tz with zonedTimeToUtc is more robust.
    // However, keeping your existing calculation method as is, as it seems intended.
    const phtYear = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric" }).format(
        now,
      ),
    );
    const phtMonth =
      parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone, month: "numeric" }).format(
          now,
        ),
      ) - 1; // JS Date months are 0-indexed
    const phtDay = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(
        now,
      ),
    );

    // Construct UTC dates for the start and end of the calculated PHT day
    const startOfTodayUTC = new Date(
      Date.UTC(phtYear, phtMonth, phtDay, 0 - 8, 0, 0, 0), // PHT is UTC+8, so PHT midnight is 8 hours *before* UTC midnight of the same day
    );
    const endOfTodayUTC = new Date(
      Date.UTC(phtYear, phtMonth, phtDay, 23 - 8, 59, 59, 999), // PHT end of day is 8 hours *before* UTC end of day of the same day
    );

    // console.log(`[ServerAction|getServedServicesTodayByUser] Querying for user ${userId} between PHT ${new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'full', timeStyle: 'full' }).format(startOfTodayUTC)} and ${new Intl.DateTimeFormat('en-US', { timeStyle: 'full', dateStyle: 'full' }).format(endOfTodayUTC)}`);
    // console.log(`[ServerAction|getServedServicesTodayByUser] UTC Range: ${startOfTodayUTC.toISOString()} to ${endOfTodayUTC.toISOString()}`);

    const services = await prisma.availedService.findMany({
      where: {
        servedById: userId, // Filter by the user who served the service
        status: Status.DONE, // Filter by services that are completed
        completedAt: {
          // Filter by completion date within the calculated UTC date range
          gte: startOfTodayUTC,
          lte: endOfTodayUTC, // Inclusive end date
          not: null, // Ensure completedAt is not null (matches type's common usage, though type allows null)
        },
        // Optional: Filter by transaction status if needed
        // transaction: { status: { not: Status.CANCELLED } },
      },
      // *** FIX START: Explicitly select all fields required by AvailedServicesProps ***
      select: {
        // Scalar fields directly on AvailedService
        id: true,
        transactionId: true,
        serviceId: true,
        quantity: true,
        price: true,
        commissionValue: true,
        originatingSetId: true,
        originatingSetTitle: true,
        checkedById: true, // Include checkedById as it's in the type
        servedById: true, // Include servedById as it's in the type
        status: true, // Include status as it's in the type
        completedAt: true, // Include completedAt as it's in the type
        createdAt: true, // Include createdAt as it's in the type
        updatedAt: true, // Include updatedAt as it's in the type

        // Include the 'service' relation, selecting fields needed for ServiceInfo { id, title }
        service: {
          select: {
            id: true, // *** MODIFIED: Added service.id ***
            title: true, // Keep service.title
          },
        },

        // Include the 'transaction' relation, selecting only the 'customer' relation,
        // and within customer, selecting only the 'name' field.
        // This matches the structure of the 'transaction' property added to AvailedServicesProps.
        transaction: {
          select: {
            customer: {
              select: {
                name: true, // Fetch customer name
              },
            },
            // Add other transaction fields here ONLY IF they are explicitly needed
            // and are part of the `transaction` object in your `AvailedServicesProps` type.
            // Based on component usage (only customer.name), we only fetch this path.
          },
        },

        // checkedBy and servedBy *objects* are optional in AvailedServicesProps now.
        // You only need to SELECT them here if you actually use the nested objects (e.g., item.checkedBy.name).
        // Based on your component, you only use item.checkedById/servedById (the IDs),
        // which are scalar fields fetched above. So, we don't need to select the full relation objects here.
        // checkedBy: { select: { id: true, name: true } }, // NOT needed based on component usage
        // servedBy: { select: { id: true, name: true } }, // NOT needed based on component usage
      },
      // *** FIX END ***
      orderBy: {
        completedAt: "desc", // Order by completion time, newest first
      },
    });

    console.log(
      `[ServerAction|getServedServicesTodayByUser] Found ${services.length} served services today.`,
    );
    // Prisma's findMany with select returns objects whose shape is determined by the select.
    // If the select matches the target type (AvailedServicesProps), the cast is helpful for safety.
    return services as AvailedServicesProps[];
  } catch (error: any) {
    console.error(
      `[ServerAction|getServedServicesTodayByUser] Error fetching services for user ${userId}:`,
      error,
    );
    // Log the error and return an empty array or throw. Returning [] matches component expectation.
    // Consider logging the full error object in development for debugging: console.error(error);
    return [];
  } finally {
    // Disconnecting Prisma client in server actions depends on your setup (e.g., Edge vs Node.js)
    // If you need to disconnect, add the check:
    // if (prisma && typeof (prisma as any).$disconnect === 'function') {
    //   await prisma.$disconnect();
    // }
  }
}

export async function createExpense(data: {
  date: string; // YYYY-MM-DD string from form
  amount: number; // Expecting number (float/decimal) from frontend input type="number"
  category: ExpenseCategory; // Use the Prisma enum type directly here if you import it
  description?: string | null; // Allow null or undefined
  recordedById: string;
  branchId?: string | null; // Allow null or undefined
}): Promise<
  { success: true; expenseId: string } | { success: false; error: string }
> {
  try {
    console.log("[ServerAction] Received createExpense request:", data);

    // Basic validation for required fields and data types
    if (typeof data.date !== "string" || !data.date) {
      return {
        success: false,
        error: "Date is required and must be a string.",
      };
    }
    if (
      typeof data.amount !== "number" ||
      isNaN(data.amount) ||
      !isFinite(data.amount) || // Check for Infinity/NaN
      data.amount <= 0 // Ensure positive amount
    ) {
      return { success: false, error: "Amount must be a positive number." };
    }
    if (!data.recordedById || typeof data.recordedById !== "string") {
      return { success: false, error: "Recorded By user ID is required." };
    }
    // branchId validation - allow undefined, null, or valid string
    // Check if it's not null/undefined AND if it's NOT a string
    if (
      data.branchId !== null &&
      data.branchId !== undefined &&
      typeof data.branchId !== "string"
    ) {
      return { success: false, error: "Invalid branch ID format." };
    }

    // Validate expense category against Prisma enum values
    const validPrismaExpenseCategories = Object.values(ExpenseCategory);
    if (!validPrismaExpenseCategories.includes(data.category)) {
      console.error(
        `[ServerAction] Invalid expense category received: "${data.category}"`,
      );
      return {
        success: false,
        error: `Invalid expense category provided: "${data.category}". Valid categories are: ${validPrismaExpenseCategories.join(", ")}.`,
      };
    }
    // Since validation passed, the category is a valid ExpenseCategory enum value
    const prismaCategory: ExpenseCategory = data.category;

    // Parse date string. Ensure it's treated as UTC start of day for @db.Date accuracy.
    // This correctly captures the DATE the user entered regardless of server timezone.
    // Using split and UTC avoids potential issues with Date constructor interpreting string timezone
    const [year, month, day] = data.date.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return {
        success: false,
        error: `Invalid date format provided: ${data.date}`,
      };
    }
    // Month is 0-indexed for Date.UTC
    const expenseDateUtc = new Date(Date.UTC(year, month - 1, day));

    if (isNaN(expenseDateUtc.getTime())) {
      return {
        success: false,
        error: `Invalid date format provided after parsing: ${data.date}`,
      };
    }

    // Optional: Check if recordedBy exists (good practice, though Foreign Key constraint would likely catch it)
    const recorder = await prisma.account.findUnique({
      where: { id: data.recordedById },
      select: { id: true }, // Just need ID to confirm existence
    });
    if (!recorder) {
      return {
        success: false,
        error: `Recorded By user with ID "${data.recordedById}" not found.`,
      };
    }
    // Optional: Check if branch exists if provided (good practice)
    if (data.branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: data.branchId },
        select: { id: true }, // Just need ID to confirm existence
      });
      if (!branch) {
        return {
          success: false,
          error: `Provided branch with ID "${data.branchId}" not found.`,
        };
      }
    }

    // Amount is likely stored as Decimal or Float in your DB.
    // Use the number directly if DB is Decimal/Float.
    // If your DB column is Integer for centavos, multiply by 100: const amountForDb = Math.round(data.amount * 100);

    const expense = await prisma.expense.create({
      data: {
        date: expenseDateUtc, // Store as UTC date (start of the day)
        amount: data.amount, // Store the number amount
        category: prismaCategory, // Use the validated Prisma enum value
        description: data.description, // description can be undefined or null
        recordedById: data.recordedById,
        branchId: data.branchId, // Can be null
      },
    });

    console.log("[ServerAction] Expense created successfully:", expense.id);
    return { success: true, expenseId: expense.id };
  } catch (error: unknown) {
    // Use 'unknown' as the catch parameter type
    // --- DETAILED ERROR LOGGING ---
    console.error("[ServerAction] DETAILED ERROR creating expense:", error);
    // --- END DETAILED ERROR LOGGING ---

    let userErrorMessage =
      "Failed to create expense due to an unexpected server error.";

    // --- START: Handle errors based on type and properties ---
    // Check if the error is an object and has a 'code' property (common for Prisma errors)
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as any).code === "string" // Cast to any to access code property for check
    ) {
      const prismaError = error as any; // Cast to any to access other potential Prisma properties like 'meta'

      // Check for specific known Prisma error codes
      if (prismaError.code === "P2002") {
        // Prisma Unique constraint violation
        userErrorMessage = `Duplicate entry error: ${prismaError.meta?.target || "unique constraint violated"}. Please check for existing records.`;
      } else if (prismaError.code === "P2003") {
        // Prisma Foreign key constraint violation
        userErrorMessage = `Data integrity error: Related record not found for field "${prismaError.meta?.field_name || "unknown"}". Ensure recorded user and branch exist.`;
      } else if (prismaError.code === "P2005") {
        // Prisma Invalid data type
        userErrorMessage = `Data type error: Invalid value for field "${prismaError.meta?.field_name || "unknown"}". Please check input values.`;
      } else {
        // Fallback for other Prisma errors by code
        userErrorMessage = `Database error (${prismaError.code}): ${prismaError.message || "An unknown database error occurred."}`;
      }
    } else if (error instanceof Error) {
      // It's a standard JavaScript Error (e.g., from validation throws before Prisma call, though explicit returns handle most)
      userErrorMessage = error.message;
    } else if (typeof error === "string") {
      // It's just a string (less common for unexpected errors but possible)
      userErrorMessage = `Server error: ${error}`;
    }
    // For any other type, the initial 'userErrorMessage' is used.
    // --- END: Handle errors based on type and properties ---

    return { success: false, error: userErrorMessage };
  } finally {
    // Ensure prisma client is connected before trying to disconnect
    // Check if prisma is defined and has a disconnect method
    if (prisma && typeof (prisma as any).$disconnect === "function") {
      await prisma.$disconnect(); // Good practice to disconnect in server actions after handling the request
    }
  }
}

export async function getSalesDataLast6Months(): Promise<SalesDataDetailed | null> {
  try {
    const today = new Date();
    // Get the end of the current month and the start of the month 5 months ago
    // date-fns uses the system's local time zone for these calculations.
    const endDate = endOfMonth(today);
    const startDate = startOfMonth(subMonths(today, 5));

    console.log(
      `[ServerAction] Fetching sales data from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    // Fetch all active branches with the fields required by the SalesDataDetailed.branches type
    const allBranches = await prisma.branch.findMany({
      select: {
        id: true,
        title: true,
        code: true, // *** MODIFIED: Added 'code' as required by the error ***
      },
      orderBy: {
        title: "asc", // Order branches alphabetically
      },
    });
    console.log(`[ServerAction] Fetched ${allBranches.length} branches.`);

    // Fetch all completed transactions within the date range,
    // including details needed for aggregation (payment method, grandTotal, availed services with branch info)
    const completedTransactions = await prisma.transaction.findMany({
      where: {
        status: Status.DONE, // Filter by completed transactions
        bookedFor: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        bookedFor: true,
        paymentMethod: true,
        grandTotal: true,
        availedServices: {
          select: {
            id: true,
            price: true,
            quantity: true,
            service: {
              select: {
                id: true,
                title: true,
                branch: {
                  select: {
                    id: true,
                    title: true,
                  },
                },
              },
            },
            originatingSetId: true,
            originatingSetTitle: true,
          },
        },
      },
      orderBy: {
        bookedFor: "asc",
      },
    });

    console.log(
      `[ServerAction] Fetched ${completedTransactions.length} completed transactions for sales report.`,
    );

    // Fetch expense data within the date range, including branchId if needed for branch-specific expense aggregation
    const expenses = await prisma.expense.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        date: true,
        amount: true,
        category: true,
        branchId: true, // Keep branchId if you might aggregate expenses by branch later
      },
      orderBy: {
        date: "asc",
      },
    });
    console.log(
      `[ServerAction] Fetched ${expenses.length} expenses for report.`,
    );

    // --- Aggregation Maps and Totals ---

    // Map to hold monthly aggregated data (sales by type, total monthly sales, total monthly expenses, monthly branch sales map)
    const monthlyDataMap = new Map<
      string, // yyyy-MM key
      {
        totalSales: number;
        cash: number;
        ewallet: number;
        bank: number;
        unknown: number;
        branchMonthlySalesMap: Map<string, number>; // Aggregation of service/set item sales by branch title for the month
        totalExpenses: number;
      }
    >();

    // Object to hold overall payment method totals
    const overallPaymentMethodTotals: PaymentMethodTotals = {
      cash: 0,
      ewallet: 0,
      bank: 0,
      unknown: 0,
    };

    // Overall totals for sales and expenses across the entire 6-month period
    let overallGrandTotal = 0;
    let overallTotalExpenses = 0;

    // Map to calculate total sales PER BRANCH for the entire 6-month period
    // This is needed for the 'branches' property in the final return type.
    const branchPeriodSalesMap = new Map<string, number>(); // *** MODIFIED: Added this map ***

    // Initialize monthly map entries for the last 6 months, ensuring all months within the range are present even if they have no data
    const currentFullMonthStart = startOfMonth(today);
    for (let i = 0; i < 6; i++) {
      const monthStart = subMonths(currentFullMonthStart, i);
      const yearMonthKey = format(monthStart, "yyyy-MM");
      monthlyDataMap.set(yearMonthKey, {
        totalSales: 0,
        cash: 0,
        ewallet: 0,
        bank: 0,
        unknown: 0,
        branchMonthlySalesMap: new Map(),
        totalExpenses: 0,
      });
    }

    // --- Aggregate Sales Data from Transactions ---
    completedTransactions.forEach((transaction) => {
      const yearMonthKey = format(transaction.bookedFor, "yyyy-MM");
      const monthData = monthlyDataMap.get(yearMonthKey);

      if (monthData) {
        const transactionGrandTotal = transaction.grandTotal ?? 0;

        // Aggregate monthly total sales (using transaction grandTotal)
        monthData.totalSales += transactionGrandTotal;

        // Aggregate monthly payment methods
        const method = transaction.paymentMethod?.toLowerCase() || "unknown";
        if (method === PaymentMethod.cash.toLowerCase()) {
          // Using .toLowerCase() for robust comparison
          monthData.cash += transactionGrandTotal;
        } else if (method === PaymentMethod.ewallet.toLowerCase()) {
          monthData.ewallet += transactionGrandTotal;
        } else if (method === PaymentMethod.bank.toLowerCase()) {
          monthData.bank += transactionGrandTotal;
        } else {
          monthData.unknown += transactionGrandTotal;
        }

        // Aggregate overall payment methods (using transaction grandTotal)
        if (method === PaymentMethod.cash.toLowerCase()) {
          overallPaymentMethodTotals.cash += transactionGrandTotal;
        } else if (method === PaymentMethod.ewallet.toLowerCase()) {
          overallPaymentMethodTotals.ewallet += transactionGrandTotal;
        } else if (method === PaymentMethod.bank.toLowerCase()) {
          overallPaymentMethodTotals.bank += transactionGrandTotal;
        } else {
          overallPaymentMethodTotals.unknown += transactionGrandTotal;
        }

        // Aggregate overall grand total sales
        overallGrandTotal += transactionGrandTotal;

        // Aggregate monthly branch sales (using individual item prices and quantities)
        // Also aggregate overall period sales by branch for the 'branches' return property
        transaction.availedServices.forEach((item) => {
          // Check if the item is linked to a service with branch info
          if (item.service?.branch) {
            const branchTitle = item.service.branch.title;
            // Calculate sales contribution from this specific availed item
            // Using price * quantity from the AvailedService record
            const itemSales = (item.price ?? 0) * (item.quantity ?? 0);

            // Aggregate for the monthly branch sales map
            monthData.branchMonthlySalesMap.set(
              branchTitle,
              (monthData.branchMonthlySalesMap.get(branchTitle) ?? 0) +
                itemSales,
            );

            // Aggregate for the overall period branch sales map *** MODIFIED: Added this aggregation ***
            branchPeriodSalesMap.set(
              branchTitle,
              (branchPeriodSalesMap.get(branchTitle) ?? 0) + itemSales,
            );
          } else if (item.originatingSetId && item.originatingSetTitle) {
            // Optional: Handle sales from sets if you want to attribute them to branches.
            // This requires logic to determine which branch a set 'belongs' to,
            // perhaps based on the services within the set or a set-specific branch field.
            // For now, sales from sets without a direct service->branch link are not included in branch-specific totals.
          } else {
            // Handle items not linked to a service or set with branch info (not included in branch totals)
          }
        });
      } else {
        console.warn(
          `[ServerAction] Transaction outside of 6-month calculation range? ID: ${transaction.id}, Date: ${transaction.bookedFor?.toISOString()}`,
        );
      }
    });

    // --- Aggregate Expense Data from Expenses ---
    expenses.forEach((expense) => {
      const yearMonthKey = format(expense.date, "yyyy-MM");
      const monthData = monthlyDataMap.get(yearMonthKey);

      if (monthData) {
        const expenseAmount = expense.amount ?? 0;

        // Aggregate monthly total expenses
        monthData.totalExpenses += expenseAmount;

        // Aggregate overall total expenses
        overallTotalExpenses += expenseAmount;

        // Optional: Aggregate expenses by branch if needed, similar to sales
        // if (expense.branchId) { ... }
      } else {
        console.warn(
          `[ServerAction] Expense outside of 6-month calculation range? ID: ${expense.id}, Date: ${expense.date?.toISOString()}`,
        );
      }
    });

    // --- Format Aggregated Data for Return Type ---

    // 1. Format Monthly Sales and Expenses Array (MonthlySales[])
    const monthlySalesArray: MonthlySales[] = Array.from(
      monthlyDataMap.entries(),
    )
      .map(([yearMonthKey, data]) => {
        // Convert the monthly branch sales map to the required object format
        const branchMonthlySales: { [branchTitle: string]: number } = {};
        data.branchMonthlySalesMap.forEach((value, key) => {
          branchMonthlySales[key] = value;
        });

        // Create branchSales array for the Preview tooltip (using the monthly aggregated sales data)
        const branchSalesForTooltip = Array.from(
          data.branchMonthlySalesMap.entries(),
        )
          .map(([branchTitle, totalSales]) => ({
            branchTitle,
            totalSales,
          }))
          .sort((a, b) => b.totalSales - a.totalSales);

        // Format the Month name (e.g., "Jan") from the year-month key
        const monthName = format(new Date(`${yearMonthKey}-01`), "MMM");

        return {
          month: monthName,
          yearMonth: yearMonthKey,
          totalSales: data.totalSales,
          cash: data.cash,
          ewallet: data.ewallet,
          bank: data.bank,
          unknown: data.unknown,
          branchSales: branchSalesForTooltip,
          branchMonthlySales: branchMonthlySales,
          totalExpenses: data.totalExpenses, // Include total monthly expenses
        };
      })
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)); // Sort months chronologically

    // 2. Format Monthly Expenses Array (MonthlyExpensesTotal[])
    // This array is a subset of the data already in monthlySalesArray,
    // required as a separate property by SalesDataDetailed.
    const monthlyExpensesArray: MonthlyExpensesTotal[] = monthlySalesArray.map(
      (item) => ({
        month: item.month,
        yearMonth: item.yearMonth,
        totalExpenses: item.totalExpenses,
      }),
    ); // *** MODIFIED: Added this mapping ***

    // 3. Format Branches Array (matching the shape inferred by the error)
    // This array includes branch details + the total sales for that branch over the *entire 6-month period*.
    const branchesReportData = allBranches.map((branch) => {
      // Look up the total sales for this branch from the branchPeriodSalesMap
      const totalSalesForPeriod = branchPeriodSalesMap.get(branch.title) ?? 0;
      return {
        id: branch.id,
        code: branch.code, // Use the code fetched from Prisma
        title: branch.title,
        totalSales: totalSalesForPeriod, // Use the calculated total sales for the period
      };
    }); // *** MODIFIED: Added this mapping ***

    // 4. Unique Branch Titles (simple array of strings)
    // This is used for things like chart legends.
    const uniqueBranchTitlesArray = allBranches.map((b) => b.title).sort();

    console.log("[ServerAction] Sales and Expense data aggregated and sorted.");
    console.log(
      "[ServerAction] Monthly Data Array (first 2):",
      monthlySalesArray.slice(0, 2),
    );
    console.log(
      "[ServerAction] Overall Payment Totals:",
      overallPaymentMethodTotals,
    );
    console.log("[ServerAction] Overall Grand Total Sales:", overallGrandTotal);
    console.log(
      "[ServerAction] Overall Grand Total Expenses:",
      overallTotalExpenses,
    );
    console.log(
      "[ServerAction] Formatted Branches with Total Sales:",
      branchesReportData,
    ); // Log the formatted branches array
    console.log(
      "[ServerAction] Unique Branch Titles:",
      uniqueBranchTitlesArray,
    );

    // *** Return the final object matching the SalesDataDetailed type ***
    return {
      monthlySales: monthlySalesArray, // Array of MonthlySales objects
      paymentMethodTotals: overallPaymentMethodTotals, // Object of overall payment totals
      grandTotal: overallGrandTotal, // Overall sales total
      uniqueBranchTitles: uniqueBranchTitlesArray, // Array of unique branch titles (strings)
      branches: branchesReportData, // *** MODIFIED: Use the array formatted to match the type ***
      monthlyExpenses: monthlyExpensesArray, // *** MODIFIED: Include the array of monthly expenses ***
      overallTotalExpenses: overallTotalExpenses, // Overall expenses total
    };
  } catch (error: any) {
    console.error("[ServerAction] Error fetching sales data:", error);
    // Return an empty data structure on error, ensuring all properties exist with default values (empty arrays, zeros)
    // This matches the required shape of SalesDataDetailed even on failure.
    return {
      monthlySales: [], // Empty array
      paymentMethodTotals: { cash: 0, ewallet: 0, bank: 0, unknown: 0 }, // Zeroed totals
      grandTotal: 0, // Zero total
      uniqueBranchTitles: [], // Empty array
      branches: [], // *** MODIFIED: Empty array matching the required branch shape ***
      monthlyExpenses: [], // *** MODIFIED: Empty array for monthly expenses ***
      overallTotalExpenses: 0, // Zero total
    };
  } finally {
    // Ensure prisma client is connected before trying to disconnect
    if (prisma && typeof (prisma as any).$disconnect === "function") {
      await prisma.$disconnect();
    }
  }
}

export async function validateGiftCertificateCode(
  code: string,
): Promise<GCValidationResult> {
  if (!code || code.trim().length === 0) {
    return {
      success: false,
      message: "GC Code cannot be empty.",
      errorCode: "INVALID_DATA",
    };
  }
  const normalizedCode = code.trim().toUpperCase();

  try {
    const gc = await prisma.giftCertificate.findUnique({
      where: { code: normalizedCode },
      include: {
        services: { select: { id: true, title: true, price: true } },
        serviceSets: { select: { id: true, title: true, price: true } },
        purchaserCustomer: { select: { id: true, name: true, email: true } },
      },
    });

    if (!gc) {
      return {
        success: false,
        message: "Gift Certificate code not found.",
        errorCode: "NOT_FOUND",
      };
    }
    if (gc.usedAt) {
      return {
        success: false,
        message: `Gift Certificate ${normalizedCode} has already been used on ${gc.usedAt.toLocaleDateString()}.`,
        errorCode: "USED",
      };
    }
    if (gc.expiresAt && new Date(gc.expiresAt) < new Date()) {
      return {
        success: false,
        message: `Gift Certificate ${normalizedCode} expired on ${gc.expiresAt.toLocaleDateString()}.`,
        errorCode: "EXPIRED",
      };
    }

    // Ensure there's at least one service or set
    if (gc.services.length === 0 && gc.serviceSets.length === 0) {
      return {
        success: false,
        message: `Gift Certificate ${normalizedCode} is not linked to any services or sets. Please contact support.`,
        errorCode: "INVALID_DATA",
      };
    }

    return {
      success: true,
      message: "Gift Certificate is valid.",
      gcDetails: gc,
    };
  } catch (error) {
    console.error("Error validating GC code:", error);
    return {
      success: false,
      message: "Error validating Gift Certificate code. Please try again.",
    };
  }
}

// --- Helper: Type for claim GC action parameters ---
interface ClaimGCData {
  gcId: string;
  customerId: string;
  bookedForDate: string; // ISO string date
  // Potentially add branchId if required for the transaction/services
}

interface ClaimGCResult {
  success: boolean;
  message: string;
  transactionId?: string;
  errors?: Record<string, string[]>;
}

export async function toggleAllCanRequestPayslipAction(
  newStatus: boolean,
  accountIds?: string[], // Optional: to only update a subset, e.g., filtered view
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (accountIds && accountIds.length > 0) {
      // Update only specified accounts
      await prisma.account.updateMany({
        where: {
          id: {
            in: accountIds,
          },
        },
        data: {
          canRequestPayslip: newStatus,
        },
      });
      // console.log(`[ServerAction] Toggled canRequestPayslip to ${newStatus} for ${accountIds.length} accounts.`);
    } else {
      // Update all accounts if no specific IDs are provided (use with caution)
      await prisma.account.updateMany({
        data: {
          canRequestPayslip: newStatus,
        },
      });
      // console.log(`[ServerAction] Toggled canRequestPayslip to ${newStatus} for ALL accounts.`);
    }

    revalidatePath("/dashboard"); // Or a more specific path if this page is elsewhere
    // Revalidate any page where this permission might be checked by an employee

    return {
      success: true,
      message: `Successfully set 'Can Request Payslip' to ${newStatus ? "Enabled" : "Disabled"} for selected accounts.`,
    };
  } catch (error: any) {
    console.error("Error in toggleAllCanRequestPayslipAction:", error);
    return {
      success: false,
      error: error.message || "Failed to update all permissions.",
    };
  }
}

export async function createTransactionFromGiftCertificate(data: {
  gcId: string;
  customerId: string;
  bookedForDate: string; // Expected YYYY-MM-DD format
}): Promise<
  | { success: true; message: string; transactionId: string }
  | { success: false; message: string }
> {
  try {
    // --- 1. Input Validation ---
    if (!data.gcId || !data.customerId || !data.bookedForDate) {
      return {
        success: false,
        message: "Missing required data (GC ID, Customer ID, or Booking Date).",
      };
    }

    // --- 2. Fetch and Validate GC ---
    const giftCertificate = await prisma.giftCertificate.findUnique({
      where: { id: data.gcId },
      include: {
        services: true, // Include related Service details
        serviceSets: {
          // Include related ServiceSet details and their services
          include: {
            services: true, // Include services within the set (might not be needed for calculation but good for context)
          },
        },
      },
    });

    if (!giftCertificate) {
      return { success: false, message: "Gift Certificate not found." };
    }
    if (giftCertificate.usedAt) {
      // Format date for user readability
      const usedDate = giftCertificate.usedAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const usedTime = giftCertificate.usedAt.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
      return {
        success: false,
        message: `Gift Certificate already used on ${usedDate} at ${usedTime}.`,
      };
    }
    if (giftCertificate.expiresAt && giftCertificate.expiresAt < new Date()) {
      const expiryDate = giftCertificate.expiresAt.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      return {
        success: false,
        message: `Gift Certificate expired on ${expiryDate}.`,
      };
    }
    if (
      giftCertificate.services.length === 0 &&
      giftCertificate.serviceSets.length === 0
    ) {
      // This GC doesn't grant anything.
      return {
        success: false,
        message:
          "Gift Certificate is not linked to any services or sets and cannot be claimed.",
      };
    }

    // --- 3. Fetch Customer ---
    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });

    if (!customer) {
      return { success: false, message: "Customer not found." };
    }

    // --- 4. Prepare Transaction and Availed Service Data ---
    let grandTotal = 0; // Total value of the GC items
    const availedServiceItemsData: any[] = []; // Data structure for createMany

    // Add services listed directly on the GC
    for (const service of giftCertificate.services) {
      availedServiceItemsData.push({
        // transactionId will be added later in the transaction
        serviceId: service.id,
        quantity: 1, // Assuming 1 quantity per service listed on GC
        price: service.price, // Snapshot of the service's current price
        commissionValue: 0, // Default commission for GC items is often 0, adjust if needed
        status: Status.PENDING, // Initially pending
        completedAt: null,
      });
      grandTotal += service.price;
    }

    // Add service sets listed on the GC
    for (const serviceSet of giftCertificate.serviceSets) {
      // Create ONE AvailedService record to represent the set being redeemed
      availedServiceItemsData.push({
        // transactionId will be added later
        originatingSetId: serviceSet.id,
        originatingSetTitle: serviceSet.title, // Denormalize title for easier access
        serviceId: null, // This AvailedService represents the set, not a specific service line
        quantity: 1, // One set
        price: serviceSet.price, // Snapshot of the set's current price
        commissionValue: 0, // Default commission
        status: Status.PENDING, // Initially pending
        completedAt: null,
      });
      grandTotal += serviceSet.price;
    }

    // Prepare dates
    const selectedDate = new Date(data.bookedForDate); // Gets the date part, usually midnight UTC
    if (isNaN(selectedDate.getTime())) {
      return { success: false, message: "Invalid booking date provided." };
    }

    // Get the current time
    const currentTime = new Date();

    // Combine selected date with current time for bookedFor
    const bookedForWithClaimTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      currentTime.getHours(),
      currentTime.getMinutes(),
      currentTime.getSeconds(),
      currentTime.getMilliseconds(),
    );

    const now = new Date(); // Use current time for createdAt and usedAt timestamp

    // --- 5. Create Transaction, Availed Services, and Update GC atomically ---
    const result = await prisma.$transaction(async (tx) => {
      // Create the Transaction
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          grandTotal: grandTotal, // Total value covered by GC
          discount: 0,
          // --- START MODIFICATION ---
          paymentMethod: PaymentMethod.cash, // Set default payment method to Cash
          // --- END MODIFICATION ---
          status: Status.PENDING, // Initial status
          giftCertificateId: giftCertificate.id, // Link the GC used
          bookedFor: bookedForWithClaimTime, // The scheduled date/time for the service
          createdAt: now, // The actual date/time the transaction record was created
          // branchId: // Omit or add logic to determine branch if needed
        },
      });

      // Link AvailedService items to the new Transaction ID
      const availedServiceDataWithTxId = availedServiceItemsData.map(
        (item) => ({
          ...item,
          transactionId: transaction.id,
          // Add branchId to AvailedService if needed
        }),
      );

      // Create AvailedService records
      if (availedServiceDataWithTxId.length > 0) {
        await tx.availedService.createMany({
          data: availedServiceDataWithTxId,
          skipDuplicates: true,
        });
      }

      // Mark the Gift Certificate as used
      await tx.giftCertificate.update({
        where: { id: giftCertificate.id },
        data: {
          usedAt: now, // Mark as used at the current time
          // Add transaction relation if added to GC model
          // transactions: {
          //    connect: { id: transaction.id }
          // }
        },
      });

      return transaction; // Return the created transaction for the success message
    });

    // --- 6. Return Success ---
    return {
      success: true,
      message: `Gift Certificate "${giftCertificate.code}" successfully claimed and transaction created with ID ${result.id}.`,
      transactionId: result.id,
    };
  } catch (error: any) {
    console.error("Error claiming Gift Certificate:", error);
    // Provide a more user-friendly error message
    if (
      error.code === "P2003" &&
      error.meta?.field_name === "giftCertificateId"
    ) {
      return {
        success: false,
        message:
          "Failed to link Gift Certificate to transaction. GC ID may not exist (unexpected after validation). Please try again or contact support.",
      };
    }
    // Catch potential type errors if Date construction fails unexpectedly
    if (error instanceof TypeError) {
      return {
        success: false,
        message:
          "Error processing date/time. Please try again or contact support.",
      };
    }

    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred during the claim process. Please try again.",
    };
  }
}

export async function getRecentTransactions(limit: number = 50) {
  try {
    const transactions = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: limit, // Limit the number of transactions fetched
      include: {
        customer: {
          select: { id: true, name: true, email: true },
        },
        availedServices: {
          include: {
            service: { select: { id: true, title: true } },
            servedBy: { select: { id: true, name: true } },
          },
        },
        voucherUsed: {
          select: { code: true },
        },
        branch: {
          select: { id: true, title: true },
        },
      },
    });

    return transactions; // Prisma results are typically plain objects compatible with JSON
  } catch (error) {
    console.error("Error fetching recent transactions:", error);
    return [];
  }
}

export async function updateTransactionDetails({
  transactionId,
  status,
  paymentMethod,
}: UpdateTransactionInput): Promise<{
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}> {
  if (!transactionId) {
    return { success: false, message: "Transaction ID is required." };
  }

  try {
    const updatedTransaction = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        ...(status !== undefined && { status }), // Update status if provided
        ...(paymentMethod !== undefined && { paymentMethod }), // Update paymentMethod if provided (can be null)
      },
    });

    // Revalidate paths that might display transaction data
    revalidatePath("/[accountId]"); // Revalidate dashboard page
    revalidatePath("/[accountId]/transactions"); // Revalidate dedicated transactions page if it exists

    return { success: true, message: "Transaction updated successfully." };
  } catch (error: any) {
    console.error(`Error updating transaction ${transactionId}:`, error);

    // Handle Prisma-specific errors, e.g., record not found
    if (error.code === "P2025") {
      return { success: false, message: "Transaction not found." };
    }

    return {
      success: false,
      message: error.message || "Failed to update transaction.",
    };
  }
}

export async function createAccountAction(
  formData: FormData,
): Promise<ActionResult> {
  try {
    const username = formData.get("username") as string;
    const name = formData.get("name") as string;
    const email = formData.get("email") as string; // Now explicitly required from the form for new accounts
    const dailyRateStr = formData.get("dailyRate") as string;
    const branchId = formData.get("branchId") as string | null; // Can be empty string "" or actual ID

    const selectedRoles: Role[] = Object.values(Role).filter(
      (roleValue) => formData.get(`role-${roleValue}`) === "on",
    );

    // --- Server-Side Validations ---
    const validationErrors: Record<string, string[]> = {};

    if (!username || username.trim() === "") {
      validationErrors.username = ["Username is required."];
    } else if (username.length > 20) {
      validationErrors.username = ["Username cannot exceed 20 characters."];
    }

    if (!name || name.trim() === "") {
      validationErrors.name = ["Full Name is required."];
    }

    if (!email || email.trim() === "") {
      validationErrors.email = ["Email is required for new accounts."];
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      // Basic email format validation
      validationErrors.email = ["Please enter a valid email address."];
    }

    let dailyRate: number | undefined;
    if (!dailyRateStr || dailyRateStr.trim() === "") {
      validationErrors.dailyRate = ["Daily rate is required."];
    } else {
      dailyRate = parseInt(dailyRateStr, 10);
      if (isNaN(dailyRate) || dailyRate < 0) {
        validationErrors.dailyRate = [
          "Daily rate must be a non-negative number.",
        ];
      }
    }

    if (selectedRoles.length === 0) {
      validationErrors.roles = ["At least one role must be selected."];
    }

    if (Object.keys(validationErrors).length > 0) {
      return {
        success: false,
        message: "Validation failed. Please check the form.",
        errors: validationErrors,
      };
    }

    // --- Check for existing username or email ---
    const existingUserByUsername = await prisma.account.findUnique({
      where: { username },
    });
    if (existingUserByUsername) {
      return {
        success: false,
        message: "Username already exists.",
        errors: { username: ["This username is already taken."] },
      };
    }

    // Email must be unique (as per schema, this is an extra frontend-friendly check)
    const existingUserByEmail = await prisma.account.findUnique({
      where: { email },
    });
    if (existingUserByEmail) {
      return {
        success: false,
        message: "Email already associated with an account.",
        errors: { email: ["This email address is already in use."] },
      };
    }

    // --- Generate and Hash Password ---
    const temporaryPassword = generateRandomPassword(); // Default length 12
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10); // Standard salt rounds

    // --- Create Account in Database ---
    const newAccount = await prisma.account.create({
      data: {
        username,
        name,
        email, // Email is validated to be present
        password: hashedPassword,
        dailyRate: dailyRate!, // Validated above
        role: selectedRoles,
        branchId: branchId && branchId !== "" ? branchId : null, // Prisma expects null for optional unset relation
        mustChangePassword: true, // CRITICAL: Force password change on first login
        // salary, canRequestPayslip will use defaults from schema
      },
      select: {
        // Select only necessary fields for response/email
        id: true,
        username: true,
        email: true,
        name: true,
      },
    });

    let emailSentSuccessfully = false;
    let emailErrorMessage = "";

    if (resendInstanceSA) {
      try {
        const { data, error } = await resendInstanceSA.emails.send({
          from: SENDER_EMAIL_SA, // IMPORTANT: Replace with your verified sender email
          to: [newAccount.email!], // Email is guaranteed to be present here
          subject: `Welcome to Your App - ${newAccount.name}!`,
          html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0056b3;">Welcome to Your App, ${newAccount.name}!</h2>
                <p>An account has been created for you by an administrator.</p>
                <p>Here are your login details:</p>
                <ul style="list-style-type: none; padding: 0;">
                  <li style="margin-bottom: 8px;"><strong>Username:</strong> ${newAccount.username}</li>
                  <li style="margin-bottom: 8px;"><strong>Temporary Password:</strong> <strong style="font-size: 1.1em; color: #d9534f;">${temporaryPassword}</strong></li>
                </ul>
                <p>
                  Please <a href="https://beautyfeel.net/login" target="_blank" style="color: #007bff; text-decoration: none;">log in here</a> as soon as possible.
                  You will be required to change this temporary password upon your first login.
                </p>
                <p>If you have any questions, please contact your administrator.</p>
                <p style="margin-top: 20px; font-size: 0.9em; color: #777;">
                  Best regards,<br/>
                  The BeautyFeel App Team
                </p>
              </div>
            `, // IMPORTANT: Replace YOUR_APPLICATION_LOGIN_URL with your actual login page URL
        });

        if (error) {
          console.error("Resend API Error:", error);
          emailErrorMessage = `Failed to send welcome email: ${error.message}`;
        } else {
          console.log(
            "Welcome email sent successfully via Resend, ID:",
            data?.id,
          );
          emailSentSuccessfully = true;
        }
      } catch (emailCatchError: any) {
        console.error("Exception during email sending:", emailCatchError);
        emailErrorMessage = `An exception occurred while sending the welcome email: ${emailCatchError.message}`;
      }
    } else {
      emailErrorMessage =
        "Email sending is not configured (RESEND_API_KEY missing). Welcome email not sent.";
      console.warn(emailErrorMessage);
    }

    // Construct the success message based on email status
    let successMessage = `Account for ${newAccount.username} created successfully.`;
    if (emailSentSuccessfully) {
      successMessage += ` A temporary password has been sent to ${newAccount.email}.`;
    } else {
      successMessage += ` ${emailErrorMessage} Please provide the password manually if needed.`;
    }

    return {
      success: true,
      message: successMessage,
      account: {
        id: newAccount.id,
        username: newAccount.username,
        email: newAccount.email,
        name: newAccount.name,
      },
    };
  } catch (error: any) {
    console.error("Create Account Action - Unexpected Error:", error);

    // Handle Prisma-specific unique constraint errors that might occur despite earlier checks (e.g., race conditions)
    if (error.code === "P2002" && error.meta?.target) {
      const targetField = (error.meta.target as string[]).join(", "); // e.g., "Account_username_key" or "Account_email_key"
      if (targetField.includes("username")) {
        return {
          success: false,
          message: "Username already exists.",
          errors: { username: ["This username is already taken."] },
        };
      }
      if (targetField.includes("email")) {
        return {
          success: false,
          message: "Email already associated with an account.",
          errors: { email: ["This email address is already in use."] },
        };
      }
      return {
        success: false,
        message: `A data conflict occurred: ${targetField} must be unique.`,
      };
    }
    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while creating the account.",
    };
  }
}

export async function updateUserPasswordAction(
  newPassword: string,
): Promise<ActionResult> {
  // 1. Get the current session on the server
  const session = await getServerSession(authOptions);

  // 2. Ensure user is authenticated
  if (!session?.user?.id) {
    return {
      success: false,
      message: "User not authenticated. Please log in again.",
    };
  }

  // 3. Validate the new password (e.g., length)
  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      message: "Password must be at least 6 characters long.",
    };
  }

  try {
    // 4. Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10); // Use appropriate salt rounds

    // 5. Update the user's record in the database
    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false, // CRITICAL: Set the flag to false
      },
    });

    console.log(`Password updated successfully for user: ${session.user.id}`);
    return {
      success: true,
      message: "Password updated successfully! Redirecting...",
    };
  } catch (error) {
    console.error("Error updating password in database:", error);
    return {
      success: false,
      message: "An unexpected error occurred while updating your password.",
    };
  }
}

type CustomerWithNonNullEmail = Pick<Customer, "id" | "name"> & {
  email: string;
};

export async function getCustomersForEmailAction(): Promise<
  CustomerWithNonNullEmail[] // Use the new type here
> {
  try {
    // Check cache first (as before)
    const cachedData = getCachedData<CustomerWithNonNullEmail[]>( // Update cache type as well
      CUSTOMERS_CACHE_KEY,
    );
    if (cachedData) {
      console.log("Returning customers from cache...");
      return cachedData;
    }

    console.log("Fetching customers from database...");

    const customersWithEmails = await prisma.customer.findMany({
      where: {
        // --- CORRECTED SYNTAX FOR COMBINING FILTERS ---
        AND: [
          { email: { not: null } }, // Condition 1: email is not null
          { email: { not: "" } }, // Condition 2: email is not an empty string
        ],
        // ---------------------------------------------
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    // The data returned by Prisma *after* the AND filter will conform to CustomerWithNonNullEmail[]
    // The type assertion is still needed because Prisma's default generated type for 'email' is 'string | null'.
    const result = customersWithEmails as CustomerWithNonNullEmail[];

    // Cache the fetched data (optional: set an expiry if needed)
    setCachedData(CUSTOMERS_CACHE_KEY, result); // Cache the correctly typed result

    console.log(`Fetched ${result.length} customers with emails.`);
    return result;
  } catch (error) {
    console.error("Error fetching customers:", error);
    // In a real app, you might want to log this error more robustly (e.g., to a logging service)
    throw new Error("Failed to fetch customer list. Database error.");
  }
}

function generateEmailHtml(
  subject: string,
  body: string,
  logoUrl: string, // Added logoUrl parameter
): string {
  // This is where you would construct the full HTML email.
  // You'd use the provided colors and structure similar to the example image.
  // For simplicity, this placeholder just wraps the text in basic HTML.
  // A real implementation would use a dedicated HTML email template file.

  // Basic example structure (need to replace with a real template)
  return `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Strict//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-strict.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style type="text/css">
    /* Client-specific Styles */
    #outlook a { padding:0; }
    body{ width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; margin:0; padding:0; }
    .ExternalClass { width:100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
    #backgroundTable { margin:0; padding:0; width:100% !important; line-height: 100% !important; }

    /* Custom Styles */
    body {
      background-color: #F6F4EB; /* customOffWhite */
      font-family: sans-serif;
      color: #2E2A2A; /* customBlack */
    }
    table { border-collapse: collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    td { margin:0; padding:0; }
    img { outline:none; text-decoration:none; -ms-interpolation-mode: bicubic; }
    a img { border:none; }
    .image_fix { display:block; }

    /* Mobile Styles */
    @media only screen and (max-width: 600px) {
      table[class=full-width] { width: 100% !important; }
      table[class=column] { width: 100% !important; float: none !important; margin-bottom: 15px; }
      td[class=column-padding] { padding-left: 15px !important; padding-right: 15px !important; }
      td[class=mobile-padding] { padding: 15px !important; }
      td[class=align-center] { text-align: center !important; }
      img[class=image-responsive] { width: 100% !important; height: auto !important; }
    }

    /* Colors */
    .color-primary-dark { color: #C28583; } /* customDarkPink */
    .color-text { color: #2E2A2A; } /* customBlack */
    .bg-offwhite { background-color: #F6F4EB; } /* customOffWhite */
    .bg-lightgray { background-color: #D9D9D9; } /* customGray */
    .btn {
        display: inline-block;
        padding: 10px 20px;
        margin-top: 15px;
        background-color: #C28583; /* customDarkPink */
        color: #FFFFFF;
        text-decoration: none;
        border-radius: 5px;
    }

  </style>
</head>
<body style="margin: 0; padding: 0; background-color: #F6F4EB;">
  <center>
    <table border="0" cellpadding="0" cellspacing="0" width="100%" class="bg-offwhite" id="backgroundTable">
      <tr>
        <td align="center" valign="top">
          <table border="0" cellpadding="0" cellspacing="0" width="600" class="full-width">
            <tr>
              <td align="center" valign="top" style="padding: 20px 0;">
                <!-- Header / Logo -->
                <!-- Use the passed logoUrl -->
                <img src="${logoUrl}" alt="BEAUTYFEEL The Beauty Lounge" width="150" style="display:block;" />
                <p style="font-size: 12px; color: #2E2A2A; margin-top: 5px;">FACE • SKIN • NAILS • MASSAGE</p>
              </td>
            </tr>
            <tr>
              <td align="left" valign="top" class="mobile-padding" style="padding: 20px; background-color: #FFFFFF; border-radius: 8px; box-shadow: 0px 4px 4px rgba(0, 0, 0, 0.1);">
                <!-- Email Body Content -->
                <h1 style="font-size: 20px; margin-bottom: 15px; color: #C28583;">${subject}</h1>

                <p style="margin-bottom: 15px; line-height: 1.6;">
                  ${body.replace(/\n/g, "<br />")}
                  <!-- Basic line break conversion: You might want to add more complex markdown parsing here if needed -->
                </p>

                <!-- Optional: Add a button -->
                <!-- <a href="#" class="btn">Book Now</a> -->

              </td>
            </tr>
            <tr>
              <td align="center" valign="top" style="padding: 20px;">
                <!-- Footer -->
                <p style="font-size: 12px; color: #2E2A2A/80; line-height: 1.5;">
                  Best regards,<br/>
                  The BeautyFeel Team
                </p>
                 <p style="font-size: 10px; color: #2E2A2A/60; margin-top: 15px;">
                  This email was sent from BeautyFeel. Please do not reply directly to this email.
                </p>
                <!-- Optional: Social links, address -->
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`;
}

export async function sendEmailsAction(
  customerIds: string[],
  subjectTemplate: string, // Renamed to indicate it's a template
  bodyTemplate: string, // Renamed to indicate it's a template
): Promise<{
  success: boolean;
  message: string;
  details?: { sent: number; failed: number; errors: string[] };
}> {
  try {
    console.log("Received send email request:", {
      customerIds,
      subjectTemplate,
    });

    if (!customerIds || customerIds.length === 0) {
      return { success: false, message: "No recipients selected." };
    }
    if (!subjectTemplate?.trim()) {
      return { success: false, message: "Subject template cannot be empty." };
    }

    if (!resendInstanceSA) {
      console.error(
        "Resend API key is missing or invalid. Emails cannot be sent.",
      );
      return {
        success: false,
        message: "Email sending service is not configured.",
      };
    }
    if (!SENDER_EMAIL_SA) {
      console.error("Sender email (SENDER_EMAIL_SA) is not configured.");
      return {
        success: false,
        message:
          "Sender email address is not configured for the email service.",
      };
    }

    const allCustomers = await getCustomersForEmailAction(); // This should be efficient if cached
    const recipients = allCustomers.filter(
      (c) => customerIds.includes(c.id) && c.email && c.email.trim() !== "",
    );

    if (recipients.length === 0) {
      return {
        success: false,
        message: "No valid recipients found with email addresses.",
      };
    }

    let sentCount = 0;
    let failedCount = 0;
    const errorMessages: string[] = [];

    console.log(
      `Attempting to send emails to ${recipients.length} recipients individually...`,
    );

    // 2. Loop through each recipient, personalize, and send.
    for (const customer of recipients) {
      if (!customer.email) {
        // Should be filtered, but good to double-check
        failedCount++;
        errorMessages.push(
          `Skipped: Customer ${customer.name || customer.id} has no email.`,
        );
        continue;
      }

      const personalizedSubject = replacePlaceholders(
        subjectTemplate,
        customer,
      );
      const personalizedBody = replacePlaceholders(bodyTemplate, customer); // This is the plain text body

      const htmlContent = generateEmailHtml(
        personalizedSubject,
        personalizedBody, // Pass the personalized plain text body for HTML generation
        LOGO_URL_SA,
      );

      try {
        console.log(
          `Sending to: ${customer.email}, Subject: ${personalizedSubject}`,
        );
        const resendResponse = await resendInstanceSA.emails.send({
          from: SENDER_EMAIL_SA,
          to: customer.email, // Send to individual customer
          subject: personalizedSubject,
          text: personalizedBody, // Personalized plain text version
          html: htmlContent, // Personalized HTML version
        });

        if (resendResponse?.data?.id) {
          console.log(
            `Email to ${customer.email} queued successfully: ${resendResponse.data.id}`,
          );
          sentCount++;
        } else {
          console.error(
            `Resend call failed or unexpected response for ${customer.email}:`,
            resendResponse,
          );
          failedCount++;
          errorMessages.push(
            `Failed for ${customer.email}: ${resendResponse?.error?.message || "Unexpected response"}`,
          );
        }
      } catch (emailError: any) {
        console.error(
          `Error sending email to ${customer.email} via Resend:`,
          emailError,
        );
        failedCount++;
        errorMessages.push(
          `Error for ${customer.email}: ${emailError.message || "Unknown error"}`,
        );
      }
    }

    let finalMessage = "";
    if (sentCount > 0) {
      finalMessage += `${sentCount} email(s) queued successfully. `;
    }
    if (failedCount > 0) {
      finalMessage += `${failedCount} email(s) failed to send.`;
      // You might want to log `errorMessages` on the server for admin review
    }
    if (sentCount === 0 && failedCount === 0) {
      // Should not happen if recipients.length > 0
      finalMessage =
        "No emails were processed. Check recipient list and server logs.";
    }

    return {
      success: sentCount > 0 && failedCount === 0, // Consider success true if at least one sent
      message: finalMessage.trim(),
      details: {
        // Optional: provide more details back to the client if needed
        sent: sentCount,
        failed: failedCount,
        errors: errorMessages,
      },
    };
  } catch (error: any) {
    console.error("Overall error in sendEmailsAction:", error);
    return {
      success: false,
      message: `Failed to process email sending request: ${error.message || "An unknown error occurred."}`,
    };
  }
}

export async function getEmailTemplatesAction() {
  const cachedTemplates = getCachedData<EmailTemplate[]>(TEMPLATES_CACHE_KEY);
  if (cachedTemplates) {
    return cachedTemplates;
  }

  try {
    const templates = await prisma.emailTemplate.findMany({
      orderBy: { name: "asc" },
    });
    setCachedData(TEMPLATES_CACHE_KEY, templates);
    return templates;
  } catch (error) {
    console.error("Error fetching email templates:", error);
    throw new Error("Could not fetch email templates.");
  }
}

export async function getActiveEmailTemplatesAction() {
  // This could also be cached with a different key if frequently accessed
  try {
    const templates = await prisma.emailTemplate.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        subject: true,
        body: true,
        placeholders: true,
      }, // Select only needed fields
    });
    return templates;
  } catch (error) {
    console.error("Error fetching active email templates:", error);
    throw new Error("Could not fetch active email templates.");
  }
}

export async function createEmailTemplateAction(
  data: z.infer<typeof EmailTemplateSchema>,
) {
  try {
    const validation = EmailTemplateSchema.safeParse(data);
    if (!validation.success) {
      return {
        success: false,
        message: "Validation failed.",
        errors: validation.error.flatten().fieldErrors,
      };
    }

    const existingTemplate = await prisma.emailTemplate.findFirst({
      where: { name: { equals: validation.data.name, mode: "insensitive" } },
    });
    if (existingTemplate) {
      return {
        success: false,
        message: "An email template with this name already exists.",
      };
    }

    const newTemplate = await prisma.emailTemplate.create({
      data: validation.data,
    });
    invalidateCache(TEMPLATES_CACHE_KEY);
    revalidatePath("/dashboard/settings/email-templates"); // Adjust your path
    return {
      success: true,
      message: "Email template created successfully.",
      template: newTemplate,
    };
  } catch (error: any) {
    console.error("Error creating email template:", error);
    // Check for Prisma specific unique constraint error if name check above misses a race condition
    if (error.code === "P2002" && error.meta?.target?.includes("name")) {
      return {
        success: false,
        message: "An email template with this name already exists.",
      };
    }
    return {
      success: false,
      message: error.message || "Could not create email template.",
    };
  }
}

// --- Action to update an existing template ---
export async function updateEmailTemplateAction(
  id: string,
  data: z.infer<typeof EmailTemplateSchema>,
) {
  try {
    const validation = EmailTemplateSchema.safeParse(data);
    if (!validation.success) {
      return {
        success: false,
        message: "Validation failed.",
        errors: validation.error.flatten().fieldErrors,
      };
    }

    // Check for unique name (case-insensitive, excluding self)
    const existingTemplate = await prisma.emailTemplate.findFirst({
      where: {
        name: { equals: validation.data.name, mode: "insensitive" },
        id: { not: id },
      },
    });
    if (existingTemplate) {
      return {
        success: false,
        message: "Another email template with this name already exists.",
      };
    }

    const updatedTemplate = await prisma.emailTemplate.update({
      where: { id },
      data: validation.data,
    });
    invalidateCache(TEMPLATES_CACHE_KEY);
    revalidatePath("/dashboard/settings/email-templates"); // Adjust your path
    return {
      success: true,
      message: "Email template updated successfully.",
      template: updatedTemplate,
    };
  } catch (error: any) {
    console.error("Error updating email template:", error);
    if (error.code === "P2002" && error.meta?.target?.includes("name")) {
      return {
        success: false,
        message: "Another email template with this name already exists.",
      };
    }
    return {
      success: false,
      message: error.message || "Could not update email template.",
    };
  }
}

// --- Action to delete a template ---
export async function deleteEmailTemplateAction(id: string) {
  try {
    await prisma.emailTemplate.delete({
      where: { id },
    });
    invalidateCache(TEMPLATES_CACHE_KEY);
    revalidatePath("/dashboard/settings/email-templates"); // Adjust your path
    return { success: true, message: "Email template deleted successfully." };
  } catch (error) {
    console.error("Error deleting email template:", error);
    return { success: false, message: "Could not delete email template." };
  }
}

export async function getCustomersAction(): Promise<CustomerForDisplay[]> {
  // Add caching here if desired, similar to ManageAccounts
  try {
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        totalPaid: true,
        nextAppointment: true,
      },
      orderBy: {
        name: "asc",
      },
    });
    // Note: Prisma returns Float for totalPaid. If your schema uses Int, adjust accordingly.
    // If totalPaid is Int (minor units), convert it here:
    // return customers.map(c => ({ ...c, totalPaid: c.totalPaid / 100 }));
    return customers; // Assuming totalPaid is already in the desired unit or Float
  } catch (error) {
    console.error("Error fetching customers:", error);
    throw new Error("Failed to fetch customers. Please try again.");
  }
}

// 2. Create Customer Action
export async function createCustomerAction(formData: FormData): Promise<{
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}> {
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
  };

  const validation = CustomerSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      success: false,
      message: "Validation failed. Please check your input.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const { name, email } = validation.data;
  const finalEmail = email?.trim() || null; // Trim and set to null if empty

  try {
    // Check email uniqueness before creating
    if (finalEmail && !(await isEmailUnique(finalEmail))) {
      return {
        success: false,
        message: "Validation failed.",
        errors: { email: ["This email address is already in use."] },
      };
    }

    await prisma.customer.create({
      data: {
        name,
        email: finalEmail,
        // totalPaid will default to 0
      },
    });

    invalidateCache(CUSTOMERS_CACHE_KEY); // Invalidate cache on success
    return { success: true, message: "Customer created successfully." };
  } catch (error) {
    console.error("Error creating customer:", error);
    return {
      success: false,
      message: "An unexpected error occurred while creating the customer.",
    };
  }
}

// 3. Update Customer Action
export async function updateCustomerAction(
  id: string,
  formData: FormData,
): Promise<{
  success: boolean;
  message?: string;
  errors?: Record<string, string[]>;
}> {
  const rawData = {
    name: formData.get("name"),
    email: formData.get("email"),
  };

  const validation = CustomerSchema.safeParse(rawData);

  if (!validation.success) {
    return {
      success: false,
      message: "Validation failed. Please check your input.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const { name, email } = validation.data;
  const finalEmail = email?.trim() || null; // Trim and set to null if empty

  try {
    // Check email uniqueness (excluding self) before updating
    if (finalEmail && !(await isEmailUnique(finalEmail, id))) {
      return {
        success: false,
        message: "Validation failed.",
        errors: {
          email: ["This email address is already in use by another customer."],
        },
      };
    }

    await prisma.customer.update({
      where: { id },
      data: {
        name,
        email: finalEmail,
      },
    });

    invalidateCache(CUSTOMERS_CACHE_KEY); // Invalidate cache on success
    return { success: true, message: "Customer updated successfully." };
  } catch (error) {
    console.error(`Error updating customer ${id}:`, error);
    // Check for specific Prisma errors like P2025 (Record not found)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { success: false, message: "Customer not found." };
    }
    return {
      success: false,
      message: "An unexpected error occurred while updating the customer.",
    };
  }
}

// 4. Delete Customer Action
export async function deleteCustomerAction(id: string): Promise<{
  success: boolean;
  message?: string;
}> {
  try {
    await prisma.customer.delete({
      where: { id },
    });

    invalidateCache(CUSTOMERS_CACHE_KEY); // Invalidate cache on success
    return { success: true, message: "Customer deleted successfully." };
  } catch (error) {
    console.error(`Error deleting customer ${id}:`, error);

    // Check for Prisma's foreign key constraint violation error (P2003)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2003"
    ) {
      return {
        success: false,
        message:
          "Cannot delete this customer. They have associated records (e.g., transactions). Please remove those records first.",
      };
    }
    // Check for record not found (P2025)
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return { success: false, message: "Customer not found." };
    }

    return {
      success: false,
      message: "An unexpected error occurred while deleting the customer.",
    };
  }
}
