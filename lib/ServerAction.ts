"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import { PrismaClient, Status } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";
import {
  AccountData,
  SalaryBreakdownItem,
  SALARY_COMMISSION_RATE,
} from "./Types";
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
