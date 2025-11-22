/**
 * Payslip approval and release validation schemas and utilities
 */

import { z } from "zod";
import { PayslipRequestStatus } from "@prisma/client";

/**
 * Schema for validating payslip request status update (approve/reject)
 */
export const updatePayslipRequestStatusSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  newStatus: z.enum(["APPROVED", "REJECTED"], {
    errorMap: () => ({ message: "Status must be APPROVED or REJECTED" }),
  }),
  adminAccountId: z.string().min(1, "Admin account ID is required").optional(),
  notes: z.string().nullable().optional(),
});

export type UpdatePayslipRequestStatusInput = z.infer<
  typeof updatePayslipRequestStatusSchema
>;

/**
 * Schema for validating payslip release action
 */
export const processAndReleasePayslipSchema = z.object({
  requestId: z.string().min(1, "Request ID is required"),
  adminAccountId: z.string().min(1, "Admin account ID is required"),
});

export type ProcessAndReleasePayslipInput = z.infer<
  typeof processAndReleasePayslipSchema
>;

/**
 * Validate payslip request status update
 */
export function validateUpdatePayslipRequestStatus(
  data: unknown,
): { success: true; data: UpdatePayslipRequestStatusInput } | { success: false; errors: Record<string, string[]> } {
  const result = updatePayslipRequestStatusSchema.safeParse(data);

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
 * Validate payslip release action
 */
export function validateProcessAndReleasePayslip(
  data: unknown,
): { success: true; data: ProcessAndReleasePayslipInput } | { success: false; errors: Record<string, string[]> } {
  const result = processAndReleasePayslipSchema.safeParse(data);

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
 * Validate payslip request status transitions
 */
export function validateStatusTransition(
  currentStatus: PayslipRequestStatus,
  newStatus: "APPROVED" | "REJECTED",
): { valid: true } | { valid: false; error: string } {
  // Prevent updating requests that are already processed or failed
  if (
    currentStatus === PayslipRequestStatus.PROCESSED ||
    currentStatus === PayslipRequestStatus.FAILED
  ) {
    return {
      valid: false,
      error: `Cannot change status of a request that is already ${currentStatus.toLowerCase()}.`,
    };
  }

  // Allow transitions from PENDING or REJECTED to APPROVED or REJECTED
  // (flexible workflow allows corrections)
  if (
    currentStatus === PayslipRequestStatus.APPROVED &&
    newStatus === PayslipRequestStatus.APPROVED
  ) {
    return {
      valid: false,
      error: "Request is already approved.",
    };
  }

  return { valid: true };
}

