"use server";

/**
 * PAYSLIP VALIDATION HELPER
 *
 * This module provides functions to validate that payslip calculations
 * are consistent between the request phase (getPayslipBreakdownForPeriod)
 * and the release phase (processAndReleasePayslipAction).
 *
 * This helps catch discrepancies early and ensures accuracy.
 */

import prisma from "./prisma";
import { PayslipRequestStatus } from "@prisma/client";
import { getPayslipBreakdownForPeriod } from "./SalaryActions";

export type PayslipValidationResult = {
  isValid: boolean;
  requestId: string;
  discrepancies: Array<{
    field: string;
    requestValue: number;
    releaseValue: number;
    difference: number;
    percentageDiff?: number;
  }>;
  requestBreakdown: {
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;
    commissionUnitCount: number;
  } | null;
  releaseBreakdown: {
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;
    commissionUnitCount: number;
  } | null;
  errors: string[];
  warnings: string[];
};

/**
 * Validate that a payslip request's breakdown matches the actual released payslip
 *
 * @param requestId - The ID of the payslip request to validate
 * @returns Validation result with detailed comparison
 */
export async function validatePayslipAmounts(
  requestId: string,
): Promise<PayslipValidationResult> {
  const result: PayslipValidationResult = {
    isValid: true,
    requestId,
    discrepancies: [],
    requestBreakdown: null,
    releaseBreakdown: null,
    errors: [],
    warnings: [],
  };

  try {
    // 1. Fetch the payslip request
    const request = await prisma.payslipRequest.findUnique({
      where: { id: requestId },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            dailyRate: true,
          },
        },
        relatedPayslip: {
          select: {
            id: true,
            baseSalary: true,
            totalCommissions: true,
            netPay: true,
            periodStartDate: true,
            periodEndDate: true,
          },
        },
      },
    });

    if (!request) {
      result.errors.push(`Payslip request ${requestId} not found.`);
      result.isValid = false;
      return result;
    }

    // 2. Get the breakdown from request phase (what was shown during review)
    const breakdownResult = await getPayslipBreakdownForPeriod(requestId);

    if (!breakdownResult.success || !breakdownResult.data) {
      result.errors.push(
        `Failed to get breakdown for request: ${breakdownResult.error || "Unknown error"}`,
      );
      result.isValid = false;
      return result;
    }

    const requestData = breakdownResult.data;
    result.requestBreakdown = {
      baseSalary: requestData.baseSalaryForPeriod,
      totalCommissions: requestData.totalCommissionsForPeriod,
      netPay: requestData.netPay,
      attendanceCount: requestData.attendanceRecords.filter((r) => r.isPresent)
        .length,
      commissionUnitCount: requestData.commissionDetails.reduce(
        (sum, item) => sum + item.servedUnitCount,
        0,
      ),
    };

    // 3. Check if payslip has been released
    if (!request.relatedPayslip) {
      result.warnings.push(
        "Payslip has not been released yet. Cannot compare with release phase.",
      );
      return result;
    }

    const payslip = request.relatedPayslip;

    // 4. Calculate what the release phase would calculate
    // Note: This is a simplified calculation for validation
    // The actual release calculation happens in processAndReleasePayslipAction
    // We'll compare the stored values in the Payslip record
    result.releaseBreakdown = {
      baseSalary: payslip.baseSalary,
      totalCommissions: payslip.totalCommissions,
      netPay: payslip.netPay,
      attendanceCount: 0, // Would need separate query to count
      commissionUnitCount: 0, // Would need separate query to count
    };

    // 5. Compare values
    const tolerance = 1; // Allow 1 unit difference for rounding

    // Compare base salary
    const baseSalaryDiff = Math.abs(
      result.requestBreakdown.baseSalary - result.releaseBreakdown.baseSalary,
    );
    if (baseSalaryDiff > tolerance) {
      result.discrepancies.push({
        field: "baseSalary",
        requestValue: result.requestBreakdown.baseSalary,
        releaseValue: result.releaseBreakdown.baseSalary,
        difference: baseSalaryDiff,
        percentageDiff:
          result.requestBreakdown.baseSalary > 0
            ? (baseSalaryDiff / result.requestBreakdown.baseSalary) * 100
            : undefined,
      });
      result.isValid = false;
    }

    // Compare total commissions
    const commissionDiff = Math.abs(
      result.requestBreakdown.totalCommissions -
        result.releaseBreakdown.totalCommissions,
    );
    if (commissionDiff > tolerance) {
      result.discrepancies.push({
        field: "totalCommissions",
        requestValue: result.requestBreakdown.totalCommissions,
        releaseValue: result.releaseBreakdown.totalCommissions,
        difference: commissionDiff,
        percentageDiff:
          result.requestBreakdown.totalCommissions > 0
            ? (commissionDiff / result.requestBreakdown.totalCommissions) * 100
            : undefined,
      });
      result.isValid = false;
    }

    // Compare net pay
    const netPayDiff = Math.abs(
      result.requestBreakdown.netPay - result.releaseBreakdown.netPay,
    );
    if (netPayDiff > tolerance) {
      result.discrepancies.push({
        field: "netPay",
        requestValue: result.requestBreakdown.netPay,
        releaseValue: result.releaseBreakdown.netPay,
        difference: netPayDiff,
        percentageDiff:
          result.requestBreakdown.netPay > 0
            ? (netPayDiff / result.requestBreakdown.netPay) * 100
            : undefined,
      });
      result.isValid = false;
    }

    // 6. Additional validation checks
    if (result.isValid) {
      console.log(
        `[validatePayslipAmounts] ✅ Validation passed for request ${requestId}`,
      );
      console.log(
        `  Base Salary: ${result.requestBreakdown.baseSalary} = ${result.releaseBreakdown.baseSalary}`,
      );
      console.log(
        `  Commissions: ${result.requestBreakdown.totalCommissions} = ${result.releaseBreakdown.totalCommissions}`,
      );
      console.log(
        `  Net Pay: ${result.requestBreakdown.netPay} = ${result.releaseBreakdown.netPay}`,
      );
    } else {
      console.error(
        `[validatePayslipAmounts] ❌ Validation failed for request ${requestId}`,
      );
      result.discrepancies.forEach((d) => {
        console.error(
          `  ${d.field}: Request=${d.requestValue}, Release=${d.releaseValue}, Diff=${d.difference}`,
        );
      });
    }

    return result;
  } catch (error: any) {
    result.errors.push(`Validation error: ${error.message || "Unknown error"}`);
    result.isValid = false;
    console.error("[validatePayslipAmounts] Error:", error);
    return result;
  }
}

/**
 * Validate all released payslips in the system
 * Useful for batch validation after fixes
 *
 * @param limit - Maximum number of payslips to validate (default: 100)
 * @returns Array of validation results
 */
export async function validateAllReleasedPayslips(
  limit: number = 100,
): Promise<PayslipValidationResult[]> {
  try {
    // Fetch all processed payslip requests with related payslips
    const requests = await prisma.payslipRequest.findMany({
      where: {
        status: PayslipRequestStatus.PROCESSED,
        relatedPayslipId: { not: null },
      },
      select: {
        id: true,
      },
      take: limit,
      orderBy: {
        processedTimestamp: "desc",
      },
    });

    console.log(
      `[validateAllReleasedPayslips] Validating ${requests.length} payslip requests...`,
    );

    const results = await Promise.all(
      requests.map((req) => validatePayslipAmounts(req.id)),
    );

    const validCount = results.filter((r) => r.isValid).length;
    const invalidCount = results.filter((r) => !r.isValid).length;

    console.log(
      `[validateAllReleasedPayslips] Validation complete: ${validCount} valid, ${invalidCount} invalid`,
    );

    if (invalidCount > 0) {
      console.error(
        `[validateAllReleasedPayslips] ⚠️ Found ${invalidCount} payslips with discrepancies:`,
      );
      results
        .filter((r) => !r.isValid)
        .forEach((r) => {
          console.error(`  Request ${r.requestId}:`);
          r.discrepancies.forEach((d) => {
            console.error(
              `    ${d.field}: ${d.requestValue} vs ${d.releaseValue} (diff: ${d.difference})`,
            );
          });
        });
    }

    return results;
  } catch (error: any) {
    console.error("[validateAllReleasedPayslips] Error:", error);
    throw error;
  }
}
