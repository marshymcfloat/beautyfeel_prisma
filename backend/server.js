const express = require("express");
const { PrismaClient, Status } = require("@prisma/client"); // Import Status enum
const { createServer } = require("http");
const { Server } = require("socket.io");

const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3000", // Adjust if your frontend runs elsewhere
    methods: ["GET", "POST", "PATCH", "PUT"], // Allow necessary methods
  },
});

// --- State Management ---
// Track pending selections (using checkedById now)
const pendingCheckSelections = new Map(); // Use Map for easier management: key -> accountId
// Track timers for transaction completion
const transactionCompletionTimers = new Map(); // transactionId -> NodeJS.Timeout

const COMPLETION_DELAY = 3 * 60 * 1000; // 3 minutes in milliseconds
const SALARY_COMMISSION_RATE = 0.1; // 10%

// --- Helper Functions ---

/**
 * Checks if all availed services in a transaction are served and starts/cancels timer.
 * @param {string} transactionId
 */
async function checkAndManageCompletionTimer(transactionId) {
  try {
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: {
        availedServices: true,
      },
    });

    if (!transaction || transaction.status !== Status.PENDING) {
      // Transaction not found or already completed/cancelled
      cancelCompletionTimer(transactionId); // Ensure no lingering timer
      return;
    }

    const allServed =
      transaction.availedServices.length > 0 && // Must have at least one service
      transaction.availedServices.every((as) => !!as.servedById);

    if (allServed) {
      // All services are marked as served, start or refresh the timer
      console.log(
        `[${transactionId}] All services served. Starting completion timer.`,
      );
      startCompletionTimer(transactionId);
    } else {
      // Not all services are served, cancel any existing timer
      console.log(
        `[${transactionId}] Not all services served. Cancelling timer.`,
      );
      cancelCompletionTimer(transactionId);
    }
  } catch (error) {
    console.error(
      `Error checking completion status for transaction ${transactionId}:`,
      error,
    );
    cancelCompletionTimer(transactionId); // Cancel timer on error
  }
}

/**
 * Starts or restarts the completion timer for a transaction.
 * @param {string} transactionId
 */
function startCompletionTimer(transactionId) {
  // Clear existing timer for this transaction, if any
  cancelCompletionTimer(transactionId);

  const timerId = setTimeout(async () => {
    console.log(
      `[${transactionId}] Completion timer fired. Verifying and completing...`,
    );
    // Remove timer from map *before* async operation
    transactionCompletionTimers.delete(transactionId);
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);

  transactionCompletionTimers.set(transactionId, timerId);
}

/**
 * Cancels the completion timer for a transaction.
 * @param {string} transactionId
 */
function cancelCompletionTimer(transactionId) {
  if (transactionCompletionTimers.has(transactionId)) {
    clearTimeout(transactionCompletionTimers.get(transactionId));
    transactionCompletionTimers.delete(transactionId);
    console.log(`[${transactionId}] Completion timer cancelled.`);
  }
}

/**
 * Marks the transaction as DONE and calculates/updates salaries.
 * @param {string} transactionId
 */
async function completeTransactionAndCalculateSalary(transactionId) {
  try {
    // Use a transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-verify: Fetch transaction and check if STILL all served and PENDING
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          availedServices: true,
        },
      });

      // Important Check: Only proceed if still pending and all served
      if (
        !transaction ||
        transaction.status !== Status.PENDING ||
        !transaction.availedServices.every((as) => !!as.servedById)
      ) {
        console.log(
          `[${transactionId}] Completion aborted. Status changed or service un-served during delay.`,
        );
        // No need to throw error, just exit the transaction block
        return null;
      }

      // 2. Update Transaction Status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { status: Status.DONE },
      });
      console.log(`[${transactionId}] Status updated to DONE.`);

      // 3. Calculate and Update Salaries
      const salaryUpdates = new Map(); // accountId -> commissionToAdd

      for (const availedService of transaction.availedServices) {
        if (availedService.servedById) {
          // Calculate commission (ensure integer math if salary is Int)
          const commission = Math.floor(
            availedService.price * SALARY_COMMISSION_RATE,
          ); // Use availedService.price snapshot
          if (commission > 0) {
            salaryUpdates.set(
              availedService.servedById,
              (salaryUpdates.get(availedService.servedById) || 0) + commission,
            );
          }
        }
      }

      // 4. Apply Salary Updates atomically
      for (const [accountId, commissionToAdd] of salaryUpdates.entries()) {
        await tx.account.update({
          where: { id: accountId },
          data: {
            salary: {
              increment: commissionToAdd,
            },
          },
        });
        console.log(
          `[${transactionId}] Added ${commissionToAdd} commission to Account ${accountId}`,
        );
      }

      return updatedTransaction; // Return the updated transaction from the block
    }); // End prisma.$transaction

    if (result) {
      // Broadcast transaction completion if successful
      io.emit("transactionCompleted", result); // Send the updated transaction
    }
  } catch (error) {
    console.error(
      `Error completing transaction ${transactionId} and calculating salary:`,
      error,
    );
    // Decide on error handling - maybe set transaction status to an ERROR state?
  }
}

// --- Socket.IO Event Handlers ---

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Renamed from selectService to reflect it's about 'checking'
  socket.on(
    "checkService",
    async ({ availedServiceId, transactionId, accountId }) => {
      // Use availedServiceId as the unique identifier for locking
      const selectionKey = availedServiceId;

      // Check if this specific availedService is already being processed for checking
      if (pendingCheckSelections.has(selectionKey)) {
        socket.emit("serviceCheckError", {
          availedServiceId,
          message:
            "This service item is currently being processed by another user.",
        });
        return;
      }

      try {
        // Mark this availedService as being processed (checked)
        pendingCheckSelections.set(selectionKey, accountId); // Store who is checking

        // 1. Fetch account details (optional, could just use accountId)
        const account = await prisma.account.findUnique({
          where: { id: accountId },
          select: { id: true }, // Only need ID
        });

        if (!account) {
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: "Account not found.",
          });
          return;
        }

        // 2. Attempt to claim the check atomically
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            // transactionId: transactionId, // ID should be unique enough
            checkedById: null, // *** IMPORTANT: Only update if not already checked ***
          },
          data: {
            checkedById: account.id,
          },
          include: {
            // Include necessary relations for frontend update
            service: true,
            checkedBy: { select: { id: true, name: true } }, // Include checker details
            servedBy: { select: { id: true, name: true } }, // Include server details
          },
        });

        // 3. Broadcast success
        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} checked by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
      } catch (error) {
        console.error("Error checking service:", error);

        // Handle specific race condition error (P2025: Record not found/condition not met)
        if (error.code === "P2025") {
          // Fetch the current state to see who checked it
          const currentService = await prisma.availedService.findUnique({
            where: { id: availedServiceId },
            include: { checkedBy: { select: { name: true } } },
          });
          const checkerName = currentService?.checkedBy?.name || "another user";
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: `Service was already checked by ${checkerName}.`,
          });
        } else {
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: "An error occurred while checking the service.",
          });
        }
      } finally {
        // Remove the lock regardless of outcome
        pendingCheckSelections.delete(selectionKey);
      }
    },
  );

  // Handle unchecking a service
  socket.on(
    "uncheckService",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        // Attempt to uncheck, only if the current user is the one who checked it
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            checkedById: accountId, // *** IMPORTANT: Only allow owner to uncheck ***
          },
          data: {
            checkedById: null,
          },
          include: {
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        // Broadcast the update to all clients
        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} unchecked by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
      } catch (error) {
        // P2025 means either service not found OR checkedById didn't match
        if (error.code !== "P2025") {
          console.error("Error unchecking service:", error);
          socket.emit("serviceUncheckError", {
            availedServiceId,
            message: "An error occurred while unchecking the service.",
          });
        } else {
          // Optionally inform user if they weren't the checker
          console.log(
            `[${transactionId}] Failed to uncheck ${availedServiceId} by ${accountId} (likely not the checker or already unchecked).`,
          );
        }
      }
    },
  );

  // --- NEW: Handle marking a service as SERVED ---
  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        // Allow marking as served even if already served (idempotent)
        // Or add servedById: null to where clause if only possible once
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
          },
          data: {
            servedById: accountId, // The account performing the action IS the server
          },
          include: {
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} marked as served by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);

        // Check if the transaction might be complete now
        await checkAndManageCompletionTimer(transactionId);
      } catch (error) {
        console.error("Error marking service as served:", error);
        if (error.code === "P2025") {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "Service item not found.",
          });
        } else {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "An error occurred while marking the service as served.",
          });
        }
      }
    },
  );

  // --- NEW: Handle UN-marking a service as SERVED ---
  socket.on(
    "unmarkServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        // Only allow the account who served it to unmark it
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            servedById: accountId, // *** IMPORTANT: Only server can unmark ***
          },
          data: {
            servedById: null,
          },
          include: {
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} unmarked as served by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);

        // Service was un-served, ensure completion timer is cancelled
        cancelCompletionTimer(transactionId); // More direct than calling checkAndManage...
      } catch (error) {
        if (error.code === "P2025") {
          // Record not found OR servedById didn't match
          console.log(
            `[${transactionId}] Failed to unmark ${availedServiceId} as served by ${accountId} (likely not server or already unmarked).`,
          );
          // Optionally notify user they cannot perform this action
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message:
              "You did not mark this service as served or it's already unmarked.",
          });
        } else {
          console.error("Error unmarking service as served:", error);
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: "An error occurred while unmarking the service as served.",
          });
        }
      }
    },
  );

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
    // Optional: Clean up pending selections if a user disconnects abruptly?
    // This is complex as they might reconnect or another user might take over.
    // For simplicity, we rely on the timeout/error handling in the check logic.
  });
});

const PORT = 4000;
httpServer.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
