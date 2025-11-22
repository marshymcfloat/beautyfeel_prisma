/**
 * Transaction validation schemas and utilities
 */

import { z } from "zod";
import { PaymentMethod } from "@prisma/client";

/**
 * Schema for validating transaction form input
 */
export const transactionFormSchema = z
  .object({
    name: z.string().min(1, "Customer name is required").max(100, "Name is too long"),
    email: z
      .union([z.string().email("Invalid email format").max(255, "Email is too long"), z.null(), z.literal("")])
      .transform((val) => (val === "" ? null : val))
      .optional(),
    customerId: z.string().nullable().optional(),
    servicesAvailed: z
      .array(
        z.object({
          id: z.string().min(1, "Service ID is required"),
          type: z.enum(["service", "set"]),
          quantity: z.number().int().positive("Quantity must be positive"),
          name: z.string().min(1, "Service name is required"),
          originalPrice: z.number().nonnegative().optional(),
        }),
      )
      .min(1, "At least one service must be selected"),
    voucherCode: z
      .union([z.string(), z.null(), z.literal("")])
      .transform((val) => (val === "" ? null : val))
      .optional(),
    paymentMethod: z.nativeEnum(PaymentMethod, {
      errorMap: () => ({ message: "Valid payment method is required" }),
    }),
    grandTotal: z.number().nonnegative("Grand total cannot be negative"),
    totalDiscount: z.number().nonnegative("Discount cannot be negative"),
    subTotal: z.number().nonnegative("Subtotal cannot be negative"),
    serveTime: z.enum(["now", "later"], {
      errorMap: () => ({ message: "Service time must be 'now' or 'later'" }),
    }),
    date: z.string().nullable().optional(),
    time: z.string().nullable().optional(),
    selectedRecommendedAppointmentId: z.string().nullable().optional(),
    generateNewFollowUpForFulfilledRA: z.boolean().optional(),
    originBranchId: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.serveTime === "later") {
        return !!data.date && !!data.time;
      }
      return true;
    },
    {
      message: "Date and time are required for 'later' bookings",
      path: ["serveTime"],
    },
  )
  .refine(
    (data) => {
      if (data.email && typeof data.email === "string" && data.email.trim() !== "") {
        return z.string().email().safeParse(data.email).success;
      }
      return true;
    },
    {
      message: "Invalid email format",
      path: ["email"],
    },
  );

export type TransactionFormInput = z.infer<typeof transactionFormSchema>;

/**
 * Convert Zod errors to field error format
 */
export function formatZodErrors(
  errors: z.ZodError,
): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  errors.errors.forEach((error) => {
    const path = error.path.join(".");
    if (!fieldErrors[path]) {
      fieldErrors[path] = [];
    }
    fieldErrors[path].push(error.message);
  });

  return fieldErrors;
}

/**
 * Validate transaction form data
 */
export function validateTransactionForm(
  data: unknown,
): { success: true; data: TransactionFormInput } | { success: false; errors: Record<string, string[]> } {
  const result = transactionFormSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: formatZodErrors(result.error),
  };
}

