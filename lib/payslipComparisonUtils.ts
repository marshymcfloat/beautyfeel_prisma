/**
 * PAYSLIP COMPARISON UTILITIES
 *
 * Pure utility functions for comparing payslip breakdowns.
 * These are NOT server actions - they're synchronous helper functions.
 */

/**
 * Compare two payslip breakdowns and identify differences
 *
 * @param requestBreakdown - Breakdown from request phase
 * @param releaseBreakdown - Breakdown from release phase
 * @returns Detailed comparison object
 */
export function comparePayslipBreakdowns(
  requestBreakdown: {
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;
    commissionUnitCount: number;
  },
  releaseBreakdown: {
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;
    commissionUnitCount: number;
  },
): {
  matches: boolean;
  differences: Array<{
    field: string;
    request: number;
    release: number;
    diff: number;
    percentageDiff?: number;
  }>;
} {
  const differences: Array<{
    field: string;
    request: number;
    release: number;
    diff: number;
    percentageDiff?: number;
  }> = [];

  const tolerance = 1; // Allow 1 unit difference for rounding

  // Compare each field
  const fields: Array<keyof typeof requestBreakdown> = [
    "baseSalary",
    "totalCommissions",
    "netPay",
    "attendanceCount",
    "commissionUnitCount",
  ];

  fields.forEach((field) => {
    const requestValue = requestBreakdown[field];
    const releaseValue = releaseBreakdown[field];
    const diff = Math.abs(requestValue - releaseValue);

    if (diff > tolerance) {
      differences.push({
        field,
        request: requestValue,
        release: releaseValue,
        diff,
        percentageDiff:
          requestValue > 0 ? (diff / requestValue) * 100 : undefined,
      });
    }
  });

  return {
    matches: differences.length === 0,
    differences,
  };
}

