// components/admin/ManagePayslips.tsx
"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  getPayslipRequestsAction,
  updatePayslipRequestStatusAction,
  processAndReleasePayslipAction,
} from "@/lib/SalaryActions"; // Adjust import path
import Button from "@/components/Buttons/Button"; // Assuming this Button component exists
import { PayslipRequestStatus, Role } from "@prisma/client"; // Import enums and types
import { RefreshCw, CheckCircle, XCircle, DollarSign, Eye } from "lucide-react"; // Icons
import { format } from "date-fns"; // For date formatting
import { useRouter } from "next/navigation"; // For potential navigation to Payslip details

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache"; // Cache utilities

// Assuming a loading spinner widget or styling is available
// import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { Loader2, AlertCircle } from "lucide-react";

// Type matching the data structure returned by getPayslipRequestsAction
// Must be the same type structure exported from lib/SalaryActions
type PayslipRequestWithAccounts = {
  id: string;
  requestTimestamp: Date;
  periodStartDate: Date;
  periodEndDate: Date;
  status: PayslipRequestStatus;
  notes: string | null;
  accountId: string;
  account: { id: string; name: string; role: Role[] }; // Need account.id and name, role might be useful for context
  processedById: string | null;
  processedBy: { name: string } | null;
  processedTimestamp: Date | null;
  relatedPayslipId: string | null; // For linking to generated payslip
  relatedPayslip: { id: string } | null; // Should also include this based on action select
};

// Cache key for this component's data
const PAYSLIP_REQUESTS_CACHE_KEY: CacheKey = "requests_ManagePayslips"; // Correct key

interface ManagePayslipsProps {
  // Pass the currently logged-in admin's ID from the session
  loggedInAdminId: string;
  // Assuming some roles prop is passed or auth is checked within the component/actions
  isOwner: boolean; // Check if the user is an owner
}

export default function ManagePayslips({
  loggedInAdminId,
  isOwner,
}: ManagePayslipsProps) {
  const router = useRouter();

  const [requests, setRequests] = useState<PayslipRequestWithAccounts[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition(); // Global pending state for any action

  const loadRequests = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    setListError(null);

    let cachedData = !forceRefresh
      ? getCachedData<PayslipRequestWithAccounts[]>(PAYSLIP_REQUESTS_CACHE_KEY)
      : null;

    if (cachedData && !forceRefresh) {
      setRequests(cachedData);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await getPayslipRequestsAction(); // Call the new server action
      if (error) {
        setListError(error);
        setRequests(cachedData || []); // Fallback to cache data on refresh error
      } else {
        setRequests(data);
        setCachedData(PAYSLIP_REQUESTS_CACHE_KEY, data);
      }
    } catch (err: any) {
      // This catch is for unexpected errors not caught by the action's return object
      setListError(err.message || "Failed to load payslip requests.");
      setRequests(cachedData || []);
    } finally {
      setIsLoading(false);
    }
  }, []); // loadRequests should only depend on its definition

  useEffect(() => {
    // Only load if loggedInAdminId is available and the user is an owner
    // Add more robust auth check server-side in the action as well.
    if (loggedInAdminId && isOwner) {
      loadRequests();
    } else if (!isOwner) {
      setRequests([]);
      setListError(
        "Access Denied. You must be an Owner to view payslip requests.",
      );
      setIsLoading(false);
    }
  }, [loggedInAdminId, isOwner, loadRequests]);

  const handleRefresh = useCallback(() => {
    if (!loggedInAdminId || !isOwner || isPending) return;
    console.log("[ManagePayslips] Manual refresh triggered.");
    loadRequests(true); // Force cache invalidation and refetch
  }, [loggedInAdminId, isOwner, loadRequests, isPending]);

  // --- Action Handlers ---

  const handleUpdateStatus = useCallback(
    async (
      requestId: string,
      newStatus: "APPROVED" | "REJECTED",
      notes?: string | null,
    ) => {
      if (!loggedInAdminId || isPending || !isOwner) {
        // Prevent actions if loading, pending, or not owner
        console.warn("Action blocked: Loading, Pending, or Not Owner.");
        return;
      }

      const actionText = newStatus.toLowerCase();
      if (
        !window.confirm(`Are you sure you want to ${actionText} this request?`)
      ) {
        return; // Cancelled by user
      }

      setListError(null); // Clear list error before new action
      startTransition(async () => {
        const result = await updatePayslipRequestStatusAction(
          requestId,
          newStatus,
          loggedInAdminId,
          notes,
        );
        if (!result.success) {
          // Update state immediately to show potential local error messages? Or rely on full reload?
          // For simplicity, reload or show a general error message on the list.
          setListError(
            result.error ||
              result.message ||
              `Failed to ${actionText} request ${requestId}.`,
          );
          // Could potentially refresh here even on error to show latest status, or maybe not to preserve error context.
          // Let's refresh on success only, and show the error message above the table.
        } else {
          console.log(
            `Successfully updated request ${requestId} status to ${newStatus}. Refreshing list.`,
          );
          invalidateCache(PAYSLIP_REQUESTS_CACHE_KEY);
          loadRequests(true); // Refetch data to show updated status and processedBy info
        }
      });
    },
    [loggedInAdminId, isPending, isOwner, loadRequests],
  ); // Added isOwner and loadRequests dependency

  const handleProcessAndRelease = useCallback(
    async (requestId: string) => {
      if (!loggedInAdminId || isPending || !isOwner) {
        // Prevent actions if loading, pending, or not owner
        console.warn("Release action blocked: Loading, Pending, or Not Owner.");
        return;
      }

      if (
        !window.confirm(
          "Are you sure you want to process and release this payslip? This action cannot be undone and will finalize earnings for the requested period.",
        )
      ) {
        return; // Cancelled by user
      }

      setListError(null); // Clear list error
      startTransition(async () => {
        const result = await processAndReleasePayslipAction(
          requestId,
          loggedInAdminId,
        ); // Call the release action
        if (!result.success) {
          setListError(
            result.error ||
              result.message ||
              `Failed to process/release payslip for request ${requestId}.`,
          );
          // Maybe refresh on error too? Or just show error and wait for manual refresh? Let's not refresh on error.
        } else {
          console.log(
            `Successfully processed request ${requestId} and released payslip ${result.relatedPayslipId}. Refreshing list.`,
          );
          invalidateCache(PAYSLIP_REQUESTS_CACHE_KEY);
          // Invalidate the employee's own history page cache as well if you want it to show the new payslip immediately
          // This is already handled within the server action `revalidatePath`.
          loadRequests(true); // Refetch data to show PROCESSED status, payslip link etc.
          // Optional: show a success toast or message beyond the basic listError
        }
      });
    },
    [loggedInAdminId, isPending, isOwner, loadRequests],
  ); // Added isOwner and loadRequests dependency

  // Helper to determine status color classes
  const getStatusClass = (status: PayslipRequestStatus) => {
    switch (status) {
      case "PENDING":
        return "bg-yellow-100 text-yellow-800";
      case "APPROVED":
        return "bg-blue-100 text-blue-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      case "PROCESSED":
        return "bg-green-100 text-green-800";
      case "FAILED":
        return "bg-red-200 text-red-900"; // More severe failed color
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Helper to format currency (optional, if not already global)
  const formatCurrency = (amount: number | null | undefined): string =>
    (amount ?? 0).toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 0, // Or 2 if cents are tracked
      maximumFractionDigits: 0, // Or 2
    });

  // Base styles
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-customBlack/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-customBlack/90 align-top"; // Align top for cells with multiline content

  if (!isOwner) {
    return (
      <div className="flex items-center justify-center gap-2 p-4 text-center text-red-600">
        <AlertCircle size={20} /> Access Denied. This page is for Owners only.
      </div>
    );
  }

  return (
    <div className="p-1">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-customBlack">
          Manage Payslip Requests
        </h2>
        <div className="flex">
          <Button
            onClick={handleRefresh}
            disabled={isLoading || isPending} // Disable refresh while loading or action pending
            size="sm"
            variant="outline"
            className={`w-full sm:w-auto ${isLoading || isPending ? "cursor-not-allowed opacity-60" : ""}`}
          >
            <RefreshCw
              size={16}
              className={`mr-1 ${isLoading ? "animate-spin" : ""}`}
            />{" "}
            Refresh List
          </Button>
        </div>
      </div>

      {listError && (
        <p className="mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700">
          {listError}
        </p>
      )}

      {isLoading && requests.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="text-customBlue h-8 w-8 animate-spin" />
          <p className="ml-2 text-customBlack/70">
            Loading payslip requests...
          </p>
        </div>
      ) : !listError && requests.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-customBlack/60">No payslip requests found.</p>
        </div>
      ) : (
        <div className="min-w-full overflow-x-auto rounded border border-customGray/30 bg-white/80 shadow-sm">
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={`${thStyleBase}`}>Account</th>
                <th className={`${thStyleBase}`}>Period</th>
                <th className={`${thStyleBase} hidden lg:table-cell`}>
                  Requested At
                </th>
                <th className={`${thStyleBase}`}>Status</th>
                <th className={`${thStyleBase} hidden md:table-cell`}>
                  Processed By
                </th>
                <th className={`${thStyleBase} hidden lg:table-cell`}>
                  Processed At
                </th>
                <th className={`${thStyleBase} hidden sm:table-cell`}>Notes</th>
                <th className={`${thStyleBase} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-customLightBlue/10">
                  {/* Account Name & Link (Optional Link) */}
                  <td className={`${tdStyleBase} font-medium`}>
                    {/* Optionally link to the employee's dashboard page */}
                    {/* <a href={`/account/${req.accountId}`} className="text-customBlue hover:underline"> */}
                    {req.account.name}
                    {/* </a> */}
                    <span className="block text-xs italic text-customBlack/60">
                      ({req.account.role.map((r) => r.toLowerCase()).join(", ")}
                      )
                    </span>
                  </td>
                  {/* Period */}
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {format(req.periodStartDate, "MMM d, yyyy")}
                    <span className="block text-customBlack/60">
                      to {format(req.periodEndDate, "MMM d, yyyy")}
                    </span>
                  </td>
                  {/* Requested At */}
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap lg:table-cell`}
                  >
                    {format(req.requestTimestamp, "MMM d, yyyy p")}
                  </td>
                  {/* Status */}
                  <td className={`${tdStyleBase}`}>
                    <span
                      className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${getStatusClass(req.status)}`}
                    >
                      {req.status.replace("_", " ")}
                    </span>
                  </td>
                  {/* Processed By */}
                  <td className={`${tdStyleBase} hidden md:table-cell`}>
                    {req.processedBy?.name ??
                      (req.status === "PENDING" ? (
                        "-"
                      ) : (
                        <span className="italic text-gray-400">N/A</span>
                      ))}
                  </td>
                  {/* Processed At */}
                  <td
                    className={`${tdStyleBase} hidden whitespace-nowrap lg:table-cell`}
                  >
                    {req.processedTimestamp
                      ? format(req.processedTimestamp, "MMM d, yyyy p")
                      : "-"}
                  </td>
                  {/* Notes */}
                  <td
                    className={`${tdStyleBase} max-w-[200px] overflow-hidden text-ellipsis`}
                  >
                    {req.notes ?? (
                      <span className="italic text-gray-400">No notes</span>
                    )}
                  </td>
                  {/* Actions */}
                  <td className={`${tdStyleBase} whitespace-nowrap text-right`}>
                    {isPending ? (
                      <span title="Processing...">
                        <Loader2
                          size={20}
                          className="text-customBlue/80 inline-block animate-spin"
                        />
                      </span>
                    ) : (
                      <>
                        {req.status === PayslipRequestStatus.PENDING && (
                          <Button
                            onClick={() =>
                              handleUpdateStatus(req.id, "APPROVED")
                            }
                            disabled={isPending}
                            size="xs"
                            className="mr-2"
                            title="Approve Request"
                          >
                            <CheckCircle size={14} className="mr-1" /> Approve
                          </Button>
                        )}
                        {req.status === PayslipRequestStatus.PENDING && (
                          <Button
                            onClick={() =>
                              handleUpdateStatus(req.id, "REJECTED")
                            }
                            disabled={isPending}
                            size="xs"
                            variant="outline"
                            className="mr-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-800"
                            title="Reject Request"
                          >
                            <XCircle size={14} className="mr-1" /> Reject
                          </Button>
                        )}
                        {req.status === PayslipRequestStatus.APPROVED && (
                          <Button
                            onClick={() => handleProcessAndRelease(req.id)}
                            disabled={isPending}
                            size="xs"
                            className="bg-green-600 text-white hover:bg-green-700"
                            title="Process and Release Payslip"
                          >
                            <DollarSign size={14} className="mr-1" /> Release
                            Payslip
                          </Button>
                        )}
                        {/* Optional: Button to view the generated payslip */}
                        {req.status === PayslipRequestStatus.PROCESSED &&
                          req.relatedPayslipId && (
                            <Button
                              onClick={() => {
                                /* Implement navigation or modal to view payslip using req.relatedPayslipId */
                                console.log(
                                  "View Payslip button clicked for:",
                                  req.relatedPayslipId,
                                );
                                // Example: router.push(`/admin/payslips/${req.relatedPayslipId}`); or open modal
                                alert(
                                  "View Payslip feature not yet implemented. Payslip ID: " +
                                    req.relatedPayslipId,
                                );
                              }}
                              disabled={isPending}
                              size="xs"
                              variant="outline"
                              title="View Generated Payslip"
                            >
                              <Eye size={14} className="mr-1" /> View Payslip
                            </Button>
                          )}
                        {(req.status === PayslipRequestStatus.REJECTED ||
                          req.status === PayslipRequestStatus.FAILED) && (
                          <span className="text-sm text-customBlack/60">
                            - No actions -
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
