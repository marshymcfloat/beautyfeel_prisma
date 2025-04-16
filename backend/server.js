// server/index.js
// --- Required Modules ---
const express = require("express");
const { PrismaClient, Status } = require("@prisma/client"); // Status enum IS needed
const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

// --- Environment & Initialization ---
const PORT = process.env.PORT || 9000;
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
const COMPLETION_DELAY = 3 * 60 * 1000; // 3 minutes

if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  process.exit(1);
}
const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.error(`CORS: Blocking origin: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PATCH", "PUT"],
  },
});

// --- State Management ---
const pendingCheckSelections = new Map(); // availedServiceId -> accountId (Transient lock for checkService)
const transactionCompletionTimers = new Map(); // transactionId -> NodeJS.Timeout

// --- Helper Functions ---
function cancelCompletionTimer(transactionId) {
  if (transactionCompletionTimers.has(transactionId)) {
    clearTimeout(transactionCompletionTimers.get(transactionId));
    transactionCompletionTimers.delete(transactionId);
    console.log(`[${transactionId}] Completion timer CANCELLED.`); // Clearer log
  }
}

async function checkAndManageCompletionTimer(transactionId) {
  console.log(
    `[${transactionId}] checkAndManageCompletionTimer: Checking status...`,
  );
  try {
    // Fetch fresh transaction status and services' status
    const transaction = await prisma.transaction.findUnique({
      where: { id: transactionId },
      include: { availedServices: { select: { status: true } } },
    });

    // Ensure transaction exists and is still PENDING
    if (!transaction || transaction.status !== Status.PENDING) {
      console.log(
        `[${transactionId}] checkAndManageCompletionTimer: Transaction not found or status is not PENDING (${transaction?.status}). Cancelling any existing timer.`,
      );
      cancelCompletionTimer(transactionId); // Cancel if state changed
      return;
    }

    // Check if ALL services are DONE
    const allDone =
      transaction.availedServices.length > 0 &&
      transaction.availedServices.every((as) => as.status === Status.DONE);
    console.log(
      `[${transactionId}] checkAndManageCompletionTimer: All services DONE? ${allDone}`,
    );

    if (allDone) {
      // Start timer ONLY if it's not already running for this transaction
      if (!transactionCompletionTimers.has(transactionId)) {
        console.log(
          `[${transactionId}] checkAndManageCompletionTimer: All DONE. Starting completion timer.`,
        );
        startCompletionTimer(transactionId);
      } else {
        console.log(
          `[${transactionId}] checkAndManageCompletionTimer: All DONE, but timer already exists. Taking no action.`,
        );
      }
    } else {
      // If not all services are done, ensure any existing timer is actively cancelled
      console.log(
        `[${transactionId}] checkAndManageCompletionTimer: Not all DONE. Ensuring timer is cancelled.`,
      );
      cancelCompletionTimer(transactionId);
    }
  } catch (error) {
    console.error(
      `[${transactionId}] Error in checkAndManageCompletionTimer:`,
      error,
    );
    // Cancel timer on any error during check as a precaution
    cancelCompletionTimer(transactionId);
  }
}

function startCompletionTimer(transactionId) {
  // Double-check and clear any existing timer before setting a new one
  cancelCompletionTimer(transactionId);

  console.log(
    `[${transactionId}] Setting completion timer for ${COMPLETION_DELAY / 1000}s.`,
  );
  const timerId = setTimeout(async () => {
    console.log(
      `[${transactionId}] Completion timer FIRED. Processing final completion...`,
    );
    // Delete the timer ID *before* starting the async operation
    // If the operation fails, we don't want the timer lingering in the map
    transactionCompletionTimers.delete(transactionId);
    await completeTransactionAndCalculateSalary(transactionId);
  }, COMPLETION_DELAY);

  transactionCompletionTimers.set(transactionId, timerId);
}

async function completeTransactionAndCalculateSalary(transactionId) {
  console.log(
    `[${transactionId}] completeTransactionAndCalculateSalary: Starting atomic transaction.`,
  );
  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-verify conditions *inside* the atomic transaction
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: {
          availedServices: {
            select: {
              id: true,
              servedById: true,
              status: true,
              commissionValue: true,
            },
          },
        },
      });

      // Strict check: Must exist, be PENDING, and have all services DONE
      const allServicesDone =
        transaction?.availedServices?.length > 0 &&
        transaction.availedServices.every((as) => as.status === Status.DONE);

      if (
        !transaction ||
        transaction.status !== Status.PENDING ||
        !allServicesDone
      ) {
        console.warn(
          `[${transactionId}] completeTransactionAndCalculateSalary: Final check FAILED inside transaction. Aborting. Status: ${transaction?.status}, All Done: ${allServicesDone}`,
        );
        // No need to cancel timer here as it was deleted before calling this function
        return null; // Signal abortion of this $transaction block
      }

      // 2. Update Transaction Status
      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { status: Status.DONE },
        // Include everything needed for the final broadcast message
        include: {
          customer: { select: { id: true, name: true } },
          availedServices: {
            include: {
              service: { select: { id: true, title: true } },
              checkedBy: { select: { id: true, name: true } },
              servedBy: { select: { id: true, name: true } },
            },
          },
        },
      });
      console.log(
        `[${transactionId}] completeTransactionAndCalculateSalary: Transaction status updated to DONE in DB.`,
      );

      // 3. Calculate & Apply Salary Updates
      const salaryUpdates = new Map(); // Explicit type

      for (const availedService of transaction.availedServices) {
        if (availedService.servedById && availedService.commissionValue > 0) {
          const serverId = availedService.servedById;
          salaryUpdates.set(
            serverId,
            (salaryUpdates.get(serverId) || 0) + availedService.commissionValue,
          );
        }
      }

      if (salaryUpdates.size > 0) {
        console.log(
          `[${transactionId}] completeTransactionAndCalculateSalary: Applying salary increments for ${salaryUpdates.size} accounts.`,
        );
        // Perform updates concurrently
        await Promise.all(
          Array.from(salaryUpdates.entries()).map(([accountId, amount]) =>
            tx.account
              .update({
                where: { id: accountId },
                data: { salary: { increment: amount } },
              })
              .catch((err) => {
                // Add individual error handling for salary update
                console.error(
                  `[${transactionId}] Failed to update salary for account ${accountId}:`,
                  err,
                );
                // Decide if this should fail the whole transaction or just log
                // For now, we let the $transaction handle rollback on error
                throw new Error(
                  `Salary update failed for account ${accountId}`,
                );
              }),
          ),
        );
        console.log(
          `[${transactionId}] completeTransactionAndCalculateSalary: Salary increments applied successfully.`,
        );
      } else {
        console.log(
          `[${transactionId}] completeTransactionAndCalculateSalary: No salary updates needed.`,
        );
      }
      return updatedTransaction; // Success, return data for broadcast
    }); // End prisma.$transaction

    // If $transaction was successful (didn't throw and didn't return null)
    if (result) {
      io.emit("transactionCompleted", result); // Broadcast SUCCESS
      console.log(
        `[${transactionId}] Transaction successfully completed and broadcasted.`,
      );
    } else {
      console.log(
        `[${transactionId}] Transaction completion aborted due to final checks.`,
      );
    }
  } catch (error) {
    console.error(
      `[${transactionId}] CRITICAL error during completeTransactionAndCalculateSalary:`,
      error,
    );
    // Consider emitting a specific error event for monitoring if needed
    // io.to('admin_room').emit('completion_error', { transactionId, message: error.message });
  }
}

// --- Express Route ---
app.get("/", (req, res) => res.status(200).send("Backend Server is Running"));

// --- Socket.IO Connections ---
io.on("connection", (socket) => {
  const clientId = socket.id;
  const clientIp = socket.handshake.address; // Get client IP for logging
  console.log(`Client connected: ${clientId} from ${clientIp}`);
  // Get accountId from query, useful for logging/debugging
  const connectedAccountId = socket.handshake.query?.accountId || "N/A";
  console.log(` -> Associated Account ID (from query): ${connectedAccountId}`);

  // --- checkService Handler ---
  socket.on(
    "checkService",
    async ({ availedServiceId, transactionId, accountId }) => {
      // Basic validation
      if (!availedServiceId || !transactionId || !accountId) {
        console.error(`[${clientId}] Invalid payload for checkService:`, {
          availedServiceId,
          transactionId,
          accountId,
        });
        socket.emit("serviceCheckError", {
          availedServiceId,
          message: "Invalid request data.",
        });
        return;
      }
      console.log(
        `[${clientId}] Received checkService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      const selectionKey = availedServiceId;

      // Check Lock
      if (pendingCheckSelections.has(selectionKey)) {
        const lockerId = pendingCheckSelections.get(selectionKey);
        console.warn(
          `[${clientId}] checkService BLOCKED for ${availedServiceId} (locked by Acc ${lockerId})`,
        );
        // Fetch name for better error message if possible without compromising speed much
        const lockerAccount = await prisma.account
          .findUnique({ where: { id: lockerId }, select: { name: true } })
          .catch(() => null);
        socket.emit("serviceCheckError", {
          availedServiceId,
          message: `Item locked by ${lockerAccount?.name || "another user"}.`,
        });
        return;
      }

      try {
        pendingCheckSelections.set(selectionKey, accountId); // Acquire lock

        // Attempt update with strict conditions
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            checkedById: null,
            status: Status.PENDING,
          },
          data: { checkedById: accountId },
          include: {
            service: { select: { id: true, title: true } },
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${clientId}] checkService SUCCESS for ${availedServiceId} by ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
      } catch (error) {
        console.error(
          `[${clientId}] checkService ERROR for ${availedServiceId}:`,
          error.code,
          error.message,
        );
        // Handle specific Prisma "Record not found" error
        if (error.code === "P2025") {
          const currentService = await prisma.availedService.findUnique({
            where: { id: availedServiceId },
            include: {
              checkedBy: { select: { name: true } },
              servedBy: { select: { name: true } },
            },
          });
          let message = "Service not found or not pending.";
          if (currentService?.checkedById)
            message = `Already checked by ${currentService.checkedBy?.name ?? "another user"}.`;
          else if (currentService?.servedById)
            message = `Already served by ${currentService.servedBy?.name ?? "another user"}. Cannot check.`;
          socket.emit("serviceCheckError", { availedServiceId, message });
        } else {
          // Generic error
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: "Error checking service.",
          });
        }
      } finally {
        pendingCheckSelections.delete(selectionKey); // ALWAYS release lock
        console.log(
          `[${clientId}] checkService UNLOCKED for ${availedServiceId}`,
        );
      }
    },
  );

  // --- uncheckService Handler ---
  socket.on(
    "uncheckService",
    async ({ availedServiceId, transactionId, accountId }) => {
      if (!availedServiceId || !transactionId || !accountId) {
        /* ... basic validation ... */ return;
      }
      console.log(
        `[${clientId}] Received uncheckService: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      try {
        // Strict condition: Must be checked by THIS account and still PENDING
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            checkedById: accountId,
            status: Status.PENDING,
          },
          data: { checkedById: null }, // Set back to null
          include: {
            service: { select: { id: true, title: true } },
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });
        console.log(
          `[${clientId}] uncheckService SUCCESS for ${availedServiceId} by ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
      } catch (error) {
        console.error(
          `[${clientId}] uncheckService ERROR for ${availedServiceId}:`,
          error.code,
          error.message,
        );
        if (error.code === "P2025") {
          socket.emit("serviceUncheckError", {
            availedServiceId,
            message: "Cannot uncheck: Not the checker or service not pending.",
          });
        } else {
          socket.emit("serviceUncheckError", {
            availedServiceId,
            message: "Error unchecking service.",
          });
        }
      }
    },
  );

  // --- markServiceServed Handler ---
  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      if (!availedServiceId || !transactionId || !accountId) {
        /* ... basic validation ... */ return;
      }
      console.log(
        `[${clientId}] Received markServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      try {
        // Pre-check for efficiency and better error message
        const serviceToCheck = await prisma.availedService.findUnique({
          where: { id: availedServiceId },
          select: {
            status: true,
            servedById: true,
            servedBy: { select: { name: true } },
          },
        });
        if (!serviceToCheck) {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "Service not found.",
          });
          return;
        }
        if (serviceToCheck.status === Status.DONE) {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: `Already served by ${serviceToCheck.servedBy?.name ?? "someone"}.`,
          });
          return;
        }
        if (serviceToCheck.status !== Status.PENDING) {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: `Cannot mark served, status is ${serviceToCheck.status}.`,
          });
          return;
        }

        // Proceed with update
        const updatedAvailedService = await prisma.availedService.update({
          where: { id: availedServiceId }, // Condition checked above
          data: {
            servedById: accountId,
            status: Status.DONE,
            completedAt: new Date(),
          },
          include: {
            service: { select: { id: true, title: true } },
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });
        console.log(
          `[${clientId}] markServiceServed SUCCESS for ${availedServiceId} by ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
        // Check if transaction can now start completion timer AFTER successful update & broadcast
        await checkAndManageCompletionTimer(transactionId);
      } catch (error) {
        // Catch errors during the update itself
        console.error(
          `[${clientId}] markServiceServed ERROR for ${availedServiceId}:`,
          error.code,
          error.message,
        );
        // P2025 might occur if deleted between check and update (unlikely but possible)
        if (error.code === "P2025") {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "Service was not found during update.",
          });
        } else {
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "Error marking service served.",
          });
        }
      }
    },
  );

  // --- unmarkServiceServed Handler ---
  socket.on(
    "unmarkServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      if (!availedServiceId || !transactionId || !accountId) {
        /* ... basic validation ... */ return;
      }
      console.log(
        `[${clientId}] Received unmarkServiceServed: AS_ID=${availedServiceId}, TX_ID=${transactionId}, ACC_ID=${accountId}`,
      );
      try {
        // Pre-check conditions
        const serviceToCheck = await prisma.availedService.findUnique({
          where: { id: availedServiceId },
          select: { status: true, servedById: true },
        });
        if (!serviceToCheck) throw new Error("Service not found."); // Handled below
        if (serviceToCheck.status !== Status.DONE)
          throw new Error(`Cannot unmark, status is ${serviceToCheck.status}.`);
        if (serviceToCheck.servedById !== accountId)
          throw new Error("Not the user who served this item.");

        // Proceed with update
        const updatedAvailedService = await prisma.availedService.update({
          where: { id: availedServiceId }, // Conditions already checked
          data: { servedById: null, status: Status.PENDING, completedAt: null },
          include: {
            service: { select: { id: true, title: true } },
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          }, // servedBy will be null
        });
        console.log(
          `[${clientId}] unmarkServiceServed SUCCESS for ${availedServiceId} by ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService);
        // Always cancel timer when unmarking
        cancelCompletionTimer(transactionId);
      } catch (error) {
        console.error(
          `[${clientId}] unmarkServiceServed ERROR for ${availedServiceId}:`,
          error.code,
          error.message,
        );
        // Handle specific known errors from pre-check
        if (error.message.includes("not found")) {
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: "Service not found.",
          });
        } else if (
          error.message.includes("not DONE") ||
          error.message.includes("Not the user")
        ) {
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: error.message,
          });
        }
        // Handle potential Prisma P2025 error during update
        else if (error.code === "P2025") {
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: "Could not update service (record mismatch).",
          });
        } else {
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: "Error unmarking service.",
          });
        }
      }
    },
  );

  // Handle disconnection
  socket.on("disconnect", (reason) => {
    console.log(
      `Client disconnected: ${clientId}, Account: ${connectedAccountId}, Reason: ${reason}`,
    );
    // Optional: Clean up locks associated with this user if needed (requires mapping socketId to accountId)
    // Example: Iterate pendingCheckSelections and remove entries where value === connectedAccountId
  });

  // Handle connection errors
  socket.on("connect_error", (err) =>
    console.error(`Socket connect_error for ${clientId}: ${err.message}`),
  );
});

// --- Start Server ---
httpServer.listen(PORT, () =>
  console.log(
    `🚀 Server running on port ${PORT}, Allowed origins: ${allowedOrigins.join(", ")}`,
  ),
);

// --- Graceful Shutdown Handler (Complete) ---
const shutdown = (signal) => {
  console.log(`\n${signal} signal received: closing HTTP server`);
  httpServer.close((err) => {
    if (err) {
      console.error("Error closing HTTP server:", err);
    } else {
      console.log("HTTP server closed.");
    }
    io.close((err) => {
      if (err) {
        console.error("Error closing Socket.IO server:", err);
      } else {
        console.log("Socket.IO server closed.");
      }
      console.log("Disconnecting Prisma Client...");
      prisma
        .$disconnect()
        .then(() => {
          console.log("Prisma Client disconnected.");
          process.exit(0);
        })
        .catch((disconnectErr) => {
          console.error("Error disconnecting Prisma:", disconnectErr);
          process.exit(1);
        });
    });
  });
  setTimeout(() => {
    console.error("Graceful shutdown timed out. Forcefully shutting down.");
    process.exit(1);
  }, 10000);
};
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
