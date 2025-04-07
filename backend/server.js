// --- Required Modules ---
const express = require("express");
const { PrismaClient, Status } = require("@prisma/client"); // Ensure Status enum is imported if used directly
const { createServer } = require("http");
const { Server } = require("socket.io");
require("dotenv").config(); // Load .env file for local development (optional)

// --- Environment Variable Setup ---
// PORT: Provided by Render (or similar host), defaults to 4000 for local dev
const PORT = process.env.PORT || 5000;
// CORS_ORIGIN: Comma-separated list of allowed origins (e.g., https://your-frontend.vercel.app,http://localhost:3000)
// Defaults to localhost:3000 for local development convenience
const allowedOrigins = (
  process.env.CORS_ORIGIN || "http://localhost:3000"
).split(",");
// DATABASE_URL: Must be set in the environment for Prisma to connect
if (!process.env.DATABASE_URL) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not set.");
  // process.exit(1); // Optional: exit if DB URL is missing
}

// --- Initialization ---
const prisma = new PrismaClient(); // Prisma automatically uses DATABASE_URL
const app = express(); // Express app (though not heavily used here, good practice)
const httpServer = createServer(app); // HTTP server for Socket.IO

// Configure Socket.IO with dynamic CORS
const io = new Server(httpServer, {
  cors: {
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      // Allow if the origin is in our configured list
      if (!origin || allowedOrigins.includes(origin)) {
        console.log(`CORS: Allowing origin: ${origin || "N/A"}`); // Log allowed origins
        callback(null, true);
      } else {
        console.error(`CORS: Blocking origin: ${origin}`); // Log blocked origins
        callback(new Error("Not allowed by CORS")); // Block the request
      }
    },
    methods: ["GET", "POST", "PATCH", "PUT"], // Specify allowed HTTP methods (usually less relevant for WebSockets but good practice)
    // credentials: true // Uncomment if you need to handle cookies or authorization headers across origins
  },
});

// --- Constants ---
const COMPLETION_DELAY = 3 * 60 * 1000; // 3 minutes in milliseconds
const SALARY_COMMISSION_RATE = 0.1; // 10%

// --- State Management (In-Memory - Consider Redis for Production Robustness) ---
// Track pending selections (using availedServiceId as the key now)
const pendingCheckSelections = new Map(); // availedServiceId -> accountId (who is checking)
// Track timers for transaction completion
const transactionCompletionTimers = new Map(); // transactionId -> NodeJS.Timeout

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
        availedServices: true, // Ensure relation name matches Prisma schema
      },
    });

    if (!transaction || transaction.status !== Status.PENDING) {
      cancelCompletionTimer(transactionId);
      return;
    }

    const allServed =
      transaction.availedServices.length > 0 &&
      transaction.availedServices.every((as) => !!as.servedById);

    if (allServed) {
      console.log(
        `[${transactionId}] All services served. Starting completion timer.`,
      );
      startCompletionTimer(transactionId);
    } else {
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
    cancelCompletionTimer(transactionId);
  }
}

/**
 * Starts or restarts the completion timer for a transaction.
 * @param {string} transactionId
 */
function startCompletionTimer(transactionId) {
  cancelCompletionTimer(transactionId); // Clear existing timer first

  const timerId = setTimeout(async () => {
    console.log(
      `[${transactionId}] Completion timer fired. Verifying and completing...`,
    );
    transactionCompletionTimers.delete(transactionId); // Remove before async operation
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
 * Marks the transaction as DONE and calculates/updates salaries atomically.
 * @param {string} transactionId
 */
async function completeTransactionAndCalculateSalary(transactionId) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id: transactionId },
        include: { availedServices: true },
      });

      if (
        !transaction ||
        transaction.status !== Status.PENDING ||
        !transaction.availedServices.every((as) => !!as.servedById)
      ) {
        console.log(
          `[${transactionId}] Completion aborted. Status changed or service un-served during delay.`,
        );
        return null; // Exit transaction block without error
      }

      const updatedTransaction = await tx.transaction.update({
        where: { id: transactionId },
        data: { status: Status.DONE },
        include: {
          availedServices: {
            include: { service: true, checkedBy: true, servedBy: true },
          },
        }, // Include details for broadcast
      });
      console.log(`[${transactionId}] Status updated to DONE.`);

      const salaryUpdates = new Map();
      for (const availedService of transaction.availedServices) {
        if (availedService.servedById) {
          const commission = Math.floor(
            availedService.price * SALARY_COMMISSION_RATE,
          );
          if (commission > 0) {
            salaryUpdates.set(
              availedService.servedById,
              (salaryUpdates.get(availedService.servedById) || 0) + commission,
            );
          }
        }
      }

      for (const [accountId, commissionToAdd] of salaryUpdates.entries()) {
        await tx.account.update({
          where: { id: accountId },
          data: { salary: { increment: commissionToAdd } },
        });
        console.log(
          `[${transactionId}] Added ${commissionToAdd} commission to Account ${accountId}`,
        );
      }

      return updatedTransaction;
    }); // End prisma.$transaction

    if (result) {
      io.emit("transactionCompleted", result); // Broadcast the successfully updated transaction
      console.log(`[${transactionId}] Broadcasted transaction completion.`);
    }
  } catch (error) {
    console.error(
      `Error completing transaction ${transactionId} and calculating salary:`,
      error,
    );
    // Consider setting transaction status to ERROR or notifying admins
  }
}

// --- Basic Express Route (Optional - Good for Health Checks) ---
app.get("/", (req, res) => {
  res.status(200).send("Backend Server is Running");
});

// --- Socket.IO Event Handlers ---
io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // Check Service (Claiming the 'check' action)
  socket.on(
    "checkService",
    async ({ availedServiceId, transactionId, accountId }) => {
      const selectionKey = availedServiceId; // Use unique ID for locking

      if (pendingCheckSelections.has(selectionKey)) {
        const checkerId = pendingCheckSelections.get(selectionKey);
        console.log(
          `[${transactionId}] Service ${availedServiceId} check blocked. Already being processed by ${checkerId}`,
        );
        // Optionally fetch checker name to provide better feedback
        socket.emit("serviceCheckError", {
          availedServiceId,
          message:
            "This service item is currently being checked by another user.",
        });
        return;
      }

      try {
        pendingCheckSelections.set(selectionKey, accountId); // Lock

        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            checkedById: null, // Atomically ensure it wasn't checked simultaneously
          },
          data: { checkedById: accountId },
          include: {
            // Include relations needed by frontend
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} checked by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService); // Broadcast update
      } catch (error) {
        if (error.code === "P2025") {
          // Prisma code for record not found or condition not met
          const currentService = await prisma.availedService.findUnique({
            where: { id: availedServiceId },
            include: { checkedBy: { select: { name: true } } },
          });
          const checkerName = currentService?.checkedBy?.name || "another user";
          console.error(
            `[${transactionId}] Error checking service ${availedServiceId} by ${accountId}: Already checked by ${checkerName}`,
          );
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: `Service was already checked by ${checkerName}.`,
          });
        } else {
          console.error(
            `[${transactionId}] Error checking service ${availedServiceId}:`,
            error,
          );
          socket.emit("serviceCheckError", {
            availedServiceId,
            message: "An error occurred while checking the service.",
          });
        }
      } finally {
        pendingCheckSelections.delete(selectionKey); // Always release lock
      }
    },
  );

  // Uncheck Service (Releasing the 'check' claim)
  socket.on(
    "uncheckService",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            checkedById: accountId, // Only allow the owner to uncheck
          },
          data: { checkedById: null },
          include: {
            // Include relations needed by frontend
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} unchecked by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService); // Broadcast update
      } catch (error) {
        if (error.code === "P2025") {
          console.log(
            `[${transactionId}] Failed to uncheck ${availedServiceId} by ${accountId} (likely not the checker or already unchecked).`,
          );
          // Optionally notify user
          socket.emit("serviceUncheckError", {
            availedServiceId,
            message:
              "You are not the user who checked this service, or it's already unchecked.",
          });
        } else {
          console.error(
            `[${transactionId}] Error unchecking service ${availedServiceId}:`,
            error,
          );
          socket.emit("serviceUncheckError", {
            availedServiceId,
            message: "An error occurred while unchecking the service.",
          });
        }
      }
    },
  );

  // Mark Service as Served
  socket.on(
    "markServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        const updatedAvailedService = await prisma.availedService.update({
          where: { id: availedServiceId },
          // Allow re-marking as served if needed (idempotent)
          // To prevent re-marking add: servedById: null
          data: { servedById: accountId },
          include: {
            // Include relations needed by frontend
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} marked as served by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService); // Broadcast update

        await checkAndManageCompletionTimer(transactionId); // Check if transaction might complete
      } catch (error) {
        if (error.code === "P2025") {
          console.error(
            `[${transactionId}] Error marking service served ${availedServiceId}: Not Found`,
          );
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "Service item not found.",
          });
        } else {
          console.error(
            `[${transactionId}] Error marking service served ${availedServiceId}:`,
            error,
          );
          socket.emit("serviceMarkServedError", {
            availedServiceId,
            message: "An error occurred while marking the service as served.",
          });
        }
      }
    },
  );

  // Unmark Service as Served
  socket.on(
    "unmarkServiceServed",
    async ({ availedServiceId, transactionId, accountId }) => {
      try {
        const updatedAvailedService = await prisma.availedService.update({
          where: {
            id: availedServiceId,
            servedById: accountId, // Only the server can unmark
          },
          data: { servedById: null },
          include: {
            // Include relations needed by frontend
            service: true,
            checkedBy: { select: { id: true, name: true } },
            servedBy: { select: { id: true, name: true } },
          },
        });

        console.log(
          `[${transactionId}] AvailedService ${availedServiceId} unmarked as served by Account ${accountId}`,
        );
        io.emit("availedServiceUpdated", updatedAvailedService); // Broadcast update

        cancelCompletionTimer(transactionId); // Ensure timer is stopped
      } catch (error) {
        if (error.code === "P2025") {
          console.log(
            `[${transactionId}] Failed to unmark ${availedServiceId} as served by ${accountId} (likely not server or already unmarked).`,
          );
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message:
              "You did not mark this service as served, or it's already unmarked.",
          });
        } else {
          console.error(
            `[${transactionId}] Error unmarking service as served ${availedServiceId}:`,
            error,
          );
          socket.emit("serviceUnmarkServedError", {
            availedServiceId,
            message: "An error occurred while unmarking the service as served.",
          });
        }
      }
    },
  );

  // Handle client disconnection
  socket.on("disconnect", (reason) => {
    console.log("Client disconnected:", socket.id, "Reason:", reason);
    // Consider cleanup for pendingCheckSelections if needed, though relying on timeouts might be sufficient
  });

  // Handle connection errors
  socket.on("connect_error", (err) => {
    console.error(`connect_error due to ${err.message}`);
  });
});

// --- Start Server ---
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running and listening on port ${PORT}`);
  console.log(`🔗 Allowed CORS origins: ${allowedOrigins.join(", ")}`);
});

// --- Graceful Shutdown (Optional but Recommended) ---
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  httpServer.close(() => {
    console.log("HTTP server closed");
    prisma.$disconnect().then(() => {
      console.log("Prisma connection closed");
      process.exit(0);
    });
  });
});

process.on("SIGINT", () => {
  console.log("SIGINT signal received: closing HTTP server");
  httpServer.close(() => {
    console.log("HTTP server closed");
    prisma.$disconnect().then(() => {
      console.log("Prisma connection closed");
      process.exit(0);
    });
  });
});
