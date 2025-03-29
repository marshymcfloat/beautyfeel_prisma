"use server";

import { formatName } from "./utils";
import { compare } from "bcryptjs";
import { PrismaClient, Status } from "@prisma/client";
const prisma = new PrismaClient();

/* interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string;
  servicesAvailed: ServiceProps[];
  serviceType: "single" | "set";
  voucherCode: string;
  serveTime: "now" | "later";
  paymentMethod: "ewallet" | "cash" | "bank";
  grandTotal: number;
  totalDiscount: number;
} */

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

type CashierState = {
  name: string;
  date: string | null; // Assuming date/time might be null if 'serveTime' is 'now'
  time: string | null;
  serveTime: "now" | "later";
  email: string | null; // Allow null
  servicesAvailed: ServiceAvailed[];
  voucherCode: string | null;
  paymentMethod: "cash" | "ewallet" | "bank" | string; // Keep flexible or use enum type
  grandTotal: number;
  totalDiscount: number;
};

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

/* export async function transactionSubmission(transactionForm: CashierState) {
  try {
    console.log(transactionForm);

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
    } = transactionForm;

    // Validation logic
    const errors: Record<string, string> = {};

    if (!name.trim()) errors.name = "Customer name is required.";
    if (
      !email.trim() ||
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email)
    ) {
      errors.email = "Valid email is required.";
    }
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service must be selected.";
    }
    if (!["cash", "ewallet", "bank"].includes(paymentMethod)) {
      errors.paymentMethod = "Invalid payment method selected.";
    }
    if (serveTime === "later" && (!date || !time)) {
      errors.serveTime = "Date and time are required for later service.";
    }

    if (Object.keys(errors).length > 0) {
      return { success: false, errors };
    }

    const newlyFormattedName = formatName(name);

    // Parse bookedFor DateTime
    let bookedFor = new Date();
    if (date && time) {
      bookedFor = new Date(`${date}T${time}:00`);
    }

    // Find existing customer
    let customer = await prisma.customer.findFirst({
      where: { name: newlyFormattedName },
    });

    // Create a new customer if not found
    if (!customer) {
      customer = await prisma.customer.create({
        data: { name: newlyFormattedName, email },
      });
    }

    // Check for a valid voucher
    let voucher = null;
    if (voucherCode) {
      voucher = await prisma.voucher.findUnique({
        where: { code: voucherCode },
      });

      if (voucher) {
        // Update voucher usage
        await prisma.voucher.update({
          where: { code: voucherCode },
          data: { usedAt: new Date() },
        });
      } else {
        return {
          success: false,
          errors: { voucherCode: "Invalid voucher code." },
        };
      }
    }

    // Create transaction with all related data
    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          paymentMethod,
          grandTotal,
          discount: totalDiscount,
          status: "PENDING",
          bookedFor,
          voucherId: voucher ? voucher.id : null,
        },
      });

      // Add availed services
      await Promise.all(
        servicesAvailed.map((service) =>
          tx.availedService.create({
            data: {
              transactionId: transaction.id,
              serviceId: service.id,
              quantity: service.quantity,
              price: service.price,
            },
          }),
        ),
      );
    });

    console.log("Transaction successfully created!");
    return { success: true };
  } catch (error) {
    console.error("Error submitting transaction:", error);
    return {
      success: false,
      errors: { general: "An error occurred while processing your request." },
    };
  }
} */

export async function transactionSubmission(transactionForm: CashierState) {
  try {
    console.log("Received Transaction Form:", transactionForm);

    const {
      name,
      date,
      time,
      serveTime,
      email, // email can be null or empty string
      servicesAvailed,
      voucherCode,
      paymentMethod,
      grandTotal,
      totalDiscount,
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
      trimmedEmail && // Only validate if email is not empty
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(trimmedEmail)
    ) {
      // Updated error message for optional field
      errors.email = "Please enter a valid email format or leave it blank.";
    }

    // MANDATORY: Services Availed
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service must be selected.";
      // You might want to display this error near the services section in the UI
      // Adding a general error for now if not displayed elsewhere
      if (!errors.general)
        errors.general = "Please select at least one service.";
    }

    // Payment Method validation (keeping as is)
    if (
      !paymentMethod ||
      !["cash", "ewallet", "bank"].includes(paymentMethod)
    ) {
      errors.paymentMethod = "Invalid payment method selected.";
      if (!errors.general) errors.general = "Please select a payment method.";
    }

    // Serve Time validation (keeping as is)
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
    const newlyFormattedName = formatName(name.trim()); // Trim name here

    // Prepare email data for Prisma: use null if empty/whitespace
    // This helps with the unique constraint (NULLs are usually not unique)
    const customerEmailData = trimmedEmail.length > 0 ? trimmedEmail : null;

    // Parse bookedFor DateTime
    let bookedFor = new Date(); // Default to now
    if (serveTime === "later" && date && time) {
      // Basic parsing, consider timezone handling if needed
      try {
        bookedFor = new Date(`${date}T${time}:00`);
        // Add basic validation if the date is invalid
        if (isNaN(bookedFor.getTime())) {
          throw new Error("Invalid date/time format");
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
      // Find existing customer primarily by name
      let customer = await tx.customer.findFirst({
        where: { name: newlyFormattedName },
        // Optionally include email check if you want exact match, but requirement is name-based
        // where: { name: newlyFormattedName, email: customerEmailData },
      });

      // Create a new customer if not found by name
      if (!customer) {
        console.log(
          `Customer "${newlyFormattedName}" not found, creating new one.`,
        );
        try {
          customer = await tx.customer.create({
            data: {
              name: newlyFormattedName,
              email: customerEmailData, // Store null if email was empty
              // totalPaid: 0, // Handled by default
            },
          });
          console.log("New customer created:", customer);
        } catch (createError: any) {
          // Catch potential unique constraint violation if email is NOT NULL and already exists
          if (
            createError.code === "P2002" &&
            createError.meta?.target?.includes("email")
          ) {
            console.error(
              "Unique constraint failed for email:",
              customerEmailData,
            );
            // Return specific error related to email uniqueness
            throw new Error(
              `The email "${customerEmailData}" is already associated with another customer.`,
            );
          }
          // Rethrow other errors
          throw createError;
        }
      } else {
        console.log("Found existing customer:", customer);
        // OPTIONAL: Update existing customer's email if provided and different?
        // if (customerEmailData && customer.email !== customerEmailData) {
        //   await tx.customer.update({
        //     where: { id: customer.id },
        //     data: { email: customerEmailData },
        //   });
        // }
      }

      // Check for a valid voucher (handle potential errors)
      let voucher = null;
      if (voucherCode) {
        voucher = await tx.voucher.findUnique({
          where: { code: voucherCode },
        });

        if (voucher) {
          if (voucher.usedAt) {
            // Voucher already used - throw error to be caught by outer catch
            throw new Error(`Voucher "${voucherCode}" has already been used.`);
          }
          // Update voucher usage - moved inside transaction
          await tx.voucher.update({
            where: { id: voucher.id }, // Use ID for reliability
            data: { usedAt: new Date() },
          });
          console.log(`Voucher "${voucherCode}" marked as used.`);
        } else {
          // Invalid voucher - throw error to be caught by outer catch
          throw new Error(`Invalid voucher code "${voucherCode}".`);
        }
      }

      // Create the main transaction record
      const transaction = await tx.transaction.create({
        data: {
          customerId: customer.id,
          paymentMethod: paymentMethod, // Ensure paymentMethod is valid type
          grandTotal,
          discount: totalDiscount,
          status: "PENDING", // Default status
          bookedFor,
          voucherId: voucher ? voucher.id : null,
          // Assuming branchId needs to be linked, how is it determined?
          // Needs to be added here, e.g., from user session, selected services, etc.
          // branchId: 'YOUR_BRANCH_ID_LOGIC_HERE', // Placeholder - THIS IS IMPORTANT
        },
      });
      console.log("Transaction record created:", transaction.id);

      // Add availed services (ensure service IDs/prices are correct)
      const availedServiceCreations = servicesAvailed.map((service) => {
        // Validate service data here if needed
        if (
          !service.id ||
          typeof service.quantity !== "number" ||
          typeof service.price !== "number"
        ) {
          throw new Error(
            `Invalid service data provided for service ID: ${service.id}`,
          );
        }
        return tx.availedService.create({
          data: {
            transactionId: transaction.id,
            serviceId: service.id,
            quantity: service.quantity,
            price: service.price, // Price snapshot at time of transaction
            // checkedById / servedById would be assigned later presumably
          },
        });
      });

      await Promise.all(availedServiceCreations);
      console.log(`${servicesAvailed.length} availed services linked.`);

      // Optionally: Update Customer's totalPaid or nextAppointment if needed
      // await tx.customer.update({
      //   where: { id: customer.id },
      //   data: { totalPaid: { increment: grandTotal } },
      // });

      return transaction; // Return the created transaction
    }); // End of prisma.$transaction

    console.log("Transaction successfully created! ID:", result.id);
    return { success: true, transactionId: result.id }; // Return success and potentially ID
  } catch (error: unknown) {
    // Use unknown instead of any
    console.error("Error submitting transaction:", error);

    // Initialize errors as the correct type
    const errors: Record<string, string> = {};
    let specificErrorHandled = false;

    // Check the error type before accessing properties
    if (error instanceof Error) {
      // Handle specific error messages precisely
      if (
        error.message.includes("voucher code") ||
        error.message.includes("already been used")
      ) {
        errors.voucherCode = error.message; // Assign only the relevant error
        specificErrorHandled = true;
      } else if (error.message.includes("associated with another customer")) {
        errors.email = error.message; // Assign only the relevant error
        specificErrorHandled = true;
      } else if (error.message.includes("Invalid date or time")) {
        errors.serveTime = error.message; // Assign only the relevant error
        specificErrorHandled = true;
      }
      // Add more specific checks if needed
    }

    // If no specific error was identified, use a general message
    if (!specificErrorHandled) {
      errors.general = "An error occurred while processing your request.";
      // Optionally add more detail from the original error if safe
      // if (error instanceof Error) {
      //    errors.general += ` Details: ${error.message}`;
      // }
    }

    // Always return an object matching the expected structure
    // Note: We return errors: errors, not errors: { general: errorMessage } unless that's the only error
    return {
      success: false,
      errors: errors, // Return the constructed errors object
    };
  }
}

/* export async function getActiveTransactions() {
  const activeTransactions = await prisma.transaction.findMany({
    where: {
      status: "PENDING",
    },
    include: {
      customer: true,
      availedServices: {
        include: {
          service: true, // Include the related service details
        },
      },
    },
  });

  return activeTransactions;
}
 */

export async function getActiveTransactions() {
  try {
    // Add try...catch for error handling
    const activeTransactions = await prisma.transaction.findMany({
      where: {
        status: Status.PENDING, // Use the imported Status enum
      },
      include: {
        customer: {
          // Include customer details
          select: {
            // Select only needed customer fields
            id: true,
            name: true,
            email: true,
            // Add other fields if needed by the CustomerProp type
            totalPaid: true, // Example if needed
            nextAppointment: true, // Example if needed
          },
        },
        availedServices: {
          include: {
            service: {
              // Include the related service details
              select: {
                // Select only necessary service fields
                id: true,
                title: true,
              },
            },
            // --- ADD THESE ---
            checkedBy: {
              // Include the account that checked the service
              select: {
                // Select only necessary account fields
                id: true,
                name: true,
              },
            },
            servedBy: {
              // Include the account that served the service
              select: {
                // Select only necessary account fields
                id: true,
                name: true,
              },
            },
            // --- END ADD ---
          },
          orderBy: {
            // Optional: Order services consistently
            service: {
              title: "asc",
            },
          },
        },
        // Include voucherUsed if needed based on TransactionProps type
        // voucherUsed: { select: { code: true, value: true } } // Example
      },
      orderBy: {
        // Optional: Order transactions
        bookedFor: "asc", // Order by booking time ascending
      },
    });

    // Prisma returns Date objects, should be fine for direct use in React Server Components
    // or if passed correctly to Client Components.
    // If you encounter serialization issues ('cannot be passed from server to client'),
    // you might need to stringify/parse or use a library like superjson.
    return activeTransactions;
  } catch (error) {
    console.error("Error fetching active transactions:", error);
    // Depending on how you want to handle errors in the UI:
    // Option 1: Return empty array
    // return [];
    // Option 2: Re-throw the error to be caught higher up or by Next.js error handling
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
