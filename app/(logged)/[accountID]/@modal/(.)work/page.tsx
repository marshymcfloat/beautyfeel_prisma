"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { isValid } from "date-fns";
import { useParams, useRouter } from "next/navigation";
import { io, Socket } from "socket.io-client";
import {
  ChevronLeft,
  // Keep Check icon for display/other uses if needed
  AlertCircle,
  Loader2,
  CheckCircle, // Icon for Mark Served button
  UserCheck, // Icon for Check In button
  Clock,
  ListChecks,
  X, // Icon for Uncheck / Unmark Served buttons
  // Keep UserMinus icon if used elsewhere
  CircleDashed,
} from "lucide-react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import { getActiveTransactions } from "@/lib/ServerAction";
import {
  TransactionPropsForTransactions,
  AvailedServicesPropsForTransactions,
  AvailedServiceUnitProps,
  ClientAccountIncluded,
} from "@/lib/Types";
import { Status } from "@prisma/client"; // Assuming prisma client enums are available client-side or mirrored

// Define a type for the state of processing actions, including the action type
type ProcessingAction = "check" | "uncheck" | "serve" | "unserve";
type ProcessingUnitActions = Map<string, ProcessingAction>; // Map unitId to the action being processed

export default function WorkInterceptedModal() {
  const { accountID: accountIdParam } = useParams();
  const router = useRouter();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

  const [fetchedTransactions, setFetchedTransactions] = useState<
    TransactionPropsForTransactions[] | null
  >(null);
  const [selectedTransaction, setSelectedTransaction] =
    useState<TransactionPropsForTransactions | null>(null);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  // Set stores unitId strings <-- CHANGED to Map<string, ProcessingAction>
  const [processingUnitActions, setProcessingUnitActions] =
    useState<ProcessingUnitActions>(new Map());
  const [error, setError] = useState<string | null>(null);

  // --- Modal Navigation / Close Handlers ---

  // Function to select a transaction and show details
  const handleSelectTransaction = useCallback(
    (transaction: TransactionPropsForTransactions) => {
      setSelectedTransaction(transaction);
      setError(null); // Clear any lingering error when viewing details
    },
    [],
  );

  // Function to close the detail view and go back to the list
  const handleCloseDetails = useCallback(() => {
    setSelectedTransaction(null);
    setError(null); // Clear any lingering error when going back to list
  }, []);

  // Function to close the entire modal
  const handleModalClose = useCallback(() => {
    router.back();
    // Also reset state just in case
    setSelectedTransaction(null);
    setFetchedTransactions(null);
    setError(null);
    setProcessingUnitActions(new Map()); // Reset map
  }, [router]);

  // --- Optimized Socket Connection Effect ---
  useEffect(() => {
    // Validate accountId early
    if (
      typeof accountId !== "string" ||
      !accountId ||
      accountId === "undefined" ||
      accountId === "null"
    ) {
      if (!fetchedTransactions && loading) setLoading(false);
      if (!error) setError("Invalid User ID. Cannot establish connection.");
      return;
    }

    // Check if socket is already connected with the same accountId
    const currentSocket = socketRef.current;
    if (
      currentSocket?.connected &&
      (currentSocket.io.opts.query as { accountId?: string })?.accountId ===
        accountId
    ) {
      // Socket already connected, just ensure state is synced
      if (!socketConnected) {
        setSocketConnected(true);
      }
      return;
    }

    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.removeAllListeners(); // Remove all listeners to prevent leaks
      socketRef.current.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    }

    const backendUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:9000";

    if (!backendUrl) {
      setError("Server Connection Error: Socket URL not configured.");
      setLoading(false);
      return;
    }

    // Optimized socket configuration
    const newSocket = io(backendUrl, {
      query: { accountId },
      reconnectionAttempts: 10, // More attempts for better reliability
      reconnectionDelay: 1000, // Start with 1 second
      reconnectionDelayMax: 5000, // Max 5 seconds between attempts
      timeout: 10000, // Reduced timeout for faster failure detection
      transports: ["websocket", "polling"], // Prefer websocket, fallback to polling
      upgrade: true, // Allow transport upgrades
      rememberUpgrade: true, // Remember successful transport
      autoConnect: true,
      forceNew: false, // Reuse existing connection if possible
    });

    socketRef.current = newSocket;

    // Optimized connection handlers with reduced logging
    const handleConnect = () => {
      if (process.env.NODE_ENV === "development") {
        console.log("WorkInterceptedModal: Socket connected:", newSocket.id);
      }
      setSocketConnected(true);
      setError(null);

      // Join transaction rooms for all active transactions to receive updates
      // This ensures we get updates even if we're not viewing the transaction
      if (fetchedTransactions && fetchedTransactions.length > 0) {
        fetchedTransactions.forEach((tx) => {
          if (tx.id) {
            // The backend will handle room joining, but we can also emit a join request
            // For now, the backend auto-joins when actions happen, but we want to receive all updates
            // So we'll join proactively when we have transactions
          }
        });
      }
    };

    const handleDisconnect = (reason: string) => {
      if (process.env.NODE_ENV === "development") {
        console.log("WorkInterceptedModal: Socket disconnected:", reason);
      }
      setSocketConnected(false);
      // Only show error for unexpected disconnects
      const isExpectedDisconnect =
        reason === "io client disconnect" ||
        reason === "transport close" ||
        reason === "ping timeout";

      if (!isExpectedDisconnect) {
        setError(`Disconnected: ${reason}. Reconnecting...`);
      } else {
        setError(null);
      }
    };

    const handleConnectError = (err: Error) => {
      if (process.env.NODE_ENV === "development") {
        console.error("WorkInterceptedModal: Socket connect_error:", err);
      }
      setSocketConnected(false);
      // Only show error if not already reconnecting
      if (!newSocket.active) {
        setError(`Connection failed: ${err.message || "Check server status."}`);
      }
    };

    const handleReconnectAttempt = (attempt: number) => {
      if (process.env.NODE_ENV === "development") {
        console.log("WorkInterceptedModal: Reconnect attempt", attempt);
      }
      // Only show error after a few attempts to avoid spam
      if (attempt > 3) {
        setError(`Reconnecting... (Attempt ${attempt})`);
      }
    };

    const handleReconnect = (attempt: number) => {
      if (process.env.NODE_ENV === "development") {
        console.log("WorkInterceptedModal: Reconnected on attempt:", attempt);
      }
      setSocketConnected(true);
      setError(null);
    };

    const handleReconnectError = (err: Error) => {
      // Only log in development to reduce noise
      if (process.env.NODE_ENV === "development") {
        console.error("WorkInterceptedModal: Reconnect error:", err);
      }
    };

    const handleReconnectFailed = () => {
      console.error("WorkInterceptedModal: Reconnect failed.");
      setSocketConnected(false);
      setError("Connection lost. Please refresh the page.");
    };

    // Set up all event listeners
    newSocket.on("connect", handleConnect);
    newSocket.on("disconnect", handleDisconnect);
    newSocket.on("connect_error", handleConnectError);
    newSocket.on("reconnect_attempt", handleReconnectAttempt);
    newSocket.on("reconnect", handleReconnect);
    newSocket.on("reconnect_error", handleReconnectError);
    newSocket.on("reconnect_failed", handleReconnectFailed);

    // Optimized data event listeners with immediate updates
    const handleAvailedServiceUpdated = (
      updatedAvailedService: AvailedServicesPropsForTransactions,
    ) => {
      if (!updatedAvailedService?.id) return;

      // Immediate synchronous updates for fastest UI response
      // Remove processing state for updated units
      setProcessingUnitActions((prev) => {
        const next = new Map(prev);
        let changed = false;
        updatedAvailedService.units?.forEach((unit) => {
          if (next.has(unit.id)) {
            next.delete(unit.id);
            changed = true;
          }
        });
        return changed ? next : prev;
      });

      const updateServiceInList = (
        list: AvailedServicesPropsForTransactions[],
      ): AvailedServicesPropsForTransactions[] =>
        list.map((s) =>
          s.id === updatedAvailedService.id
            ? {
                ...s,
                ...updatedAvailedService,
                units: updatedAvailedService.units,
              }
            : s,
        );

      // Immediate state updates (not in transition for faster response)
      setFetchedTransactions(
        (prev) =>
          prev?.map((tx) =>
            tx.id === updatedAvailedService.transactionId
              ? {
                  ...tx,
                  availedServices: updateServiceInList(
                    tx.availedServices ?? [],
                  ),
                }
              : tx,
          ) ?? null,
      );

      setSelectedTransaction((prev) => {
        if (prev?.id === updatedAvailedService.transactionId) {
          return {
            ...prev,
            availedServices: updateServiceInList(prev.availedServices ?? []),
          };
        }
        return prev;
      });
      setError(null);
    };

    const handleTransactionCompleted = (
      completedTransaction: TransactionPropsForTransactions,
    ) => {
      if (!completedTransaction?.id) return;
      if (process.env.NODE_ENV === "development") {
        console.log("Received transactionCompleted:", completedTransaction.id);
      }

      setFetchedTransactions(
        (prev) => prev?.filter((t) => t.id !== completedTransaction.id) ?? null,
      );
      setSelectedTransaction((prev) =>
        prev?.id === completedTransaction.id ? null : prev,
      );
      setProcessingUnitActions((prev) => {
        const next = new Map(prev);
        let changed = false;
        completedTransaction.availedServices?.forEach((service) => {
          service.units?.forEach((unit) => {
            if (next.has(unit.id)) {
              next.delete(unit.id);
              changed = true;
            }
          });
        });
        return changed ? next : prev;
      });
      setError(null);
    };

    const handleUnitActionError = (errorPayload: {
      unitId?: string;
      message?: string;
    }) => {
      console.error("Received unit action error:", errorPayload);
      setError(
        `Action Failed${errorPayload.unitId ? ` for unit ${errorPayload.unitId.substring(0, 4)}...` : ""}: ${errorPayload.message || "Unknown error"}`,
      );

      if (errorPayload?.unitId) {
        setProcessingUnitActions((prev) => {
          if (!prev.has(errorPayload.unitId!)) return prev;
          const next = new Map(prev);
          next.delete(errorPayload.unitId!);
          return next;
        });
      }
    };

    // Set up data listeners
    newSocket.on("availedServiceUpdated", handleAvailedServiceUpdated);
    newSocket.on("transactionCompleted", handleTransactionCompleted);
    newSocket.on("unitActionError", handleUnitActionError);

    return () => {
      // Clean up all listeners
      newSocket.off("connect", handleConnect);
      newSocket.off("disconnect", handleDisconnect);
      newSocket.off("connect_error", handleConnectError);
      newSocket.off("reconnect_attempt", handleReconnectAttempt);
      newSocket.off("reconnect", handleReconnect);
      newSocket.off("reconnect_error", handleReconnectError);
      newSocket.off("reconnect_failed", handleReconnectFailed);
      newSocket.off("availedServiceUpdated", handleAvailedServiceUpdated);
      newSocket.off("transactionCompleted", handleTransactionCompleted);
      newSocket.off("unitActionError", handleUnitActionError);

      if (newSocket.connected) {
        newSocket.disconnect();
      }
      if (socketRef.current?.id === newSocket.id) {
        socketRef.current = null;
      }
      setSocketConnected(false);
    };
  }, [accountId]); // Only depend on accountId to prevent unnecessary reconnections

  // --- Utility Function ---
  const formatCurrency = useCallback(
    (value: number | null | undefined): string => {
      if (
        value == null ||
        typeof value !== "number" ||
        isNaN(value) ||
        !isFinite(value)
      )
        value = 0;
      return value.toLocaleString("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    },
    [],
  );

  // Socket event handlers are now set up directly in the connection effect above
  // This eliminates the need for a separate effect and prevents timing issues

  // --- Optimized Effect for Initial Data Fetch ---
  useEffect(() => {
    let isMounted = true;
    let abortController: AbortController | null = null;

    async function fetchTransactionsData() {
      // Cancel previous request if still pending
      if (abortController) {
        abortController.abort();
      }
      abortController = new AbortController();

      setLoading(true);
      setError(null);

      if (
        typeof accountId !== "string" ||
        !accountId ||
        accountId === "undefined" ||
        accountId === "null"
      ) {
        setError("Invalid User ID. Cannot fetch transactions.");
        setLoading(false);
        setFetchedTransactions([]);
        return;
      }

      try {
        const data = await getActiveTransactions(accountId);

        // Check if component is still mounted and request wasn't aborted
        if (isMounted && !abortController.signal.aborted) {
          if (!Array.isArray(data)) {
            console.error("Initial Fetch Data Error: Invalid format.", data);
            setError("Failed to load transactions or invalid data format.");
            setFetchedTransactions([]);
          } else {
            console.log("Initial Transactions Fetched:", data.length, "items");
            setFetchedTransactions(data);
          }
        }
      } catch (err: any) {
        // Don't set error if request was aborted
        if (abortController?.signal.aborted) {
          console.log("Fetch aborted");
          return;
        }
        console.error("Fetch Transactions Error:", err);
        if (isMounted) {
          setError(
            `Fetch error: ${err.message || "Unknown error fetching transactions."}`,
          );
          setFetchedTransactions([]);
        }
      } finally {
        if (isMounted && !abortController?.signal.aborted) {
          setLoading(false);
        }
      }
    }

    // Only fetch if accountId is available and seems valid
    if (
      typeof accountId === "string" &&
      accountId &&
      accountId !== "undefined" &&
      accountId !== "null"
    ) {
      fetchTransactionsData();
    } else {
      console.warn(
        "accountId not valid or not yet available, skipping initial fetch.",
      );
      setLoading(false);
      setFetchedTransactions([]);
    }

    return () => {
      isMounted = false;
      if (abortController) {
        abortController.abort();
      }
    };
  }, [accountId]); // Only depend on accountId

  // --- Optimized Memoized Transaction Filtering and Sorting ---
  const { serveNowTransactions, futureTransactions } = useMemo(() => {
    if (!fetchedTransactions || fetchedTransactions.length === 0) {
      return { serveNowTransactions: [], futureTransactions: [] };
    }

    const serveNowItems: TransactionPropsForTransactions[] = [];
    const futureItems: TransactionPropsForTransactions[] = [];

    // Pre-calculate today's start of day UTC once
    const now = new Date();
    const todayStartOfDayUTC = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );

    // Single pass through transactions for better performance
    for (const tx of fetchedTransactions) {
      const bookedForDate =
        tx.bookedFor && isValid(new Date(tx.bookedFor))
          ? new Date(tx.bookedFor)
          : null;

      if (bookedForDate && isValid(bookedForDate)) {
        const bookedForStartOfDayUTC = new Date(
          Date.UTC(
            bookedForDate.getUTCFullYear(),
            bookedForDate.getUTCMonth(),
            bookedForDate.getUTCDate(),
          ),
        );

        if (bookedForStartOfDayUTC <= todayStartOfDayUTC) {
          serveNowItems.push(tx);
        } else {
          futureItems.push(tx);
        }
      } else {
        // Treat transactions without a valid bookedFor date as "Serve Now"
        serveNowItems.push(tx);
      }
    }

    // Optimized sorting with pre-computed timestamps
    const getSortTime = (
      tx: TransactionPropsForTransactions,
      defaultTime: number,
    ) => {
      if (tx.bookedFor && isValid(new Date(tx.bookedFor))) {
        return new Date(tx.bookedFor).getTime();
      }
      return defaultTime;
    };

    // Sort "Serve Now" by bookedFor ascending (earliest first)
    serveNowItems.sort((a, b) => {
      return getSortTime(a, 0) - getSortTime(b, 0);
    });

    // Sort "Future" by bookedFor ascending (earliest first)
    futureItems.sort((a, b) => {
      return getSortTime(a, Infinity) - getSortTime(b, Infinity);
    });

    return {
      serveNowTransactions: serveNowItems,
      futureTransactions: futureItems,
    };
  }, [fetchedTransactions]); // Recompute only when fetchedTransactions changes

  // --- Helper to get the current assigned user (Checked or Served) ---
  const getAssignedUser = useCallback(
    (unit: AvailedServiceUnitProps): ClientAccountIncluded | null => {
      // If unit is DONE, the assigned user is the one who served it
      if (unit.status === Status.DONE && unit.servedBy) {
        return unit.servedBy;
      }
      // If unit is PENDING, the assigned user is the one who checked it
      // A unit should only be CHECKED if its status is PENDING (based on backend logic)
      if (unit.status === Status.PENDING && unit.checkedBy) {
        return unit.checkedBy;
      }
      // Otherwise (CANCELLED, PENDING unassigned, etc.), there is no assigned user to display here
      return null;
    },
    [Status],
  );

  // --- Service Unit Check/Uncheck Logic ---
  const handleUnitCheckToggle = useCallback(
    (unit: AvailedServiceUnitProps, wantsToBecomeChecked: boolean) => {
      const currentSocket = socketRef.current;
      if (
        !currentSocket?.connected ||
        typeof accountId !== "string" ||
        !accountId ||
        accountId === "undefined" ||
        accountId === "null" ||
        processingUnitActions.has(unit.id) // Check if ANY action is processing for this unit
      ) {
        console.warn(
          `Check/Uncheck action skipped for unit ${unit.id.substring(0, 4)}...: Socket not ready, account ID missing, or already processing.`,
          {
            socketReady: !!currentSocket?.connected,
            accountId,
            isProcessing: processingUnitActions.has(unit.id),
            action: wantsToBecomeChecked ? "check" : "uncheck",
          },
        );
        if (!currentSocket?.connected)
          setError("Socket is disconnected. Cannot perform action.");
        else if (
          !accountId ||
          accountId === "undefined" ||
          accountId === "null"
        )
          setError("Invalid User ID. Cannot perform action.");
        else if (processingUnitActions.has(unit.id))
          setError("Another action is already in progress for this unit."); // More general message
        return; // Exit early if conditions aren't met
      }

      // Frontend pre-validation (backend will re-validate)
      if (unit.status !== Status.PENDING) {
        setError(`Cannot check/uncheck a unit with status: ${unit.status}.`);
        return;
      }

      if (wantsToBecomeChecked) {
        // Can only check if it's PENDING (checked above) AND not already checked by anyone
        if (unit.checkedById) {
          if (unit.checkedById !== accountId) {
            setError(
              `Unit is already checked by ${unit.checkedBy?.name || "someone else"}.`,
            );
          } else {
            console.warn(`Unit ${unit.id} already checked by me.`);
            setError("Unit is already checked by you."); // Inform user anyway
          }
          return; // Cannot check if already checked
        }
        // Unit should also not be served (backend validates this too)
        if (unit.servedById) {
          setError("Cannot check a unit that has already been served.");
          return;
        }
      } else {
        // wantsToBecomeUnchecked
        // Can only uncheck if it's PENDING (checked above) AND checked *by me*
        if (unit.checkedById !== accountId) {
          if (!unit.checkedById) {
            setError("Unit is not currently checked.");
          } else {
            setError("Cannot uncheck a unit checked by someone else.");
          }
          return; // Cannot uncheck if not checked by me
        }
        // Unit should also not be served (backend validates this too)
        if (unit.servedById) {
          setError("Cannot uncheck a unit that has already been served.");
          return;
        }
      }

      // Optimistic update: immediately update UI for instant feedback
      const optimisticUpdate = () => {
        if (wantsToBecomeChecked) {
          // Optimistically add checked state
          const optimisticUnit = {
            ...unit,
            checkedById: accountId,
            checkedBy: { id: accountId, name: "You" } as ClientAccountIncluded,
            checkedAt: new Date(),
          };

          const updateUnitInService = (
            service: AvailedServicesPropsForTransactions,
          ): AvailedServicesPropsForTransactions => ({
            ...service,
            units: service.units.map((u) =>
              u.id === unit.id ? optimisticUnit : u,
            ),
          });

          setFetchedTransactions(
            (prev) =>
              prev?.map((tx) =>
                tx.id === selectedTransaction?.id
                  ? {
                      ...tx,
                      availedServices: tx.availedServices.map((s) =>
                        s.id === unit.availedServiceId
                          ? updateUnitInService(s)
                          : s,
                      ),
                    }
                  : tx,
              ) ?? null,
          );

          setSelectedTransaction((prev) => {
            if (prev && prev.id === selectedTransaction?.id) {
              return {
                ...prev,
                availedServices: prev.availedServices.map((s) =>
                  s.id === unit.availedServiceId ? updateUnitInService(s) : s,
                ),
              };
            }
            return prev;
          });
        }
        // For uncheck, we'll wait for server confirmation to avoid flicker
      };

      // Add unit ID and action type to processing state map
      setProcessingUnitActions((prev) =>
        new Map(prev).set(unit.id, wantsToBecomeChecked ? "check" : "uncheck"),
      );
      setError(null); // Clear previous errors on new action

      // Apply optimistic update for check actions
      if (wantsToBecomeChecked) {
        optimisticUpdate();
      }

      // Determine the correct socket event name
      const eventName = wantsToBecomeChecked ? "checkUnit" : "uncheckUnit";

      // Prepare payload
      const payload = {
        unitId: unit.id, // Crucial: Send the specific unit ID
        accountId,
        availedServiceId: unit.availedServiceId,
        transactionId: selectedTransaction?.id, // Ensure transactionId is available
      };

      // Send event via socket with optimized error handling
      if (selectedTransaction?.id) {
        if (process.env.NODE_ENV === "development") {
          console.log(`Emitting socket event: ${eventName}`, payload);
        }

        // Use emit with acknowledgment for better reliability
        const timeout = setTimeout(() => {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `Socket event ${eventName} timeout for unit ${unit.id}`,
            );
          }
          setProcessingUnitActions((prev) => {
            const next = new Map(prev);
            next.delete(unit.id);
            return next;
          });
          setError("Action timed out. Please try again.");
        }, 8000); // 8 second timeout (reduced for faster feedback)

        // Emit with acknowledgment callback
        currentSocket.emit(
          eventName,
          payload,
          (response?: { success?: boolean; error?: string }) => {
            clearTimeout(timeout);
            if (response && response.success === false) {
              setProcessingUnitActions((prev) => {
                const next = new Map(prev);
                next.delete(unit.id);
                return next;
              });
              setError(response.error || "Action failed on server.");
            }
            // If response is undefined or success is true, the socket event will handle the update
          },
        );
      } else {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "Cannot emit unit action: Transaction ID is missing.",
            payload,
          );
        }
        setProcessingUnitActions((prev) => {
          const next = new Map(prev);
          next.delete(unit.id);
          return next;
        });
        setError("Failed to send action: Transaction context missing.");
      }
    },
    [accountId, processingUnitActions, selectedTransaction?.id, Status], // Depend on Status enum
  );

  // --- Service Unit Serve/Unserve Logic ---
  const handleUnitServeToggle = useCallback(
    (unit: AvailedServiceUnitProps, wantsToBecomeServed: boolean) => {
      const currentSocket = socketRef.current;
      if (
        !currentSocket?.connected ||
        typeof accountId !== "string" ||
        !accountId ||
        accountId === "undefined" ||
        accountId === "null" ||
        processingUnitActions.has(unit.id) // Check if ANY action is processing for this unit
      ) {
        console.warn(
          `Serve/Unserve action skipped for unit ${unit.id.substring(0, 4)}...: Socket not ready, account ID missing, or already processing.`,
          {
            socketReady: !!currentSocket?.connected,
            accountId,
            isProcessing: processingUnitActions.has(unit.id),
            action: wantsToBecomeServed ? "serve" : "unserve",
          },
        );
        if (!currentSocket?.connected)
          setError("Socket is disconnected. Cannot perform action.");
        else if (
          !accountId ||
          accountId === "undefined" ||
          accountId === "null"
        )
          setError("Invalid User ID. Cannot perform action.");
        else if (processingUnitActions.has(unit.id))
          setError("Another action is already in progress for this unit."); // More general message
        return; // Exit early if conditions aren't met
      }

      // Frontend pre-validation (backend will re-validate)
      if (wantsToBecomeServed) {
        // Can only serve if status is PENDING
        if (unit.status !== Status.PENDING) {
          setError(
            `Cannot mark unit served with status: ${unit.status}. Only PENDING units can be served.`,
          );
          return;
        }
        // Ideally, can only serve if *checked by me* - enforcing typical workflow
        if (unit.checkedById !== accountId) {
          if (unit.checkedById) {
            setError(
              `Cannot mark unit served: Unit is checked by ${unit.checkedBy?.name || "someone else"}.`,
            );
          } else {
            setError(
              "Cannot mark unit served: Unit has not been checked in yet.",
            );
          }
          return;
        }
        // Unit should not be already served (backend validates this too)
        if (unit.servedById) {
          if (unit.servedById === accountId) {
            console.warn(`Unit ${unit.id} already served by me.`);
            setError("Unit is already served by you."); // Inform user anyway
          } else {
            setError(
              `Cannot mark unit served: Unit is already served by ${unit.servedBy?.name || "someone else"}.`,
            );
          }
          return;
        }
      } else {
        // wantsToBecomeUnserved
        // Can only unserve if status is DONE
        if (unit.status !== Status.DONE) {
          setError(
            `Cannot unmark unit served with status: ${unit.status}. Only DONE units can be unmarked served.`,
          );
          return;
        }
        // Can only unserve if *served by me*
        if (unit.servedById !== accountId) {
          if (!unit.servedById) {
            setError("Unit is not currently marked as served.");
          } else {
            setError(
              `Cannot unmark unit served: Unit was served by ${unit.servedBy?.name || "someone else"}.`,
            );
          }
          return;
        }
      }

      // Optimistic update: immediately update UI for instant feedback
      const optimisticUpdate = () => {
        if (wantsToBecomeServed) {
          // Optimistically mark as served
          const optimisticUnit = {
            ...unit,
            status: Status.DONE,
            servedById: accountId,
            servedBy: { id: accountId, name: "You" } as ClientAccountIncluded,
            completedAt: new Date(),
          };

          const updateUnitInService = (
            service: AvailedServicesPropsForTransactions,
          ): AvailedServicesPropsForTransactions => ({
            ...service,
            units: service.units.map((u) =>
              u.id === unit.id ? optimisticUnit : u,
            ),
          });

          setFetchedTransactions(
            (prev) =>
              prev?.map((tx) =>
                tx.id === selectedTransaction?.id
                  ? {
                      ...tx,
                      availedServices: tx.availedServices.map((s) =>
                        s.id === unit.availedServiceId
                          ? updateUnitInService(s)
                          : s,
                      ),
                    }
                  : tx,
              ) ?? null,
          );

          setSelectedTransaction((prev) => {
            if (prev && prev.id === selectedTransaction?.id) {
              return {
                ...prev,
                availedServices: prev.availedServices.map((s) =>
                  s.id === unit.availedServiceId ? updateUnitInService(s) : s,
                ),
              };
            }
            return prev;
          });
        }
        // For unserve, we'll wait for server confirmation
      };

      // Add unit ID and action type to processing state map
      setProcessingUnitActions((prev) =>
        new Map(prev).set(unit.id, wantsToBecomeServed ? "serve" : "unserve"),
      );
      setError(null); // Clear previous errors on new action

      // Apply optimistic update for serve actions
      if (wantsToBecomeServed) {
        optimisticUpdate();
      }

      // Determine the correct socket event name
      const eventName = wantsToBecomeServed
        ? "markUnitServed"
        : "unmarkUnitServed";

      // Prepare payload
      const payload = {
        unitId: unit.id, // Crucial: Send the specific unit ID
        accountId,
        availedServiceId: unit.availedServiceId,
        transactionId: selectedTransaction?.id, // Ensure transactionId is available
      };

      // Send event via socket with optimized error handling
      if (selectedTransaction?.id) {
        if (process.env.NODE_ENV === "development") {
          console.log(`Emitting socket event: ${eventName}`, payload);
        }

        // Use emit with acknowledgment for better reliability
        const timeout = setTimeout(() => {
          if (process.env.NODE_ENV === "development") {
            console.warn(
              `Socket event ${eventName} timeout for unit ${unit.id}`,
            );
          }
          setProcessingUnitActions((prev) => {
            const next = new Map(prev);
            next.delete(unit.id);
            return next;
          });
          setError("Action timed out. Please try again.");
        }, 8000); // 8 second timeout (reduced for faster feedback)

        // Emit with acknowledgment callback
        currentSocket.emit(
          eventName,
          payload,
          (response?: { success?: boolean; error?: string }) => {
            clearTimeout(timeout);
            if (response && response.success === false) {
              setProcessingUnitActions((prev) => {
                const next = new Map(prev);
                next.delete(unit.id);
                return next;
              });
              setError(response.error || "Action failed on server.");
            }
            // If response is undefined or success is true, the socket event will handle the update
          },
        );
      } else {
        if (process.env.NODE_ENV === "development") {
          console.error(
            "Cannot emit unit action: Transaction ID is missing.",
            payload,
          );
        }
        setProcessingUnitActions((prev) => {
          const next = new Map(prev);
          next.delete(unit.id);
          return next;
        });
        setError("Failed to send action: Transaction context missing.");
      }
    },
    [accountId, processingUnitActions, selectedTransaction?.id, Status], // Depend on Status enum
  );

  // --- Render Functions ---
  const renderTransactionTable = useCallback(
    (transactions: TransactionPropsForTransactions[], title: string) => (
      <div className="mb-1">
        <h3 className="sticky top-0 z-10 border-b border-t border-customGray bg-customOffWhite px-4 py-2.5 text-sm font-semibold text-customDarkPink">
          {title} ({transactions.length})
        </h3>
        {loading &&
        transactions.length === 0 &&
        fetchedTransactions === null ? ( // Show loading specific to initial fetch state
          <p className="bg-white px-4 py-4 text-center text-sm italic text-gray-500">
            Loading...
          </p>
        ) : transactions.length > 0 ? (
          <table className="min-w-full table-fixed">
            <thead className="bg-customOffWhite/70">
              <tr>
                <th className="w-[30%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Date/Time
                </th>
                <th className="w-[45%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Customer
                </th>
                <th className="w-[25%] border-b border-customGray px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Pending Units
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray bg-white">
              {transactions.map((transaction) => (
                <tr
                  className="cursor-pointer hover:bg-customDarkPink/10"
                  key={transaction.id}
                  onClick={() => handleSelectTransaction(transaction)}
                  tabIndex={0}
                  onKeyDown={(e) =>
                    e.key === "Enter" && handleSelectTransaction(transaction)
                  }
                >
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-gray-700">
                    {transaction.bookedFor &&
                    isValid(new Date(transaction.bookedFor)) ? (
                      <>
                        <div>
                          {new Date(
                            transaction.bookedFor,
                          ).toLocaleDateString() ?? "N/A"}
                        </div>
                        <div className="text-[10px]">
                          {new Date(transaction.bookedFor).toLocaleTimeString(
                            [],
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          ) ?? ""}
                        </div>
                      </>
                    ) : (
                      <div>N/A Date</div> // Handle invalid/missing bookedFor date display
                    )}
                  </td>
                  <td className="truncate px-3 py-2.5 text-sm font-medium text-customBlack">
                    {transaction.customer?.name ?? "Unknown"}
                  </td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">
                    <span className="inline-flex items-center">
                      {transaction.availedServices.reduce((total, service) => {
                        return (
                          total +
                          service.units.filter(
                            (unit) => unit.status === Status.PENDING,
                          ).length
                        );
                      }, 0)}
                      <CircleDashed
                        size={12}
                        className="ml-1 text-orange-600"
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          // Only show "No transactions" message if not loading and data is fetched (empty array)
          !loading &&
          fetchedTransactions !== null &&
          serveNowTransactions.length === 0 &&
          futureTransactions.length === 0 && (
            <p className="bg-white px-4 py-4 text-center text-sm italic text-gray-500">
              {title.includes("Ready to Serve")
                ? "No transactions ready for service in this category."
                : "No upcoming bookings in this category."}
            </p>
          )
        )}
        {/* Specific message if fetchedTransactions is null (implies initial fetch failed or hasn't happened properly) */}
        {!loading && fetchedTransactions === null && (
          <p className="py-10 text-center text-sm italic text-gray-500">
            Could not load transaction list.
          </p>
        )}
      </div>
    ),
    [
      handleSelectTransaction,
      loading,
      fetchedTransactions,
      Status,
      isValid,
      serveNowTransactions,
      futureTransactions,
    ],
  );

  const renderContent = useCallback(() => {
    // Show initial loading state before any data is fetched
    if (loading && fetchedTransactions === null && !error)
      return (
        <div className="flex h-full items-center justify-center p-10 text-gray-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading
          transactions...
        </div>
      );

    // Show error state if initial fetch failed and no transactions were loaded
    if (
      error &&
      !loading &&
      (!fetchedTransactions || fetchedTransactions.length === 0) &&
      !selectedTransaction // Show only if not viewing a specific transaction detail
    )
      return (
        <div className="flex h-full flex-col items-center justify-center p-10 text-red-600">
          <AlertCircle className="mb-2 h-8 w-8" />
          <p className="text-center font-medium">{error}</p>
        </div>
      );

    if (selectedTransaction) {
      const allAvailedServices = selectedTransaction.availedServices;

      return (
        <div className="flex h-full flex-col">
          <div className="flex-shrink-0 border-b border-customGray bg-customOffWhite p-3">
            <h2 className="mb-1 truncate text-base font-semibold text-customBlack">
              {selectedTransaction.customer?.name ?? "Unknown Customer"}
            </h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                <Clock size={12} className="text-gray-400" /> Created:{" "}
                {selectedTransaction.createdAt?.toLocaleDateString() ?? "N/A"}
              </span>
              {selectedTransaction.bookedFor &&
                isValid(new Date(selectedTransaction.bookedFor)) && (
                  <span className="flex items-center gap-1">
                    <Clock size={12} className="text-gray-400" /> Booked:{" "}
                    {new Date(
                      selectedTransaction.bookedFor,
                    ).toLocaleDateString() ?? "N/A"}{" "}
                    @
                    {new Date(selectedTransaction.bookedFor).toLocaleTimeString(
                      [],
                      {
                        hour: "2-digit",
                        minute: "2-digit",
                      },
                    ) ?? ""}
                  </span>
                )}
              <span className="flex items-center gap-1">
                Transaction Status:
                <span
                  className={`font-medium ${selectedTransaction.status === Status.PENDING ? `text-orange-700` : selectedTransaction.status === Status.DONE ? `text-green-700` : `text-red-700`}`}
                >
                  {selectedTransaction.status}
                </span>
              </span>
              {selectedTransaction.branch && (
                <span className="flex items-center gap-1">
                  Branch:{" "}
                  <span className="font-medium text-gray-700">
                    {selectedTransaction.branch.title}
                  </span>
                </span>
              )}
              {socketConnected ? (
                <span className="flex items-center gap-1 text-green-600">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                  <span className="text-xs font-medium">Connected</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-orange-500">
                  <AlertCircle size={12} />
                  <span className="text-xs font-medium">
                    Connecting... Real-time updates may be delayed.
                  </span>
                </span>
              )}
            </div>
          </div>
          {/* Show detailed error message when viewing transaction details */}
          {error && selectedTransaction && (
            <div className="flex flex-shrink-0 items-center gap-2 border-b border-red-200 bg-red-100 p-2 text-sm text-red-700">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          <div className="flex-grow space-y-3 overflow-y-auto bg-customOffWhite p-3">
            {allAvailedServices.length === 0 ? (
              <p className="mt-10 text-center italic text-gray-500">
                No services listed for this transaction.
              </p>
            ) : (
              // Map through availed services
              allAvailedServices.map((service) => (
                <div
                  key={service.id}
                  className="border-b border-customGray/50 pb-3 last:border-b-0 last:pb-0"
                >
                  <h3 className="mb-2 text-sm font-semibold text-customDarkPink">
                    {service.service?.title ??
                      service.originatingSetTitle ??
                      "Unknown Service"}
                    {service.quantity > 1 && (
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        (x{service.quantity})
                      </span>
                    )}
                    {service.originatingSetTitle && service.service?.title && (
                      <span className="ml-1 text-xs font-normal text-gray-500">
                        (from {service.originatingSetTitle})
                      </span>
                    )}
                    <span className="ml-2 text-sm font-semibold text-gray-700">
                      {formatCurrency(
                        // Show total price for the AS line item, not per unit price here
                        // The price per unit is shown in the unit details
                        service.price,
                      )}{" "}
                    </span>
                  </h3>
                  <div className="space-y-2 pl-4">
                    {/* Map through individual units within the service */}
                    {service.units
                      .sort((a, b) => a.unitIndex - b.unitIndex)
                      .map((unit) => {
                        // Check if any action is processing for this specific unit
                        const processingActionForUnit =
                          processingUnitActions.get(unit.id);
                        const isProcessingUnit = !!processingActionForUnit;

                        const isCheckedByMe = unit.checkedById === accountId;
                        const isServedByMe = unit.servedById === accountId;
                        const assignedUser = getAssignedUser(unit);
                        const isAssignedToSomeone = !!assignedUser;
                        const isAssignedToOther =
                          isAssignedToSomeone && assignedUser?.id !== accountId;

                        // Determine button visibility based on unit status and assignment
                        const showCheckButton =
                          unit.status === Status.PENDING && !unit.checkedById; // Show Check In if PENDING and not checked
                        const showUncheckButton =
                          unit.status === Status.PENDING && isCheckedByMe; // Show Uncheck if PENDING and checked by me
                        const showMarkServedButton =
                          unit.status === Status.PENDING && isCheckedByMe; // Show Mark Served if PENDING and checked by me (adjust logic if anyone can serve)
                        const showUnmarkServedButton =
                          unit.status === Status.DONE && isServedByMe; // Show Unmark Served if DONE and served by me

                        // Determine button disabled state
                        const isCheckDisabled =
                          isProcessingUnit || !showCheckButton;
                        const isUncheckDisabled =
                          isProcessingUnit || !showUncheckButton;
                        const isMarkServedDisabled =
                          isProcessingUnit || !showMarkServedButton;
                        const isUnmarkServedDisabled =
                          isProcessingUnit || !showUnmarkServedButton;

                        // CSS classes based on unit status and assignment
                        let unitClasses = `flex flex-col rounded-lg border p-3 shadow-sm transition-opacity duration-150 `;
                        if (isProcessingUnit)
                          unitClasses += " animate-pulse opacity-60";

                        if (unit.status === Status.DONE)
                          unitClasses += ` border-green-400 bg-green-100`;
                        else if (isCheckedByMe)
                          unitClasses += ` border-customDarkPink bg-customDarkPink/10`;
                        else if (isAssignedToOther)
                          unitClasses += ` border-amber-400 bg-amber-50`;
                        else unitClasses += ` border-customGray bg-white`; // Default style for unassigned PENDING

                        return (
                          <div key={unit.id} className={unitClasses}>
                            <div className="flex items-center justify-between gap-3">
                              {/* Left side: Unit Label, Status, Assignment */}
                              <div className="relative flex min-w-0 flex-grow items-center gap-2.5">
                                <span className="flex-shrink-0 text-sm font-medium text-customBlack">
                                  Unit {unit.unitIndex + 1}
                                </span>

                                <span
                                  className={`inline-block flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold lowercase leading-tight ${unit.status === Status.PENDING ? `bg-orange-100 text-orange-700` : ""} ${unit.status === Status.DONE ? `bg-green-100 text-green-800` : ""} ${unit.status === Status.CANCELLED ? "bg-red-100 text-red-700" : ""}`}
                                >
                                  {unit.status.toLowerCase()}
                                </span>

                                {/* Show assignment details */}
                                {assignedUser ? (
                                  <span
                                    className={`text-xxs ml-auto flex-shrink-0 sm:ml-0 ${assignedUser?.id === accountId ? "font-semibold text-customDarkPink" : "font-semibold text-amber-700"}`}
                                  >
                                    {unit.status === Status.DONE
                                      ? "Served By:"
                                      : "Checked By:"}{" "}
                                    {/* Show context: Served By or Checked By */}
                                    {assignedUser?.name ?? "Unknown"}
                                  </span>
                                ) : (
                                  // Show unassigned status explicitly for PENDING units that are not assigned
                                  unit.status === Status.PENDING && (
                                    <span className="text-xxs ml-auto flex-shrink-0 text-gray-500 sm:ml-0">
                                      Unassigned
                                    </span>
                                  )
                                )}
                              </div>
                              {/* Right side: Unit Price */}
                              <span
                                className={`ml-2 flex-shrink-0 text-sm font-semibold ${unit.status === Status.DONE ? "text-green-700" : isCheckedByMe ? `text-customDarkPink` : `text-gray-700`}`}
                              >
                                {formatCurrency(
                                  service.quantity > 0
                                    ? service.price / service.quantity // Display price per unit
                                    : 0,
                                )}
                              </span>
                            </div>

                            {/* Actions Row / Completed Info */}
                            <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px]">
                              {/* Uncheck Button */}
                              {showUncheckButton && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnitCheckToggle(unit, false)
                                  }
                                  disabled={isUncheckDisabled}
                                  className={`rounded px-2 py-1 font-semibold transition-colors duration-150 ${isUncheckDisabled ? "cursor-not-allowed bg-gray-200 text-gray-500" : "bg-amber-500 text-white hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50"} `}
                                >
                                  {/* Show loader specific to the action */}
                                  {isProcessingUnit &&
                                  processingActionForUnit === "uncheck" ? (
                                    <Loader2
                                      size={10}
                                      className="mr-1 inline animate-spin"
                                    />
                                  ) : (
                                    <X size={10} className="mr-1 inline" />
                                  )}
                                  Uncheck
                                </button>
                              )}

                              {/* Check Button */}
                              {showCheckButton && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnitCheckToggle(unit, true)
                                  }
                                  disabled={isCheckDisabled}
                                  className={`rounded px-2 py-1 font-semibold transition-colors duration-150 ${isCheckDisabled ? "cursor-not-allowed bg-gray-200 text-gray-500" : "bg-customDarkPink text-white hover:bg-customDarkPink/90 focus:outline-none focus:ring-2 focus:ring-customDarkPink/50"} `}
                                >
                                  {/* Show loader specific to the action */}
                                  {isProcessingUnit &&
                                  processingActionForUnit === "check" ? (
                                    <Loader2
                                      size={10}
                                      className="mr-1 inline animate-spin"
                                    />
                                  ) : (
                                    <UserCheck
                                      size={10}
                                      className="mr-1 inline"
                                    />
                                  )}
                                  Check In
                                </button>
                              )}

                              {/* Unmark Served Button */}
                              {showUnmarkServedButton && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleUnitServeToggle(unit, false)
                                  }
                                  disabled={isUnmarkServedDisabled}
                                  className={`rounded px-2 py-1 font-semibold transition-colors duration-150 ${isUnmarkServedDisabled ? "cursor-not-allowed bg-gray-200 text-gray-500" : "bg-red-500 text-white hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500/50"} `}
                                >
                                  {/* Show loader specific to the action */}
                                  {isProcessingUnit &&
                                  processingActionForUnit === "unserve" ? (
                                    <Loader2
                                      size={10}
                                      className="mr-1 inline animate-spin"
                                    />
                                  ) : (
                                    <X size={10} className="mr-1 inline" />
                                  )}
                                  Unmark Served
                                </button>
                              )}

                              {/* Mark Served Button */}
                              {showMarkServedButton && (
                                <button
                                  type="button"
                                  // Assuming only checker can serve for this UI
                                  onClick={() =>
                                    handleUnitServeToggle(unit, true)
                                  }
                                  disabled={isMarkServedDisabled}
                                  className={`rounded px-2 py-1 font-semibold transition-colors duration-150 ${isMarkServedDisabled ? "cursor-not-allowed bg-gray-200 text-gray-500" : "bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-600/50"} `}
                                >
                                  {/* Show loader specific to the action */}
                                  {isProcessingUnit &&
                                  processingActionForUnit === "serve" ? (
                                    <Loader2
                                      size={10}
                                      className="mr-1 inline animate-spin"
                                    />
                                  ) : (
                                    <CheckCircle
                                      size={10}
                                      className="mr-1 inline"
                                    />
                                  )}
                                  Mark Served
                                </button>
                              )}

                              {/* Show completion time if unit status is DONE */}
                              {unit.status === Status.DONE &&
                                unit.completedAt && (
                                  <span className="ml-auto text-xs text-gray-600">
                                    Completed:{" "}
                                    {new Date(
                                      unit.completedAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                              {/* Show checked time if PENDING and checked */}
                              {unit.status === Status.PENDING &&
                                unit.checkedAt && (
                                  <span className="ml-auto text-xs text-gray-600">
                                    Checked:{" "}
                                    {new Date(
                                      unit.checkedAt,
                                    ).toLocaleTimeString([], {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </span>
                                )}
                              {/* Add info for Cancelled units if needed */}
                              {unit.status === Status.CANCELLED && (
                                <span className="ml-auto text-xs text-gray-600">
                                  Cancelled
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    {/* Message if an AvailedService has no units (shouldn't happen if quantity > 0) */}
                    {service.units.length === 0 && service.quantity > 0 && (
                      <p className="mt-2 text-center text-xs italic text-gray-500">
                        Data issue: No units found for this service line
                        (Quantity: {service.quantity}).
                      </p>
                    )}
                    {/* Message if an AvailedService has quantity 0 */}
                    {service.quantity === 0 && (
                      <p className="mt-2 text-center text-xs italic text-gray-500">
                        No units expected for this service line (Quantity: 0).
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
            {/* Message if the Transaction has no Availed Services */}
            {allAvailedServices.length === 0 && (
              <p className="mt-10 text-center italic text-gray-500">
                No services listed for this transaction.
              </p>
            )}
          </div>
        </div>
      );
    }

    // State for the list view
    const showErrorInList =
      error && // Show error if there is one
      !loading && // Not currently loading initial data
      (fetchedTransactions === null || fetchedTransactions.length === 0) && // Either fetch failed or returned empty
      !selectedTransaction; // Not currently viewing transaction details

    return (
      <div className="h-full overflow-y-auto bg-customOffWhite">
        {/* Socket Connection Status Banner */}
        {!socketConnected && !loading && (
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-orange-200 bg-orange-50 p-2 text-center text-xs text-orange-700">
            <Loader2 className="inline h-3 w-3 flex-shrink-0 animate-spin" />
            <span>
              Connecting to server... Real-time updates will be available once
              connected.
            </span>
          </div>
        )}
        {socketConnected && (
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-green-200 bg-green-50 p-1.5 text-center text-xs text-green-700">
            <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
            <span>Connected - Real-time updates active</span>
          </div>
        )}
        {/* General Error Banner (only when not viewing details) */}
        {showErrorInList && (
          <div className="flex flex-shrink-0 items-center justify-center gap-2 border-b border-red-200 bg-red-50 p-2 text-center text-sm text-red-600">
            <AlertCircle className="inline h-4 w-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Render the transaction tables */}
        {renderTransactionTable(serveNowTransactions, "Ready to Serve")}
        {renderTransactionTable(futureTransactions, "Upcoming Bookings")}

        {/* Message when both lists are empty after loading */}
        {!loading &&
          !showErrorInList && // Don't show if a specific error is already displayed
          fetchedTransactions !== null && // Ensure initial fetch completed
          serveNowTransactions.length === 0 &&
          futureTransactions.length === 0 && (
            <p className="py-10 text-center text-sm italic text-gray-500">
              No pending transactions found in your queue.
            </p>
          )}
        {/* Message indicating real-time updates */}
        {!loading &&
          fetchedTransactions !== null &&
          fetchedTransactions.length > 0 && // Show only if there are transactions to potentially update
          socketConnected && ( // Show only if socket is connected
            <p className="py-4 text-center text-xs italic text-gray-500">
              List updates in real-time.
            </p>
          )}
        {/* Show loading spinner specifically when fetching initial data */}
        {loading && fetchedTransactions === null && (
          <p className="py-10 text-center text-sm italic text-gray-500">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading
            list...
          </p>
        )}
      </div>
    );
  }, [
    selectedTransaction,
    loading,
    error,
    serveNowTransactions,
    futureTransactions,
    processingUnitActions, // Dependency for rendering processing state
    handleUnitCheckToggle,
    handleUnitServeToggle, // Dependency for rendering serve/unserve buttons
    formatCurrency,
    accountId,
    renderTransactionTable,
    fetchedTransactions,
    socketConnected,
    Status,
    getAssignedUser,
    isValid,
  ]);

  // --- Modal Title Logic ---
  const modalTitle = useMemo(
    () => (
      <div className="relative w-full text-center">
        <div className="flex items-center justify-center">
          {!selectedTransaction && (
            <ListChecks size={18} className="mr-2 text-customDarkPink" />
          )}
          <DialogTitle>
            {selectedTransaction ? "Transaction Details" : "Work Queue"}
          </DialogTitle>
        </div>
        {/* Close Button */}
        <button
          onClick={handleModalClose}
          className="absolute right-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Close"
        >
          <X size={20} />
        </button>
        {/* Back Button (shown when a transaction is selected) */}
        {selectedTransaction && (
          <button
            onClick={handleCloseDetails}
            className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
            aria-label="Back"
          >
            <ChevronLeft size={20} />
          </button>
        )}
      </div>
    ),
    [selectedTransaction, handleModalClose, handleCloseDetails],
  );

  return (
    <Modal
      isOpen={true} // Modal is always open when this component is mounted
      onClose={handleModalClose}
      title={modalTitle}
      hideDefaultHeader={false} // Use the custom title area
      hideDefaultCloseButton={true} // Use the custom close button
      titleClassName="p-4 border-b border-customGray bg-customOffWhite text-customBlack flex-shrink-0"
      contentClassName="p-0 flex flex-col min-h-0" // Remove padding from content body
      containerClassName="relative m-auto flex flex-col max-h-[90vh] h-[700px] w-full max-w-lg overflow-hidden rounded-lg bg-customOffWhite shadow-xl border border-customGray" // Main modal size and layout
      size="lg" // Use the large size for better layout
    >
      <div className="min-h-0 flex-grow overflow-auto bg-customOffWhite">
        {renderContent()}
      </div>
    </Modal>
  );
}
