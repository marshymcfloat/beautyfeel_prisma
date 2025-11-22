/**
 * Payslip request validation schemas and utilities
 */

import { z } from "zod";
import { isValid } from "date-fns";

/**
 * Schema for validating payslip request input
 */
export const payslipRequestSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  notes: z.string().nullable().optional(),
});

export type PayslipRequestInput = z.infer<typeof payslipRequestSchema>;

/**
 * Validate payslip request data
 */
export function validatePayslipRequest(
  data: unknown,
): { success: true; data: PayslipRequestInput } | { success: false; errors: Record<string, string[]> } {
  const result = payslipRequestSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors: Record<string, string[]> = {};
  result.error.errors.forEach((error) => {
    const path = error.path.join(".");
    if (!errors[path]) {
      errors[path] = [];
    }
    errors[path].push(error.message);
  });

  return {
    success: false,
    errors,
  };
}

/**
 * Validate date range for payslip period
 */
export function validatePayslipPeriod(
  startDate: Date,
  endDate: Date,
): { valid: true } | { valid: false; error: string } {
  if (!isValid(startDate)) {
    return { valid: false, error: "Invalid start date provided." };
  }

  if (!isValid(endDate)) {
    return { valid: false, error: "Invalid end date provided." };
  }

  if (startDate >= endDate) {
    return {
      valid: false,
      error: "Start date must be before end date.",
    };
  }

  // Check if dates are too far in the future (e.g., more than 1 year)
  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  if (endDate > oneYearFromNow) {
    return {
      valid: false,
      error: "End date cannot be more than 1 year in the future.",
    };
  }

  // Check if dates are too far in the past (e.g., more than 10 years)
  const tenYearsAgo = new Date();
  tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
  if (startDate < tenYearsAgo) {
    return {
      valid: false,
      error: "Start date cannot be more than 10 years in the past.",
    };
  }

  return { valid: true };
}

