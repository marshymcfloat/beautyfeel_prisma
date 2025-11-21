"use server";

import prisma from "./prisma";
import {
  Status,
  Role, // Need the Role enum for commission rate logic
  PayslipRequestStatus,
  PayslipRequest,
  PayslipStatus,
  AvailedServiceUnit,
  AvailedService,
  Transaction,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

import { z } from "zod";

import { revalidatePath } from "next/cache";
import {
  startOfDay,
  addDays,
  endOfDay,
  eachDayOfInterval,
  isValid,
} from "date-fns";

import { toZonedTime, toDate, formatInTimeZone, format } from "date-fns-tz";
const SALARY_COMMISSION_RATE = parseFloat(
  process.env.SALARY_COMMISSION_RATE || "0.1",
);
const MASSEUSE_COMMISSION_RATE = parseFloat(
  process.env.MASSEUSE_COMMISSION_RATE || "0.5", // Or your specific masseuse rate
);

type PayslipActionResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

// MODIFIED: Accepts the date string from the client
export type RequestPayslipPayload = {
  accountId: string;
  notes?: string;
  // periodEndDateString is no longer needed
};

type EmployeeWorkHistoryData = {
  account: {
    id: string;
    name: string;
    dailyRate: number;
    salary: number; // This seems to be 'Current Total Earnings (Gross)' in the UI
    canRequestPayslip: boolean;
  };
  lastPayslip: {
    periodEndDate: Date;
    releasedDate: Date | null; // Ensure this is part of the type
  } | null;
  commissionSummary: {
    totalCommissionSinceCutoff: number;
    entries: Array<{
      availedServiceId: string;
      transactionId: string;
      transactionCreatedAt: Date;
      title: string;
      itemQuantity: number; // Total quantity for the AvailedService
      servedUnitCount: number; // Units served by this employee for this AvailedService
      totalCommissionForThisASItem: number; // Total commission for this employee from this AvailedService
    }>;
  };
  payslipRequests: Array<{
    id: string;
    status: string; // Ideally, use PayslipRequestStatus enum type
    requestTimestamp: Date;
    periodStartDate: Date;
    periodEndDate: Date;
    notes: string | null;
  }>;
  currentPeriodStartDate: Date | null; // The start date of the current work/earning period
};

type AvailedServiceUnitWithRelations = Prisma.AvailedServiceUnitGetPayload<{
  include: {
    servedBy: { select: { role: true } }; // To determine commission rate
    availedService: {
      select: {
        id: true;
        quantity: true;
        price: true; // Base price of the AvailedService (for all units)
        originatingSetTitle: true;
        service: { select: { title: true } };
        transaction: {
          select: {
            id: true;
            grandTotal: true; // Grand total of the transaction after discounts
            createdAt: true; // Transaction creation date
            // To calculate discount proportion:
            availedServices: { select: { id: true; price: true } };
          };
        };
      };
    };
  };
}>;

export type PayslipRequestWithAccounts = PayslipRequest & {
  account: { id: string; name: string; role: Role[]; dailyRate: number };
  processedBy: { name: string } | null;
  relatedPayslip: { id: string } | null;
};

export type Employee = {
  id: string;
  name: string;
  canRequestPayslip: boolean;
};

const PHILIPPINES_TIMEZONE = "Asia/Manila"; // Use IANA timezone name for robustness

const startOfDayInTimezone = (date: Date, timeZone: string): Date => {
  // 1. Format the input UTC Date to get the date part (e.g., "2023-10-27")
  //    as it appears in the target timezone.
  const datePart = formatInTimeZone(date, timeZone, "yyyy-MM-dd");

  // 2. Construct a string representing the start of that day in the target timezone.
  const startOfDayString = `${datePart}T00:00:00.000`;

  // 3. Parse this string using toDate, telling it that the string represents
  //    a local time in the specified 'timeZone'. This returns a UTC Date object.
  return toDate(startOfDayString, { timeZone });
};

const endOfDayInTimezone = (date: Date, timeZone: string): Date => {
  // 1. Format the input UTC Date to get the date part in the target timezone.
  const datePart = formatInTimeZone(date, timeZone, "yyyy-MM-dd");

  // 2. Construct a string representing the end of that day (23:59:59.999)
  //    in the target timezone.
  const endOfDayString = `${datePart}T23:59:59.999`;

  // 3. Parse this string, interpreting it as local time in the specified 'timeZone',
  //    to get the corresponding UTC Date object.
  return toDate(endOfDayString, { timeZone });
};

const GetServedServicesSchema = z.object({
  accountId: z.string().uuid("Invalid account ID format."),
});

// --- Output Data Structure ---
type ServedServiceDetail = {
  // Transaction Info
  transactionId: string;
  transactionCreatedAt: Date; // Original creation/booking date of transaction
  transactionMarkedDoneAt: Date; // When the transaction was marked as DONE (transaction.updatedAt)
  transactionGrandTotal: number;
  customerName: string;

  // Availed Service (Line Item) Info
  availedServiceId: string;
  availedServiceItemPrice: number; // Total price for this line item (e.g., service unit price * quantity)
  availedServiceItemQuantity: number; // Total quantity for this line item

  // Original Service Info
  originalServiceId: string;
  originalServiceTitle: string;
  originalServiceBaseUnitPrice: number; // Base price per single unit of the service

  // Served Unit Info
  servedUnitId: string;
  servedUnitIndex: number; // 0-based index within the availed service line item
  servedUnitCompletedAt: Date | null; // When this specific unit was marked completed
};

export async function getServedServicesAfterLastPayslip(input: {
  accountId: string;
}): Promise<{
  success: boolean;
  data?: ServedServiceDetail[];
  error?: string;
  lastPayslipReleaseDateUsed?: Date | null; // To inform client about the cutoff
}> {
  const validation = GetServedServicesSchema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      error:
        "Invalid input: " +
        validation.error.flatten().fieldErrors.accountId?.join(", "),
    };
  }

  const { accountId } = validation.data;

  try {
    // 1. Find the release date of the last 'RELEASED' payslip for the account
    const lastPayslip = await prisma.payslip.findFirst({
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

    const lastPayslipReleaseDate = lastPayslip?.releasedDate || null;

    // 2. Fetch AvailedServiceUnits served by the employee:
    //    - The unit itself must be 'DONE'.
    //    - The parent Transaction must be 'DONE'.
    //    - If a last payslip release date exists, the Transaction must have been
    //      marked 'DONE' (i.e., its `updatedAt` timestamp) *after* that release date.
    const servedUnits = await prisma.availedServiceUnit.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE, // Ensure the unit itself is marked as DONE
        availedService: {
          transaction: {
            status: Status.DONE,
            // Apply date filter if lastPayslipReleaseDate is available
            ...(lastPayslipReleaseDate && {
              updatedAt: {
                // Assumes Transaction.updatedAt reflects when status became DONE
                gt: lastPayslipReleaseDate,
              },
            }),
          },
        },
      },
      select: {
        id: true, // servedUnitId
        unitIndex: true,
        completedAt: true, // servedUnitCompletedAt
        availedService: {
          select: {
            id: true, // availedServiceId
            price: true, // availedServiceItemPrice (total for the line item)
            quantity: true, // availedServiceItemQuantity
            service: {
              // Original service details
              select: {
                id: true, // originalServiceId
                title: true, // originalServiceTitle
                price: true, // originalServiceBaseUnitPrice
              },
            },
            transaction: {
              select: {
                id: true, // transactionId
                createdAt: true, // transactionCreatedAt
                updatedAt: true, // transactionMarkedDoneAt (when status likely changed to DONE)
                grandTotal: true,
                customer: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: [
        { availedService: { transaction: { createdAt: "desc" } } }, // Show most recent transactions first
        { availedService: { service: { title: "asc" } } }, // Then sort by service title
        { unitIndex: "asc" }, // Then by unit index
      ],
    });

    // 3. Transform the data into the desired output structure
    const data: ServedServiceDetail[] = servedUnits.map((unit) => {
      const transaction = unit.availedService.transaction;
      const availedService = unit.availedService;
      const service = availedService.service; // This can be null if AvailedService doesn't link to a Service

      return {
        // Transaction Info
        transactionId: transaction.id,
        transactionCreatedAt: transaction.createdAt,
        transactionMarkedDoneAt: transaction.updatedAt!, // Should be set if transaction is DONE and updatedAt is @updatedAt
        transactionGrandTotal: transaction.grandTotal,
        customerName: transaction.customer?.name || "N/A",

        // Availed Service (Line Item) Info
        availedServiceId: availedService.id,
        availedServiceItemPrice: availedService.price,
        availedServiceItemQuantity: availedService.quantity,

        // Original Service Info
        originalServiceId: service?.id || "N/A",
        originalServiceTitle: service?.title || "Custom Item/Not Specified",
        originalServiceBaseUnitPrice: service?.price ?? 0, // Service.price is base for single unit

        // Served Unit Info
        servedUnitId: unit.id,
        servedUnitIndex: unit.unitIndex,
        servedUnitCompletedAt: unit.completedAt,
      };
    });

    return {
      success: true,
      data,
      lastPayslipReleaseDateUsed: lastPayslipReleaseDate,
    };
  } catch (error) {
    console.error("Error in getServedServicesAfterLastPayslip:", error);
    let errorMessage =
      "An unexpected error occurred while fetching served services.";
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    return {
      success: false,
      error: errorMessage,
      lastPayslipReleaseDateUsed: null,
    };
  }
}

export async function getEmployeeWorkHistory(
  accountId: string,
): Promise<EmployeeWorkHistoryData | null> {
  if (!accountId) return null;

  try {
    const accountWithLastPayslipData = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        dailyRate: true,
        salary: true,
        canRequestPayslip: true,
        payslips: {
          where: { status: "RELEASED" },
          orderBy: { periodEndDate: "desc" }, // Still order by periodEndDate to get the most recent payslip by its period
          select: {
            periodEndDate: true,
            releasedDate: true, // This is crucial for the new logic
          },
          take: 1,
        },
      },
    });

    if (!accountWithLastPayslipData) return null;

    const { payslips, ...accountInfo } = accountWithLastPayslipData;
    const lastReleasedPayslip = payslips[0] || null;

    // Determine fallback start date for the very first payslip if no previous released payslips.
    let fallbackStartDate: Date;
    const firstAttendance = await prisma.attendance.findFirst({
      where: { accountId },
      orderBy: { date: "asc" },
      select: { date: true },
    });
    // If no attendance, fall back to today's start of day.
    // Note: attendance.date is @db.Date, so startOfDayInTimezone is correct for local timezone comparison.
    fallbackStartDate = firstAttendance
      ? startOfDayInTimezone(firstAttendance.date, PHILIPPINES_TIMEZONE)
      : startOfDayInTimezone(new Date(), PHILIPPINES_TIMEZONE);

    // --- MODIFIED: Align with requestPayslipAction's new periodStartDate logic ---
    // This is the effective start of the period for *requesting* a payslip,
    // which the user now wants to be based on the last releasedDate.
    let effectiveCurrentPeriodStartDate: Date;
    if (lastReleasedPayslip && lastReleasedPayslip.releasedDate) {
      // If a last released payslip exists, the new request period starts from its release date and time.
      effectiveCurrentPeriodStartDate = lastReleasedPayslip.releasedDate;
    } else {
      // If no last released payslip, it starts from the first attendance (or today's start if no attendance).
      effectiveCurrentPeriodStartDate = fallbackStartDate;
    }

    // --- Commission cutoff condition for *unpaid* commissions displayed on the dashboard ---
    // This logic correctly remains strictly *after* the last release date to avoid double-counting commissions
    // that were already paid out in the previous cycle.
    let commissionCompletedAtCondition: { gt?: Date; gte?: Date };
    if (lastReleasedPayslip && lastReleasedPayslip.releasedDate) {
      commissionCompletedAtCondition = { gt: lastReleasedPayslip.releasedDate };
    } else {
      // If no payslip released (or no release date), count commissions for units completed
      // *on or after* the start of the current effective work period.
      commissionCompletedAtCondition = { gte: effectiveCurrentPeriodStartDate };
    }
    // --- END MODIFICATION ---

    // --- LOGGING FOR DEBUGGING (Optional) ---
    // console.log(`[getEmployeeWorkHistory] Employee: ${accountInfo.name}`);
    // if (lastReleasedPayslip) {
    //   console.log(
    //     `  Last Payslip Period End: ${formatInTimeZone(lastReleasedPayslip.periodEndDate, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`,
    //   );
    //   console.log(
    //     `  Last Payslip Released Date: ${lastReleasedPayslip.releasedDate ? formatInTimeZone(lastReleasedPayslip.releasedDate, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX") : "N/A"}`,
    //   );
    // } else {
    //   console.log("  No previous released payslips.");
    // }
    // console.log(
    //   `  Effective Current Period Start Date (for payslip request display): ${formatInTimeZone(effectiveCurrentPeriodStartDate, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`,
    // );
    // if (commissionCompletedAtCondition.gt) {
    //     console.log(
    //         `  Commission Cutoff (completed AFTER): ${formatInTimeZone(commissionCompletedAtCondition.gt, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`
    //     );
    // } else if (commissionCompletedAtCondition.gte) {
    //     console.log(
    //         `  Commission Cutoff (completed ON or AFTER): ${formatInTimeZone(commissionCompletedAtCondition.gte, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`
    //     );
    // }
    // --- END LOGGING ---

    const servedUnitsSinceCutoff = (await prisma.availedServiceUnit.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE, // Only count commissions for DONE units
        completedAt: commissionCompletedAtCondition, // Apply the new, modified condition
      },
      include: {
        servedBy: { select: { role: true } },
        availedService: {
          select: {
            id: true,
            quantity: true,
            price: true,
            originatingSetTitle: true,
            service: { select: { title: true } },
            transaction: {
              select: {
                id: true,
                grandTotal: true,
                createdAt: true,
                availedServices: { select: { id: true, price: true } },
              },
            },
          },
        },
      },
      orderBy: { completedAt: "asc" },
    })) as AvailedServiceUnitWithRelations[];

    let totalCommissionSinceCutoff = 0;
    const commissionEntriesMap = new Map<
      string, // Key: AvailedService.id
      EmployeeWorkHistoryData["commissionSummary"]["entries"][0]
    >();

    for (const unit of servedUnitsSinceCutoff) {
      const as = unit.availedService;
      const txn = as?.transaction;
      if (!as || !txn || !unit.servedBy) continue;

      // Calculate commission for this single unit, considering transaction-level discounts
      const originalSumOfTxnAvailedServicePrices = txn.availedServices.reduce(
        (sum: number, s: { price: number | null }) => sum + (s.price ?? 0),
        0,
      );
      const totalTransactionDiscount =
        originalSumOfTxnAvailedServicePrices > 0
          ? Math.max(0, originalSumOfTxnAvailedServicePrices - txn.grandTotal) // Ensure discount isn't negative
          : 0;
      const availedServiceOriginalPrice = as.price ?? 0; // Total price for this AvailedService item

      // Distribute transaction discount proportionally to this availed service
      const asDiscountContribution =
        originalSumOfTxnAvailedServicePrices > 0 &&
        availedServiceOriginalPrice > 0
          ? (availedServiceOriginalPrice /
              originalSumOfTxnAvailedServicePrices) *
            totalTransactionDiscount
          : 0;

      const availedServiceEffectivePrice = Math.max(
        0,
        availedServiceOriginalPrice - asDiscountContribution,
      );

      // Effective price for one unit of this AvailedService
      const effectiveUnitPriceForCommission =
        as.quantity > 0 ? availedServiceEffectivePrice / as.quantity : 0;

      let commissionRate = SALARY_COMMISSION_RATE; // Default rate
      if (unit.servedBy.role.includes(Role.MASSEUSE)) {
        commissionRate = MASSEUSE_COMMISSION_RATE;
      }

      const calculatedUnitCommission = Math.max(
        0,
        Math.floor(effectiveUnitPriceForCommission * commissionRate),
      );
      totalCommissionSinceCutoff += calculatedUnitCommission;

      // Aggregate commission details by AvailedService
      if (!commissionEntriesMap.has(as.id)) {
        commissionEntriesMap.set(as.id, {
          availedServiceId: as.id,
          transactionId: txn.id,
          transactionCreatedAt: txn.createdAt,
          title:
            as.originatingSetTitle || as.service?.title || "Unknown Service",
          itemQuantity: as.quantity, // Total quantity of items in this AvailedService
          servedUnitCount: 0, // Units served by *this* employee for this AvailedService
          totalCommissionForThisASItem: 0, // Commission for *this* employee from this AvailedService
        });
      }
      const entry = commissionEntriesMap.get(as.id)!;
      entry.servedUnitCount++;
      entry.totalCommissionForThisASItem += calculatedUnitCommission;
    }

    const payslipRequests = await prisma.payslipRequest.findMany({
      where: {
        accountId,
        // Filter requests whose period starts on or after the effectiveCurrentPeriodStartDate (now aligned with releasedDate)
        periodStartDate: { gte: effectiveCurrentPeriodStartDate },
      },
      orderBy: { requestTimestamp: "desc" },
      select: {
        id: true,
        status: true,
        requestTimestamp: true,
        periodStartDate: true,
        periodEndDate: true,
        notes: true,
      },
    });

    return {
      account: accountInfo,
      lastPayslip: lastReleasedPayslip
        ? {
            periodEndDate: lastReleasedPayslip.periodEndDate,
            releasedDate: lastReleasedPayslip.releasedDate,
          }
        : null,
      commissionSummary: {
        totalCommissionSinceCutoff,
        entries: Array.from(commissionEntriesMap.values()),
      },
      payslipRequests,
      currentPeriodStartDate: effectiveCurrentPeriodStartDate,
    } as EmployeeWorkHistoryData; // Casting to ensure the return type matches
  } catch (error: any) {
    console.error(
      `[getEmployeeWorkHistory] Error fetching data for account ${accountId}:`,
      error.message,
      error.stack,
    );
    // Optionally, rethrow or handle more gracefully
    return null; // Or throw error;
  }
}

export async function requestPayslipAction(
  payload: RequestPayslipPayload,
): Promise<PayslipActionResult> {
  const { accountId, notes } = payload;
  const errors: Record<string, string[]> = {};

  if (!accountId) {
    errors.general = ["Account ID is missing."];
    return { success: false, message: "Validation failed.", errors };
  }

  const requestTime = new Date(); // Precise timestamp for the request and period end
  const periodEndDate = requestTime; // The end of the period is the exact time of the request

  const lastPayslip = await prisma.payslip.findFirst({
    where: { accountId, status: "RELEASED" },
    orderBy: { periodEndDate: "desc" }, // Find the most recent payslip by its period end date
    select: { id: true, releasedDate: true, periodEndDate: true }, // Select id for logging, and both dates for robust checks
  });

  let requiredPeriodStartDate: Date;
  if (lastPayslip) {
    // --- MODIFIED: The new period starts EXACTLY at the timestamp of the last payslip's release. ---
    // This is according to your explicit instruction based on the provided image and schema.
    // WARNING: This will create a gap in base salary/attendance coverage
    // if lastPayslip.releasedDate is later than lastPayslip.periodEndDate.
    // Example: Last payslip covers up to June 15. Released on June 18.
    // New payslip period will start from June 18. June 16 & 17 daily rates are missed.
    if (!lastPayslip.releasedDate) {
      // Fallback if somehow a released payslip has no releasedDate (shouldn't happen per schema)
      console.warn(
        `[requestPayslipAction] Last released payslip ${lastPayslip.id} has no releasedDate. Falling back to periodEndDate + 1 day.`,
      );
      requiredPeriodStartDate = startOfDay(
        addDays(lastPayslip.periodEndDate, 1),
      );
    } else {
      requiredPeriodStartDate = lastPayslip.releasedDate;
    }
  } else {
    // For a brand new employee with no previous payslips, the period starts from their
    // very first recorded attendance, at the beginning of that day.
    const firstAttendance = await prisma.attendance.findFirst({
      where: { accountId },
      orderBy: { date: "asc" },
      select: { date: true }, // Select just the date
    });
    if (!firstAttendance) {
      return {
        success: false,
        message: "Cannot request payslip: No attendance records found.",
        errors: { general: ["No work history found."] },
      };
    }
    // Using startOfDay because attendance.date is @db.Date (date-only)
    requiredPeriodStartDate = startOfDay(firstAttendance.date);
  }

  // Validation: Ensure the determined start date is not after the end date.
  if (requiredPeriodStartDate >= periodEndDate) {
    return {
      success: false,
      message: "No new work records to process since the last payslip.",
    };
  }

  // Overlap check: Prevent creating new requests that overlap with existing PENDING/APPROVED ones.
  const existingOverlapRequest = await prisma.payslipRequest.findFirst({
    where: {
      accountId,
      status: { in: ["PENDING", "APPROVED"] },
      periodStartDate: { lte: periodEndDate },
      periodEndDate: { gte: requiredPeriodStartDate },
    },
  });
  if (existingOverlapRequest) {
    return {
      success: false,
      message: `An active request with status '${existingOverlapRequest.status}' already exists that overlaps this period.`,
    };
  }

  try {
    await prisma.payslipRequest.create({
      data: {
        accountId,
        periodStartDate: requiredPeriodStartDate,
        periodEndDate: periodEndDate, // Use the precise timestamp of the request as the period end
        notes: notes || null,
        status: PayslipRequestStatus.PENDING,
        requestTimestamp: requestTime, // Record the exact timestamp when the request was made
      },
    });

    // Revalidate paths to update UI
    revalidatePath(`/account/${accountId}`);
    revalidatePath(`/admin/payslips`);
    return {
      success: true,
      message: "Payslip request submitted successfully!",
    };
  } catch (error: any) {
    console.error("[requestPayslipAction] Error:", error);
    return { success: false, message: "An unexpected error occurred." };
  }
}

export async function getPayslipRequestsAction(): Promise<{
  data: PayslipRequestWithAccounts[];
  error: string | null;
}> {
  try {
    const requests = await prisma.payslipRequest.findMany({
      include: {
        account: {
          select: { id: true, name: true, role: true, dailyRate: true },
        },
        processedBy: { select: { name: true } },
        relatedPayslip: { select: { id: true } },
      },
      orderBy: [{ status: "asc" }, { periodEndDate: "asc" }],
    });
    return { data: requests, error: null };
  } catch (error) {
    console.error("[getPayslipRequestsAction] Error:", error);
    return { data: [], error: "Failed to load payslip requests." };
  }
}
// 2. Update Payslip Request Status (Approve/Reject)
// Pass adminAccountId to track who processed it.
export async function updatePayslipRequestStatusAction(
  requestId: string,
  newStatus: "APPROVED" | "REJECTED",
  adminAccountId?: string | undefined,
  notes?: string | null,
): Promise<{ success: boolean; message?: string; error?: string }> {
  // --- Server-side authentication and authorization check ---
  // Ensure adminAccountId belongs to an authorized admin/owner.
  // const session = await auth(); // Example
  // if (!session?.user || session.user.id !== adminAccountId || !session.user.role.includes(Role.OWNER)) {
  //      return { success: false, error: "Authorization failed. Invalid admin or permissions." };
  // }
  // Assuming auth check passes...

  if (!["APPROVED", "REJECTED"].includes(newStatus)) {
    // Should not happen with correct typing/usage, but as a server-side safeguard
    console.error(
      "[updatePayslipRequestStatusAction] Invalid status provided:",
      newStatus,
    );
    return { success: false, error: "Invalid status transition attempted." };
  }

  try {
    // Find the request to get current status and requested period details for revalidation paths
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        status: true,
        accountId: true,
        periodStartDate: true,
        periodEndDate: true,
      }, // Select fields needed for check and revalidation
    });

    if (!request) {
      return { success: false, error: "Payslip request not found." };
    }

    // Prevent updating requests that are already processed or failed
    if (
      request.status === PayslipRequestStatus.PROCESSED ||
      request.status === PayslipRequestStatus.FAILED
    ) {
      return {
        success: false,
        error: `Cannot change status of a request that is already ${request.status}.`,
      };
    }
    // Optional: Prevent approving a rejected request? Allow reversing decisions? Depends on workflow.
    // The current logic *allows* going from REJECTED to APPROVED/PENDING or vice-versa if needed for corrections.
    // Add specific checks here if only certain transitions are allowed.

    await prisma.payslipRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        notes: notes, // Save notes only if provided
        processedById: adminAccountId, // Record which admin updated it
        processedTimestamp: new Date(),
      },
    });

    console.log(
      `[updatePayslipRequestStatusAction] Request ${requestId} status updated to ${newStatus} by admin ${adminAccountId}.`,
    );

    // Revalidate paths potentially affected (admin list, employee's history)
    revalidatePath("/admin/payslips");
    revalidatePath(`/account/${request.accountId}`);

    return {
      success: true,
      message: `Request ${newStatus.toLowerCase()} successfully.`,
    };
  } catch (error) {
    console.error(
      `[updatePayslipRequestStatusAction] Error updating request ${requestId} to ${newStatus}:`,
      error,
    );
    return {
      success: false,
      error: `Failed to update request status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export async function processAndReleasePayslipAction(
  requestId: string,
  adminAccountId: string,
): Promise<{
  success: boolean;
  message?: string;
  relatedPayslipId?: string;
  error?: string;
}> {
  try {
    return await prisma.$transaction(async (tx) => {
      const request = await tx.payslipRequest.findUnique({
        where: { id: requestId, status: PayslipRequestStatus.APPROVED },
        include: {
          account: {
            select: { id: true, name: true, dailyRate: true, role: true },
          },
          relatedPayslip: { select: { id: true } },
        },
      });

      if (!request) {
        throw new Error(
          "Approved payslip request not found or already handled.",
        );
      }
      if (request.relatedPayslipId) {
        throw new Error("This request has already been processed.");
      }

      const {
        periodStartDate, // This is a Date object (UTC timestamp) from the DB (e.g., lastPayslip.releasedDate)
        periodEndDate, // This is a Date object (UTC timestamp) from the DB (e.g., new Date() from client)
        accountId: employeeAccountId,
      } = request;
      const employeeDailyRate = request.account.dailyRate;

      // 1. Determine local timezone boundaries for the *requested period*
      // These are used for display and the general "period" of the payslip.
      const localizedPeriodStartDate = startOfDayInTimezone(
        periodStartDate,
        PHILIPPINES_TIMEZONE,
      );
      const localizedPeriodEndDate = endOfDayInTimezone(
        periodEndDate,
        PHILIPPINES_TIMEZONE,
      );

      // 1a. Find the last released payslip to determine attendance cutoff
      // Attendance should only be counted from AFTER the last payslip's period end date
      const lastReleasedPayslipForAttendance = await tx.payslip.findFirst({
        where: {
          accountId: employeeAccountId,
          status: PayslipStatus.RELEASED,
          // Only consider payslips whose period ENDED before this request's period begins
          periodEndDate: { lt: periodStartDate },
        },
        orderBy: { periodEndDate: "desc" },
        select: { periodEndDate: true, releasedDate: true },
      });

      // 1b. Determine the TRUE attendance calculation start date
      // Import timezone helper functions from timezoneHelpers.ts
      const { getUtcForPhtStartOfDay, getUtcForPhtStartOfNextDay } = await import(
        "./timezoneHelpers"
      );

      let trueAttendanceCalculationStartDateUtc: Date;
      if (
        lastReleasedPayslipForAttendance?.periodEndDate &&
        isValid(new Date(lastReleasedPayslipForAttendance.periodEndDate))
      ) {
        // Attendance starts the day AFTER the last released payslip's period end date (in PHT)
        const lastPeriodEndDate = new Date(
          lastReleasedPayslipForAttendance.periodEndDate,
        );
        trueAttendanceCalculationStartDateUtc =
          getUtcForPhtStartOfNextDay(lastPeriodEndDate);

        console.log(
          `[processAndReleasePayslipAction] Last payslip period end: ${lastPeriodEndDate.toISOString()}. Attendance calculation starts: ${trueAttendanceCalculationStartDateUtc.toISOString()}`,
        );
      } else {
        // No previous payslip, start from the request's period start date
        trueAttendanceCalculationStartDateUtc =
          getUtcForPhtStartOfDay(periodStartDate);

        console.log(
          `[processAndReleasePayslipAction] No previous payslip. Attendance calculation starts: ${trueAttendanceCalculationStartDateUtc.toISOString()}`,
        );
      }

      // Convert attendance start date to date-only format for comparison with @db.Date
      // Attendance dates are stored using getStartOfTodayTargetTimezoneUtc() logic
      const PHT_TIMEZONE_FOR_ATTENDANCE = "Asia/Manila";
      const attendanceStartFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: PHT_TIMEZONE_FOR_ATTENDANCE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      const attendanceEndFormatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: PHT_TIMEZONE_FOR_ATTENDANCE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });

      const attendanceStartPhtDateString = attendanceStartFormatter.format(
        trueAttendanceCalculationStartDateUtc,
      );
      const attendanceEndPhtDateString = attendanceEndFormatter.format(
        localizedPeriodEndDate,
      );

      const [attStartYear, attStartMonth, attStartDay] =
        attendanceStartPhtDateString.split("-").map(Number);
      const [attEndYear, attEndMonth, attEndDay] =
        attendanceEndPhtDateString.split("-").map(Number);

      const attendanceStartDateOnly = new Date(
        Date.UTC(attStartYear, attStartMonth - 1, attStartDay, 0, 0, 0, 0),
      );
      const attendanceEndDateOnly = new Date(
        Date.UTC(attEndYear, attEndMonth - 1, attEndDay, 0, 0, 0, 0),
      );

      // 2. Calculate Base Salary for the period
      // Attendance.date is @db.Date (date-only), so comparison is date-based.
      // IMPORTANT: Only count attendance from AFTER the last payslip's period end date
      const attendanceInPeriod = await tx.attendance.findMany({
        where: {
          accountId: employeeAccountId,
          isPresent: true, // Only count present days
          date: {
            // Use the TRUE calculation start date (after last payslip) up to the period end
            gte: attendanceStartDateOnly,
            lte: attendanceEndDateOnly,
          },
        },
        select: { date: true, isPresent: true },
        orderBy: { date: "asc" },
      });

      console.log(
        `[processAndReleasePayslipAction] Found ${attendanceInPeriod.length} attendance records in calculated range (excluding previous payslip periods).`,
      );

      const allDatesInRange = eachDayOfInterval({
        start: localizedPeriodStartDate, // Use localized boundaries for date-fns iteration
        end: localizedPeriodEndDate,
      });

      const attendanceMap = new Map(
        attendanceInPeriod.map((r) => [
          format(r.date, "yyyy-MM-dd"),
          r.isPresent,
        ]),
      );

      const fullAttendanceRecords = allDatesInRange.map((date) => ({
        date,
        isPresent: attendanceMap.get(format(date, "yyyy-MM-dd")) ?? false,
        hasRecord: attendanceMap.has(format(date, "yyyy-MM-dd")),
      }));

      const attendedDaysCount = fullAttendanceRecords.filter(
        (a) => a.isPresent,
      ).length;
      const baseSalaryForPeriod = employeeDailyRate * attendedDaysCount;

      // --- CRITICAL MODIFICATION: ALIGN COMMISSION CUTOFF LOGIC ---
      // This part now mirrors getPayslipBreakdownForPeriod and getEmployeeWorkHistory
      // to ensure commissions are calculated from the correct point.

      // Fetch the IMMEDIATELY PRECEDING RELEASED payslip for this employee.
      // Crucial: Only consider payslips whose period ENDED *before* this request's period begins.
      // This is vital to find the genuinely prior payout event.
      const lastReleasedPayslip = await tx.payslip.findFirst({
        where: {
          accountId: employeeAccountId,
          status: PayslipStatus.RELEASED,
          periodEndDate: { lt: periodStartDate }, // This ensures we get the payslip *before* the current request's start
        },
        orderBy: { periodEndDate: "desc" },
        select: { releasedDate: true },
      });

      let commissionCompletedAtCondition: { gt?: Date; gte?: Date };

      if (lastReleasedPayslip?.releasedDate) {
        // If a previous payslip was released, commissions should be counted *strictly after* its release date and time.
        commissionCompletedAtCondition = {
          gt: lastReleasedPayslip.releasedDate,
        };
      } else {
        // If no previous payslip released, commissions start from the request's period start date (inclusive).
        // This periodStartDate was set by requestPayslipAction (either first attendance or last_release_date).
        commissionCompletedAtCondition = { gte: periodStartDate };
      }
      // --- END CRITICAL MODIFICATION ---

      // 3. Calculate Total Commissions for the period
      const servedUnitsInPeriod = (await tx.availedServiceUnit.findMany({
        where: {
          servedById: employeeAccountId,
          status: Status.DONE,
          completedAt: {
            ...commissionCompletedAtCondition, // Use the dynamically determined GT/GTE condition
            lt: addDays(periodEndDate, 1), // Commissions up to the very end of the period's last day (request.periodEndDate)
          },
        },
        include: {
          servedBy: { select: { role: true } },
          availedService: {
            select: {
              id: true,
              quantity: true,
              price: true,
              originatingSetTitle: true,
              service: { select: { title: true } },
              transaction: {
                select: {
                  id: true,
                  grandTotal: true,
                  createdAt: true,
                  availedServices: { select: { id: true, price: true } },
                },
              },
            },
          },
        },
      })) as AvailedServiceUnitWithRelations[];

      let totalCommissionsForPeriod = 0;

      for (const unit of servedUnitsInPeriod) {
        const as = unit.availedService;
        const txn = as?.transaction;
        if (!as || !txn || !unit.servedBy) continue;

        const originalSumOfTxnAvailedServicePrices = txn.availedServices.reduce(
          (sum: number, s: { price: number | null }) => sum + (s.price ?? 0),
          0,
        );
        const totalTransactionDiscount =
          originalSumOfTxnAvailedServicePrices > 0
            ? Math.max(0, originalSumOfTxnAvailedServicePrices - txn.grandTotal)
            : 0;
        const availedServiceOriginalPrice = as.price ?? 0;
        const asDiscountContribution =
          originalSumOfTxnAvailedServicePrices > 0 &&
          availedServiceOriginalPrice > 0
            ? (availedServiceOriginalPrice /
                originalSumOfTxnAvailedServicePrices) *
              totalTransactionDiscount
            : 0;
        const availedServiceEffectivePrice = Math.max(
          0,
          availedServiceOriginalPrice - asDiscountContribution,
        );
        const effectiveUnitPriceForCommission =
          as.quantity > 0 ? availedServiceEffectivePrice / as.quantity : 0;

        let commissionRate = SALARY_COMMISSION_RATE;
        if (unit.servedBy.role.includes(Role.MASSEUSE)) {
          commissionRate = MASSEUSE_COMMISSION_RATE;
        }

        const calculatedUnitCommission = Math.max(
          0,
          Math.floor(effectiveUnitPriceForCommission * commissionRate),
        );
        totalCommissionsForPeriod += calculatedUnitCommission;
      }

      // 4. Calculate Net Pay
      const netPay = baseSalaryForPeriod + totalCommissionsForPeriod;

      // 5. Check for existing payslip with exact period dates (including time)
      // Use the exact DateTime values from the request to respect time precision
      const existingPayslip = await tx.payslip.findUnique({
        where: {
          accountId_periodStartDate_periodEndDate: {
            accountId: employeeAccountId,
            periodStartDate: periodStartDate, // Use exact DateTime from request
            periodEndDate: periodEndDate, // Use exact DateTime from request
          },
        },
      });

      if (existingPayslip) {
        throw new Error(
          `A payslip for this exact period (${format(periodStartDate, "yyyy-MM-dd HH:mm:ss")} to ${format(periodEndDate, "yyyy-MM-dd HH:mm:ss")}) already exists for this employee.`,
        );
      }

      // 6. Create the Payslip record with exact period dates (including time)
      // Store the exact DateTime values from the request to respect time precision
      const newPayslip = await tx.payslip.create({
        data: {
          accountId: employeeAccountId,
          // Store exact DateTime values from the request (including time)
          // This allows multiple payslips for the same date if they have different times
          periodStartDate: periodStartDate, // Exact DateTime from request
          periodEndDate: periodEndDate, // Exact DateTime from request
          baseSalary: baseSalaryForPeriod,
          totalCommissions: totalCommissionsForPeriod,
          netPay,
          status: PayslipStatus.RELEASED,
          releasedDate: new Date(), // Actual UTC timestamp of release
        },
      });

      // 7. Update the Payslip Request status and link it
      await tx.payslipRequest.update({
        where: { id: requestId },
        data: {
          status: PayslipRequestStatus.PROCESSED,
          processedById: adminAccountId,
          processedTimestamp: new Date(),
          relatedPayslipId: newPayslip.id,
        },
      });

      // 8. Decrement Account's Running Salary
      await tx.account.update({
        where: { id: employeeAccountId },
        data: {
          salary: {
            decrement: netPay,
          },
        },
      });

      console.log(
        `[Payslip] Released ₱${netPay} for ${request.account.name}. Account salary decremented.`,
      );

      revalidatePath("/admin/payslips");
      revalidatePath(`/account/${employeeAccountId}`);

      return {
        success: true,
        message: `Payslip released successfully (₱${netPay.toLocaleString()}).`,
        relatedPayslipId: newPayslip.id,
      };
    });
  } catch (error: any) {
    console.error("Error in processAndReleasePayslipAction:", error);
    return {
      success: false,
      error: "Failed to process payslip due to an internal error.",
    };
  }
}

export async function getPayslipBreakdownForPeriod(requestId: string): Promise<{
  success: boolean;
  data?: {
    request: PayslipRequest & { account: { name: string; dailyRate: number } };
    attendanceRecords: Array<{
      date: Date;
      isPresent: boolean;
      hasRecord: boolean;
    }>;
    baseSalaryForPeriod: number;
    commissionDetails: Array<{
      // Stricter type for commissionDetails
      availedServiceId: string;
      title: string;
      servedUnitCount: number;
      totalCommissionForThisASItem: number;
      transactionId: string; // Added for consistency with getEmployeeWorkHistory
      transactionCreatedAt: Date; // Added for consistency with getEmployeeWorkHistory
    }>;
    totalCommissionsForPeriod: number;
    netPay: number;
  };
  error?: string;
}> {
  try {
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      include: {
        account: {
          select: { id: true, name: true, dailyRate: true, role: true },
        },
      },
    });

    if (!request) {
      throw new Error("Payslip request not found.");
    }

    const { accountId, account, periodStartDate, periodEndDate } = request;

    // --- Find the last released payslip to determine calculation cutoffs ---
    const lastReleasedPayslip = await prisma.payslip.findFirst({
      where: {
        accountId,
        status: "RELEASED",
      },
      orderBy: { releasedDate: "desc" },
      select: {
        periodEndDate: true, // @db.Date (UTC 00:00Z)
        releasedDate: true, // @db.DateTime (UTC timestamp)
      },
    });

    // Determine the TRUE start dates/times for fetching data based on last payslip
    let trueAttendanceCalculationStartDateUtc: Date;
    let commissionCalculationStartTimeUtc: Date;

    if (
      lastReleasedPayslip?.releasedDate &&
      isValid(new Date(lastReleasedPayslip.releasedDate)) &&
      lastReleasedPayslip?.periodEndDate &&
      isValid(new Date(lastReleasedPayslip.periodEndDate))
    ) {
      const lastPeriodEndDate = new Date(lastReleasedPayslip.periodEndDate); // @db.Date -> UTC 00:00Z
      const lastReleaseTimestamp = new Date(lastReleasedPayslip.releasedDate); // @db.DateTime -> UTC timestamp

      // Import timezone helper functions from timezoneHelpers.ts
      // Attendance starts the day AFTER the last released period end date *in PHT*
      const { getUtcForPhtStartOfNextDay } = await import("./timezoneHelpers");

      trueAttendanceCalculationStartDateUtc =
        getUtcForPhtStartOfNextDay(lastPeriodEndDate);

      // Commission period starts *exactly* at the moment the last payslip was released (UTC timestamp)
      commissionCalculationStartTimeUtc = lastReleaseTimestamp;

      console.log(
        `[getPayslipBreakdownForPeriod] Last released payslip period end: ${lastPeriodEndDate.toISOString()}. Attendance calculation starts: ${trueAttendanceCalculationStartDateUtc.toISOString()} (UTC for PHT next day).`,
      );
      console.log(
        `[getPayslipBreakdownForPeriod] Last released payslip timestamp: ${lastReleaseTimestamp.toISOString()}. Commission calculation starts: ${commissionCalculationStartTimeUtc.toISOString()} (exact UTC).`,
      );
    } else {
      // If no released payslip, calculation starts from the start of the nominal request period day in PHT
      const { getUtcForPhtStartOfDay } = await import("./timezoneHelpers");
      trueAttendanceCalculationStartDateUtc =
        getUtcForPhtStartOfDay(periodStartDate);
      // If no released timestamp, start commissions from epoch timestamp
      commissionCalculationStartTimeUtc = new Date(0); // Epoch start (UTC)

      console.log(
        `[getPayslipBreakdownForPeriod] No prior release. Attendance calculation starts: ${trueAttendanceCalculationStartDateUtc.toISOString()} (UTC for PHT start of request day).`,
      );
      console.log(
        `[getPayslipBreakdownForPeriod] No prior released timestamp. Commission calculation starts from epoch: ${commissionCalculationStartTimeUtc.toISOString()}.`,
      );
    }

    // Determine the upper boundary for calculation
    // periodEndDate is a DateTime (request timestamp), we need to get the end of that day in PHT
    const { getUtcForPhtStartOfDay, getUtcForPhtStartOfNextDay } = await import(
      "./timezoneHelpers"
    );

    // Convert periodEndDate (DateTime) to the end of that day in PHT (exclusive boundary)
    // First get the start of the day containing periodEndDate in PHT, then add one day
    const periodEndDateInPht = getUtcForPhtStartOfDay(periodEndDate);
    const calculationPeriodEndExclusive =
      getUtcForPhtStartOfNextDay(periodEndDateInPht);

    console.log(
      `[getPayslipBreakdownForPeriod] Period end DateTime: ${periodEndDate.toISOString()}`,
    );
    console.log(
      `[getPayslipBreakdownForPeriod] Period end date in PHT: ${periodEndDateInPht.toISOString()}`,
    );
    console.log(
      `[getPayslipBreakdownForPeriod] Calculation period end (exclusive UTC boundary): ${calculationPeriodEndExclusive.toISOString()}`,
    );

    // --- Base Salary Calculation ---
    // Calculate attendance based on the TRUE calculation start date up to the exclusive end boundary
    // Attendance records use @db.Date which are UTC 00:00Z Date objects
    // IMPORTANT: We need to normalize the boundaries to UTC 00:00:00.000Z (date-only)
    // because attendance.date is @db.Date, stored as UTC midnight

    // Convert PHT boundaries to UTC date-only for comparison with @db.Date fields
    // IMPORTANT: Attendance dates are stored using getStartOfTodayTargetTimezoneUtc() logic
    // which converts a PHT date to UTC by extracting year/month/day in PHT and creating UTC date
    // We need to do the same conversion here to match the stored format

    // The attendance.date field stores dates as UTC 00:00:00.000Z for the PHT day
    // For example: Nov 21, 2025 in PHT is stored as 2025-11-21T00:00:00.000Z (not 2025-11-20T16:00:00.000Z)
    // This is because getStartOfTodayTargetTimezoneUtc() extracts the PHT date parts and creates a UTC date

    // So we need to extract the PHT date components from our boundaries and create UTC dates
    // This matches exactly how attendance dates are stored in the database
    const PHT_TIMEZONE_FOR_ATTENDANCE = "Asia/Manila";
    const phtStartFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PHT_TIMEZONE_FOR_ATTENDANCE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const phtEndFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: PHT_TIMEZONE_FOR_ATTENDANCE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const startPhtDateString = phtStartFormatter.format(
      trueAttendanceCalculationStartDateUtc,
    );
    const endPhtDateString = phtEndFormatter.format(
      calculationPeriodEndExclusive,
    );

    const [startYear, startMonth, startDay] = startPhtDateString
      .split("-")
      .map(Number);
    const [endYear, endMonth, endDay] = endPhtDateString.split("-").map(Number);

    // Create UTC dates using the PHT date components (same as getStartOfTodayTargetTimezoneUtc)
    // This ensures we're comparing dates in the same format as they're stored
    const attendanceStartDateOnly = new Date(
      Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0),
    );
    const attendanceEndDateOnly = new Date(
      Date.UTC(endYear, endMonth - 1, endDay, 0, 0, 0, 0),
    );

    console.log(`[getPayslipBreakdownForPeriod] Attendance query parameters:`);
    console.log(
      `  - PHT Start boundary: ${trueAttendanceCalculationStartDateUtc.toISOString()}`,
    );
    console.log(
      `  - PHT End boundary (exclusive): ${calculationPeriodEndExclusive.toISOString()}`,
    );
    console.log(
      `  - UTC Date-only start: ${attendanceStartDateOnly.toISOString()}`,
    );
    console.log(
      `  - UTC Date-only end (exclusive): ${attendanceEndDateOnly.toISOString()}`,
    );

    const relevantAttendanceRecords = await prisma.attendance.findMany({
      where: {
        accountId,
        isPresent: true,
        date: {
          // @db.Date are UTC 00:00Z Date objects - compare as date-only
          gte: attendanceStartDateOnly, // Use normalized date-only start boundary
          lt: attendanceEndDateOnly, // Use normalized date-only end boundary (exclusive)
        },
      },
      select: { date: true, isPresent: true },
      orderBy: { date: "asc" },
    });

    console.log(
      `[getPayslipBreakdownForPeriod] Found ${relevantAttendanceRecords.length} attendance records in calculated range`,
    );
    if (relevantAttendanceRecords.length > 0) {
      console.log(
        `[getPayslipBreakdownForPeriod] Attendance dates found:`,
        relevantAttendanceRecords
          .map((r) => r.date.toISOString().split("T")[0])
          .join(", "),
      );
    } else {
      console.warn(
        `[getPayslipBreakdownForPeriod] No attendance records found! This might indicate a timezone or date comparison issue.`,
      );
      // Debug: Let's also check what attendance records exist for this account
      const allAttendanceForAccount = await prisma.attendance.findMany({
        where: { accountId },
        select: { date: true, isPresent: true },
        orderBy: { date: "desc" },
        take: 10,
      });
      console.log(
        `[getPayslipBreakdownForPeriod] Recent attendance records for account (last 10):`,
        allAttendanceForAccount.map((r) => ({
          date: r.date.toISOString().split("T")[0],
          isPresent: r.isPresent,
        })),
      );
    }

    // Generate all dates in the requested period for display
    // Convert DateTime period dates to date-only for display
    // IMPORTANT: We need to use the same logic as getStartOfTodayTargetTimezoneUtc
    // to ensure dates match what's stored in the database
    const periodStartDateOnly = getUtcForPhtStartOfDay(periodStartDate);
    const periodEndDateOnly = getUtcForPhtStartOfDay(periodEndDate);

    console.log(`[getPayslipBreakdownForPeriod] Display period dates:`);
    console.log(
      `  - Period start (PHT day start): ${periodStartDateOnly.toISOString()}`,
    );
    console.log(
      `  - Period end (PHT day start): ${periodEndDateOnly.toISOString()}`,
    );

    const allDatesInRange = eachDayOfInterval({
      start: periodStartDateOnly,
      end: periodEndDateOnly,
    });

    console.log(
      `[getPayslipBreakdownForPeriod] Generated ${allDatesInRange.length} dates for display`,
    );

    // Create a map of actual attendance records
    // Use UTC date string for consistent comparison (attendance.date is UTC 00:00:00.000Z)
    const attendanceMap = new Map(
      relevantAttendanceRecords.map((r) => {
        // r.date is already a UTC 00:00:00.000Z Date object from @db.Date
        const dateKey = r.date.toISOString().split("T")[0]; // "YYYY-MM-DD" format
        return [dateKey, r.isPresent];
      }),
    );

    console.log(
      `[getPayslipBreakdownForPeriod] Attendance map keys:`,
      Array.from(attendanceMap.keys()).join(", "),
    );

    // Create full attendance records for display (all dates in period)
    // Convert each date in the range to UTC date string for comparison
    // IMPORTANT: eachDayOfInterval returns dates, but we need to match them with attendance records
    // which are stored as UTC 00:00:00.000Z. We need to convert the display dates to the same format.
    const fullAttendanceRecords = allDatesInRange.map((date) => {
      // date from eachDayOfInterval is a Date object
      // We need to convert it to UTC date string to match attendance records
      // The attendance records are stored using getStartOfTodayTargetTimezoneUtc() which returns UTC dates
      // So we need to get the UTC date string from the display date

      // Convert the date to UTC date string (YYYY-MM-DD)
      // Since date might have time components, we normalize it to UTC midnight first
      const dateAsUtc = new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
      const dateKey = dateAsUtc.toISOString().split("T")[0]; // "YYYY-MM-DD" format

      const isPresent = attendanceMap.get(dateKey) ?? false;
      const hasRecord = attendanceMap.has(dateKey);

      // Return the original date for display, but use UTC date string for matching
      return {
        date,
        isPresent,
        hasRecord,
      };
    });

    console.log(
      `[getPayslipBreakdownForPeriod] Generated ${fullAttendanceRecords.length} display records`,
    );
    console.log(
      `[getPayslipBreakdownForPeriod] Present days in display:`,
      fullAttendanceRecords.filter((r) => r.isPresent).length,
    );

    // Count only present days within the calculated range (not the full period display)
    const attendedDaysCount = relevantAttendanceRecords.length;
    const baseSalaryForPeriod = account.dailyRate * attendedDaysCount;

    // --- Commission Calculation ---
    // Commissions should start *strictly after* the last payslip release timestamp
    let commissionFilterCondition: { gt?: Date; gte?: Date };

    if (lastReleasedPayslip?.releasedDate) {
      commissionFilterCondition = { gt: commissionCalculationStartTimeUtc };
    } else {
      commissionFilterCondition = { gte: commissionCalculationStartTimeUtc };
    }

    // LOGGING FOR DEBUGGING (Optional)
    // console.log(`[getPayslipBreakdownForPeriod] Request ID: ${requestId}`);
    // console.log(`  Payslip Period: ${format(periodStartDate, 'yyyy-MM-dd')} to ${format(periodEndDate, 'yyyy-MM-dd')}`);
    // if (lastReleasedPayslip) {
    //   console.log(`  Last Released Payslip Released Date: ${formatInTimeZone(lastReleasedPayslip.releasedDate!, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`);
    // } else {
    //   console.log("  No previous released payslip found.");
    // }
    // if (commissionFilterCondition.gt) {
    //     console.log(`  Commission Cutoff Start (gt): ${formatInTimeZone(commissionFilterCondition.gt, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`);
    // } else if (commissionFilterCondition.gte) {
    //     console.log(`  Commission Cutoff Start (gte): ${formatInTimeZone(commissionFilterCondition.gte, PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`);
    // }
    // console.log(`  Commission Cutoff End (lt): ${formatInTimeZone(addDays(periodEndDate, 1), PHILIPPINES_TIMEZONE, "yyyy-MM-dd HH:mm:ssXXX")}`);

    // Step 3: Fetch served units based on the determined commission cutoff and the request's end date.
    // Use servedAt instead of completedAt for consistency with approvePayslipRequest
    const servedUnitsInPeriod = (await prisma.availedServiceUnit.findMany({
      where: {
        servedById: accountId,
        status: Status.DONE,
        servedAt: {
          ...commissionFilterCondition, // Apply the dynamically determined start condition (gt or gte)
          lt: calculationPeriodEndExclusive, // Strictly BEFORE the exclusive UTC end boundary
          not: null, // servedAt must be set
        },
        availedService: {
          commissionValue: { gt: 0 }, // Only include units that potentially earn commission
          transaction: {
            status: { not: Status.CANCELLED }, // Filter out units from cancelled transactions
          },
        },
      },
      include: {
        servedBy: { select: { role: true } },
        availedService: {
          select: {
            id: true,
            quantity: true,
            price: true,
            originatingSetTitle: true,
            service: { select: { title: true } },
            transaction: {
              select: {
                id: true,
                grandTotal: true,
                createdAt: true,
                availedServices: { select: { id: true, price: true } },
              },
            },
          },
        },
      },
      orderBy: { servedAt: "asc" },
    })) as AvailedServiceUnitWithRelations[];

    let totalCommissionsForPeriod = 0;
    const commissionEntriesMap = new Map<
      string,
      {
        availedServiceId: string;
        title: string;
        servedUnitCount: number;
        totalCommissionForThisASItem: number;
        transactionId: string; // Include transactionId for consistency
        transactionCreatedAt: Date; // Include transactionCreatedAt for consistency
      }
    >();

    for (const unit of servedUnitsInPeriod) {
      const as = unit.availedService;
      const txn = as?.transaction;
      if (!as || !txn || !unit.servedBy) continue;

      // Commission calculation logic (remains correct)
      const originalSumOfTxnAvailedServicePrices = txn.availedServices.reduce(
        (sum, s) => sum + (s.price ?? 0),
        0,
      );
      const totalTransactionDiscount =
        originalSumOfTxnAvailedServicePrices > 0
          ? Math.max(0, originalSumOfTxnAvailedServicePrices - txn.grandTotal)
          : 0;
      const availedServiceOriginalPrice = as.price ?? 0;
      const asDiscountContribution =
        originalSumOfTxnAvailedServicePrices > 0 &&
        availedServiceOriginalPrice > 0
          ? (availedServiceOriginalPrice /
              originalSumOfTxnAvailedServicePrices) *
            totalTransactionDiscount
          : 0;
      const availedServiceEffectivePrice = Math.max(
        0,
        availedServiceOriginalPrice - asDiscountContribution,
      );
      const effectiveUnitPriceForCommission =
        as.quantity > 0 ? availedServiceEffectivePrice / as.quantity : 0;

      let commissionRate = SALARY_COMMISSION_RATE;
      if (unit.servedBy.role.includes(Role.MASSEUSE)) {
        commissionRate = MASSEUSE_COMMISSION_RATE;
      }

      const calculatedUnitCommission = Math.max(
        0,
        Math.floor(effectiveUnitPriceForCommission * commissionRate),
      );
      totalCommissionsForPeriod += calculatedUnitCommission;

      if (!commissionEntriesMap.has(as.id)) {
        commissionEntriesMap.set(as.id, {
          availedServiceId: as.id,
          transactionId: txn.id, // Included
          transactionCreatedAt: txn.createdAt, // Included
          title:
            as.originatingSetTitle || as.service?.title || "Unknown Service",
          servedUnitCount: 0,
          totalCommissionForThisASItem: 0,
        });
      }
      const entry = commissionEntriesMap.get(as.id)!;
      entry.servedUnitCount++;
      entry.totalCommissionForThisASItem += calculatedUnitCommission;
    }

    const commissionDetails = Array.from(commissionEntriesMap.values());
    const netPay = baseSalaryForPeriod + totalCommissionsForPeriod;

    return {
      success: true,
      data: {
        request,
        attendanceRecords: fullAttendanceRecords,
        baseSalaryForPeriod,
        commissionDetails,
        totalCommissionsForPeriod,
        netPay,
      },
    };
  } catch (error: any) {
    console.error("[getPayslipBreakdownForPeriod] Error:", error);
    return { success: false, error: error.message };
  }
}

export async function getEmployeesForPayslipManagement() {
  try {
    const employees = await prisma.account.findMany({
      where: {
        // Fetch roles that are typically on payroll. Adjust as needed.
        role: {
          hasSome: [Role.WORKER, Role.MASSEUSE],
        },
      },
      select: {
        id: true,
        name: true,
        canRequestPayslip: true, // Select the permission flag
      },
      orderBy: {
        name: "asc",
      },
    });
    return { success: true, data: employees };
  } catch (error) {
    console.error("[getEmployeesForPayslipManagement] Error:", error);
    return { success: false, error: "Failed to load employees." };
  }
}

// Action to update a single employee's permission
export async function updateEmployeePayslipPermissionAction(
  accountId: string,
  canRequest: boolean,
) {
  try {
    // Optional: Add a check here to ensure the caller is an admin/owner

    await prisma.account.update({
      where: { id: accountId },
      data: {
        canRequestPayslip: canRequest,
      },
    });

    console.log(
      `[PayslipPermission] Updated ${accountId} canRequestPayslip to ${canRequest}.`,
    );

    // Revalidate paths to update the UI instantly for both admin and employee
    revalidatePath("/admin/payslips"); // Assuming this is the admin page route
    revalidatePath(`/account/${accountId}`); // Revalidates the employee's history page

    return { success: true };
  } catch (error) {
    console.error("[updateEmployeePayslipPermissionAction] Error:", error);
    return { success: false, error: "Failed to update permission." };
  }
}
