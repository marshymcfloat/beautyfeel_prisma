"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  PaymentMethod,
  Status,
  GiftCertificate,
  Service,
  Role,
  DiscountRule,
  ServiceSet,
  Voucher,
  DiscountType,
} from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  MonthlySalesWithPaymentBreakdown,
  SalesDataDetailed,
  PaymentMethodTotals,
  CheckGCResult,
  UIDiscountRuleWithServices,
  AccountForManagement,
  TransactionSubmissionResponse,
} from "./Types";
import {
  AccountData,
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE,
  BranchForSelect,
  EmployeeForAttendance,
} from "./Types";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { ParamValue } from "next/dist/server/request/params";

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

const branchSchema = z.object({
  title: z.string().min(1, "Title is required"),
  code: z
    .string()
    .min(1, "Code is required")
    .max(6, "Code must be 6 characters or less"),
});

const updateBranchSchema = z.object({
  title: z.string().min(1, "Title is required"),
  // Code is generally not updated via this action
});

const prisma = new PrismaClient().$extends(withAccelerate());

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

// Define CashierState interface based on your form structure
interface CashierState {
  name: string;
  date?: string; // Optional for 'serve now'
  time?: string; // Optional for 'serve now'
  serveTime: "now" | "later";
  email?: string | null;
  servicesAvailed: {
    id: string; // Service ID
    name: string; // Service Name (useful for display, maybe not needed here)
    price: number; // Price PER UNIT
    quantity: number; // How many units of this service
  }[];
  voucherCode?: string | null;
  paymentMethod: PaymentMethod;
  grandTotal: number;
  totalDiscount: number;
  // Add branchId if it comes from the form or context
  // branchId?: string;
}

export async function getCustomer(name: string) {
  try {
    const foundCustomers = await prisma.customer.findMany({
      where: {
        name: {
          startsWith: name,
          mode: "insensitive",
        },
      },
    });
    return foundCustomers;
  } catch (error) {
    console.error(error);
  }
}

export async function getVoucher(code: string) {
  try {
    const foundCode = await prisma.voucher.findFirst({
      where: { code },
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
      error: "An error occurred while fetching the voucher",
    };
  }
}

export async function getAllVouchers(): Promise<Voucher[]> {
  console.log("Server Action: getAllVouchers executing...");
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: {
        // Order by used status first (Active first), then by code
        usedAt: "asc", // nulls first (Active)
        // Optionally add a secondary sort
        // code: 'asc',
      },
    });
    console.log(
      `Server Action: Fetched ${vouchers.length} vouchers successfully.`,
    );
    // Ensure dates are serializable if necessary, Prisma usually handles this
    return vouchers;
  } catch (error) {
    console.error("Server Action Error [getAllVouchers]:", error);
    throw new Error("Failed to fetch vouchers via server action.");
  }
}

export async function getAllServices(): Promise<Service[]> {
  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      // Add include/select if needed, e.g., include: { branch: true }
    });
    return services;
  } catch (error) {
    console.error("Error fetching only services:", error);
    return [];
  }
}

export async function getAllServicesOnly(): Promise<Service[]> {
  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      // Add include/select if needed, e.g., include: { branch: true }
    });
    return services;
  } catch (error) {
    console.error("Error fetching only services:", error);
    return [];
  }
}

// --- Action to fetch ONLY Service Sets ---
export async function getAllServiceSets(): Promise<ServiceSet[]> {
  try {
    const serviceSets = await prisma.serviceSet.findMany({
      orderBy: { title: "asc" },
      include: {
        // Important: Include the services within the set if needed for display/validation
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
    description: z.string().trim().optional().nullable(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FIXED_AMOUNT]),
    discountValue: z.coerce
      .number()
      .positive("Discount value must be positive"),
    startDate: z.string().date("Invalid start date"),
    endDate: z.string().date("Invalid end date"),
    applyTo: z.enum(["all", "specific"]),
    serviceIds: z.array(z.string().uuid()).optional(),
  })
  .refine(
    (data) => {
      try {
        return new Date(data.endDate) >= new Date(data.startDate);
      } catch {
        return false;
      }
    },
    { message: "End date must be on or after start date", path: ["endDate"] },
  )
  .refine(
    (data) =>
      data.applyTo === "all" || (data.serviceIds && data.serviceIds.length > 0),
    {
      message:
        "Please select at least one service when applying to specific services.",
      path: ["serviceIds"],
    },
  );

export async function transactionSubmission(
  transactionForm: CashierState,
): Promise<TransactionSubmissionResponse> {
  // Explicitly type the return Promise
  try {
    console.log("Received Transaction Form:", transactionForm);

    const {
      name,
      date,
      time,
      serveTime,
      email,
      servicesAvailed,
      voucherCode,
      paymentMethod,
      grandTotal,
      totalDiscount,
      // branchId, // Get branchId if needed
    } = transactionForm;

    // --- Validation Logic ---
    const errors: Record<string, string> = {}; // Keep internal errors as string for simplicity here

    // MANDATORY: Customer Name
    if (!name || !name.trim()) {
      errors.name = "Customer name is required.";
    }

    // OPTIONAL Email: Validate format ONLY IF provided
    const trimmedEmail = email ? email.trim() : "";
    if (
      trimmedEmail &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(trimmedEmail)
    ) {
      errors.email = "Please enter a valid email format or leave it blank.";
    }

    // MANDATORY: Services Availed
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service must be selected.";
      // Add a general message for easier display
      if (!errors.general)
        errors.general = "Please select at least one service.";
    } else {
      // Additional validation for services array content
      for (const service of servicesAvailed) {
        if (!service.id || typeof service.id !== "string") {
          errors.servicesAvailed =
            "Invalid service data (missing or invalid ID).";
          break; // Stop checking once an error is found
        }
        if (
          typeof service.quantity !== "number" ||
          service.quantity < 1 ||
          !Number.isInteger(service.quantity)
        ) {
          errors.servicesAvailed = `Invalid quantity for service ${
            service.name || service.id
          }. Quantity must be a positive whole number.`;
          break;
        }
        // Allow price 0 (e.g., free gift), but not negative
        if (typeof service.price !== "number" || service.price < 0) {
          errors.servicesAvailed = `Invalid price for service ${
            service.name || service.id
          }. Price must be a non-negative number.`;
          break;
        }
      }
      if (errors.servicesAvailed && !errors.general)
        errors.general = "Invalid service data provided.";
    }

    // Payment Method validation
    if (
      !paymentMethod ||
      !["cash", "ewallet", "bank"].includes(paymentMethod)
    ) {
      errors.paymentMethod = "Invalid payment method selected.";
      if (!errors.general) errors.general = "Please select a payment method.";
    }

    // Serve Time validation
    if (serveTime === "later" && (!date || !time)) {
      errors.serveTime = "Date and time are required for later service.";
      if (!errors.general)
        errors.general = "Please select date and time for later service.";
    }

    // --- Return errors if any ---
    if (Object.keys(errors).length > 0) {
      console.log("Validation Errors:", errors);
      // FIX: Add message and convert errors
      return {
        success: false,
        message: errors.general || "Validation failed. Please check the form.",
        errors: convertErrorsToStringArrays(errors),
      };
    }

    // --- Process Valid Data ---
    const newlyFormattedName = formatName(name.trim());
    const customerEmailData = trimmedEmail.length > 0 ? trimmedEmail : null;

    // Parse bookedFor DateTime
    let bookedFor = new Date(); // Default to now
    if (serveTime === "later" && date && time) {
      try {
        bookedFor = new Date(`${date}T${time}:00`);
        if (isNaN(bookedFor.getTime())) {
          throw new Error("Invalid date/time format resulting in NaN");
        }
      } catch (dateError) {
        console.error("Error parsing date/time:", dateError);
        const errorMsg = "Invalid date or time format provided.";
        // FIX: Add message and format errors correctly
        return {
          success: false,
          message: errorMsg,
          errors: { serveTime: [errorMsg] }, // Ensure array format
        };
      }
    }

    // Use a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Find or Create Customer
      let customer = await tx.customer.findFirst({
        where: { name: newlyFormattedName },
      });

      if (!customer) {
        console.log(
          `Customer "${newlyFormattedName}" not found, creating new one.`,
        );
        try {
          customer = await tx.customer.create({
            data: {
              name: newlyFormattedName,
              email: customerEmailData,
            },
          });
          console.log("New customer created:", customer);
        } catch (createError: any) {
          let userMessage = "Failed to create customer record."; // Default message
          if (
            createError.code === "P2002" &&
            createError.meta?.target?.includes("email")
          ) {
            console.error(
              "Unique constraint failed for email:",
              customerEmailData,
            );
            const existingCustomerWithEmail = await tx.customer.findUnique({
              where: { email: customerEmailData! },
            });
            if (existingCustomerWithEmail) {
              userMessage = `The email "${customerEmailData}" is already associated with customer "${existingCustomerWithEmail.name}". Please use a different email or find the existing customer.`;
            } else {
              userMessage = `The email "${customerEmailData}" is already in use.`;
            }
          }
          // Throw error to be caught by the outer catch block of transactionSubmission
          throw new Error(userMessage);
        }
      } else {
        console.log("Found existing customer:", customer);
        if (customerEmailData && customer.email !== customerEmailData) {
          console.log(
            `Updating email for customer ${customer.id} to ${customerEmailData}`,
          );
          try {
            await tx.customer.update({
              where: { id: customer.id },
              data: { email: customerEmailData },
            });
          } catch (updateError: any) {
            let userMessage = "Failed to update customer email.";
            if (
              updateError.code === "P2002" &&
              updateError.meta?.target?.includes("email")
            ) {
              userMessage = `The email "${customerEmailData}" is already associated with another customer.`;
            }
            // Throw error to be caught by the outer catch block
            throw new Error(userMessage);
          }
        }
      }

      // Handle Voucher
      let voucher = null;
      let actualDiscount = totalDiscount;

      if (voucherCode) {
        voucher = await tx.voucher.findUnique({
          where: { code: voucherCode },
        });

        if (voucher) {
          if (voucher.usedAt) {
            // Throw error to be caught by the outer catch block
            throw new Error(`Voucher "${voucherCode}" has already been used.`);
          }
          // Optional: Add more voucher validation logic here
          await tx.voucher.update({
            where: { id: voucher.id },
            data: { usedAt: new Date() },
          });
          console.log(`Voucher "${voucherCode}" marked as used.`);
        } else {
          // Throw error to be caught by the outer catch block
          throw new Error(`Invalid voucher code "${voucherCode}".`);
        }
      }

      // Create the main Transaction record
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          paymentMethod: paymentMethod as PaymentMethod, // Cast if using Prisma enum type
          grandTotal,
          discount: actualDiscount,
          status: Status.PENDING,
          bookedFor,
          voucherId: voucher ? voucher.id : null,
          // branchId: determinedBranchId, // Add if needed
        },
      });
      console.log("Transaction record created:", transaction.id);

      // Create individual AvailedService records
      const availedServiceCreatePromises = [];
      let totalCreated = 0;
      for (const inputService of servicesAvailed) {
        for (let i = 0; i < inputService.quantity; i++) {
          availedServiceCreatePromises.push(
            tx.availedService.create({
              data: {
                transactionId: transaction.id,
                serviceId: inputService.id,
                quantity: 1,
                price: inputService.price,
                checkedById: null,
                servedById: null,
              },
            }),
          );
          totalCreated++;
        }
      }
      await Promise.all(availedServiceCreatePromises);
      console.log(
        `${totalCreated} individual AvailedService records created and linked.`,
      );

      return transaction;
    }); // End of prisma.$transaction

    console.log("Transaction successfully created! ID:", result.id);
    // Revalidate paths if necessary
    // revalidatePath("/admin/transactions");
    // revalidatePath("/reports/sales");

    // FIX: Return correct success shape
    return { success: true, transactionId: result.id };
  } catch (error: unknown) {
    console.error("Error submitting transaction:", error);

    const responseErrors: Record<string, string[]> = {}; // Use string[] for final errors
    let responseMessage = "An unexpected error occurred during submission."; // Default message

    if (error instanceof Error) {
      responseMessage = error.message; // Use the caught error message by default

      // Handle specific known errors and map to fields if possible
      if (error.message.includes("already been used")) {
        responseErrors.voucherCode = [error.message];
      } else if (error.message.includes("Invalid voucher code")) {
        responseErrors.voucherCode = [error.message];
      } else if (error.message.includes("already associated with")) {
        responseErrors.email = [error.message];
      } else if (error.message.includes("already in use")) {
        responseErrors.email = [error.message];
      } else if (error.message.includes("Invalid date or time")) {
        responseErrors.serveTime = [error.message];
      }
      // Add more specific mappings if needed

      // If no specific field error was mapped, but we have a message, use general
      if (Object.keys(responseErrors).length === 0 && responseMessage) {
        responseErrors.general = [responseMessage];
      }
    }
    // Ensure there's always a general message if no specific errors were mapped
    if (!responseErrors.general && Object.keys(responseErrors).length === 0) {
      responseErrors.general = [responseMessage];
    }

    // FIX: Return correct error shape
    return {
      success: false,
      message: responseMessage, // Provide the main error message
      errors: responseErrors, // Provide the field-specific errors (can be empty)
    };
  }
}

export async function createGiftCertificateAction(formData: FormData) {
  const rawData = {
    code: formData.get("code"),
    serviceIds: formData.getAll("serviceIds"),
    expiresAt: formData.get("expiresAt") || null,
    recipientName: formData.get("recipientName") || null,
    // --- Ensure empty string becomes null for the database ---
    recipientEmail: (formData.get("recipientEmail") as string)?.trim() || null,
  };

  const validation = GiftCertificateCreateSchema.safeParse(rawData);

  if (!validation.success) {
    console.error(
      "GC Validation Failed:",
      validation.error.flatten().fieldErrors,
    );
    return {
      success: false,
      message: "Validation failed.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  // Use validated data (Zod handles the optional/null part)
  const { code, serviceIds, expiresAt, recipientName, recipientEmail } =
    validation.data;

  try {
    const existing = await prisma.giftCertificate.findUnique({
      where: { code },
    });
    if (existing) {
      return {
        success: false,
        message: `Code "${code}" already exists.`,
        errors: { code: [`Code "${code}" already exists.`] },
      };
    }

    const createdGC = await prisma.giftCertificate.create({
      data: {
        code,
        // Use validated data, which might be null for email
        recipientName: recipientName || null, // Ensure null if empty string passed validation
        recipientEmail: recipientEmail || null, // Ensure null if empty string passed validation
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        services: { connect: serviceIds.map((id) => ({ id })) },
      },
      include: { services: { select: { id: true, title: true } } },
    });
    console.log("GC Created:", createdGC);
    revalidatePath("/customize");
    return {
      success: true,
      message: `Gift Certificate ${code} created successfully.`,
    };
  } catch (error: any) {
    // ... (existing error handling) ...
    console.error("Error creating Gift Certificate:", error);
    if (error.code === "P2002" && error.meta?.target?.includes("code")) {
      return {
        success: false,
        message: `Code "${code}" already exists.`,
        errors: { code: [`Code "${code}" already exists.`] },
      };
    }
    return {
      success: false,
      message: "Database error creating Gift Certificate.",
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

export async function getActiveTransactions() {
  try {
    const activeTransactions = await prisma.transaction.findMany({
      // --- Add cacheStrategy here ---
      cacheStrategy: {
        ttl: 30, // Example: Cache results for only 30 seconds
        // swr: 15, // Optional: Serve stale data for 15s while revalidating in background
      },
      // --- End of cacheStrategy ---
      where: {
        status: Status.PENDING,
      },
      include: {
        // ... your includes ...
        customer: {
          select: {
            id: true,
            name: true,
            email: true,
            totalPaid: true,
            nextAppointment: true,
          },
        },
        availedServices: {
          include: {
            service: {
              select: {
                id: true,
                title: true,
              },
            },
            checkedBy: {
              select: {
                id: true,
                name: true,
              },
            },
            servedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            service: {
              title: "asc",
            },
          },
        },
      },
      orderBy: {
        bookedFor: "asc",
      },
    });
    return activeTransactions;
  } catch (error) {
    console.error("Error fetching active transactions:", error);
    throw new Error(
      "Failed to fetch active transactions. Please try again later.",
    );
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
export async function getSalaryBreakdown(
  accountId: string,
): Promise<SalaryBreakdownItem[]> {
  if (!accountId) {
    throw new Error("Account ID is required.");
  }

  try {
    const completedServices = await prisma.availedService.findMany({
      where: {
        servedById: accountId,
        transaction: {
          status: Status.DONE,
        },
      },
      include: {
        service: {
          select: { title: true },
        },
        transaction: {
          select: {
            // Select createdAt instead of updatedAt
            createdAt: true,
            customer: {
              select: { name: true },
            },
          },
        },
      },
      orderBy: {
        // Order by transaction creation date
        transaction: {
          createdAt: "desc",
        },
      },
      // take: 50, // Consider pagination
    });

    const breakdownItems: SalaryBreakdownItem[] = completedServices.map(
      (as) => {
        const commission = Math.floor(as.price * SALARY_COMMISSION_RATE);
        return {
          id: as.id,
          serviceTitle: as.service.title,
          customerName: as.transaction?.customer?.name ?? "Unknown",
          // Use transaction.createdAt
          transactionDate: new Date(as.transaction.createdAt), // Ensure it's a Date object
          servicePrice: as.price,
          commissionEarned: commission,
        };
      },
    );

    return breakdownItems;
  } catch (error) {
    console.error(
      `Error fetching salary breakdown for account ${accountId}:`,
      error,
    );
    throw new Error("Failed to fetch salary breakdown.");
  }
}

export async function getCurrentAccountData(
  accountId: string,
): Promise<AccountData> {
  if (!accountId) return null;
  try {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        role: true, // Select the role array
        salary: true,
      },
    });
    if (!account) return null;
    // Ensure role is treated as Role[] if needed, Prisma client usually handles this
    return account as AccountData; // Cast might be needed depending on exact setup
  } catch (error) {
    console.error(`Error fetching account data for ${accountId}:`, error);
    return null;
  }
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

const serviceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  // Use preprocess to handle string-to-number conversion for FormData
  price: z.preprocess(
    (val) => {
      if (typeof val === "string") return parseInt(val, 10);
      if (typeof val === "number") return val;
      return NaN; // Mark as invalid if not string or number
    },
    z
      .number({ invalid_type_error: "Price must be a number" })
      .int()
      .min(0, "Price must be non-negative"),
  ),
  branchId: z.string().uuid("Invalid Branch ID"),
});

// --- Create Service Action ---
export async function createServiceAction(formData: FormData) {
  const rawData = {
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    branchId: formData.get("branchId"),
  };

  const validationResult = serviceSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.log(validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  const data = validationResult.data;

  try {
    // Optional: Check uniqueness within branch?
    // const existing = await prisma.service.findFirst({ where: { title: data.title, branchId: data.branchId } });
    // if (existing) return { success: false, message: 'Service title already exists in this branch' };

    const newService = await prisma.service.create({ data });

    revalidatePath("/customize");
    return {
      success: true,
      data: newService,
      message: "Service created successfully.",
    };
  } catch (error: any) {
    console.error("Create Service Action Error:", error);
    if (
      error.code === "P2003" &&
      error.meta?.field_name?.includes("branchId")
    ) {
      return { success: false, message: "Selected Branch does not exist." };
    }
    return {
      success: false,
      message: "Database error: Failed to create service.",
    };
  }
}

// --- Update Service Action ---
export async function updateServiceAction(id: string, formData: FormData) {
  if (!id) return { success: false, message: "Service ID is required." };

  const rawData = {
    title: formData.get("title"),
    description: formData.get("description"),
    price: formData.get("price"),
    branchId: formData.get("branchId"),
  };

  // Use .partial() as updates might only send some fields
  const validationResult = serviceSchema.partial().safeParse(rawData);

  if (!validationResult.success) {
    console.log(validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  // Remove undefined values so Prisma doesn't try to set them to null
  const dataToUpdate = Object.fromEntries(
    Object.entries(validationResult.data).filter(([_, v]) => v !== undefined),
  );

  if (Object.keys(dataToUpdate).length === 0) {
    return { success: false, message: "No valid data provided for update." };
  }

  try {
    const updatedService = await prisma.service.update({
      where: { id },
      data: dataToUpdate,
    });

    revalidatePath("/customize");
    return {
      success: true,
      data: updatedService,
      message: "Service updated successfully.",
    };
  } catch (error: any) {
    console.error(`Update Service Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Service not found." };
    }
    if (
      error.code === "P2003" &&
      error.meta?.field_name?.includes("branchId")
    ) {
      return { success: false, message: "Selected Branch does not exist." };
    }
    return {
      success: false,
      message: "Database error: Failed to update service.",
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

export async function createAccountAction(formData: FormData) {
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
    // General fallback
    return {
      success: false,
      message: `Database error: Failed to create account. ${error.message || "Unknown error"}`,
    };
  }
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

export async function getSalesDataLast6Months(): Promise<SalesDataDetailed> {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  console.log(`Fetching sales data from: ${sixMonthsAgo.toISOString()}`);

  try {
    const transactions = await prisma.transaction.findMany({
      where: { status: Status.DONE, createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, grandTotal: true, paymentMethod: true },
      orderBy: { createdAt: "asc" },
    });

    console.log(`Fetched ${transactions.length} completed transactions.`);

    // Map key: "YYYY-MM", value: object with totals for that month
    const monthlyMap: Map<
      string,
      Omit<MonthlySalesWithPaymentBreakdown, "month" | "yearMonth">
    > = new Map();
    const overallPaymentTotals: PaymentMethodTotals = {
      cash: 0,
      ewallet: 0,
      bank: 0,
      unknown: 0,
    };
    let overallGrandTotal = 0;

    // Initialize map for the last 6 months
    for (let i = 0; i < 6; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const yearMonthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}`;
      if (!monthlyMap.has(yearMonthKey)) {
        // Ensure not already initialized if loop overlaps somehow
        monthlyMap.set(yearMonthKey, {
          totalSales: 0,
          cash: 0,
          ewallet: 0,
          bank: 0,
          unknown: 0,
        });
      }
    }

    // Aggregate data
    for (const tx of transactions) {
      const year = tx.createdAt.getFullYear();
      const month = tx.createdAt.getMonth() + 1;
      const yearMonthKey = `${year}-${month.toString().padStart(2, "0")}`;

      // Get or initialize the data object for the month
      const currentMonthData = monthlyMap.get(yearMonthKey) ?? {
        totalSales: 0,
        cash: 0,
        ewallet: 0,
        bank: 0,
        unknown: 0,
      };

      // Add to monthly totalSales
      currentMonthData.totalSales += tx.grandTotal;

      // Add to specific payment method total *for the month* AND *overall*
      switch (tx.paymentMethod) {
        case PaymentMethod.cash:
          currentMonthData.cash += tx.grandTotal;
          overallPaymentTotals.cash += tx.grandTotal;
          break;
        case PaymentMethod.ewallet:
          currentMonthData.ewallet += tx.grandTotal;
          overallPaymentTotals.ewallet += tx.grandTotal;
          break;
        case PaymentMethod.bank:
          currentMonthData.bank += tx.grandTotal;
          overallPaymentTotals.bank += tx.grandTotal;
          break;
        default:
          currentMonthData.unknown += tx.grandTotal;
          overallPaymentTotals.unknown += tx.grandTotal;
          break;
      }

      // Update the map with the modified month data
      monthlyMap.set(yearMonthKey, currentMonthData);

      // Add to overall grand total
      overallGrandTotal += tx.grandTotal;
    }

    // Format monthly data for the result
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const monthlySalesData: MonthlySalesWithPaymentBreakdown[] = Array.from(
      monthlyMap.entries(),
    )
      .map(([yearMonth, totals]) => {
        const [year, monthIndex] = yearMonth.split("-").map(Number);
        const shortYear = year.toString().slice(-2);
        const monthName = monthNames[monthIndex - 1];
        return {
          yearMonth: yearMonth,
          month: `${monthName} '${shortYear}`,
          ...totals, // Spread the calculated totals (totalSales, cash, ewallet, etc.)
        };
      })
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)); // Sort chronologically

    return {
      monthlySales: monthlySalesData,
      paymentMethodTotals: overallPaymentTotals, // Return overall totals
      grandTotal: overallGrandTotal,
    };
  } catch (error) {
    console.error("Error fetching detailed sales data:", error);
    return {
      monthlySales: [],
      paymentMethodTotals: { cash: 0, ewallet: 0, bank: 0, unknown: 0 },
      grandTotal: 0,
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
    description: formData.get("description") || null,
    discountType: formData.get("discountType"),
    discountValue: formData.get("discountValue"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    applyTo: formData.get("applyTo"),
    serviceIds: formData.getAll("serviceIds"),
  };
  const validation = DiscountRuleSchema.safeParse(rawData);

  if (!validation.success) {
    console.error(
      "Discount Validation Failed:",
      validation.error.flatten().fieldErrors,
    );
    return {
      success: false,
      message: "Validation failed.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  // Destructure applyTo from validated data
  const {
    discountType,
    discountValue,
    startDate,
    endDate,
    applyTo,
    serviceIds,
    description,
  } = validation.data;

  try {
    // Base data includes the new applyToAll flag
    const createData: {
      description?: string | null;
      discountType: DiscountType;
      discountValue: number;
      startDate: Date;
      endDate: Date;
      isActive: boolean;
      applyToAll: boolean; // <<< Add applyToAll
      services?: { connect: { id: string }[] };
    } = {
      description,
      discountType,
      discountValue,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      isActive: true,
      applyToAll: applyTo === "all", // <<< Set flag based on form value
    };

    // Connect services only if applying to specific ones
    if (applyTo === "specific" && serviceIds && serviceIds.length > 0) {
      createData.services = { connect: serviceIds.map((id) => ({ id })) };
    }
    // No need to explicitly handle 'services' field when applyTo is 'all'

    await prisma.discountRule.create({ data: createData });

    revalidatePath("/customize");
    return { success: true, message: "Discount rule created successfully." };
  } catch (error) {
    /* ... handle errors ... */
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
  // Optional: Pass checker's details if needed for authorization/scoping
  // checkerId: string,
  // checkerRoles: Role[],
  // filterBranchId?: string | null
  EmployeeForAttendance[]
> {
  console.log("Server Action: getEmployeesForAttendanceAction executing...");
  try {
    // Basic Implementation: Fetch all non-OWNER accounts for now.
    // TODO: Refine filtering based on checker's role/branch if needed.
    //       e.g., if checker has CASHIER/WORKER/ATTENDANCE_CHECKER role and a branchId,
    //       only fetch accounts from that branch. OWNER sees all.

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today (important for Date comparison)
    // For Prisma Date field, create a string in YYYY-MM-DD or use the Date obj directly if adapter supports
    // Let's use the Date object directly assuming the driver adapter handles it.

    const accounts = await prisma.account.findMany({
      where: {
        // Exclude owners from being marked? Or maybe exclude the checker themselves?
        // role: { hasNone: [Role.OWNER] } // Example: Don't show OWNERs in attendance list
        // id: { not: checkerId } // Example: Don't show the checker themselves
        // branchId: filterBranchId ? filterBranchId : undefined // Example: Filter by branch
      },
      select: {
        id: true,
        name: true,
        dailyRate: true,
        branch: {
          // Select branch title
          select: { title: true },
        },
        // Fetch attendance specifically for TODAY for this account
        attendances: {
          where: {
            date: today, // Filter attendance records for today's date
          },
          select: {
            id: true,
            isPresent: true,
            notes: true,
          },
          take: 1, // Should only be one record per user per day due to unique constraint
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    console.log(
      `Server Action: Fetched ${accounts.length} accounts for attendance.`,
    );

    // Process the result to match the EmployeeForAttendance type
    const employeesWithAttendance: EmployeeForAttendance[] = accounts.map(
      (acc) => ({
        id: acc.id,
        name: acc.name,
        dailyRate: acc.dailyRate ?? 0, // Use default if null
        branchTitle: acc.branch?.title ?? null,
        // Prisma returns an array for relations, get the first (or null)
        todaysAttendance:
          acc.attendances.length > 0 ? acc.attendances[0] : null,
      }),
    );

    return employeesWithAttendance;
  } catch (error) {
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
  checkerIdInput: string | ParamValue, // Rename input param to avoid shadowing after check
): Promise<{ success: boolean; message: string; updatedSalary?: number }> {
  console.log(
    `Server Action: markAttendanceAction called for Account ${accountId}, isPresent: ${isPresent}, Checker Input: ${checkerIdInput}`,
  );

  if (!accountId || !checkerIdInput) {
    return {
      success: false,
      message: "Account ID and Checker ID are required.",
    };
  }

  // --- FIX: Validate checkerIdInput is a string ---
  if (typeof checkerIdInput !== "string") {
    console.error(
      `Invalid checkerId type: ${typeof checkerIdInput}. Expected string. Value: ${JSON.stringify(checkerIdInput)}`,
    );
    return {
      success: false,
      // Provide a user-friendly error message
      message: "Invalid request: Checker ID must be a single identifier.",
    };
  }
  // --- END FIX ---

  // Now we know checkerIdInput is a string, assign it to a const with the correct type
  const checkerId: string = checkerIdInput;
  console.log(`Using validated Checker ID: ${checkerId}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Start of today

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get Account Details (incl. current salary and daily rate)
      const account = await tx.account.findUnique({
        where: { id: accountId },
        select: { dailyRate: true, salary: true },
      });

      if (!account) {
        throw new Error(`Account with ID ${accountId} not found.`);
      }

      const dailyRate = account.dailyRate ?? 0;
      const currentSalary = account.salary ?? 0;

      // 2. Find existing attendance record for today
      const existingAttendance = await tx.attendance.findUnique({
        where: {
          date_accountId: { date: today, accountId: accountId },
        },
        select: { isPresent: true },
      });

      let salaryChange = 0;
      const wasPreviouslyPresent = existingAttendance?.isPresent ?? false;

      // 3. Determine Salary Change
      if (isPresent && !wasPreviouslyPresent) {
        salaryChange = dailyRate;
        console.log(
          `Account ${accountId}: Marking PRESENT. Adding ${dailyRate} to salary.`,
        );
      } else if (!isPresent && wasPreviouslyPresent) {
        salaryChange = -dailyRate;
        console.log(
          `Account ${accountId}: Marking ABSENT (was present). Subtracting ${dailyRate} from salary.`,
        );
      } else {
        console.log(
          `Account ${accountId}: Attendance marked (${isPresent}), but no salary change needed.`,
        );
      }

      const newSalary = currentSalary + salaryChange;

      // --- Data for Upsert (Uses the validated 'checkerId' which is guaranteed string) ---
      const attendanceCreateData = {
        date: today,
        accountId: accountId,
        isPresent: isPresent,
        notes: notes,
        checkedById: checkerId, // Now guaranteed string
        checkedAt: new Date(),
      };

      const attendanceUpdateData = {
        // Only update fields that might change
        isPresent: isPresent,
        notes: notes,
        checkedById: checkerId, // Now guaranteed string
        checkedAt: new Date(),
      };
      // --- End Data for Upsert ---

      // 4. Upsert Attendance Record
      await tx.attendance.upsert({
        where: {
          date_accountId: { date: today, accountId: accountId },
        },
        create: attendanceCreateData, // Use the object with string checkerId
        update: attendanceUpdateData, // Use the object with string checkerId
      });
      console.log(`Account ${accountId}: Upserted attendance record.`);

      // 5. Update Account Salary (only if it changed)
      if (salaryChange !== 0) {
        await tx.account.update({
          where: { id: accountId },
          data: { salary: newSalary },
        });
        console.log(`Account ${accountId}: Updated salary to ${newSalary}.`);
      }

      return {
        success: true,
        message: `Attendance marked successfully for ${today.toISOString().split("T")[0]}.`,
        updatedSalary: newSalary,
      };
    }); // End Transaction

    // Revalidate path if needed
    revalidatePath("/customize"); // Or a more specific path
    revalidatePath("/attendance"); // Assuming the component is on this path

    return result;
  } catch (error: any) {
    console.error("Server Action Error [markAttendanceAction]:", error);
    // Check for specific Prisma errors if needed, e.g., P2002 for unique constraint violation
    // although upsert should handle the unique constraint gracefully.
    // Check if it's a known error type before accessing error.message
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      message: `Failed to mark attendance: ${errorMessage}`,
    };
  }
}
