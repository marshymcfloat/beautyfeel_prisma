"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import bcrypt from "bcryptjs";
import { PrismaClient, Status } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import { Role } from "@prisma/client";
import {
  AccountData,
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE,
} from "./Types";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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
  paymentMethod: "cash" | "ewallet" | "bank" | string; // Use specific types if possible
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

export async function transactionSubmission(transactionForm: CashierState) {
  try {
    console.log("Received Transaction Form:", transactionForm);

    const {
      name,
      date,
      time,
      serveTime,
      email,
      servicesAvailed, // Array like: [{ id: 'svc1', name: 'Haircut', price: 50, quantity: 3 }, ...]
      voucherCode,
      paymentMethod,
      grandTotal,
      totalDiscount,
      // branchId, // Get branchId if needed
    } = transactionForm;

    // --- Validation Logic ---
    const errors: Record<string, string> = {};

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
          errors.servicesAvailed = `Invalid quantity for service ${service.name || service.id}. Quantity must be a positive whole number.`;
          break;
        }
        if (typeof service.price !== "number" || service.price < 0) {
          errors.servicesAvailed = `Invalid price for service ${service.name || service.id}. Price must be a non-negative number.`;
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
      return { success: false, errors };
    }

    // --- Process Valid Data ---
    const newlyFormattedName = formatName(name.trim());
    const customerEmailData = trimmedEmail.length > 0 ? trimmedEmail : null;

    // Parse bookedFor DateTime
    let bookedFor = new Date(); // Default to now
    if (serveTime === "later" && date && time) {
      try {
        // IMPORTANT: Ensure date and time strings combine correctly for your timezone.
        // Using UTC for consistency might be safer if clients/servers are in different zones.
        // Example: Use a library like date-fns or dayjs for robust parsing.
        // Basic JS Date parsing can be tricky with timezones.
        bookedFor = new Date(`${date}T${time}:00`); // Assumes local timezone if no zone specified
        if (isNaN(bookedFor.getTime())) {
          throw new Error("Invalid date/time format resulting in NaN");
        }
      } catch (dateError) {
        console.error("Error parsing date/time:", dateError);
        return {
          success: false,
          errors: { serveTime: "Invalid date or time format provided." },
        };
      }
    }

    // Use a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Find or Create Customer
      let customer = await tx.customer.findFirst({
        where: { name: newlyFormattedName },
        // Consider if email should be part of the unique identification or just updated
        // where: { name: newlyFormattedName, email: customerEmailData }, // Stricter match
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
          if (
            createError.code === "P2002" &&
            createError.meta?.target?.includes("email")
          ) {
            console.error(
              "Unique constraint failed for email:",
              customerEmailData,
            );
            // You might want to fetch the customer with this email instead
            const existingCustomerWithEmail = await tx.customer.findUnique({
              where: { email: customerEmailData! },
            });
            if (existingCustomerWithEmail) {
              throw new Error(
                `The email "${customerEmailData}" is already associated with customer "${existingCustomerWithEmail.name}". Please use a different email or find the existing customer.`,
              );
            } else {
              // Should not happen if constraint failed, but as a fallback:
              throw new Error(
                `The email "${customerEmailData}" is already in use.`,
              );
            }
          }
          throw createError; // Rethrow other errors
        }
      } else {
        console.log("Found existing customer:", customer);
        // Optional: Update existing customer's email if provided and different
        // Be careful if email is meant to be a unique identifier
        if (customerEmailData && customer.email !== customerEmailData) {
          console.log(
            `Updating email for customer ${customer.id} to ${customerEmailData}`,
          );
          // Add try-catch here too for potential unique constraint violation during update
          try {
            await tx.customer.update({
              where: { id: customer.id },
              data: { email: customerEmailData },
            });
          } catch (updateError: any) {
            if (
              updateError.code === "P2002" &&
              updateError.meta?.target?.includes("email")
            ) {
              throw new Error(
                `The email "${customerEmailData}" is already associated with another customer.`,
              );
            }
            throw updateError;
          }
        }
      }

      // Handle Voucher
      let voucher = null;
      let actualDiscount = totalDiscount; // Use the form's discount by default

      if (voucherCode) {
        voucher = await tx.voucher.findUnique({
          where: { code: voucherCode },
        });

        if (voucher) {
          if (voucher.usedAt) {
            throw new Error(`Voucher "${voucherCode}" has already been used.`);
          }
          // Optional: Verify voucher applicability (e.g., min spend, specific services) here
          // Optional: Recalculate discount based *only* on the voucher if form discount is unreliable
          // actualDiscount = calculateDiscount(voucher, servicesAvailed); // Implement this function if needed
          await tx.voucher.update({
            where: { id: voucher.id },
            data: { usedAt: new Date() },
          });
          console.log(`Voucher "${voucherCode}" marked as used.`);
        } else {
          throw new Error(`Invalid voucher code "${voucherCode}".`);
        }
      } else {
        // If no voucher code, ensure the discount isn't coming from a non-existent voucher
        // You might want validation to ensure totalDiscount is 0 if no voucherCode is present,
        // unless you allow manual discounts.
        // actualDiscount = totalDiscount; // Keep manual discount if allowed
      }

      // Create the main Transaction record
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          paymentMethod: paymentMethod,
          grandTotal, // Ensure this is calculated correctly on the frontend/backend
          discount: actualDiscount, // Use the determined discount
          status: Status.PENDING, // Use Enum if available
          bookedFor,
          voucherId: voucher ? voucher.id : null,
          /* branchId: determinedBranchId, // Link the determined branch ID */
        },
      });
      console.log("Transaction record created:", transaction.id);

      // --- >>> CORE CHANGE HERE <<< ---
      // Create individual AvailedService records for each unit of quantity
      const availedServiceCreatePromises = [];
      let totalCreated = 0;

      for (const inputService of servicesAvailed) {
        // The input validation for quantity > 0 happened earlier
        for (let i = 0; i < inputService.quantity; i++) {
          availedServiceCreatePromises.push(
            tx.availedService.create({
              data: {
                transactionId: transaction.id,
                serviceId: inputService.id,
                quantity: 1, // Set quantity to 1 for each individual record
                price: inputService.price, // Price per unit of the service at time of transaction
                // checkedById and servedById will be null initially
                checkedById: null,
                servedById: null,
              },
            }),
          );
          totalCreated++;
        }
      }

      // Wait for all individual AvailedService records to be created
      await Promise.all(availedServiceCreatePromises);
      console.log(
        `${totalCreated} individual AvailedService records created and linked.`,
      );
      // --- >>> END OF CORE CHANGE <<< ---

      // Optionally: Update Customer's totalPaid or other stats (consider doing this elsewhere, e.g., when status becomes COMPLETED)
      // await tx.customer.update({
      //   where: { id: customer.id },
      //   data: { totalPaid: { increment: grandTotal } }, // Maybe only increment when paid?
      // });

      return transaction; // Return the created transaction
    }); // End of prisma.$transaction

    console.log("Transaction successfully created! ID:", result.id);
    /*   revalidatePath("/path/to/transactions"); // Example: Revalidate relevant pages */
    return { success: true, transactionId: result.id };
  } catch (error: unknown) {
    console.error("Error submitting transaction:", error);

    const errors: Record<string, string> = {};
    let specificErrorHandled = false;

    if (error instanceof Error) {
      // Handle specific known errors first
      if (
        error.message.includes("Voucher") &&
        error.message.includes("already been used")
      ) {
        errors.voucherCode = error.message;
        specificErrorHandled = true;
      } else if (error.message.includes("Invalid voucher code")) {
        errors.voucherCode = error.message;
        specificErrorHandled = true;
      } else if (
        error.message.includes("associated with another customer") ||
        error.message.includes("already in use")
      ) {
        errors.email = error.message; // Error related to customer email uniqueness
        specificErrorHandled = true;
      } else if (error.message.includes("Invalid date or time")) {
        errors.serveTime = error.message;
        specificErrorHandled = true;
      } else if (
        error.message.includes("Invalid quantity") ||
        error.message.includes("Invalid price")
      ) {
        errors.servicesAvailed = error.message; // Error related to service data
        specificErrorHandled = true;
      }
      // Add more specific error checks as needed
    }

    // If no specific error matched, provide a general error message
    if (!specificErrorHandled) {
      errors.general =
        "An unexpected error occurred while processing the transaction. Please try again.";
      // Log the detailed error for debugging, but don't expose it to the user
      console.error("Unhandled transaction error details:", error);
    }

    return {
      success: false,
      errors: errors,
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
  username: z.string().min(1).max(6, "Username must be 1-6 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  name: z.string().min(1, "Name is required"),
  email: z
    .string()
    .email("Invalid email format")
    .optional()
    .nullable()
    .or(z.literal("")), // Allow empty string from form
  // Use preprocess for salary
  salary: z.preprocess(
    (val) => {
      if (typeof val === "string") return parseInt(val, 10);
      if (typeof val === "number") return val;
      return NaN;
    },
    z
      .number({ invalid_type_error: "Salary must be a number" })
      .int()
      .min(0, "Salary must be non-negative"),
  ),
  branchId: z
    .string()
    .uuid("Invalid Branch ID")
    .optional()
    .nullable()
    .or(z.literal("")), // Allow empty string
  role: z.array(z.nativeEnum(Role)).min(1, "At least one role is required"),
});

// Schema for update (password excluded)
const updateAccountSchema = createAccountSchema
  .omit({ password: true })
  .partial();

// --- Create Account Action ---
export async function createAccountAction(formData: FormData) {
  const roles = ALL_ROLES.filter(
    (role) => formData.get(`role-${role}`) === "on",
  );
  const rawData = {
    username: formData.get("username"),
    password: formData.get("password"),
    name: formData.get("name"),
    email: formData.get("email"),
    salary: formData.get("salary"),
    branchId: formData.get("branchId") || null, // Handle empty string from select
    role: roles,
  };

  const validationResult = createAccountSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.log("Validation Errors:", validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  const { password, email, branchId, ...restData } = validationResult.data;

  try {
    // Check uniqueness
    const existingUsername = await prisma.account.findUnique({
      where: { username: restData.username },
    });
    if (existingUsername) {
      return {
        success: false,
        message: `Username "${restData.username}" is already taken.`,
      };
    }
    if (email) {
      const existingEmail = await prisma.account.findUnique({
        where: { email },
      });
      if (existingEmail) {
        return {
          success: false,
          message: `Email "${email}" is already registered.`,
        };
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10); // 10 = salt rounds

    const newAccount = await prisma.account.create({
      data: {
        ...restData,
        password: hashedPassword,
        email: email || null, // Store null if empty string
        branchId: branchId || null, // Store null if empty string
      },
    });

    revalidatePath("/customize");
    // Exclude password from returned data
    const { password: _, ...returnData } = newAccount;
    return {
      success: true,
      data: returnData,
      message: "Account created successfully.",
    };
  } catch (error: any) {
    console.error("Create Account Action Error:", error);
    if (
      error.code === "P2003" &&
      error.meta?.field_name?.includes("branchId")
    ) {
      return { success: false, message: "Selected Branch does not exist." };
    }
    return {
      success: false,
      message: "Database error: Failed to create account.",
    };
  }
}

// --- Update Account Action ---
export async function updateAccountAction(id: string, formData: FormData) {
  if (!id) return { success: false, message: "Account ID is required." };

  const roles = ALL_ROLES.filter(
    (role) => formData.get(`role-${role}`) === "on",
  );
  const rawData = {
    username: formData.get("username"),
    name: formData.get("name"),
    email: formData.get("email"),
    salary: formData.get("salary"),
    branchId: formData.get("branchId") || null,
    role: roles,
  };

  const validationResult = updateAccountSchema.safeParse(rawData);

  if (!validationResult.success) {
    console.log("Validation Errors:", validationResult.error.flatten());
    return {
      success: false,
      message: "Validation failed",
      errors: validationResult.error.flatten().fieldErrors,
    };
  }

  // Remove undefined values and handle optional fields correctly
  const dataToUpdate: Record<string, any> = {};
  for (const [key, value] of Object.entries(validationResult.data)) {
    if (value !== undefined) {
      if ((key === "email" || key === "branchId") && value === "") {
        dataToUpdate[key] = null; // Set empty strings to null in DB
      } else {
        dataToUpdate[key] = value;
      }
    }
  }

  if (Object.keys(dataToUpdate).length === 0) {
    return { success: false, message: "No valid data provided for update." };
  }

  try {
    // Check uniqueness constraints if username/email are being updated
    if (dataToUpdate.username) {
      const existingUsername = await prisma.account.findFirst({
        where: { username: dataToUpdate.username, id: { not: id } },
      });
      if (existingUsername) {
        return {
          success: false,
          message: `Username "${dataToUpdate.username}" is already taken.`,
        };
      }
    }
    if (dataToUpdate.email) {
      // Note: includes null if email was cleared
      const existingEmail = await prisma.account.findFirst({
        where: { email: dataToUpdate.email, id: { not: id } },
      });
      if (existingEmail) {
        return {
          success: false,
          message: `Email "${dataToUpdate.email}" is already registered.`,
        };
      }
    }

    const updatedAccount = await prisma.account.update({
      where: { id },
      data: dataToUpdate,
    });

    revalidatePath("/customize");
    // Exclude password from returned data
    const { password: _, ...returnData } = updatedAccount;
    return {
      success: true,
      data: returnData,
      message: "Account updated successfully.",
    };
  } catch (error: any) {
    console.error(`Update Account Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Account not found." };
    }
    if (
      error.code === "P2003" &&
      error.meta?.field_name?.includes("branchId")
    ) {
      return { success: false, message: "Selected Branch does not exist." };
    }
    // Catch potential unique constraint violation if checks above somehow fail concurrently
    if (error.code === "P2002") {
      const target = error.meta?.target as string[] | undefined;
      if (target?.includes("username"))
        return { success: false, message: "Username already taken." };
      if (target?.includes("email"))
        return { success: false, message: "Email already registered." };
    }
    return {
      success: false,
      message: "Database error: Failed to update account.",
    };
  }
}

// --- Delete Account Action ---
export async function deleteAccountAction(id: string) {
  if (!id) return { success: false, message: "Account ID is required." };

  try {
    // Add dependency checks if needed (e.g., if account served/checked services)
    // const servedCount = await prisma.availedService.count({ where: { servedById: id } });
    // const checkedCount = await prisma.availedService.count({ where: { checkedById: id } });
    // if (servedCount > 0 || checkedCount > 0) {
    //     return { success: false, message: 'Cannot delete account. It is associated with past services.' };
    // }

    await prisma.account.delete({ where: { id } });

    revalidatePath("/customize");
    return { success: true, message: "Account deleted successfully." };
  } catch (error: any) {
    console.error(`Delete Account Action Error (ID: ${id}):`, error);
    if (error.code === "P2025") {
      return { success: false, message: "Account not found." };
    }
    return {
      success: false,
      message: "Database error: Failed to delete account.",
    };
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
