"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import { PrismaClientValidationError } from "@prisma/client/runtime/library";
import bcrypt from "bcryptjs";
import { getServerSession } from "next-auth";
import { authOptions } from "./authOptions";
import prisma from "@/lib/prisma";
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
  Transaction,
  RecommendedAppointment,
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
} from "date-fns";

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

interface CustomerWithDetails {
  id: string;
  name: string;
  email: string | null;
  totalPaid: number;
  nextAppointment: Date | null;
  transactions: Array<
    Pick<
      Transaction,
      "id" | "createdAt" | "grandTotal" | "status" | "bookedFor"
    > & {
      availedServices: Array<{
        service?: { title: string } | null;
        originatingSetTitle?: string | null;
      }>;
    }
  >;
  recommendedAppointments: Array<
    Pick<RecommendedAppointment, "id" | "recommendedDate" | "status"> & {
      originatingService?: { title: string } | null;
    }
  >;
  purchasedGiftCertificatesCount: number;
}

interface GcCreationData {
  code: string;
  itemIds: string[];
  itemType: "service" | "set";
  purchaserCustomerId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  expiresAt?: string | null;
}

interface ActionResult {
  success: boolean;
  message: string;
}

interface ActionResult {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  account?: {
    id: string;
    username: string;
    email: string | null;
    name: string;
  };
}

export type GCValidationDetails = GiftCertificate & {
  services: Pick<Service, "id" | "title" | "price">[];
  serviceSets: Pick<ServiceSet, "id" | "title" | "price">[];
  purchaserCustomer?: Pick<Customer, "id" | "name" | "email"> | null;
};

interface GCValidationResult {
  success: boolean;
  message: string;
  gcDetails?: GCValidationDetails;
  errorCode?: "NOT_FOUND" | "USED" | "EXPIRED" | "INVALID_DATA";
}

interface UpdateTransactionInput {
  transactionId: string;
  status?: Status;
  paymentMethod?: PaymentMethod | null;
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
  const targetDateString = formatter.format(nowUtc);
  const [yearStr, monthStr, dayStr] = targetDateString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
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
    .or(z.literal("")),
});

const isEmailUnique = async (
  email: string,
  currentId: string | null = null,
): Promise<boolean> => {
  if (!email) return true;
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

const PHILIPPINES_TIMEZONE = "Asia/Manila";
const MANILA_OFFSET_HOURS = 8;
const PHT_TIMEZONE_OFFSET_HOURS = 8;

const resendApiKeySA =
  process.env.RESEND_API_KEY || "re_2jVrmuDq_ANKBi91TjmsYVj8Gv7VHZfZD";
const resendInstanceSA = resendApiKeySA ? new Resend(resendApiKeySA) : null;
if (!resendInstanceSA && process.env.NODE_ENV === "production") {
  console.warn(
    "WARNING (ServerAction): RESEND_API_KEY is not set. Booking confirmation emails will NOT be sent.",
  );
}
const SENDER_EMAIL_SA = process.env.SENDER_EMAIL || "clinic@beautyfeel.net";
const LOGO_URL_SA =
  process.env.LOGO_URL || "https://beautyfeel.net/btfeel-icon.png";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "An unknown error occurred";
}

function generateRandomPassword(length: number = 6): string {
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
      newErrors[key] = [errorObj[key]];
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

  return result;
}

function generateBookingConfirmationBodySA(
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

  const appointmentReminderHtml = `
    <p style="font-weight: bold; margin-top: 20px; margin-bottom: 5px; color: #555;">Appointment Reminder:</p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      To manage your waiting time, we accept pre-booked appointments but walk-ins are also welcome.
      With this, please be on time on your scheduled appointment. A grace period of 15 minutes will be given.
      Afterwards, your appointment will be automatically cancelled and will treat you as walk-in (first come, first serve).
    </p>
  `;

  const cancellationReminderHtml = `
    <p style="font-weight: bold; margin-top: 20px; margin-bottom: 5px; color: #555;">Cancellation/No Show Reminder:</p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      All Appointment Cancellations less than 3 hours prior to scheduled time, will result to a <strong>50% charge</strong> of your service cost.
    </p>
    <p style="margin-bottom: 10px; font-size: 15px;">
      All "No Shows" will be charged <strong>100% of your service cost</strong>.
    </p>
  `;

  const reminderSectionHtml = `
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eeeeee;">
        <p style="font-size: 18px; font-weight: bold; margin-bottom: 15px; text-align: center; color: #2c3e50;">Important Reminders</p>
        ${appointmentReminderHtml}
        ${cancellationReminderHtml}
      </div>
    `;

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
  `.trim();
}

function generateBookingEmailHTMLSA(
  bodyContent: string,
  subjectLine: string,
  logoUrl: string,
): string {
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

  return `
<p><strong>Date:</strong> ${formattedDate}<br>
<strong>Time:</strong> ${formattedTime}</p>
<p><strong>Services Booked:</strong></p>
<ul>${serviceListItemsHtml}</ul>
  `.trim();
}

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
    const emailTemplate = await prisma.emailTemplate.findUnique({
      where: { name: "Booking Confirmation" },
    });

    if (!emailTemplate || !emailTemplate.isActive) {
      console.warn(
        "sendBookingConfirmationEmail: 'Booking Confirmation' email template not found or is inactive. Skipping email.",
      );
      return;
    }

    const bookingDetailsHtml = generateBookingDetailsHtml(
      bookingDateTimeUTC,
      services,
    );

    let processedSubject = emailTemplate.subject.replace(
      /{{customerName}}/g,
      customerName,
    );

    let templateBodyContent = emailTemplate.body;
    templateBodyContent = templateBodyContent.replace(
      /{{subject}}/g,
      processedSubject,
    );
    templateBodyContent = templateBodyContent.replace(
      /{{customerName}}/g,
      customerName,
    );
    templateBodyContent = templateBodyContent.replace(
      /{{bookingDetailsHtml}}/g,
      bookingDetailsHtml,
    );

    const fullEmailHtml = generateEmailHtml(
      processedSubject,
      templateBodyContent,
      logoUrl,
    );

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

    const { data: emailSentData, error: emailSendError } =
      await resendInstanceSA.emails.send({
        from: SENDER_EMAIL_SA,
        to: [customerEmail],
        subject: processedSubject,
        html: fullEmailHtml,
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

/*
const stringToBoolean = z.preprocess(
  (val) => String(val).toLowerCase() === "true",
  z.boolean(),
);


const emptyStringToNull = z.preprocess((val) => {

  if (val === "") return null;

  return val;
}, z.string().nullable());

const baseServiceSchema = z.object({
  title: z.string().min(1, "Service Title is required.").max(255),
  description: emptyStringToNull,
  price: z.coerce
    .number()
    .int()
    .nonnegative("Price must be a non-negative integer."),
  branchId: z.string().min(1, "Branch is required."),
  followUpPolicy: z.nativeEnum(FollowUpPolicy, {
    required_error: "Follow-up policy is required.",
    invalid_type_error: "Invalid follow-up policy.",
  }),

  recommendedFollowUpDays: z.coerce
    .number()
    .int()
    .positive("Recommended days must be a positive integer.")
    .nullable(),



  sendPostTreatmentEmail: stringToBoolean,

  postTreatmentEmailSubject: emptyStringToNull,

  postTreatmentInstructions: emptyStringToNull,

});

const serviceSchema = baseServiceSchema.superRefine((data, ctx) => {

  if (data.followUpPolicy !== FollowUpPolicy.NONE) {
    if (
      data.recommendedFollowUpDays === null ||
      data.recommendedFollowUpDays === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recommended days required for selected follow-up policy.",
        path: ["recommendedFollowUpDays"],
      });
    }
  } else {


    if (
      data.recommendedFollowUpDays !== null &&
      data.recommendedFollowUpDays !== undefined
    ) {





    }
  }


  if (data.sendPostTreatmentEmail === true) {
    if (
      !data.postTreatmentEmailSubject ||
      data.postTreatmentEmailSubject.trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email subject is required if sending post-treatment email.",
        path: ["postTreatmentEmailSubject"],
      });
    }
    if (
      !data.postTreatmentInstructions ||
      data.postTreatmentInstructions.trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Instructions are required if sending post-treatment email.",
        path: ["postTreatmentInstructions"],
      });
    }
  } else {










  }
});

const baseServiceFormDataSchema = z.object({
  title: z
    .union([z.string(), z.null()])
    .transform((v) =>
      v === null || v === undefined || v === "" ? null : v.trim(),
    )
    .pipe(z.string().min(1, "Title is required.")),

  description: z
    .union([z.string(), z.null()])
    .transform((v) =>
      v === null || v === undefined || v === "" ? null : v.trim(),
    )
    .pipe(z.string().nullable()),

  price: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v))
    .pipe(
      z
        .string()
        .min(1, "Price is required.")
        .transform((v) => Number(v)),
    ),

  branchId: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v))
    .pipe(z.string().min(1, "Branch is required.")),

  recommendedFollowUpDays: z
    .union([z.string(), z.null()])
    .transform((v) => {
      const val = v === null || v === undefined || v === "" ? null : v;
      if (val === null) return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    })
    .pipe(z.number().nullable()),

  followUpPolicy: z
    .union([z.string(), z.null()])
    .transform((v) => (v === null || v === undefined || v === "" ? null : v))
    .pipe(
      z.nativeEnum(FollowUpPolicy, {
        errorMap: () => ({ message: "Invalid follow-up policy selected." }),
      }),
    ),
});

const partialServiceSchema = baseServiceFormDataSchema
  .partial()
  .superRefine((data, ctx) => {
    const {
      title,
      description,
      price,
      branchId,
      recommendedFollowUpDays,
      followUpPolicy,
    } = data;

    if (price !== undefined) {
      if (!Number.isInteger(price) || price < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Price must be a non-negative integer.",
          path: ["price"],
        });
      }
    }

    if (
      followUpPolicy !== undefined &&
      followUpPolicy !== FollowUpPolicy.NONE
    ) {
      if (
        recommendedFollowUpDays === null ||
        recommendedFollowUpDays === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days is required for this policy.",
          path: ["recommendedFollowUpDays"],
        });
      } else if (
        !Number.isInteger(recommendedFollowUpDays) ||
        recommendedFollowUpDays <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days must be a positive integer.",
          path: ["recommendedFollowUpDays"],
        });
      }
    }
  });

  */

const stringToBoolean = z.preprocess(
  (val) => String(val).toLowerCase() === "true",
  z.boolean(),
);

const emptyStringToNull = z.preprocess((val) => {
  if (val === undefined || val === null) return null;

  if (String(val).trim() === "") return null;

  return val;
}, z.string().nullable());

const coerceNumberOrNull = z.preprocess((val) => {
  if (val === undefined || val === null || String(val).trim() === "")
    return null;
  const num = Number(val);
  return isNaN(num) ? null : num;
}, z.number().nullable());

const unifiedBaseServiceSchema = z.object({
  title: emptyStringToNull.pipe(
    z.string().min(1, "Service Title is required."),
  ),
  description: emptyStringToNull,
  price: coerceNumberOrNull.pipe(
    z
      .number()
      .int()
      .nonnegative("Price must be a non-negative integer.")
      .min(0, "Price cannot be negative."),
  ),
  branchId: emptyStringToNull.pipe(z.string().min(1, "Branch is required.")),

  followUpPolicy: emptyStringToNull.pipe(
    z.nativeEnum(FollowUpPolicy, {
      errorMap: () => ({ message: "Invalid follow-up policy selected." }),
    }),
  ),
  recommendedFollowUpDays: coerceNumberOrNull.pipe(
    z
      .number()
      .int()
      .positive("Recommended days must be a positive integer.")
      .nullable(),
  ),

  sendPostTreatmentEmail: stringToBoolean,
  postTreatmentEmailSubject: emptyStringToNull,
  postTreatmentInstructions: emptyStringToNull,
});

const serviceSchema = unifiedBaseServiceSchema.superRefine((data, ctx) => {
  if (data.followUpPolicy !== FollowUpPolicy.NONE) {
    if (
      data.recommendedFollowUpDays === null ||
      data.recommendedFollowUpDays === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Recommended days required for selected follow-up policy.",
        path: ["recommendedFollowUpDays"],
      });
    }
  }

  if (data.sendPostTreatmentEmail === true) {
    if (
      !data.postTreatmentEmailSubject ||
      data.postTreatmentEmailSubject.trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email subject is required if sending post-treatment email.",
        path: ["postTreatmentEmailSubject"],
      });
    }
    if (
      !data.postTreatmentInstructions ||
      data.postTreatmentInstructions.trim() === ""
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Instructions are required if sending post-treatment email.",
        path: ["postTreatmentInstructions"],
      });
    }
  }
});

const partialServiceSchema = unifiedBaseServiceSchema
  .partial()
  .superRefine((data, ctx) => {
    if (
      data.followUpPolicy !== undefined &&
      data.followUpPolicy !== FollowUpPolicy.NONE
    ) {
      if (
        data.recommendedFollowUpDays === null ||
        data.recommendedFollowUpDays === undefined
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days required for selected follow-up policy.",
          path: ["recommendedFollowUpDays"],
        });
      } else if (
        !Number.isInteger(data.recommendedFollowUpDays) ||
        data.recommendedFollowUpDays <= 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Recommended days must be a positive integer.",
          path: ["recommendedFollowUpDays"],
        });
      }
    }

    if (data.sendPostTreatmentEmail === true) {
      if (
        data.postTreatmentEmailSubject !== undefined &&
        (!data.postTreatmentEmailSubject ||
          data.postTreatmentEmailSubject.trim() === "")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Email subject is required if sending post-treatment email.",
          path: ["postTreatmentEmailSubject"],
        });
      }

      if (
        data.postTreatmentInstructions !== undefined &&
        (!data.postTreatmentInstructions ||
          data.postTreatmentInstructions.trim() === "")
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Instructions are required if sending post-treatment email.",
          path: ["postTreatmentInstructions"],
        });
      }
    }

    if (data.price !== undefined) {
      if (!Number.isInteger(data.price) || data.price < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Price must be a non-negative integer.",
          path: ["price"],
        });
      }
    }
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

export async function generatePayslipData(
  accountId: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  baseSalary: number;
  totalCommissions: number;
  totalDeductions: number;
  totalBonuses: number;
  netPay: number;
}> {
  console.log(
    `[generatePayslipData] Calculating payslip data for Account ID: ${accountId}`,
  );
  console.log(`[generatePayslipData] Received Period Start Date: ${startDate}`);
  console.log(`[generatePayslipData] Received Period End Date: ${endDate}`);

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { dailyRate: true, name: true },
    });

    if (!account) {
      throw new Error(
        `Account not found for payslip generation (ID: ${accountId}).`,
      );
    }

    const dailyRate = account.dailyRate ?? 0;
    console.log(
      `[generatePayslipData] Account: ${account.name}, Daily Rate fetched: ${dailyRate}`,
    );

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId: accountId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        isPresent: true,
      },
      select: {
        id: true,
        date: true,
      },
    });
    const presentDays = attendanceRecords.length;
    const baseSalary = presentDays * dailyRate;
    console.log(
      `[generatePayslipData] Found ${presentDays} present days in period.`,
    );
    console.log(
      `[generatePayslipData] Calculated Base Salary: ${presentDays} days * ${dailyRate} rate = ${baseSalary}`,
    );

    const inclusiveEndDate = endOfDay(endDate);
    console.log(
      `[generatePayslipData] Fetching served/completed items between ${startDate} (inclusive start) and ${inclusiveEndDate} (inclusive end)`,
    );

    const servedItems = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE,
        completedAt: {
          gte: startDate,
          lte: inclusiveEndDate,
        },
        commissionValue: {
          gt: 0,
        },
      },
      select: {
        commissionValue: true,
        service: { select: { title: true } },
        completedAt: true,
      },
    });

    const totalCommissions = servedItems.reduce((sum, item) => {
      return sum + (item.commissionValue ?? 0);
    }, 0);

    console.log(
      `[generatePayslipData] Found ${servedItems.length} served items with commission completed in period.`,
    );
    console.log(
      `[generatePayslipData] Calculated Total Commissions: ${totalCommissions}`,
    );

    if (servedItems.length > 0) {
      console.log("[generatePayslipData] Commission Breakdown Items Found:");
      servedItems.forEach((item) =>
        console.log(
          `  - Service: ${item.service?.title || "Unknown Service"}, Commission: ${item.commissionValue}, Completed At: ${item.completedAt}`,
        ),
      );
    }

    const totalDeductions = 0;
    console.log(
      `[generatePayslipData] Calculated Total Deductions: ${totalDeductions} (Placeholder - Implement logic)`,
    );

    const totalBonuses = 0;
    console.log(
      `[generatePayslipData] Calculated Total Bonuses: ${totalBonuses} (Placeholder - Implement logic)`,
    );

    const netPay =
      baseSalary + totalCommissions + totalBonuses - totalDeductions;
    console.log(
      `[generatePayslipData] Calculated Net Pay: (${baseSalary} Base + ${totalCommissions} Comm + ${totalBonuses} Bonus) - ${totalDeductions} Deduct = ${netPay}`,
    );

    console.log("[generatePayslipData] Calculation complete. Returning data.");
    return {
      baseSalary,
      totalCommissions,
      totalDeductions,
      totalBonuses,
      netPay,
    };
  } catch (error: any) {
    console.error(
      `[generatePayslipData] Error calculating payslip data for Account ID ${accountId}:`,
      error,
    );

    throw new Error(
      `Failed to generate payslip data for account ${accountId}. Reason: ${error.message}`,
    );
  }
}

export interface MonthlySalesData {
  month: string;
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
  dailyRate: number;
  branchId: string | null;
  branch: {
    id: string;
    title: string;
  } | null;
};

type ServiceProps = {
  id: string;
  title: string;
  price: number;
  quantity: number;
};

type ServiceAvailed = {
  id: string;
  title: string;
  quantity: number;
  price: number;
};
export const getAllBranches = async (): Promise<Branch[]> => {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { title: "asc" },
    });
    console.log("[ServerAction] Fetched branches:", branches.length);
    return branches;
  } catch (error) {
    console.error("[ServerAction] Error fetching branches:", error);

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
      const services = await prisma.service.findMany({
        where: {
          branchId: branchId !== "all" ? branchId : undefined,
        },
        orderBy: {
          title: "asc",
        },
        select: {
          id: true,
          title: true,
          price: true,
        },
      });
      console.log(
        `[ServerAction] Found ${services.length} services for Type='${serviceType}', Branch='${branchId}'`,
      );

      return services.map((service) => ({
        value: service.id,
        label: `${service.title} - ₱${service.price.toLocaleString()}`,
      }));
    } else if (serviceType === "set") {
      const serviceSets = await prisma.serviceSet.findMany({
        orderBy: {
          title: "asc",
        },
        select: {
          id: true,
          title: true,
          price: true,
        },
      });
      console.log(
        `[ServerAction] Found ${serviceSets.length} service sets for Type='${serviceType}'`,
      );

      return serviceSets.map((set) => ({
        value: set.id,
        label: `${set.title} - ₱${set.price.toLocaleString()}`,
      }));
    } else {
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

    return [];
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
          },
          orderBy: {
            recommendedDate: "asc",
          },
          select: {
            id: true,
            recommendedDate: true,
            status: true,
            originatingService: {
              select: {
                id: true,
                title: true,

                followUpPolicy: true,
              },
            },
          },
        },
      },
      take: 10,
    });

    console.log(
      "Server: Prisma fetched customers:",
      JSON.stringify(customers, null, 2),
    );

    const result: CustomerWithRecommendations[] = customers.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      recommendedAppointments: customer.recommendedAppointments.map((ra) => ({
        id: ra.id,
        recommendedDate: ra.recommendedDate.toISOString(),
        status: ra.status,
        originatingService: ra.originatingService
          ? {
              id: ra.originatingService.id,
              title: ra.originatingService.title,

              followUpPolicy: ra.originatingService.followUpPolicy,
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to check voucher.");
  }

  try {
    const upperCode = code.trim().toUpperCase();
    const foundCode = await prisma.voucher.findUnique({
      where: { code: upperCode },
    });

    if (!foundCode) {
      return { status: false, error: "Invalid voucher code" };
    }

    if (foundCode.usedAt) {
      return { status: false, error: "Voucher has already been used" };
    }

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required.");
  }

  const allowedRoles: Role[] = [Role.OWNER, Role.CASHIER];
  if (!session.user.role?.some((role) => allowedRoles.includes(role))) {
    throw new Error(
      "Unauthorized: You do not have permission to view all vouchers.",
    );
  }

  console.log("Server Action: getAllVouchers executing...");
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: {
        usedAt: "asc",
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
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view services.");
  }

  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      include: { branch: { select: { title: true } } },
    });
    return services;
  } catch (error) {
    console.error("Error fetching services:", error);
    return [];
  }
}

export async function getAllServicesOnly(): Promise<Service[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view services.");
  }

  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
    });
    return services;
  } catch (error) {
    console.error("Error fetching only services:", error);
    return [];
  }
}

export async function getAllServiceSets(): Promise<ServiceSet[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new Error("Authentication required to view service sets.");
  }

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

  recipientEmail: z
    .string()
    .trim()
    .email({ message: "Invalid email format provided." })
    .optional()
    .or(z.literal(""))
    .nullable(),
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
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid start date format (YYYY-MM-DD)"),
    endDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid end date format (YYYY-MM-DD)"),
    applyTo: z.enum(["all", "specific"]),
    serviceIds: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate && data.startDate > data.endDate) {
        return false;
      }
      return true;
    },
    {
      message: "End date cannot be before start date.",
      path: ["endDate"],
    },
  );

const getStartOfTodayPHT = (): Date => {
  const now = new Date();

  const phtDateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [yearStr, monthStr, dayStr] = phtDateFormatter.format(now).split("-");

  return new Date(
    Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr)),
  );
};

export async function transactionSubmission(
  transactionForm: CashierState,
): Promise<TransactionSubmissionResponse> {
  let bookingDateTimeForConfirmationEmail: Date | null = null;
  let servicesForConfirmationEmail: { name: string }[] = [];
  const transactionProcessingStartTimeUTC = new Date(); // Mark start time

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

    // --- Validation ---
    const errors: Record<string, string> = {};
    if (!name || !name.trim()) errors.name = "Customer name is required.";
    const trimmedEmail = email?.trim() || null;

    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      errors.email = "Invalid email format.";
    }
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service or set must be selected.";
    }
    // Note: Payment method validation is included in the original code, good.
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

    const customerNameFormatted = formatName(name); // Assuming formatName utility
    let finalBookingDateTimeUTC = transactionProcessingStartTimeUTC; // Default to now if serveTime is 'now'

    if (serveTime === "later" && dateString && timeString) {
      try {
        const [year, month, day] = dateString.split("-").map(Number);
        const [hours, minutes] = timeString.split(":").map(Number);

        const phtEquivalentUTC = new Date(
          Date.UTC(year, month - 1, day, hours, minutes, 0),
        );
        const phtOffsetMs = MANILA_OFFSET_HOURS * 60 * 60 * 1000;
        const targetUTCMs = phtEquivalentUTC.getTime() - phtOffsetMs;

        finalBookingDateTimeUTC = new Date(targetUTCMs);

        if (isNaN(finalBookingDateTimeUTC.getTime())) {
          throw new Error(
            "Invalid date/time for 'later' booking after UTC conversion.",
          );
        }
        bookingDateTimeForConfirmationEmail = finalBookingDateTimeUTC; // Store for email
      } catch (e: any) {
        console.error(
          "Server Action: Error parsing date/time for 'later' booking:",
          e.message,
          e,
        );
        return {
          success: false,
          message: "Invalid date or time format for 'later' booking.",
          errors: { serveTime: ["Invalid date or time format provided."] },
        };
      }
    }

    // Start the database transaction
    const transactionResult = await prisma.$transaction(
      async (tx) => {
        // --- Customer Handling ---
        let customerRecord;
        // Try to find by ID first if transactionForm.customerId is available from cashier state
        if (transactionForm.customerId) {
          customerRecord = await tx.customer.findUnique({
            where: { id: transactionForm.customerId },
          });
        }
        // If not found by ID or no ID provided, try by name (less reliable for existing)
        if (!customerRecord) {
          customerRecord = await tx.customer.findFirst({
            where: { name: customerNameFormatted },
          });
        }

        if (customerRecord) {
          // Existing customer
          if (trimmedEmail && customerRecord.email !== trimmedEmail) {
            // Update email if changed and provided
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
              throw e; // Re-throw other errors
            }
          }
        } else {
          // New customer
          // Note: Original code threw error if email was missing for new customer
          // Let's make sure required fields are present for a new customer record
          if (!trimmedEmail)
            throw new Error(
              "Email is required to create a new customer profile.",
            );
          try {
            customerRecord = await tx.customer.create({
              data: { name: customerNameFormatted, email: trimmedEmail },
            });
          } catch (e: any) {
            if (e.code === "P2002" && e.meta?.target?.includes("email"))
              throw new Error(
                `The email "${trimmedEmail}" is already in use by another customer.`,
              );
            throw e; // Re-throw other errors
          }
        }

        // --- Voucher Handling ---
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
            data: { usedAt: new Date() }, // Mark as used
          });
          processedVoucherId = voucher.id;
        }

        // --- Transaction Record Creation ---
        const newTransactionRecord = await tx.transaction.create({
          data: {
            customerId: customerRecord.id,
            paymentMethod: paymentMethod as PaymentMethod, // Ensure paymentMethod is of PaymentMethod enum type
            grandTotal,
            discount: totalDiscount,
            status: Status.PENDING, // Initial status
            bookedFor: finalBookingDateTimeUTC, // Use the calculated booking time
            voucherId: processedVoucherId,
            createdAt: transactionProcessingStartTimeUTC, // Record when the transaction processing started
            // branchId might be needed if transactions are branch-specific
          },
        });

        // --- Optimization: Fetch all required service and set details in bulk ---
        const serviceItemIds = servicesAvailed
          .filter((item) => item.type === "service")
          .map((item) => item.id);
        const setItemIds = servicesAvailed
          .filter((item) => item.type === "set")
          .map((item) => item.id);

        // Fetch service details
        const serviceDetailsMap = new Map<
          string,
          { id: string; price: number }
        >();
        if (serviceItemIds.length > 0) {
          const serviceDetails = await tx.service.findMany({
            where: { id: { in: serviceItemIds } },
            select: { id: true, price: true },
          });
          serviceDetails.forEach((s) => serviceDetailsMap.set(s.id, s));
        }

        // Fetch set details and the services within them
        const setDetailsMap = new Map<
          string,
          {
            id: string;
            title: string;
            services: { id: string; price: number; title: string }[];
          }
        >();
        const servicesInSetsMap = new Map<
          string,
          { id: string; price: number; title: string }[]
        >();
        if (setItemIds.length > 0) {
          const setDetailsWithServices = await tx.serviceSet.findMany({
            where: { id: { in: setItemIds } },
            include: {
              services: { select: { id: true, price: true, title: true } }, // Services within the set
            },
          });
          setDetailsWithServices.forEach((set) => {
            setDetailsMap.set(set.id, set);
            servicesInSetsMap.set(set.id, set.services);
          });
        }
        // --- End Optimization Fetch ---

        // --- Availed Services Creation (Using fetched data) ---
        servicesForConfirmationEmail = []; // Reset for this transaction
        for (const item of servicesAvailed as AvailedItem[]) {
          // Cast to ensure type
          // Use item.name for confirmation email, assuming AvailedItem has `name` property
          // If not, adjust this to use service/set title from fetched data.
          servicesForConfirmationEmail.push({ name: item.name });

          if (item.type === "service") {
            const serviceDetails = serviceDetailsMap.get(item.id);

            // Calculate initial commission based on the original service price fetched
            const initialCommission = serviceDetails
              ? Math.floor(serviceDetails.price * SALARY_COMMISSION_RATE)
              : 0;

            await tx.availedService.create({
              data: {
                transactionId: newTransactionRecord.id,
                serviceId: item.id,
                quantity: item.quantity || 1, // Default to 1 if quantity not present
                price: item.originalPrice, // Use the price from the form/cart (can be affected by client-side logic/discounts)
                // Note: It might be better to store the *original* service price fetched
                // from the database here instead of item.originalPrice if you need
                // to reconstruct the transaction cost accurately server-side.
                commissionValue: initialCommission, // Calculated based on original price
                status: Status.PENDING, // Worker will mark as DONE
              },
            });
          } else if (item.type === "set") {
            const servicesInSet = servicesInSetsMap.get(item.id);
            const setDetails = setDetailsMap.get(item.id); // Get set title/id

            if (servicesInSet && setDetails) {
              for (const serviceInSet of servicesInSet) {
                // Commission for service within a set is based on its individual price
                const initialCommissionInSet = Math.floor(
                  serviceInSet.price * SALARY_COMMISSION_RATE,
                );
                await tx.availedService.create({
                  data: {
                    transactionId: newTransactionRecord.id,
                    serviceId: serviceInSet.id, // ID of the individual service in the set
                    quantity: item.quantity || 1, // Quantity of the set applies to each service in it
                    price: 0, // Price is typically on the set itself, not individual services within it for transaction purposes
                    commissionValue: initialCommissionInSet,
                    originatingSetId: setDetails.id,
                    originatingSetTitle: setDetails.title,
                    status: Status.PENDING,
                  },
                });
              }
            } else {
              console.warn(
                `[TX Submit] Set details or services not found for set ID: ${item.id}`,
              );
              // Decide how to handle this - maybe throw an error or log and continue?
              // Throwing might be safer to ensure data integrity.
              throw new Error(
                `Failed to find details for set "${item.name}". Please try again.`,
              );
            }
          } else {
            console.warn(
              `[TX Submit] Unknown item type encountered: ${item.type}`,
            );
            // Handle unexpected item types if necessary
          }
        }
        // --- End Availed Services Creation ---

        // --- Handle existing RA fulfillment and update customer.nextAppointment ---
        let customerIdForNextApptUpdate: string = customerRecord.id;

        if (selectedRecommendedAppointmentId) {
          const raToLink = await tx.recommendedAppointment.findUnique({
            where: { id: selectedRecommendedAppointmentId },
            include: {
              originatingService: {
                select: { id: true, followUpPolicy: true, title: true },
              },
            },
          });

          // Check if the RA exists, belongs to the customer, and is not already marked ATTENDED
          if (
            raToLink &&
            raToLink.customerId === customerRecord.id &&
            raToLink.status !== RecommendedAppointmentStatus.ATTENDED &&
            !raToLink.attendedTransactionId
          ) {
            let suppressNextGenFlag = false;
            // Determine if follow-up generation should be suppressed based on policy and user choice
            if (
              raToLink.originatingService?.followUpPolicy ===
              FollowUpPolicy.NONE
            ) {
              suppressNextGenFlag = true; // Always suppress if policy is NONE
            } else {
              // For ONCE or EVERY_TIME, suppress only if the user unchecked the box
              suppressNextGenFlag = !generateNewFollowUpForFulfilledRA;
            }
            await tx.recommendedAppointment.update({
              where: { id: selectedRecommendedAppointmentId },
              data: {
                status: RecommendedAppointmentStatus.ATTENDED,
                attendedTransactionId: newTransactionRecord.id,
                suppressNextFollowUpGeneration: suppressNextGenFlag,
              },
            });
            console.log(
              `[TX Submit] Linked RA ${selectedRecommendedAppointmentId} (${raToLink.originatingService?.title}) to TX ${newTransactionRecord.id}. suppressNextGen: ${suppressNextGenFlag}`,
            );
          } else {
            console.warn(
              `[TX Submit] Skipped linking RA ${selectedRecommendedAppointmentId}. Conditions not met or RA not found/already processed. RA found: ${!!raToLink}, Belongs to customer: ${raToLink?.customerId === customerRecord.id}, Status: ${raToLink?.status}, Attended TX: ${raToLink?.attendedTransactionId}`,
            );
          }
        }

        // Update customer's totalPaid
        await tx.customer.update({
          where: { id: customerRecord.id },
          data: { totalPaid: { increment: grandTotal } },
        });

        // Re-evaluate and Update customer.nextAppointment
        // This happens after an RA might have been marked ATTENDED
        const customerForNextApptQuery = await tx.customer.findUnique({
          where: { id: customerIdForNextApptUpdate },
          select: {
            recommendedAppointments: {
              where: {
                status: {
                  in: [
                    RecommendedAppointmentStatus.RECOMMENDED,
                    RecommendedAppointmentStatus.SCHEDULED,
                  ],
                },
                recommendedDate: { gte: startOfDay(new Date()) }, // Future active RAs from today onwards
              },
              orderBy: { recommendedDate: "asc" },
              take: 1,
              select: { recommendedDate: true },
            },
          },
        });
        const newEarliestActiveRADate =
          customerForNextApptQuery?.recommendedAppointments[0]
            ?.recommendedDate || null;
        await tx.customer.update({
          where: { id: customerIdForNextApptUpdate },
          data: { nextAppointment: newEarliestActiveRADate },
        });
        console.log(
          `[TX Submit] Updated customer ${customerIdForNextApptUpdate} nextAppointment to ${newEarliestActiveRADate?.toISOString() || "null"}`,
        );
        // --- End RA handling and nextAppointment update ---

        // Return necessary data from the transaction
        return {
          transaction: newTransactionRecord,
          customerForEmail: {
            name: customerRecord.name,
            email: customerRecord.email,
          },
        };
      },
      // Keep your desired client-side timeout, but note Accelerate has its own limit
      { timeout: 15000, maxWait: 10000 },
    );

    // Extract data from the transaction result
    const { transaction: createdTransaction, customerForEmail: customerData } =
      transactionResult;

    // Send booking confirmation email if applicable (outside the transaction)
    if (
      serveTime === "later" &&
      customerData?.email &&
      bookingDateTimeForConfirmationEmail
    ) {
      // Note: Error handling for the email sending should ideally be separate
      // so it doesn't fail the main transaction submission response.
      try {
        await sendBookingConfirmationEmail(
          customerData.name,
          customerData.email,
          bookingDateTimeForConfirmationEmail,
          servicesForConfirmationEmail,
          LOGO_URL_SA,
        );
      } catch (emailError) {
        console.error(
          "[TX Submit] Error sending confirmation email:",
          emailError,
        );
        // Optionally return a warning in the success response
        // return { success: true, transactionId: createdTransaction.id, warning: "Transaction saved, but confirmation email failed." };
      }
    }

    // Success response
    return { success: true, transactionId: createdTransaction.id };
  } catch (error: unknown) {
    // --- Centralized Error Handling ---
    console.error("[TX Submit] CRITICAL Error:", error);
    let message =
      "An unexpected error occurred during the transaction process.";
    const fieldErrors: Record<string, string[]> = {};

    if (error instanceof Error) {
      message = error.message; // Use the specific error message

      // Map specific known errors to field errors
      if (
        message.includes("email") &&
        (message.includes("already used") ||
          message.includes("associated with another customer") ||
          message.includes("required to create a new customer profile")) // Catch new customer email error
      ) {
        fieldErrors.email = [message];
      } else if (message.includes("voucher")) {
        fieldErrors.voucherCode = [message];
      } else if (
        message.includes("date or time format") ||
        message.includes("Invalid date/time")
      ) {
        fieldErrors.serveTime = [message];
      } else if (message.includes("Failed to find details for set")) {
        fieldErrors.servicesAvailed = [message]; // Link set error to services field
      }
      // Add more specific error checks if needed

      // If it's a Prisma Client KnownRequestError (like P6005), check its details
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as any).code === "string"
      ) {
        const prismaError = error as any; // Cast for easier access to potential Prisma properties

        if (prismaError.code === "P6005") {
          // This is the Accelerate Timeout error
          message =
            "The transaction took too long to complete. Please try again or simplify the transaction if possible.";
          fieldErrors.general = [message]; // Or link to a relevant field if applicable
          console.error(
            "Prisma Accelerate Timeout Error (P6005):",
            prismaError.message,
            prismaError.response?.body,
          );
        } else if (prismaError.code === "P2002") {
          // Catch P2002 unique constraint errors not explicitly handled above
          const target =
            prismaError.meta?.target?.join(", ") || "unknown field";
          message = `A unique constraint failed: ${target}. This usually means a record with the same value already exists.`;
          if (target.includes("email")) fieldErrors.email = [message];
          else if (target.includes("code")) fieldErrors.voucherCode = [message];
          else fieldErrors.general = [message];
        } else if (prismaError.code === "P2028") {
          // Generic transaction timeout (less specific than P6005 with Accelerate)
          message = "The transaction timed out. Please try again.";
          fieldErrors.general = [message];
        }
        // Add other specific Prisma error codes you want to handle with custom messages
      } else {
        // For generic Error objects or unknown errors not specifically handled
        fieldErrors.general = [message]; // Put the error message in a general bucket
      }
    } else {
      // Handle non-Error type throws
      fieldErrors.general = [message]; // Fallback to general error bucket
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

  const errors: Record<string, string[]> = {};

  if (!data.code || data.code.trim().length < 4) {
    errors.code = ["Code is required (min 4 chars)."];
  } else {
    data.code = data.code.trim().toUpperCase();
  }
  if (!data.itemIds || data.itemIds.length === 0) {
    errors.itemIds = ["Please select at least one service or set."];
  }
  if (!data.itemType || !["service", "set"].includes(data.itemType)) {
    errors.itemType = ["Invalid item type specified."];
  } else if (data.itemType === "set" && data.itemIds.length > 1) {
    errors.itemIds = ["Only one set can be selected for a Gift Certificate."];
  }

  const trimmedRecipientEmail = data.recipientEmail?.trim() || null;
  if (
    trimmedRecipientEmail &&
    !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(trimmedRecipientEmail)
  ) {
    errors.recipientEmail = ["Please enter a valid email address."];
  } else {
    data.recipientEmail = trimmedRecipientEmail;
  }

  const expiresAtDate = data.expiresAt ? new Date(data.expiresAt) : null;
  if (expiresAtDate && isNaN(expiresAtDate.getTime())) {
    errors.expiresAt = ["Invalid expiry date provided."];
  } else if (expiresAtDate) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dateToCheck = new Date(expiresAtDate);
    dateToCheck.setUTCHours(0, 0, 0, 0);
    if (dateToCheck < today) {
      errors.expiresAt = ["Expiry date cannot be in the past."];
    }
  }

  if (Object.keys(errors).length > 0) {
    console.error("[ServerAction] GC Validation Failed:", errors);
    return { success: false, message: "Validation failed.", errors };
  }

  let createdGC;
  let recipientCustomerId: string | null = null;

  try {
    const finalExpiresAtDate =
      data.expiresAt && !isNaN(new Date(data.expiresAt).getTime())
        ? new Date(data.expiresAt)
        : null;

    let recipientCustomerRecord: any | null = null;

    const transactionResult = await prisma.$transaction(async (tx) => {
      const existing = await tx.giftCertificate.findUnique({
        where: { code: data.code },
      });
      if (existing) {
        throw new Error(`Code "${data.code}" already exists.`);
      }

      if (data.recipientEmail) {
        recipientCustomerRecord = await tx.customer.findUnique({
          where: { email: data.recipientEmail },
        });

        if (!recipientCustomerRecord) {
          try {
            const nameToCreate =
              data.recipientName?.trim() || `Recipient for GC ${data.code}`;
            recipientCustomerRecord = await tx.customer.create({
              data: {
                name: nameToCreate,
                email: data.recipientEmail,
              },
            });
            console.log(
              `[ServerAction] Created new customer for GC recipient: ${recipientCustomerRecord.id}`,
            );
          } catch (e: any) {
            if (e.code === "P2002" && e.meta?.target?.includes("email")) {
              console.warn(
                `[ServerAction] Race condition: Customer with email ${data.recipientEmail} created concurrently. Fetching existing.`,
              );
              recipientCustomerRecord = await tx.customer.findUnique({
                where: { email: data.recipientEmail },
              });
              if (!recipientCustomerRecord) {
                throw new Error(
                  `Failed to retrieve customer with email ${data.recipientEmail} after conflict.`,
                );
              }
            } else {
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
        }

        recipientCustomerId = recipientCustomerRecord.id;
      } else {
        recipientCustomerId = null;
      }

      const prismaCreateData: any = {
        code: data.code,
        purchaserCustomer: data.purchaserCustomerId
          ? { connect: { id: data.purchaserCustomerId } }
          : undefined,
        recipientName: data.recipientName?.trim() || null,
        recipientEmail: data.recipientEmail,
        expiresAt: finalExpiresAtDate,

        ...(recipientCustomerId && {
          recipientCustomer: { connect: { id: recipientCustomerId } },
        }),

        services:
          data.itemType === "service" && data.itemIds.length > 0
            ? { connect: data.itemIds.map((id) => ({ id })) }
            : undefined,
        serviceSets:
          data.itemType === "set" && data.itemIds.length > 0
            ? { connect: data.itemIds.map((id) => ({ id })) }
            : undefined,
      };

      const newGC = await tx.giftCertificate.create({
        data: prismaCreateData,
        include: {
          services: { select: { title: true } },
          serviceSets: { select: { title: true } },
        },
      });

      console.log("[ServerAction] GC Created within transaction:", newGC.id);

      return {
        newGC,
        recipientCustomerId: recipientCustomerId,
      };
    });

    createdGC = transactionResult.newGC;

    recipientCustomerId = transactionResult.recipientCustomerId;

    if (
      createdGC.recipientEmail &&
      resendInstanceSA &&
      resendInstanceSA.emails &&
      resendInstanceSA.emails.send &&
      SENDER_EMAIL_SA &&
      LOGO_URL_SA
    ) {
      console.log(
        `[ServerAction] Attempting to send GC email to ${createdGC.recipientEmail} for code ${createdGC.code}`,
      );

      try {
        const gcEmailTemplate = await prisma.emailTemplate.findFirst({
          where: {
            name: "Gift Certificate Notification",
            isActive: true,
          },
        });

        if (!gcEmailTemplate) {
          console.warn(
            `[ServerAction] Gift Certificate email template "Gift Certificate Notification" not found or not active. Email not sent for GC ${createdGC.code}.`,
          );
        } else {
          console.log(
            `[ServerAction] Using template "${gcEmailTemplate.name}" for GC email.`,
          );

          const customerNameForEmail =
            createdGC.recipientName || "Valued Customer";
          const expiryInfo = formatGCExpiryDate(createdGC.expiresAt);

          const includedItems =
            data.itemType === "service"
              ? createdGC.services.map((s: { title: string }) => ({
                  name: s.title,
                }))
              : createdGC.serviceSets.map((s: { title: string }) => ({
                  name: s.title,
                }));

          const itemsListHtml =
            includedItems.length > 0
              ? `<ul>${includedItems
                  .map(
                    (item) =>
                      `<li style="margin-bottom: 5px;">${item.name}</li>`,
                  )
                  .join("")}</ul>`
              : "<p>Details will be confirmed upon redemption.</p>";

          let processedSubject = gcEmailTemplate.subject;
          processedSubject = processedSubject.replace(
            /{{customerName}}/g,
            customerNameForEmail,
          );
          processedSubject = processedSubject.replace(
            /{{gcCode}}/g,
            createdGC.code,
          );

          let templateBodyContent = gcEmailTemplate.body;
          templateBodyContent = templateBodyContent.replace(
            /{{subject}}/g,
            processedSubject,
          );
          templateBodyContent = templateBodyContent.replace(
            /{{customerName}}/g,
            customerNameForEmail,
          );
          templateBodyContent = templateBodyContent.replace(
            /{{gcCode}}/g,
            createdGC.code,
          );
          templateBodyContent = templateBodyContent.replace(
            /{{itemsList}}/g,
            itemsListHtml,
          );
          templateBodyContent = templateBodyContent.replace(
            /{{expiryInfo}}/g,
            expiryInfo,
          );

          const fullEmailHtml = generateEmailHtml(
            processedSubject,
            templateBodyContent,
            LOGO_URL_SA,
          );

          const plainTextBody = `
Hi ${customerNameForEmail},

This email confirms the details of your Gift Certificate for BeautyFeel.
Your unique Gift Certificate code is: ${createdGC.code}

It is applicable to the following:
${includedItems.map((item) => `- ${item.name}`).join("\n")}

${expiryInfo}

Please present this code (or email) upon arrival. We look forward to providing your services soon!

Best regards,
The BeautyFeel Team
           `
            .replace(/\n\s+/g, "\n")
            .trim();

          const { data: emailSentData, error: emailSendError } =
            await resendInstanceSA.emails.send({
              from: SENDER_EMAIL_SA,
              to: [createdGC.recipientEmail],
              subject: processedSubject,
              html: fullEmailHtml,
              text: plainTextBody,
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
        }
      } catch (error: any) {
        console.error(
          `[ServerAction] Exception during GC email sending process for ${createdGC.code}:`,
          error,
        );
      }
    } else {
      let reason = "";
      if (!createdGC.recipientEmail) reason += "No recipient email. ";
      if (
        !resendInstanceSA ||
        !resendInstanceSA.emails ||
        !resendInstanceSA.emails.send
      )
        reason += "Resend not configured. ";
      if (!SENDER_EMAIL_SA) reason += "Sender email not configured. ";
      if (!LOGO_URL_SA) reason += "Logo URL not configured.";
      console.log(
        `[ServerAction] Skipping GC email for ${createdGC.code}. Reason: ${reason.trim()}`,
      );
    }

    revalidatePath("/dashboard/settings/gift-certificates");

    if (createdGC.purchaserCustomerId) {
      revalidatePath(`/dashboard/customers/${createdGC.purchaserCustomerId}`);
    }

    if (recipientCustomerId) {
      revalidatePath(`/dashboard/customers/${recipientCustomerId}`);
    }

    return {
      success: true,
      message: `Gift Certificate ${data.code} created successfully.`,
    };
  } catch (error: any) {
    console.error("[ServerAction] Error creating Gift Certificate:", error);
    let message = "Database error creating Gift Certificate.";
    const fieldErrors: Record<string, string[]> = {};

    if (error.message?.includes(`Code "${data.code}" already exists`)) {
      message = error.message;
      fieldErrors.code = [message];
    } else if (
      (error.code === "P2002" && error.meta?.target?.includes("email")) ||
      error.message?.includes("Failed to retrieve customer with email") ||
      error.message?.includes(`Failed to create customer with email`)
    ) {
      message = error.message.includes("Failed to")
        ? error.message
        : `The email "${data.recipientEmail}" is already in use by another customer.`;
      fieldErrors.recipientEmail = [message];
    } else if (error.code === "P2003" || error.code === "P2025") {
      console.error(
        "[ServerAction] Foreign key or connect constraint failed:",
        error.meta || error,
      );
      message = `Invalid ID provided for purchaser or selected ${data.itemType}(s). Record not found.`;
      if (error.meta?.cause?.includes("`purchaserCustomerId`")) {
        fieldErrors.purchaserCustomerId = ["Invalid purchaser ID."];
      } else if (
        error.meta?.cause?.includes("`serviceId`") ||
        error.meta?.cause?.includes("`serviceSetId`")
      ) {
        fieldErrors.itemIds = [
          `One or more selected ${data.itemType}(s) not found.`,
        ];
      } else {
        fieldErrors.general = [message];
      }
    } else if (error instanceof PrismaClientValidationError) {
      console.error("[ServerAction] Prisma Validation Error:", error.message);

      message = "Validation error with database operation.";

      if (error.message.includes("Unknown argument")) {
        fieldErrors.general = [`Database schema mismatch: ${error.message}`];
      } else {
        fieldErrors.general = [error.message];
      }
    } else {
      fieldErrors.general = [
        error.message ||
          "An unexpected error occurred during database operation.",
      ];
    }

    return { success: false, message: message, errors: fieldErrors };
  }
}

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
          include: {
            service: {
              select: { id: true, title: true },
            },

            checkedBy: {
              select: { id: true, name: true },
            },
            servedBy: {
              select: { id: true, name: true },
            },
          },
          orderBy: { service: { title: "asc" } },
        },
      },
      orderBy: {
        bookedFor: "asc",
      },
    });
    console.log(
      `Server Action: Found ${transactions.length} active transactions.`,
    );

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

        availedServices: tx.availedServices.map((as): AvailedServicesProps => {
          const checkedByInfo: AccountInfo | null = as.checkedBy
            ? { id: as.checkedBy.id, name: as.checkedBy.name }
            : null;
          const servedByInfo: AccountInfo | null = as.servedBy
            ? { id: as.servedBy.id, name: as.servedBy.name }
            : null;

          const serviceDetails: ServiceInfo = as.service
            ? { id: as.service.id, title: as.service.title }
            : null;

          return {
            id: as.id,
            transactionId: as.transactionId,
            serviceId: as.serviceId,
            service: serviceDetails,
            quantity: as.quantity,
            price: as.price,

            commissionValue: as.commissionValue,
            status: as.status,
            completedAt: as.completedAt,
            createdAt: as.createdAt,
            updatedAt: as.updatedAt,

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
        const isPasswordValid = await compare(password, foundAcc.password);

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

export async function getSalaryBreakdown(
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
        servedById: accountId,
        commissionValue: { gt: 0 },
        status: Status.DONE,
        completedAt: {
          gte: queryStartDate,
          lte: queryEndDate,
          not: null,
        },

        transaction: {
          status: { not: Status.CANCELLED },
        },
      },
      include: {
        service: {
          select: { title: true, price: true },
        },
        transaction: {
          select: {
            customer: {
              select: { name: true },
            },
          },
        },
      },

      orderBy: {
        completedAt: "desc",
      },
    });

    console.log(
      `Server Action: Found ${completedServices.length} relevant completed services.`,
    );

    const breakdownItems: SalaryBreakdownItem[] = completedServices

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
        const completionDate = as.completedAt!;

        return {
          id: as.id,

          serviceTitle: as.service?.title ?? null,
          customerName: as.transaction?.customer?.name ?? null,

          completedAt: completionDate,
          servicePrice: originalServicePrice,
          commissionEarned: commission,

          originatingSetId: as.originatingSetId ?? null,
          originatingSetTitle: as.originatingSetTitle ?? null,
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
export async function getCurrentPayPeriodDatesForAccount(
  accountId: string,
  periodDurationDays: number = 7,
  defaultStartDate: Date = new Date("2024-01-01"),
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

  const lastReleasedPayslip = await prisma.payslip.findFirst({
    where: {
      accountId: accountId,
      status: PayslipStatus.RELEASED,
    },
    orderBy: {
      periodEndDate: "desc",
    },
    select: {
      periodEndDate: true,
    },
  });

  let startDate: Date;

  if (
    lastReleasedPayslip?.periodEndDate &&
    isValid(new Date(lastReleasedPayslip.periodEndDate))
  ) {
    const lastEnd = new Date(lastReleasedPayslip.periodEndDate);
    startDate = startOfDay(addDays(lastEnd, 1));
    console.log(
      `[getCurrentPayPeriodDatesForAccount] Found last released payslip ending on ${format(lastEnd, "yyyy-MM-dd")}. New period starts: ${format(startDate, "yyyy-MM-dd")}`,
    );
  } else {
    startDate = startOfDay(defaultStartDate);
    console.log(
      `[getCurrentPayPeriodDatesForAccount] No valid previous released payslip found. Using default start date: ${format(startDate, "yyyy-MM-dd")}`,
    );
  }

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
    startDate = startOfDay(setDate(today, 1));
    endDate = endOfDay(setDate(today, 15));
  } else {
    startDate = startOfDay(setDate(today, 16));
    endDate = endOfDay(endOfMonth(today));
  }

  return { startDate, endDate };
}

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

    revalidatePath("/customize");
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
      return { success: false, message: "Branch not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to update branch.",
    };
  }
}

export async function deleteBranchAction(id: string) {
  if (!id) return { success: false, message: "Branch ID is required." };

  try {
    const accountCount = await prisma.account.count({
      where: { branchId: id },
    });
    const serviceCount = await prisma.service.count({
      where: { branchId: id },
    });

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

  const rawData = Object.fromEntries(formData.entries());
  console.log("Server: Raw data from form:", rawData);

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

  const data = validationResult.data;
  console.log("Server: Validated data for Prisma create:", data);

  try {
    const newService = await prisma.service.create({
      data: {
        title: data.title,
        description: data.description,
        price: data.price,
        branchId: data.branchId,
        followUpPolicy: data.followUpPolicy,
        recommendedFollowUpDays: data.recommendedFollowUpDays,

        recommendFollowUp: data.followUpPolicy !== FollowUpPolicy.NONE,

        sendPostTreatmentEmail: data.sendPostTreatmentEmail,
        postTreatmentEmailSubject: data.postTreatmentEmailSubject,
        postTreatmentInstructions: data.postTreatmentInstructions,
      },
    });

    console.log("Server: Service created successfully:", newService.id);

    revalidatePath(`/customize/${newService.branchId}`);
    revalidatePath("/customize");

    return {
      success: true,
      data: newService,
      message: "Service created successfully.",
    };
  } catch (error: any) {
    console.error("Server: Create Service Action Error:", error);

    if (error.code === "P2002") {
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
        return {
          success: false,
          message: "A service with this title already exists.",
          errors: { title: ["Duplicate title"] },
        };
      }

      return {
        success: false,
        message: "Duplicate entry.",
        errors: { general: ["Duplicate entry."] },
      };
    }
    if (error.code === "P2003") {
      const fieldName = error.meta?.field_name;
      if (fieldName === "branchId") {
        return {
          success: false,
          message: "Selected Branch does not exist.",
          errors: { branchId: ["Branch not found"] },
        };
      }

      return {
        success: false,
        message: "Invalid relation.",
        errors: { general: ["Invalid relation."] },
      };
    }

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

  const rawData = Object.fromEntries(formData.entries());
  console.log("Server: Raw data from form for update:", rawData);

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

  const data = validationResult.data;
  console.log("Server: Validated partial data for Prisma update:", data);

  const dataToUpdate = {
    ...data,

    ...(data.followUpPolicy !== undefined && {
      recommendFollowUp: data.followUpPolicy !== FollowUpPolicy.NONE,
    }),

    ...(data.followUpPolicy === FollowUpPolicy.NONE && {
      recommendedFollowUpDays: null,
    }),
  };

  console.log("Server: Data to update for Prisma:", dataToUpdate);

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn(`Server: No valid data provided for update for ID: ${id}.`);
    return { success: false, message: "No valid data provided for update." };
  }

  let oldBranchId = null;
  if (dataToUpdate.branchId === undefined) {
    try {
      const existingService = await prisma.service.findUnique({
        where: { id },
        select: { branchId: true },
      });
      if (existingService) {
        oldBranchId = existingService.branchId;
      }
    } catch (fetchError) {
      console.error(
        `Server: Failed to fetch old branchId for ID ${id}:`,
        fetchError,
      );
    }
  } else {
    try {
      const existingService = await prisma.service.findUnique({
        where: { id },
        select: { branchId: true },
      });
      if (
        existingService &&
        existingService.branchId !== dataToUpdate.branchId
      ) {
        oldBranchId = existingService.branchId;
      }
    } catch (fetchError) {
      console.error(
        `Server: Failed to fetch old branchId for revalidation after branch change for ID ${id}:`,
        fetchError,
      );
    }
  }

  try {
    const updatedService = await prisma.service.update({
      where: { id },
      data: dataToUpdate,
    });

    console.log("Server: Service updated successfully:", updatedService.id);

    const newBranchId = updatedService.branchId;
    if (oldBranchId && oldBranchId !== newBranchId) {
      revalidatePath(`/customize/${oldBranchId}`);
      console.log(
        `Server: Revalidating old branch path: /customize/${oldBranchId}`,
      );
    }
    revalidatePath(`/customize/${newBranchId}`);
    revalidatePath("/customize");
    console.log(
      `Server: Revalidating new branch path: /customize/${newBranchId}`,
    );

    return {
      success: true,
      data: updatedService,
      message: "Service updated successfully.",
    };
  } catch (error: any) {
    console.error(`Server: Update Service Action Error (ID: ${id}):`, error);

    if (error.code === "P2025") {
      return {
        success: false,
        message: "Service not found.",
        errors: { general: ["Service not found."] },
      };
    }
    if (error.code === "P2002") {
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
        return {
          success: false,
          message: "A service with this title already exists.",
          errors: { title: ["Duplicate title"] },
        };
      }

      return {
        success: false,
        message: "Duplicate entry.",
        errors: { general: ["Duplicate entry."] },
      };
    }
    if (error.code === "P2003") {
      const fieldName = error.meta?.field_name;
      if (fieldName === "branchId") {
        return {
          success: false,
          message: "Selected Branch does not exist.",
          errors: { branchId: ["Branch not found"] },
        };
      }

      return {
        success: false,
        message: "Invalid relation.",
        errors: { general: ["Invalid relation."] },
      };
    }

    return {
      success: false,
      message: "Database error: Failed to update service.",
      errors: { general: ["Database error: Failed to update service."] },
    };
  }
}

export async function deleteServiceAction(id: string) {
  if (!id) return { success: false, message: "Service ID is required." };

  try {
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
    const existingAppointment = await prisma.recommendedAppointment.findUnique({
      where: { id: recommendedAppointmentId },
      select: { id: true, status: true, customerId: true },
    });

    if (!existingAppointment) {
      console.warn(
        `Server: Recommended Appointment ${recommendedAppointmentId} not found.`,
      );
      return { success: false, message: "Recommended Appointment not found." };
    }

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
      };
    }

    const cancelledAppointment = await prisma.recommendedAppointment.update({
      where: { id: recommendedAppointmentId },
      data: {
        status: RecommendedAppointmentStatus.CANCELLED,
      },
    });

    console.log(
      `Server: Recommended Appointment ${recommendedAppointmentId} status updated to CANCELLED.`,
    );

    revalidatePath(`/customers/${cancelledAppointment.customerId}`);
    revalidatePath(`/recommended-appointments`);

    return {
      success: true,
      message: "Recommended Appointment cancelled successfully.",
    };
  } catch (error: any) {
    console.error(
      `Server: Error cancelling Recommended Appointment ${recommendedAppointmentId}:`,
      error,
    );

    if (error.code === "P2025") {
      return { success: false, message: "Recommended Appointment not found." };
    }
    return {
      success: false,
      message: error.message || "Failed to cancel Recommended Appointment.",
    };
  }
}

const ALL_ROLES = Object.values(Role);

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
  dailyRate: z.coerce
    .number({ invalid_type_error: "Daily Rate must be a number" })
    .int("Daily Rate must be a whole number")
    .nonnegative("Daily Rate must be non-negative")
    .optional(),
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

export async function getAccountSalary(
  accountId: string,
): Promise<{ salary: number } | null> {
  if (!accountId) return null;
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { salary: true },
    });

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
        dailyRate: true,
        branchId: true,
        branch: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });
    console.log(
      `Server Action: Fetched ${accounts.length} accounts successfully.`,
    );

    return accounts.map((acc) => ({
      ...acc,

      dailyRate: acc.dailyRate ?? 0,
    })) as AccountForManagement[];
  } catch (error) {
    console.error("Server Action Error [getAccountsAction]:", error);

    throw new Error("Failed to fetch accounts via server action.");
  }
}

export async function getBranchesForSelectAction(): Promise<BranchForSelect[]> {
  console.log("Server Action: getBranchesForSelectAction executing...");
  try {
    const branches = await prisma.branch.findMany({
      select: {
        id: true,
        title: true,
      },
      orderBy: {
        title: "asc",
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
        gte: startDate,
        lte: endDate,
      },
    },

    select: {
      id: true,
      date: true,
      isPresent: true,
      notes: true,
    },
  });

  return records as AttendanceRecord[];
}

export async function updateAccountAction(id: string, formData: FormData) {
  console.log(`--- Updating Account ${id} ---`);

  console.log("Raw FormData:", Object.fromEntries(formData.entries()));

  if (!id) return { success: false, message: "Account ID is required." };

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

  const rawData = {
    username: formData.get("username"),
    name: formData.get("name"),
    email: formData.get("email"),
    dailyRate: formData.get("dailyRate"),
    branchId: branchIdForZod,
    role: roles,
  };

  console.log("Raw Data for Zod:", rawData);

  const validationResult = updateAccountSchema.safeParse(rawData);

  console.log(
    "Zod Validation Result:",
    JSON.stringify(validationResult, null, 2),
  );

  if (!validationResult.success) {
    console.error(
      "Zod Validation Errors:",
      validationResult.error.flatten().fieldErrors,
    );

    const fieldErrors = validationResult.error.flatten().fieldErrors;
    const messages = Object.entries(fieldErrors)
      .map(([field, errors]) => `${field}: ${errors?.join(", ")}`)
      .join("; ");
    return {
      success: false,
      message: `Validation failed. ${messages}`,
      errors: fieldErrors,
    };
  }

  console.log("Validated Data:", validationResult.data);

  const dataToUpdate: { [key: string]: any } = {};
  const { email, branchId, dailyRate, ...restValidatedData } =
    validationResult.data;

  Object.assign(dataToUpdate, restValidatedData);

  if ("email" in validationResult.data) {
    dataToUpdate.email = email === "" ? null : email;
  }
  if ("branchId" in validationResult.data) {
    dataToUpdate.branchId = branchId;
  }

  if (dailyRate !== undefined && dailyRate !== null) {
    dataToUpdate.dailyRate = dailyRate;
  } else if (
    formData.has("dailyRate") &&
    (formData.get("dailyRate") === null || formData.get("dailyRate") === "")
  ) {
  }

  console.log("Data being sent to Prisma Update:", dataToUpdate);

  if (Object.keys(dataToUpdate).length === 0) {
    console.warn("No changes detected after validation to update.");

    const existingAccount = await prisma.account.findUnique({ where: { id } });
    if (!existingAccount)
      return { success: false, message: "Account not found." };
    const { password: _, ...returnData } = existingAccount;
    return { success: true, message: "No changes detected.", data: returnData };
  }

  try {
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

    if (dataToUpdate.email) {
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

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: dataToUpdate,
    });

    console.log("Prisma Update Successful:", updatedAccount);

    revalidatePath("/customize");
    const { password: _, ...returnData } = updatedAccount;
    return {
      success: true,
      data: returnData,
      message: "Account updated successfully.",
    };
  } catch (error: any) {
    console.error(`Prisma Update Error for ID ${id}:`, error);
    if (error.code) console.error("Prisma Error Code:", error.code);
    if (error.meta) console.error("Prisma Error Meta:", error.meta);

    if (error.code === "P2025") {
      return { success: false, message: "Account not found." };
    }
    if (
      error.code === "P2003" &&
      error.meta?.field_name?.includes("branchId")
    ) {
      return {
        success: false,
        message: `Selected Branch (ID: ${dataToUpdate.branchId}) does not exist or is invalid. Please refresh the branch list.`,
        errors: { branchId: ["Selected Branch does not exist or is invalid."] },
      };
    }
    if (error.code === "P2002") {
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
      message: `Database error: Failed to update account. ${error.message || "Unknown error"}`,
    };
  }
}

export async function deleteAccountAction(
  accountId: string,
): Promise<{ success: boolean; message: string }> {
  console.log(`Attempting to delete account: ${accountId}`);
  if (!accountId) return { success: false, message: "Account ID required." };
  try {
    const accountToDelete = await prisma.account.findUnique({
      where: { id: accountId },
      select: { role: true },
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
    revalidatePath("/customize");
    return { success: true, message: "Account deleted successfully." };
  } catch (error: any) {
    console.error(`Error deleting account ${accountId}:`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Account not found." };
    }

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
      data: { code: upperCode, value },
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

export async function updateVoucherAction(id: string, formData: FormData) {
  if (!id) return { success: false, message: "Voucher ID is required." };

  const rawData = { value: formData.get("value") };
  const validationResult = voucherSchema
    .pick({ value: true })
    .safeParse(rawData);

  if (!validationResult.success) {
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }
  const { value } = validationResult.data;

  try {
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
      return { success: false, message: "Voucher not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to update voucher.",
    };
  }
}

export async function deleteVoucherAction(id: string) {
  if (!id) return { success: false, message: "Voucher ID is required." };

  try {
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
    (val) => (typeof val === "string" ? parseInt(val, 10) : val),
    z
      .number({ invalid_type_error: "Price must be a number" })
      .int()
      .min(0, "Price must be non-negative"),
  ),

  serviceIds: z
    .array(z.string().uuid("Invalid Service ID format"))
    .min(1, "At least one service must be selected for the set"),
});

export async function createServiceSetAction(formData: FormData) {
  const rawData = {
    title: formData.get("title"),
    price: formData.get("price"),
    serviceIds: formData.getAll("serviceIds"),
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
    const existing = await prisma.serviceSet.findUnique({ where: { title } });
    if (existing) {
      return {
        success: false,
        message: `A service set with the title "${title}" already exists.`,
      };
    }

    const existingServices = await prisma.service.count({
      where: { id: { in: serviceIds } },
    });
    if (existingServices !== serviceIds.length) {
      return {
        success: false,
        message: "One or more selected services do not exist.",
      };
    }

    const newServiceSet = await prisma.serviceSet.create({
      data: {
        title,
        price,
        services: {
          connect: serviceIds.map((id) => ({ id })),
        },
      },
      include: { services: { select: { id: true, title: true } } },
    });

    revalidatePath("/customize");
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

  const dataToUpdate: { title?: string; price?: number; services?: any } = {};
  if (title !== undefined) dataToUpdate.title = title;
  if (price !== undefined) dataToUpdate.price = price;

  if (serviceIds !== undefined) {
    if (serviceIds.length === 0) {
      return {
        success: false,
        message: "A service set must contain at least one service.",
      };
    }

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
      set: serviceIds.map((id) => ({ id })),
    };
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return { success: false, message: "No valid data provided for update." };
  }

  try {
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

export async function deleteServiceSetAction(setId: string) {
  if (!setId) return { success: false, message: "Service Set ID is required." };

  try {
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
        usedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      orderBy: {
        issuedAt: "desc",
      },
    });
    return activeGCs;
  } catch (error) {
    console.error("Error fetching active gift certificates:", error);
    return [];
  }
}

export async function toggleDiscountRuleAction(
  id: string,
  currentStatus: boolean,
): Promise<{ success: boolean; message: string }> {
  console.log(
    `Toggling discount rule ${id} from isActive=${currentStatus} to ${!currentStatus}`,
  );

  if (!id || typeof id !== "string") {
    console.error("Invalid ID provided for toggling discount rule.");
    return { success: false, message: "Invalid discount rule ID." };
  }

  try {
    const existingRule = await prisma.discountRule.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!existingRule) {
      console.error(`Discount rule with ID ${id} not found.`);
      return { success: false, message: "Discount rule not found." };
    }

    await prisma.discountRule.update({
      where: { id: id },
      data: {
        isActive: !currentStatus,
      },
    });

    revalidatePath("/customize");

    const newMessage = `Discount rule ${!currentStatus ? "activated" : "deactivated"} successfully.`;
    console.log(newMessage);
    return { success: true, message: newMessage };
  } catch (error: any) {
    console.error(`Error toggling discount rule status for ID ${id}:`, error);

    return {
      success: false,
      message: "Database error updating discount status. Please try again.",
    };
  }
}
export async function createDiscountRuleAction(formData: FormData) {
  const rawData = {
    description: formData.get("description") as string | null,
    discountType: formData.get("discountType") as DiscountType,
    discountValue: formData.get("discountValue") as string,
    startDate: formData.get("startDate") as string,
    endDate: formData.get("endDate") as string,
    applyTo: formData.get("applyTo") as "all" | "specific",
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
    startDate: rawPhtStartDateString,
    endDate: rawPhtEndDateString,
    applyTo,
    serviceIds,
    description,
  } = validation.data;

  try {
    const [startYear, startMonth, startDay] = rawPhtStartDateString
      .split("-")
      .map(Number);

    const startDateUTC = new Date(
      Date.UTC(startYear, startMonth - 1, startDay) -
        PHT_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000,
    );

    const [endYear, endMonth, endDay] = rawPhtEndDateString
      .split("-")
      .map(Number);

    const endOfDayPHTinUTCms =
      Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999) -
      PHT_TIMEZONE_OFFSET_HOURS * 60 * 60 * 1000;
    const endDateUTC = new Date(endOfDayPHTinUTCms);

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
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      applyToAll: boolean;
      services?: { connect: { id: string }[] };
    } = {
      description: description ?? null,
      discountType,
      discountValue,
      startDate: startDateUTC,
      endDate: endDateUTC,
      isActive: true,
      applyToAll: applyTo === "all",
    };

    if (applyTo === "specific" && serviceIds && serviceIds.length > 0) {
      createData.services = { connect: serviceIds.map((id) => ({ id })) };
    }

    await prisma.discountRule.create({ data: createData });

    revalidatePath("/customize");
    return { success: true, message: "Discount rule created successfully." };
  } catch (error: any) {
    console.error("Error creating discount rule in Prisma:", error);
    let message = "Failed to create discount rule due to a server error.";
    if (error.code === "P2002") {
      message =
        "A discount rule with similar unique properties already exists.";
    }
    return {
      success: false,
      message: message,
    };
  }
}

export async function getDiscountRules(): Promise<
  UIDiscountRuleWithServices[]
> {
  console.log("Fetching all discount rules...");
  try {
    const rulesFromDb = await prisma.discountRule.findMany({
      orderBy: { startDate: "desc" },
      include: {
        services: { select: { id: true, title: true } },
      },
    });

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
    console.error("Error fetching all discount rules:", error);
    return [];
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
    return [];
  }
}

export async function deleteDiscountRuleAction(id: string) {
  try {
    await prisma.discountRule.update({
      where: { id },
      data: {
        services: { set: [] },
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
            status: "RELEASED",
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
        dailyRate: acc.dailyRate ?? 0,
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

  updatedAttendance?: { id: string; isPresent: boolean; notes: string | null };
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
          select: { isPresent: true, id: true },
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

            checkedById: checkerId,
            checkedAt: checkTimestampUtc,
          },
          select: { id: true, isPresent: true, notes: true },
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

          updatedAttendance: {
            id: upsertedAttendance.id,
            isPresent: upsertedAttendance.isPresent,
            notes: upsertedAttendance.notes,
          },
        };
      },
      {
        maxWait: 10000,
        timeout: 10000,
      },
    );

    revalidatePath(`/dashboard`);
    if (accountId) {
      revalidatePath(`/account/${accountId}`);
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

      const statusMessage =
        existingPayslip.status === PayslipStatus.PENDING
          ? "requested and pending processing"
          : "already generated/released";
      return {
        success: true,
        message: `Payslip for this period has already been ${statusMessage}.`,
        payslipId: existingPayslip.id,
        status: existingPayslip.status,
      };
    }

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
      select: { date: true },
    });

    const presentDaysCount = attendanceRecords.length;
    const baseSalary = (account.dailyRate || 0) * presentDaysCount;

    const availedServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: "DONE",
        completedAt: {
          gte: periodStartDate,
          lte: periodEndDate,
        },
      },
      select: { commissionValue: true },
    });
    const totalCommissions = availedServices.reduce(
      (sum, service) => sum + (service.commissionValue || 0),
      0,
    );

    const totalDeductions = 0;
    const totalBonuses = 0;

    const netPay =
      baseSalary + totalCommissions + totalBonuses - totalDeductions;

    const newPayslip = await prisma.payslip.create({
      data: {
        accountId,
        periodStartDate,
        periodEndDate,
        baseSalary,
        totalCommissions,
        totalDeductions,
        totalBonuses,
        netPay,
        status: PayslipStatus.PENDING,
      },
    });

    console.log(
      `SERVER ACTION: Created new PENDING payslip (ID: ${newPayslip.id})`,
    );

    return {
      success: true,
      message: "Payslip requested successfully! It's now pending processing.",
      payslipId: newPayslip.id,
      status: newPayslip.status,
    };
  } catch (error: any) {
    console.error("Error requesting payslip generation:", error);

    return {
      success: false,
      message: `Failed to request payslip: ${error.message || "An unexpected error occurred."}`,
    };
  }
}

export async function getPayslips(filters: {
  status?: string | null;
  employeeId?: string | null;
}): Promise<PayslipData[]> {
  console.log("SERVER ACTION: Fetching payslips with filters:", filters);
  try {
    const whereClause: Prisma.PayslipWhereInput = {};

    if (filters.status && filters.status !== "ALL") {
      if (
        Object.values(PayslipStatus).includes(filters.status as PayslipStatus)
      ) {
        whereClause.status = filters.status as PayslipStatus;
      } else {
        console.warn(
          `Invalid filter status: ${filters.status}. Not applying status filter.`,
        );
      }
    }

    if (filters.employeeId) {
      whereClause.accountId = filters.employeeId;
    }

    const payslips = await prisma.payslip.findMany({
      where: whereClause,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            role: true,
            salary: true,
            dailyRate: true,
            email: true,
            branchId: true,
            canRequestPayslip: true,
          },
        },
      },
      orderBy: [
        { status: "asc" },
        { periodEndDate: "desc" },
        { account: { name: "asc" } },
      ],
    });

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
      accountData: {
        id: p.account.id,
        name: p.account.name,
        role: p.account.role,
        salary: p.account.salary,
        dailyRate: p.account.dailyRate,
        email: p.account.email,
        branchId: p.account.branchId,
        canRequestPayslip: p.account.canRequestPayslip,
      },
    }));

    console.log(
      `SERVER ACTION: Successfully fetched ${payslipDataList.length} payslips for filters ${JSON.stringify(filters)}.`,
    );
    return payslipDataList;
  } catch (error) {
    console.error("Error fetching payslips:", error);
    throw new Error("Failed to fetch payslips.");
  }
}

export const approvePayslipRequest = async (
  requestId: string,
  adminId: string,
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
  payslipId?: string;
}> => {
  console.log(
    `[ServerAction approvePayslipRequest] Initiating for Request ID: ${requestId} by Admin: ${adminId}`,
  );

  try {
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      include: {
        account: { select: { name: true, dailyRate: true } },
      },
    });

    if (!request) {
      return { success: false, error: "Payslip request not found." };
    }
    if (request.status !== PayslipRequestStatus.PENDING) {
      return {
        success: false,
        error: `Request is not PENDING (Status: ${request.status}). Cannot approve.`,
      };
    }
    if (!request.account) {
      return {
        success: false,
        error: "Account associated with the request not found.",
      };
    }

    const accountId = request.accountId;
    const employeeName = request.account.name;
    const dailyRate = request.account.dailyRate ?? 0;

    const payslipNominalPeriodStart = new Date(request.periodStartDate);
    const payslipNominalPeriodEnd = new Date(request.periodEndDate);

    if (
      !isValid(payslipNominalPeriodStart) ||
      !isValid(payslipNominalPeriodEnd)
    ) {
      return {
        success: false,
        error: "Invalid period dates in the payslip request.",
      };
    }

    let trueAttendanceStartDate = payslipNominalPeriodStart;
    const previousReleasedPayslipsForAttendance = await prisma.payslip.findMany(
      {
        where: {
          accountId: accountId,
          status: PayslipStatus.RELEASED,
          periodEndDate: { lt: payslipNominalPeriodStart },
        },
        orderBy: { periodEndDate: "desc" },
        select: { periodEndDate: true },
        take: 1,
      },
    );

    if (previousReleasedPayslipsForAttendance.length > 0) {
      const lastSettledPeriodEndDate = new Date(
        previousReleasedPayslipsForAttendance[0].periodEndDate,
      );
      if (isValid(lastSettledPeriodEndDate)) {
        trueAttendanceStartDate = startOfDay(
          addDays(lastSettledPeriodEndDate, 1),
        );
      }
    }
    console.log(
      `[approvePayslipRequest] For ${employeeName}, Payslip Nominal Period: ${format(payslipNominalPeriodStart, "PP")} - ${format(payslipNominalPeriodEnd, "PP")}. True Attendance Start for Salary Calc: ${format(trueAttendanceStartDate, "PP")}`,
    );

    let calculatedBaseSalary = 0;
    if (!isBefore(payslipNominalPeriodEnd, trueAttendanceStartDate)) {
      const relevantAttendanceRecords = await getAttendanceForPeriod(
        accountId,
        trueAttendanceStartDate,
        payslipNominalPeriodEnd,
      );
      const presentDaysCount = relevantAttendanceRecords.filter(
        (r) => r.isPresent,
      ).length;
      calculatedBaseSalary = presentDaysCount * dailyRate;
      console.log(
        `[approvePayslipRequest] ${employeeName}: ${presentDaysCount} present days (rate ${dailyRate}) = Base Salary ${calculatedBaseSalary}`,
      );
    } else {
      console.log(
        `[approvePayslipRequest] ${employeeName}: No valid days for attendance calculation (period end before true start). Base Salary 0.`,
      );
    }

    const commissionsForThisPayslip = await getCommissionBreakdownForPeriod(
      accountId,
      payslipNominalPeriodStart,
      payslipNominalPeriodEnd,
    );
    const calculatedTotalCommissions = commissionsForThisPayslip.reduce(
      (sum, item) => sum + (item.commissionEarned || 0),
      0,
    );
    console.log(
      `[approvePayslipRequest] ${employeeName}: Total Commissions calculated: ${calculatedTotalCommissions}`,
    );

    const calculatedTotalDeductions = 0;
    const calculatedTotalBonuses = 0;

    const netPay =
      calculatedBaseSalary +
      calculatedTotalCommissions +
      calculatedTotalBonuses -
      calculatedTotalDeductions;

    const newPayslip = await prisma.payslip.create({
      data: {
        accountId: accountId,
        periodStartDate: payslipNominalPeriodStart,
        periodEndDate: payslipNominalPeriodEnd,
        baseSalary: calculatedBaseSalary,
        totalCommissions: calculatedTotalCommissions,
        totalDeductions: calculatedTotalDeductions,
        totalBonuses: calculatedTotalBonuses,
        netPay: netPay,
        status: PayslipStatus.PENDING,

        payslipRequest: { connect: { id: requestId } },
      },
    });
    console.log(
      `[approvePayslipRequest] New PENDING Payslip (ID: ${newPayslip.id}) created for ${employeeName}.`,
    );

    await prisma.payslipRequest.update({
      where: { id: requestId },
      data: {
        status: PayslipRequestStatus.PROCESSED,
        processedById: adminId,
        processedTimestamp: new Date(),
        relatedPayslipId: newPayslip.id,
      },
    });
    console.log(
      `[approvePayslipRequest] PayslipRequest (ID: ${requestId}) marked as PROCESSED.`,
    );

    return {
      success: true,
      message: `Payslip for ${employeeName} (Period: ${format(payslipNominalPeriodStart, "PP")} - ${format(payslipNominalPeriodEnd, "PP")}) generated and is now PENDING release.`,
      payslipId: newPayslip.id,
    };
  } catch (error: any) {
    console.error(
      `[ServerAction approvePayslipRequest] CRITICAL error for Request ID ${requestId}:`,
      error,
    );

    try {
      await prisma.payslipRequest.update({
        where: { id: requestId, status: PayslipRequestStatus.PENDING },
        data: {
          status: PayslipRequestStatus.FAILED,
          notes: `Approval failed: ${error.message}`,
        },
      });
    } catch (updateError) {
      console.error(
        `[ServerAction approvePayslipRequest] Failed to mark request ${requestId} as FAILED:`,
        updateError,
      );
    }
    return {
      success: false,
      error: `An unexpected server error occurred while approving the request: ${error.message}`,
    };
  }
};
export async function rejectPayslipRequest(
  requestId: string,
  adminAccountId: string,
  reason?: string,
): Promise<{ success: boolean; message?: string; error?: string }> {
  console.log(
    `[ServerAction] Rejecting Payslip Request ID: ${requestId} by Admin ID: ${adminAccountId}`,
  );

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

  try {
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      select: { id: true, status: true },
    });

    if (!request) throw new Error("Payslip request not found.");
    if (request.status !== PayslipRequestStatus.PENDING) {
      throw new Error(
        `Request is not pending (Status: ${request.status}). Cannot reject.`,
      );
    }

    await prisma.payslipRequest.update({
      where: { id: requestId },
      data: {
        status: PayslipRequestStatus.REJECTED,
        processedById: adminAccountId,
        processedTimestamp: new Date(),
        notes: reason || "Rejected by administrator.",
      },
    });

    console.log(
      `[ServerAction] Payslip Request ${requestId} rejected successfully.`,
    );

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
  statusFilter: string = "PENDING",
): Promise<PayslipRequestData[]> {
  console.log(
    `[ServerAction] Fetching payslip requests with status: ${statusFilter}`,
  );
  try {
    const whereClause: any = {};
    if (statusFilter !== "ALL") {
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
        whereClause.status = PayslipRequestStatus.PENDING;
      }
    }

    const requests = await prisma.payslipRequest.findMany({
      where: whereClause,
      include: {
        account: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        requestTimestamp: "asc",
      },
    });

    console.log(`[ServerAction] Found ${requests.length} payslip requests.`);

    return requests.map((req) => ({
      id: req.id,
      accountId: req.accountId,
      employeeName: req.account.name,
      requestTimestamp: req.requestTimestamp,
      periodStartDate: req.periodStartDate,
      periodEndDate: req.periodEndDate,
      status: req.status,
      notes: req.notes,
    }));
  } catch (error: any) {
    console.error("[ServerAction] Error fetching payslip requests:", error);
    throw new Error("Failed to load payslip requests.");
  }
}

export async function getPayslipStatusForPeriod(
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
): Promise<PayslipStatusOption> {
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
    return null;
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

    return payslip?.status ?? "NOT_FOUND";
  } catch (error: any) {
    console.error("Error fetching payslip status:", error);
    return null;
  }
}

export async function releaseSalary(
  payslipId: string,
  adminAccountId: string,
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
          netPay: true,
          periodStartDate: true,
          periodEndDate: true,
          account: {
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
        throw new Error(
          `Account details for payslip ${payslipId} could not be found.`,
        );
      }
      if (payslip.status !== PayslipStatus.PENDING) {
        throw new Error("Payslip is not in PENDING status.");
      }

      await tx.payslip.update({
        where: { id: payslipId },
        data: { status: PayslipStatus.RELEASED, releasedDate: new Date() },
      });

      await tx.account.update({
        where: { id: payslip.accountId },
        data: { salary: 0 },
      });

      const expenseDescription = `Salary payment for ${payslip.account.name} (Acct: ${payslip.accountId}) for period ${payslip.periodStartDate.toISOString().split("T")[0]} to ${payslip.periodEndDate.toISOString().split("T")[0]}. Payslip ID: ${payslipId}.`;

      await tx.expense.create({
        data: {
          date: new Date(),
          amount: payslip.netPay,
          category: ExpenseCategory.SALARIES,
          description: expenseDescription,
          recordedById: adminAccountId,
          branchId: payslip.account.branchId,
        },
      });

      console.log(
        `SERVER ACTION: Successfully released payslip ${payslipId}, reset salary for account ${payslip.accountId}, and created salary expense record.`,
      );
    });

    revalidatePath("/dashboard/[accountID]/manage");
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
      throw new Error(
        "Cannot release: Payslip or related Account record not found.",
      );
    } else if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new Error(
        "Cannot release: A required record (Payslip or Account) was not found during the update.",
      );
    }

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

export async function getCommissionBreakdownForPeriod(
  accountId: string,

  _periodStartDate: Date,
  periodEndDate: Date,
): Promise<SalaryBreakdownItem[]> {
  const lastReleasedPayslip = await prisma.payslip.findFirst({
    where: {
      accountId: accountId,
      status: PayslipStatus.RELEASED,
    },
    orderBy: {
      releasedDate: "desc",
    },
    select: {
      releasedDate: true,
    },
  });

  let effectiveMinCompletedAt: Date | null = null;
  if (
    lastReleasedPayslip?.releasedDate &&
    isValid(new Date(lastReleasedPayslip.releasedDate))
  ) {
    effectiveMinCompletedAt = new Date(lastReleasedPayslip.releasedDate);
  }

  console.log(
    `[getCommissionBreakdownForPeriod - NewLogic] For ${accountId}. EffectiveMinCompletedAt: ${effectiveMinCompletedAt?.toISOString() ?? "From beginning"}. PeriodEndDate (upper bound): ${periodEndDate.toISOString()}`,
  );

  const inclusivePeriodEndDate = endOfDay(periodEndDate);

  try {
    const items = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE,
        completedAt: {
          ...(effectiveMinCompletedAt ? { gt: effectiveMinCompletedAt } : {}),

          lte: inclusivePeriodEndDate,
          not: null,
        },
        commissionValue: { gt: 0 },
      },
      select: {
        id: true,
        commissionValue: true,
        service: { select: { title: true, price: true } },
        transaction: { select: { customer: { select: { name: true } } } },
        originatingSetId: true,
        originatingSetTitle: true,
        completedAt: true,
      },
      orderBy: { completedAt: "asc" },
    });

    console.log(
      `[getCommissionBreakdownForPeriod - NewLogic] Found ${items.length} relevant items for ${accountId}.`,
    );

    const breakdownItems: SalaryBreakdownItem[] = items.map((item) => ({
      id: item.id,
      servicePrice: item.service?.price ?? 0,
      commissionEarned: item.commissionValue ?? 0,
      serviceTitle: item.service?.title ?? null,
      customerName: item.transaction?.customer?.name ?? null,
      completedAt: item.completedAt!,
      originatingSetId: item.originatingSetId,
      originatingSetTitle: item.originatingSetTitle,
    }));
    return breakdownItems;
  } catch (error) {
    console.error(
      `[getCommissionBreakdownForPeriod - NewLogic] Error for ${accountId}:`,
      error,
    );
    return [];
  } finally {
    if (prisma && typeof (prisma as any).$disconnect === "function") {
      await (prisma as any).$disconnect();
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
        periodEndDate: true,
        releasedDate: true,
      },
    });

    const lastReleasedPayslipEndDate =
      lastReleasedPayslip?.periodEndDate || null;
    const lastReleasedTimestamp = lastReleasedPayslip?.releasedDate || null;

    let attendancePeriodStartDate: Date;
    if (
      lastReleasedPayslipEndDate &&
      isValid(new Date(lastReleasedPayslipEndDate))
    ) {
      attendancePeriodStartDate = startOfDay(
        addDays(new Date(lastReleasedPayslipEndDate), 1),
      );
    } else {
      attendancePeriodStartDate = startOfMonth(new Date());
    }

    const currentPeriodEndDate = endOfDay(new Date());

    let commissionQueryStartDate: Date;
    if (lastReleasedTimestamp && isValid(new Date(lastReleasedTimestamp))) {
      commissionQueryStartDate = new Date(lastReleasedTimestamp);
    } else {
      commissionQueryStartDate = attendancePeriodStartDate;
    }

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId: accountId,
        date: {
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
          gte: commissionQueryStartDate,
          lte: currentPeriodEndDate,
        },
        commissionValue: { gt: 0 },
      },
      select: {
        id: true,
        price: true,
        quantity: true,
        commissionValue: true,
        completedAt: true,
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
        completedAt: item.completedAt || null,
        originatingSetId: item.originatingSetId,
        originatingSetTitle: item.originatingSetTitle,
      }),
    );

    const result: CurrentSalaryDetailsData = {
      attendanceRecords: attendanceRecords as AttendanceRecord[],
      breakdownItems: breakdownItems,
      accountData: accountData,

      currentPeriodStartDate: attendancePeriodStartDate,
      currentPeriodEndDate: currentPeriodEndDate,
      lastReleasedPayslipEndDate: lastReleasedPayslipEndDate,
      lastReleasedTimestamp: lastReleasedTimestamp,
    };

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
  try {
    console.log(
      `[ServerAction] Fetching current account data for ${accountId}`,
    );
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
    console.log(
      `[ServerAction] Account data found for ${accountId}: ${account?.name}`,
    );

    return account as AccountData | null;
  } catch (error) {
    console.error(
      `[ServerAction] Error fetching account data for ${accountId}:`,
      error,
    );

    throw new Error("Failed to fetch account data.");
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
          gte: sixMonthsAgo,
          lte: now,
        },
      },

      select: {
        id: true,
        createdAt: true,
        bookedFor: true,
        grandTotal: true,
        status: true,

        availedServices: {
          select: {
            id: true,
            quantity: true,
            price: true,

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
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    })) as DetailedTransactionWithBranch[];

    console.log(
      `[ServerAction] Successfully fetched ${transactions.length} completed transactions with required details.`,
    );

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

    return [];
  }
};

export const updateAccountCanRequestPayslip = async (
  accountId: string,
  canRequest: boolean,
): Promise<{ success: boolean; message?: string; error?: string }> => {
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
  try {
    console.log(
      "[ServerAction] Fetching all accounts with basic info (excluding OWNER via hasSome).",
    );

    const nonOwnerRoles = [Role.CASHIER, Role.WORKER, Role.ATTENDANCE_CHECKER];
    const accounts = await prisma.account.findMany({
      where: {
        role: {
          hasSome: nonOwnerRoles,
        },
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

    return accounts as BasicAccountInfo[];
  } catch (error: any) {
    console.error("[ServerAction] Error fetching accounts basic info:", error);

    throw new Error("Failed to fetch accounts.");
  }
};

export const requestPayslipRelease = async (
  accountId: string,
): Promise<{ success: boolean; message?: string; error?: string }> => {
  console.log(
    `[ServerAction requestPayslipRelease - Option 2 Logic] Initiating for ID: ${accountId}`,
  );

  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, name: true, canRequestPayslip: true, role: true },
    });

    if (!account) return { success: false, error: "Account not found." };
    if (account.role.includes(Role.OWNER))
      return {
        success: false,
        error: "Owners cannot request payslips this way.",
      };
    if (!account.canRequestPayslip)
      return {
        success: false,
        error: "Payslip requests are currently disabled.",
      };

    console.log(
      `[ServerAction Option 2] Permission PASSED for ${account.name}.`,
    );

    const lastReleasedPayslip = await prisma.payslip.findFirst({
      where: { accountId: accountId, status: PayslipStatus.RELEASED },
      orderBy: { releasedDate: "desc" },
      select: { releasedDate: true, periodEndDate: true },
    });

    let commissionCutoffDate: Date | null = null;
    if (
      lastReleasedPayslip?.releasedDate &&
      isValid(new Date(lastReleasedPayslip.releasedDate))
    ) {
      commissionCutoffDate = new Date(lastReleasedPayslip.releasedDate);
      console.log(
        `[ServerAction Option 2] Last payslip released at: ${commissionCutoffDate.toISOString()}`,
      );
    } else {
      console.log(
        `[ServerAction Option 2] No prior released payslip. Considering all commissions.`,
      );
    }

    const newCommissionableServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        status: "DONE",
        commissionValue: { gt: 0 },
        completedAt: commissionCutoffDate
          ? { gt: commissionCutoffDate }
          : undefined,
      },
      select: { id: true },
      take: 1,
    });

    if (newCommissionableServices.length === 0) {
      console.log(
        `[ServerAction Option 2] No new commissionable services for ${account.name}.`,
      );
      return {
        success: false,
        message: "No new commissions available for a payslip request.",
      };
    }
    console.log(`[ServerAction Option 2] New commissionable service(s) found.`);

    const lastReleasedPayslipPeriodEndDateDB =
      lastReleasedPayslip?.periodEndDate
        ? new Date(lastReleasedPayslip.periodEndDate)
        : null;

    const startOfPHTToday = getStartOfTodayPHT();

    let requestPeriodStartDate: Date;
    const requestPeriodEndDate = startOfPHTToday;

    if (
      lastReleasedPayslipPeriodEndDateDB &&
      isEqual(startOfPHTToday, lastReleasedPayslipPeriodEndDateDB)
    ) {
      requestPeriodStartDate = startOfPHTToday;
      console.log(
        `[ServerAction Option 2] Same-day request scenario. Period: ${format(requestPeriodStartDate, "yyyy-MM-dd")} to ${format(requestPeriodEndDate, "yyyy-MM-dd")}`,
      );
    } else if (lastReleasedPayslipPeriodEndDateDB) {
      requestPeriodStartDate = startOfDay(
        addDays(lastReleasedPayslipPeriodEndDateDB, 1),
      );
      console.log(
        `[ServerAction Option 2] Next-day request scenario. Period: ${format(requestPeriodStartDate, "yyyy-MM-dd")} to ${format(requestPeriodEndDate, "yyyy-MM-dd")}`,
      );
    } else {
      const defaultStartDate = startOfDay(new Date("2024-01-01"));
      requestPeriodStartDate = isBefore(startOfPHTToday, defaultStartDate)
        ? startOfPHTToday
        : defaultStartDate;

      console.log(
        `[ServerAction Option 2] No prior payslip scenario. Period: ${format(requestPeriodStartDate, "yyyy-MM-dd")} to ${format(requestPeriodEndDate, "yyyy-MM-dd")}`,
      );
    }

    if (isBefore(requestPeriodEndDate, requestPeriodStartDate)) {
      console.error(
        `[ServerAction Option 2] CRITICAL DATE LOGIC ERROR: Request period end before start. End: ${requestPeriodEndDate.toISOString()}, Start: ${requestPeriodStartDate.toISOString()}. This indicates a flaw in period calculation even with Option 2.`,
      );
      return {
        success: false,
        error: "Internal error: Invalid period calculation for request.",
      };
    }

    const existingPendingRequest = await prisma.payslipRequest.findFirst({
      where: {
        accountId: accountId,
        status: PayslipRequestStatus.PENDING,
        periodStartDate: requestPeriodStartDate,
        periodEndDate: requestPeriodEndDate,
      },
      select: { id: true },
    });

    if (existingPendingRequest) {
      return {
        success: false,
        message: "You already have a pending request for this period.",
      };
    }
    console.log(`[ServerAction Option 2] No existing PENDING request.`);

    try {
      const newRequest = await prisma.payslipRequest.create({
        data: {
          accountId,
          periodStartDate: requestPeriodStartDate,
          periodEndDate: requestPeriodEndDate,
          status: PayslipRequestStatus.PENDING,
        },
      });
      console.log(
        `[ServerAction Option 2] PayslipRequest created (ID: ${newRequest.id})`,
      );
    } catch (dbError: any) {
      console.error(
        `[ServerAction Option 2] DB Error creating request:`,
        dbError,
      );

      if (
        dbError instanceof Prisma.PrismaClientKnownRequestError &&
        dbError.code === "P2002"
      ) {
        return {
          success: false,
          message:
            "A request for this period might already exist. Please check.",
        };
      }
      return { success: false, error: "Database error saving request." };
    }

    console.log(
      `[ServerAction Option 2] >>> ADMIN NOTIFICATION for ${account.name}`,
    );
    return {
      success: true,
      message:
        "Payslip request submitted successfully. Please wait for review.",
    };
  } catch (error: any) {
    console.error(`[ServerAction Option 2] CRITICAL error:`, error);
    return { success: false, error: "Unexpected server error." };
  }
};

export async function getMyReleasedPayslips(
  accountId: string,
): Promise<PayslipData[]> {
  if (!accountId) {
    throw new Error("Account ID is required.");
  }
  console.log(`SERVER ACTION: Fetching RELEASED payslips for Acc ${accountId}`);
  try {
    const payslips = await prisma.payslip.findMany({
      where: { accountId: accountId, status: PayslipStatus.RELEASED },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            role: true,
            salary: true,
            dailyRate: true,
            canRequestPayslip: true,
            email: true,
            branchId: true,
          },
        },
      },
      orderBy: [{ periodEndDate: "desc" }],
    });

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

      accountData: {
        id: p.account.id,
        name: p.account.name,
        role: p.account.role,
        salary: p.account.salary,
        dailyRate: p.account.dailyRate,
        canRequestPayslip: p.account.canRequestPayslip,
        email: p.account.email,
        branchId: p.account.branchId,
      },
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

    if (error instanceof Error) {
      throw new Error(`Failed to fetch payslip history: ${error.message}`);
    } else {
      console.error("Unknown error type:", error);
      throw new Error(
        "Failed to fetch payslip history due to an unknown error.",
      );
    }
  } finally {
  }
}

export async function getServedServicesTodayByUser(
  userId: string,
): Promise<AvailedServicesProps[]> {
  if (!userId) {
    console.error(
      "[ServerAction|getServedServicesTodayByUser] User ID is required.",
    );
    return [];
  }

  try {
    const timeZone = "Asia/Manila";
    const now = new Date();

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
      ) - 1;
    const phtDay = parseInt(
      new Intl.DateTimeFormat("en-US", { timeZone, day: "numeric" }).format(
        now,
      ),
    );

    const startOfTodayUTC = new Date(
      Date.UTC(phtYear, phtMonth, phtDay, 0 - 8, 0, 0, 0),
    );
    const endOfTodayUTC = new Date(
      Date.UTC(phtYear, phtMonth, phtDay, 23 - 8, 59, 59, 999),
    );

    const services = await prisma.availedService.findMany({
      where: {
        servedById: userId,
        status: Status.DONE,
        completedAt: {
          gte: startOfTodayUTC,
          lte: endOfTodayUTC,
          not: null,
        },
      },

      select: {
        id: true,
        transactionId: true,
        serviceId: true,
        quantity: true,
        price: true,
        commissionValue: true,
        originatingSetId: true,
        originatingSetTitle: true,
        checkedById: true,
        servedById: true,
        status: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,

        service: {
          select: {
            id: true,
            title: true,
          },
        },

        transaction: {
          select: {
            customer: {
              select: {
                name: true,
              },
            },
          },
        },
      },

      orderBy: {
        completedAt: "desc",
      },
    });

    console.log(
      `[ServerAction|getServedServicesTodayByUser] Found ${services.length} served services today.`,
    );

    return services as AvailedServicesProps[];
  } catch (error: any) {
    console.error(
      `[ServerAction|getServedServicesTodayByUser] Error fetching services for user ${userId}:`,
      error,
    );

    return [];
  } finally {
  }
}

export async function createExpense(data: {
  date: string;
  amount: number;
  category: ExpenseCategory;
  description?: string | null;
  recordedById: string;
  branchId?: string | null;
}): Promise<
  { success: true; expenseId: string } | { success: false; error: string }
> {
  try {
    console.log("[ServerAction] Received createExpense request:", data);

    if (typeof data.date !== "string" || !data.date) {
      return {
        success: false,
        error: "Date is required and must be a string.",
      };
    }
    if (
      typeof data.amount !== "number" ||
      isNaN(data.amount) ||
      !isFinite(data.amount) ||
      data.amount <= 0
    ) {
      return { success: false, error: "Amount must be a positive number." };
    }
    if (!data.recordedById || typeof data.recordedById !== "string") {
      return { success: false, error: "Recorded By user ID is required." };
    }

    if (
      data.branchId !== null &&
      data.branchId !== undefined &&
      typeof data.branchId !== "string"
    ) {
      return { success: false, error: "Invalid branch ID format." };
    }

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

    const prismaCategory: ExpenseCategory = data.category;

    const [year, month, day] = data.date.split("-").map(Number);
    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return {
        success: false,
        error: `Invalid date format provided: ${data.date}`,
      };
    }

    const expenseDateUtc = new Date(Date.UTC(year, month - 1, day));

    if (isNaN(expenseDateUtc.getTime())) {
      return {
        success: false,
        error: `Invalid date format provided after parsing: ${data.date}`,
      };
    }

    const recorder = await prisma.account.findUnique({
      where: { id: data.recordedById },
      select: { id: true },
    });
    if (!recorder) {
      return {
        success: false,
        error: `Recorded By user with ID "${data.recordedById}" not found.`,
      };
    }

    if (data.branchId) {
      const branch = await prisma.branch.findUnique({
        where: { id: data.branchId },
        select: { id: true },
      });
      if (!branch) {
        return {
          success: false,
          error: `Provided branch with ID "${data.branchId}" not found.`,
        };
      }
    }

    const expense = await prisma.expense.create({
      data: {
        date: expenseDateUtc,
        amount: data.amount,
        category: prismaCategory,
        description: data.description,
        recordedById: data.recordedById,
        branchId: data.branchId,
      },
    });

    console.log("[ServerAction] Expense created successfully:", expense.id);
    return { success: true, expenseId: expense.id };
  } catch (error: unknown) {
    console.error("[ServerAction] DETAILED ERROR creating expense:", error);

    let userErrorMessage =
      "Failed to create expense due to an unexpected server error.";

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as any).code === "string"
    ) {
      const prismaError = error as any;

      if (prismaError.code === "P2002") {
        userErrorMessage = `Duplicate entry error: ${prismaError.meta?.target || "unique constraint violated"}. Please check for existing records.`;
      } else if (prismaError.code === "P2003") {
        userErrorMessage = `Data integrity error: Related record not found for field "${prismaError.meta?.field_name || "unknown"}". Ensure recorded user and branch exist.`;
      } else if (prismaError.code === "P2005") {
        userErrorMessage = `Data type error: Invalid value for field "${prismaError.meta?.field_name || "unknown"}". Please check input values.`;
      } else {
        userErrorMessage = `Database error (${prismaError.code}): ${prismaError.message || "An unknown database error occurred."}`;
      }
    } else if (error instanceof Error) {
      userErrorMessage = error.message;
    } else if (typeof error === "string") {
      userErrorMessage = `Server error: ${error}`;
    }

    return { success: false, error: userErrorMessage };
  } finally {
    if (prisma && typeof (prisma as any).$disconnect === "function") {
      await prisma.$disconnect();
    }
  }
}

export async function getSalesDataLast6Months(): Promise<SalesDataDetailed | null> {
  try {
    const today = new Date();

    const endDate = endOfMonth(today);
    const startDate = startOfMonth(subMonths(today, 5));

    console.log(
      `[ServerAction] Fetching sales data from ${startDate.toISOString()} to ${endDate.toISOString()}`,
    );

    const allBranches = await prisma.branch.findMany({
      select: {
        id: true,
        title: true,
        code: true,
      },
      orderBy: {
        title: "asc",
      },
    });
    console.log(`[ServerAction] Fetched ${allBranches.length} branches.`);

    const completedTransactions = await prisma.transaction.findMany({
      where: {
        status: Status.DONE,
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
        branchId: true,
      },
      orderBy: {
        date: "asc",
      },
    });
    console.log(
      `[ServerAction] Fetched ${expenses.length} expenses for report.`,
    );

    const monthlyDataMap = new Map<
      string,
      {
        totalSales: number;
        cash: number;
        ewallet: number;
        bank: number;
        unknown: number;
        branchMonthlySalesMap: Map<string, number>;
        totalExpenses: number;
      }
    >();

    const overallPaymentMethodTotals: PaymentMethodTotals = {
      cash: 0,
      ewallet: 0,
      bank: 0,
      unknown: 0,
    };

    let overallGrandTotal = 0;
    let overallTotalExpenses = 0;

    const branchPeriodSalesMap = new Map<string, number>();

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

    completedTransactions.forEach((transaction) => {
      const yearMonthKey = format(transaction.bookedFor, "yyyy-MM");
      const monthData = monthlyDataMap.get(yearMonthKey);

      if (monthData) {
        const transactionGrandTotal = transaction.grandTotal ?? 0;

        monthData.totalSales += transactionGrandTotal;

        const method = transaction.paymentMethod?.toLowerCase() || "unknown";
        if (method === PaymentMethod.cash.toLowerCase()) {
          monthData.cash += transactionGrandTotal;
        } else if (method === PaymentMethod.ewallet.toLowerCase()) {
          monthData.ewallet += transactionGrandTotal;
        } else if (method === PaymentMethod.bank.toLowerCase()) {
          monthData.bank += transactionGrandTotal;
        } else {
          monthData.unknown += transactionGrandTotal;
        }

        if (method === PaymentMethod.cash.toLowerCase()) {
          overallPaymentMethodTotals.cash += transactionGrandTotal;
        } else if (method === PaymentMethod.ewallet.toLowerCase()) {
          overallPaymentMethodTotals.ewallet += transactionGrandTotal;
        } else if (method === PaymentMethod.bank.toLowerCase()) {
          overallPaymentMethodTotals.bank += transactionGrandTotal;
        } else {
          overallPaymentMethodTotals.unknown += transactionGrandTotal;
        }

        overallGrandTotal += transactionGrandTotal;

        transaction.availedServices.forEach((item) => {
          if (item.service?.branch) {
            const branchTitle = item.service.branch.title;

            const itemSales = (item.price ?? 0) * (item.quantity ?? 0);

            monthData.branchMonthlySalesMap.set(
              branchTitle,
              (monthData.branchMonthlySalesMap.get(branchTitle) ?? 0) +
                itemSales,
            );

            branchPeriodSalesMap.set(
              branchTitle,
              (branchPeriodSalesMap.get(branchTitle) ?? 0) + itemSales,
            );
          } else if (item.originatingSetId && item.originatingSetTitle) {
          } else {
          }
        });
      } else {
        console.warn(
          `[ServerAction] Transaction outside of 6-month calculation range? ID: ${transaction.id}, Date: ${transaction.bookedFor?.toISOString()}`,
        );
      }
    });

    expenses.forEach((expense) => {
      const yearMonthKey = format(expense.date, "yyyy-MM");
      const monthData = monthlyDataMap.get(yearMonthKey);

      if (monthData) {
        const expenseAmount = expense.amount ?? 0;

        monthData.totalExpenses += expenseAmount;

        overallTotalExpenses += expenseAmount;
      } else {
        console.warn(
          `[ServerAction] Expense outside of 6-month calculation range? ID: ${expense.id}, Date: ${expense.date?.toISOString()}`,
        );
      }
    });

    const monthlySalesArray: MonthlySales[] = Array.from(
      monthlyDataMap.entries(),
    )
      .map(([yearMonthKey, data]) => {
        const branchMonthlySales: { [branchTitle: string]: number } = {};
        data.branchMonthlySalesMap.forEach((value, key) => {
          branchMonthlySales[key] = value;
        });

        const branchSalesForTooltip = Array.from(
          data.branchMonthlySalesMap.entries(),
        )
          .map(([branchTitle, totalSales]) => ({
            branchTitle,
            totalSales,
          }))
          .sort((a, b) => b.totalSales - a.totalSales);

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
          totalExpenses: data.totalExpenses,
        };
      })
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

    const monthlyExpensesArray: MonthlyExpensesTotal[] = monthlySalesArray.map(
      (item) => ({
        month: item.month,
        yearMonth: item.yearMonth,
        totalExpenses: item.totalExpenses,
      }),
    );

    const branchesReportData = allBranches.map((branch) => {
      const totalSalesForPeriod = branchPeriodSalesMap.get(branch.title) ?? 0;
      return {
        id: branch.id,
        code: branch.code,
        title: branch.title,
        totalSales: totalSalesForPeriod,
      };
    });

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
    );
    console.log(
      "[ServerAction] Unique Branch Titles:",
      uniqueBranchTitlesArray,
    );

    return {
      monthlySales: monthlySalesArray,
      paymentMethodTotals: overallPaymentMethodTotals,
      grandTotal: overallGrandTotal,
      uniqueBranchTitles: uniqueBranchTitlesArray,
      branches: branchesReportData,
      monthlyExpenses: monthlyExpensesArray,
      overallTotalExpenses: overallTotalExpenses,
    };
  } catch (error: any) {
    console.error("[ServerAction] Error fetching sales data:", error);

    return {
      monthlySales: [],
      paymentMethodTotals: { cash: 0, ewallet: 0, bank: 0, unknown: 0 },
      grandTotal: 0,
      uniqueBranchTitles: [],
      branches: [],
      monthlyExpenses: [],
      overallTotalExpenses: 0,
    };
  } finally {
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

interface ClaimGCData {
  gcId: string;
  customerId: string;
  bookedForDate: string;
}

interface ClaimGCResult {
  success: boolean;
  message: string;
  transactionId?: string;
  errors?: Record<string, string[]>;
}

export async function toggleAllCanRequestPayslipAction(
  newStatus: boolean,
  accountIds?: string[],
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (accountIds && accountIds.length > 0) {
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
    } else {
      await prisma.account.updateMany({
        data: {
          canRequestPayslip: newStatus,
        },
      });
    }

    revalidatePath("/dashboard");

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
  bookedForDate: string;
}): Promise<
  | { success: true; message: string; transactionId: string }
  | { success: false; message: string }
> {
  try {
    if (!data.gcId || !data.customerId || !data.bookedForDate) {
      return {
        success: false,
        message: "Missing required data (GC ID, Customer ID, or Booking Date).",
      };
    }

    const giftCertificate = await prisma.giftCertificate.findUnique({
      where: { id: data.gcId },
      include: {
        services: true,
        serviceSets: {
          include: {
            services: true,
          },
        },
      },
    });

    if (!giftCertificate) {
      return { success: false, message: "Gift Certificate not found." };
    }
    if (giftCertificate.usedAt) {
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
      return {
        success: false,
        message:
          "Gift Certificate is not linked to any services or sets and cannot be claimed.",
      };
    }

    const customer = await prisma.customer.findUnique({
      where: { id: data.customerId },
    });

    if (!customer) {
      return { success: false, message: "Customer not found." };
    }

    let grandTotal = 0;
    const availedServiceItemsData: any[] = [];

    for (const service of giftCertificate.services) {
      availedServiceItemsData.push({
        serviceId: service.id,
        quantity: 1,
        price: service.price,
        commissionValue: 0,
        status: Status.PENDING,
        completedAt: null,
      });
      grandTotal += service.price;
    }

    for (const serviceSet of giftCertificate.serviceSets) {
      availedServiceItemsData.push({
        originatingSetId: serviceSet.id,
        originatingSetTitle: serviceSet.title,
        serviceId: null,
        quantity: 1,
        price: serviceSet.price,
        commissionValue: 0,
        status: Status.PENDING,
        completedAt: null,
      });
      grandTotal += serviceSet.price;
    }

    const selectedDate = new Date(data.bookedForDate);
    if (isNaN(selectedDate.getTime())) {
      return { success: false, message: "Invalid booking date provided." };
    }

    const currentTime = new Date();

    const bookedForWithClaimTime = new Date(
      selectedDate.getFullYear(),
      selectedDate.getMonth(),
      selectedDate.getDate(),
      currentTime.getHours(),
      currentTime.getMinutes(),
      currentTime.getSeconds(),
      currentTime.getMilliseconds(),
    );

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          grandTotal: grandTotal,
          discount: 0,

          paymentMethod: PaymentMethod.cash,

          status: Status.PENDING,
          giftCertificateId: giftCertificate.id,
          bookedFor: bookedForWithClaimTime,
          createdAt: now,
        },
      });

      const availedServiceDataWithTxId = availedServiceItemsData.map(
        (item) => ({
          ...item,
          transactionId: transaction.id,
        }),
      );

      if (availedServiceDataWithTxId.length > 0) {
        await tx.availedService.createMany({
          data: availedServiceDataWithTxId,
          skipDuplicates: true,
        });
      }

      await tx.giftCertificate.update({
        where: { id: giftCertificate.id },
        data: {
          usedAt: now,
        },
      });

      return transaction;
    });

    return {
      success: true,
      message: `Gift Certificate "${giftCertificate.code}" successfully claimed and transaction created with ID ${result.id}.`,
      transactionId: result.id,
    };
  } catch (error: any) {
    console.error("Error claiming Gift Certificate:", error);

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
      take: limit,
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

    return transactions;
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
        ...(status !== undefined && { status }),
        ...(paymentMethod !== undefined && { paymentMethod }),
      },
    });

    revalidatePath("/[accountId]");
    revalidatePath("/[accountId]/transactions");

    return { success: true, message: "Transaction updated successfully." };
  } catch (error: any) {
    console.error(`Error updating transaction ${transactionId}:`, error);

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
    const email = formData.get("email") as string;
    const dailyRateStr = formData.get("dailyRate") as string;
    const branchId = formData.get("branchId") as string | null;

    const selectedRoles: Role[] = Object.values(Role).filter(
      (roleValue) => formData.get(`role-${roleValue}`) === "on",
    );

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

    const temporaryPassword = generateRandomPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    const newAccount = await prisma.account.create({
      data: {
        username,
        name,
        email,
        password: hashedPassword,
        dailyRate: dailyRate!,
        role: selectedRoles,
        branchId: branchId && branchId !== "" ? branchId : null,
        mustChangePassword: true,
      },
      select: {
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
          from: SENDER_EMAIL_SA,
          to: [newAccount.email!],
          subject: `Welcome to BeautyFeel App - ${newAccount.name}!`,
          html: `
              <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <h2 style="color: #0056b3;">Welcome to BeautyFeel App, ${newAccount.name}!</h2>
                <p>An account has been created for you by an administrator.</p>
                <p>Here are your login details:</p>
                <ul style="list-style-type: none; padding: 0;">
                  <li style="margin-bottom: 8px;"><strong>Username:</strong> ${newAccount.username}</li>
                  <li style="margin-bottom: 8px;"><strong>Temporary Password:</strong> <strong style="font-size: 1.1em; color: #d9534f;">${temporaryPassword}</strong></li>
                </ul>
                <p>
                  Please <a href="https:
                  You will be required to change this temporary password upon your first login.
                </p>
                <p>If you have any questions, please contact your administrator.</p>
                <p style="margin-top: 20px; font-size: 0.9em; color: #777;">
                  Best regards,<br/>
                  The BeautyFeel App Team
                </p>
              </div>
            `,
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

    if (error.code === "P2002" && error.meta?.target) {
      const targetField = (error.meta.target as string[]).join(", ");
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
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      success: false,
      message: "User not authenticated. Please log in again.",
    };
  }

  if (!newPassword || newPassword.length < 6) {
    return {
      success: false,
      message: "Password must be at least 6 characters long.",
    };
  }

  try {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.account.update({
      where: { id: session.user.id },
      data: {
        password: hashedPassword,
        mustChangePassword: false,
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
  CustomerWithNonNullEmail[]
> {
  try {
    const cachedData =
      getCachedData<CustomerWithNonNullEmail[]>(CUSTOMERS_CACHE_KEY);
    if (cachedData) {
      console.log("Returning customers from cache...");
      return cachedData;
    }

    console.log("Fetching customers from database...");

    const customersWithEmails = await prisma.customer.findMany({
      where: {
        AND: [{ email: { not: null } }, { email: { not: "" } }],
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

    const result = customersWithEmails as CustomerWithNonNullEmail[];

    setCachedData(CUSTOMERS_CACHE_KEY, result);

    console.log(`Fetched ${result.length} customers with emails.`);
    return result;
  } catch (error) {
    console.error("Error fetching customers:", error);

    throw new Error("Failed to fetch customer list. Database error.");
  }
}

function generateEmailHtml(
  subject: string,
  body: string,
  logoUrl: string,
): string {
  return `
<!DOCTYPE html PUBLIC "-
<html xmlns="http:
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${subject}</title>
  <style type="text/css">
    #outlook a { padding:0; }
    body{ width:100% !important; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; margin:0; padding:0; }
    .ExternalClass { width:100%; }
    .ExternalClass, .ExternalClass p, .ExternalClass span, .ExternalClass font, .ExternalClass td, .ExternalClass div { line-height: 100%; }
    #backgroundTable { margin:0; padding:0; width:100% !important; line-height: 100% !important; }

    body {
      background-color: #F6F4EB;
      font-family: sans-serif;
      color: #2E2A2A; 
    }
    table { border-collapse: collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
    td { margin:0; padding:0; }
    img { outline:none; text-decoration:none; -ms-interpolation-mode: bicubic; }
    a img { border:none; }
    .image_fix { display:block; }

    @media only screen and (max-width: 600px) {
      table[class=full-width] { width: 100% !important; }
      table[class=column] { width: 100% !important; float: none !important; margin-bottom: 15px; }
      td[class=column-padding] { padding-left: 15px !important; padding-right: 15px !important; }
      td[class=mobile-padding] { padding: 15px !important; }
      td[class=align-center] { text-align: center !important; }
      img[class=image-responsive] { width: 100% !important; height: auto !important; }
    }

    .color-primary-dark { color: #C28583; } 
    .color-text { color: #2E2A2A; } 
    .bg-offwhite { background-color: #F6F4EB; } 
    .bg-lightgray { background-color: #D9D9D9; }
    .btn {
        display: inline-block;
        padding: 10px 20px;
        margin-top: 15px;
        background-color: #C28583; 
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
  subjectTemplate: string,
  bodyTemplate: string,
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

    const allCustomers = await getCustomersForEmailAction();
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

    for (const customer of recipients) {
      if (!customer.email) {
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
      const personalizedBody = replacePlaceholders(bodyTemplate, customer);

      const htmlContent = generateEmailHtml(
        personalizedSubject,
        personalizedBody,
        LOGO_URL_SA,
      );

      try {
        console.log(
          `Sending to: ${customer.email}, Subject: ${personalizedSubject}`,
        );
        const resendResponse = await resendInstanceSA.emails.send({
          from: SENDER_EMAIL_SA,
          to: customer.email,
          subject: personalizedSubject,
          text: personalizedBody,
          html: htmlContent,
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
    }
    if (sentCount === 0 && failedCount === 0) {
      finalMessage =
        "No emails were processed. Check recipient list and server logs.";
    }

    return {
      success: sentCount > 0 && failedCount === 0,
      message: finalMessage.trim(),
      details: {
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
      },
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
    revalidatePath("/dashboard/settings/email-templates");
    return {
      success: true,
      message: "Email template created successfully.",
      template: newTemplate,
    };
  } catch (error: any) {
    console.error("Error creating email template:", error);

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
    revalidatePath("/dashboard/settings/email-templates");
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

export async function deleteEmailTemplateAction(id: string) {
  try {
    await prisma.emailTemplate.delete({
      where: { id },
    });
    invalidateCache(TEMPLATES_CACHE_KEY);
    revalidatePath("/dashboard/settings/email-templates");
    return { success: true, message: "Email template deleted successfully." };
  } catch (error) {
    console.error("Error deleting email template:", error);
    return { success: false, message: "Could not delete email template." };
  }
}

export async function getCustomersAction(): Promise<CustomerWithDetails[]> {
  try {
    const customersFromDb = await prisma.customer.findMany({
      orderBy: {
        name: "asc",
      },
      // Use select at the top level to explicitly include scalar fields and relations
      select: {
        id: true,
        name: true,
        email: true,
        totalPaid: true,
        nextAppointment: true,

        // Include relations within the select block
        transactionHistory: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: {
            // Nested select for the relation
            id: true,
            createdAt: true,
            grandTotal: true,
            status: true,
            bookedFor: true,
            availedServices: {
              take: 5,
              select: {
                // Nested select for the relation's relation
                service: { select: { title: true } },
                originatingSetTitle: true,
              },
            },
          },
        },
        recommendedAppointments: {
          // Include relation within select
          where: {
            status: { in: ["RECOMMENDED", "SCHEDULED"] },
            recommendedDate: { gte: startOfDay(new Date()) },
          },
          orderBy: { recommendedDate: "asc" },
          take: 10,
          select: {
            // Nested select for the relation
            id: true,
            recommendedDate: true,
            status: true,
            originatingService: { select: { title: true } },
          },
        },
        _count: {
          // Include _count within select
          select: { purchasedGiftCertificates: true },
        },
      },
      // Remove the top-level 'include' as 'select' is now used
      // include: { ... } // This part is moved into 'select'
    });

    // The shape of customersFromDb now precisely matches the CustomerWithDetails interface
    // because of the explicit select, resolving the type error.
    return customersFromDb.map((customer) => ({
      id: customer.id,
      name: customer.name,
      email: customer.email,
      totalPaid: customer.totalPaid,
      nextAppointment: customer.nextAppointment,
      transactions: customer.transactionHistory,
      recommendedAppointments: customer.recommendedAppointments,
      purchasedGiftCertificatesCount: customer._count.purchasedGiftCertificates,
    }));
  } catch (error) {
    console.error("Error fetching customers with details:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new Error(`Database error: ${error.message} (Code: ${error.code})`);
    }
    throw new Error(
      "Failed to fetch customer data. Please try refreshing the page.",
    );
  } finally {
    await prisma.$disconnect(); // Good practice to disconnect in standalone functions
  }
}
export async function createCustomerAction(formData: FormData) {
  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;

  const trimmedName = name?.trim();
  const trimmedEmail = email?.trim();

  if (!trimmedName) {
    return {
      success: false,
      message: "Name is required.",
      errors: { name: ["Name is required."] },
    };
  }
  if (trimmedName.length > 50) {
    return {
      success: false,
      message: "Name cannot exceed 50 characters.",
      errors: { name: ["Name too long."] },
    };
  }
  if (
    trimmedEmail &&
    trimmedEmail.length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
  ) {
    return {
      success: false,
      message: "Invalid email format provided.",
      errors: { email: ["Invalid email format."] },
    };
  }

  try {
    const newCustomer = await prisma.customer.create({
      data: {
        name: trimmedName,
        email: trimmedEmail && trimmedEmail.length > 0 ? trimmedEmail : null,
      },
    });
    invalidateCache(CUSTOMERS_CACHE_KEY);
    // revalidateTag('customers');
    return {
      success: true,
      message: "Customer created successfully!",
      customer: newCustomer,
    };
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target as string[] | undefined;
      if (target && target.includes("email")) {
        return {
          success: false,
          message:
            "This email address is already registered to another customer.",
          errors: { email: ["Email already in use."] },
        };
      }
      return {
        success: false,
        message: "A customer with these unique details already exists.",
        errors: { form: ["Unique constraint failed."] },
      };
    }
    console.error("Create customer error:", error);
    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while creating the customer.",
    };
  }
}

export async function updateCustomerAction(
  customerId: string,
  formData: FormData,
) {
  const name = formData.get("name") as string | null;
  const email = formData.get("email") as string | null;

  const trimmedName = name?.trim();
  const trimmedEmail = email?.trim();

  if (!trimmedName) {
    return {
      success: false,
      message: "Name is required.",
      errors: { name: ["Name is required."] },
    };
  }
  if (trimmedName.length > 50) {
    return {
      success: false,
      message: "Name cannot exceed 50 characters.",
      errors: { name: ["Name too long."] },
    };
  }
  if (
    trimmedEmail &&
    trimmedEmail.length > 0 &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)
  ) {
    return {
      success: false,
      message: "Invalid email format provided.",
      errors: { email: ["Invalid email format."] },
    };
  }

  try {
    const updatedCustomer = await prisma.customer.update({
      where: { id: customerId },
      data: {
        name: trimmedName,
        email: trimmedEmail && trimmedEmail.length > 0 ? trimmedEmail : null,
      },
    });
    invalidateCache(CUSTOMERS_CACHE_KEY);
    // revalidateTag('customers');
    return {
      success: true,
      message: "Customer details updated successfully!",
      customer: updatedCustomer,
    };
  } catch (error: any) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target as string[] | undefined;
      if (target && target.includes("email")) {
        return {
          success: false,
          message:
            "This email address is already registered to another customer.",
          errors: { email: ["Email already in use by another customer."] },
        };
      }
      return {
        success: false,
        message: "Update failed due to a conflict with existing data.",
        errors: { form: ["Unique constraint failed on update."] },
      };
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return {
        success: false,
        message: "Customer not found. The record may have been deleted.",
      };
    }
    console.error("Update customer error:", error);
    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while updating the customer.",
    };
  }
}

export async function deleteCustomerAction(customerId: string) {
  try {
    await prisma.customer.delete({
      where: { id: customerId },
    });
    invalidateCache(CUSTOMERS_CACHE_KEY);
    // revalidateTag('customers');
    return {
      success: true,
      message: "Customer has been successfully deleted.",
    };
  } catch (error: any) {
    console.error("Delete customer error:", error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return {
          success: false,
          message:
            "Cannot delete this customer as they have associated records (like transactions or appointments). Please remove or reassign these records first.",
        };
      }
      if (error.code === "P2025") {
        return {
          success: false,
          message: "Customer not found. They may have already been deleted.",
        };
      }
    }
    return {
      success: false,
      message:
        error.message ||
        "An unexpected error occurred while trying to delete the customer.",
    };
  }
}
async function getAccountDailyRate(accountId: string): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { dailyRate: true },
  });
  return account?.dailyRate ?? 0;
}
