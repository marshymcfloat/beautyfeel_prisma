/**
 * Attendance validation schemas and utilities
 */

import { z } from "zod";

/**
 * Schema for validating attendance action input
 */
export const attendanceActionSchema = z.object({
  accountId: z.string().min(1, "Account ID is required"),
  isPresent: z.boolean(),
  notes: z.string().nullable().optional(),
  checkerId: z.string().min(1, "Checker ID is required"),
});

export type AttendanceActionInput = z.infer<typeof attendanceActionSchema>;

/**
 * Validate attendance action data
 */
export function validateAttendanceAction(
  data: unknown,
): { success: true; data: AttendanceActionInput } | { success: false; errors: Record<string, string[]> } {
  const result = attendanceActionSchema.safeParse(data);

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

