"use server";

/**
 * SERVER ACTIONS FOR PAYSLIP VALIDATION
 * 
 * These actions can be called from client components to validate payslip amounts
 * and catch discrepancies between request and release phases.
 */

import {
  validatePayslipAmounts,
  validateAllReleasedPayslips,
  type PayslipValidationResult,
} from "./payslipValidationHelpers";

/**
 * Validate a specific payslip request's amounts
 * Server action that can be called from client
 */
export async function validatePayslipAction(
  requestId: string,
): Promise<{
  success: boolean;
  data?: PayslipValidationResult;
  error?: string;
}> {
  try {
    const result = await validatePayslipAmounts(requestId);
    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    console.error("[validatePayslipAction] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to validate payslip",
    };
  }
}

/**
 * Validate all released payslips
 * Server action that can be called from client (admin only)
 */
export async function validateAllPayslipsAction(
  limit: number = 100,
): Promise<{
  success: boolean;
  data?: PayslipValidationResult[];
  error?: string;
}> {
  try {
    const results = await validateAllReleasedPayslips(limit);
    return {
      success: true,
      data: results,
    };
  } catch (error: any) {
    console.error("[validateAllPayslipsAction] Error:", error);
    return {
      success: false,
      error: error.message || "Failed to validate payslips",
    };
  }
}


