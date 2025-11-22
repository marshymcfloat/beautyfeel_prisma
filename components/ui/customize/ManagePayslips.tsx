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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { PayslipRequestStatus, Role } from "@prisma/client"; // Import enums and types
import { RefreshCw, CheckCircle, XCircle, DollarSign, Eye, Loader2, AlertCircle } from "lucide-react"; // Icons
import { format } from "date-fns"; // For date formatting
import { useRouter } from "next/navigation"; // For potential navigation to Payslip details

import {
  getCachedData,
  setCachedData,
  invalidateCache,
  CacheKey,
} from "@/lib/cache"; // Cache utilities

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
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [confirmRejectOpen, setConfirmRejectOpen] = useState(false);
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [pendingActionRequestId, setPendingActionRequestId] = useState<string | null>(null);
  const [pendingActionType, setPendingActionType] = useState<"APPROVE" | "REJECT" | "RELEASE" | null>(null);

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
        toast.error("Failed to load payslip requests", {
          description: error,
        });
      } else {
        setRequests(data);
        setCachedData(PAYSLIP_REQUESTS_CACHE_KEY, data);
        if (forceRefresh) {
          toast.success("List refreshed", {
            description: "Payslip requests have been updated.",
            duration: 2000,
          });
        }
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

  const handleUpdateStatusClick = useCallback(
    (requestId: string, newStatus: "APPROVED" | "REJECTED") => {
      if (!loggedInAdminId || isPending || !isOwner) {
        console.warn("Action blocked: Loading, Pending, or Not Owner.");
        return;
      }

      setPendingActionRequestId(requestId);
      setPendingActionType(newStatus === "APPROVED" ? "APPROVE" : "REJECT");
      if (newStatus === "APPROVED") {
        setConfirmApproveOpen(true);
      } else {
        setConfirmRejectOpen(true);
      }
    },
    [loggedInAdminId, isPending, isOwner],
  );

  const handleConfirmUpdateStatus = useCallback(
    async (notes?: string | null) => {
      if (!pendingActionRequestId || !pendingActionType) return;

      const newStatus = pendingActionType === "APPROVE" ? "APPROVED" : "REJECTED";
      const actionText = pendingActionType.toLowerCase();
      const requestId = pendingActionRequestId;

      setConfirmApproveOpen(false);
      setConfirmRejectOpen(false);
      setListError(null);

      startTransition(async () => {
        try {
          const result = await updatePayslipRequestStatusAction(
            requestId,
            newStatus,
            loggedInAdminId,
            notes,
          );
          if (!result.success) {
            const errorMsg =
              result.error ||
              result.message ||
              `Failed to ${actionText} request ${requestId}.`;
            setListError(errorMsg);
            toast.error(`Failed to ${actionText} request`, {
              description: errorMsg,
            });
          } else {
            toast.success(`Request ${actionText}ed successfully`, {
              description: "The list will now refresh.",
              duration: 3000,
            });
            invalidateCache(PAYSLIP_REQUESTS_CACHE_KEY);
            loadRequests(true);
          }
        } catch (error: any) {
          const errorMsg = error.message || `Failed to ${actionText} request.`;
          setListError(errorMsg);
          toast.error(`Error ${actionText}ing request`, {
            description: errorMsg,
          });
        } finally {
          setPendingActionRequestId(null);
          setPendingActionType(null);
        }
      });
    },
    [pendingActionRequestId, pendingActionType, loggedInAdminId, loadRequests],
  );

  const handleProcessAndReleaseClick = useCallback(
    (requestId: string) => {
      if (!loggedInAdminId || isPending || !isOwner) {
        console.warn("Release action blocked: Loading, Pending, or Not Owner.");
        return;
      }

      setPendingActionRequestId(requestId);
      setPendingActionType("RELEASE");
      setConfirmReleaseOpen(true);
    },
    [loggedInAdminId, isPending, isOwner],
  );

  const handleConfirmProcessAndRelease = useCallback(async () => {
    if (!pendingActionRequestId) return;

    const requestId = pendingActionRequestId;
    setConfirmReleaseOpen(false);
    setListError(null);

    startTransition(async () => {
      try {
        const result = await processAndReleasePayslipAction(
          requestId,
          loggedInAdminId,
        );
        if (!result.success) {
          const errorMsg =
            result.error ||
            result.message ||
            `Failed to process/release payslip for request ${requestId}.`;
          setListError(errorMsg);
          toast.error("Failed to release payslip", {
            description: errorMsg,
          });
        } else {
          toast.success("Payslip released successfully", {
            description: result.message || "The list will now refresh.",
            duration: 3000,
          });
          invalidateCache(PAYSLIP_REQUESTS_CACHE_KEY);
          loadRequests(true);
        }
      } catch (error: any) {
        const errorMsg = error.message || "Failed to release payslip.";
        setListError(errorMsg);
        toast.error("Error releasing payslip", {
          description: errorMsg,
        });
      } finally {
        setPendingActionRequestId(null);
        setPendingActionType(null);
      }
    });
  }, [pendingActionRequestId, loggedInAdminId, loadRequests]);

  const selectedRequest = pendingActionRequestId
    ? requests.find((r) => r.id === pendingActionRequestId)
    : null;

  // Base styles
  const thStyleBase =
    "px-3 py-2 text-left text-xs font-medium text-foreground/80 uppercase tracking-wider";
  const tdStyleBase = "px-3 py-2 text-sm text-foreground/90 align-top"; // Align top for cells with multiline content

  if (!isOwner) {
    return (
      <Card className="m-4">
        <CardContent className="flex min-h-[200px] flex-col items-center justify-center p-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="mt-4 text-2xl font-semibold">Access Denied</h2>
          <p className="mt-2 text-muted-foreground">
            This page is for Owners only.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <CardTitle>Manage Payslip Requests</CardTitle>
            <Button
              onClick={handleRefresh}
              disabled={isLoading || isPending}
              size="sm"
              variant="outline"
            >
              {isLoading || isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh List
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {listError && (
            <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              {listError}
            </div>
          )}

          {isLoading && requests.length === 0 ? (
            <div className="space-y-4 py-8">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : !listError && requests.length === 0 ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center text-center">
              <p className="text-muted-foreground">No payslip requests found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <ScrollArea className="h-[600px]">
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
                    <span className="block text-xs italic text-muted-foreground">
                      ({req.account.role.map((r) => r.toLowerCase()).join(", ")}
                      )
                    </span>
                  </td>
                  {/* Period */}
                  <td className={`${tdStyleBase} whitespace-nowrap`}>
                    {format(req.periodStartDate, "MMM d, yyyy")}
                    <span className="block text-muted-foreground">
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
                    <Badge
                      variant={
                        req.status === "PENDING"
                          ? "secondary"
                          : req.status === "APPROVED"
                            ? "default"
                            : req.status === "REJECTED" || req.status === "FAILED"
                              ? "destructive"
                              : "default"
                      }
                      className={
                        req.status === "PROCESSED"
                          ? "bg-green-100 text-green-800 hover:bg-green-200"
                          : ""
                      }
                    >
                      {req.status.replace("_", " ")}
                    </Badge>
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
                          <>
                            <Button
                              onClick={() =>
                                handleUpdateStatusClick(req.id, "APPROVED")
                              }
                              disabled={isPending}
                              size="sm"
                              variant="default"
                              className="mr-2"
                              title="Approve Request"
                            >
                              <CheckCircle className="mr-1 h-4 w-4" /> Approve
                            </Button>
                            <Button
                              onClick={() =>
                                handleUpdateStatusClick(req.id, "REJECTED")
                              }
                              disabled={isPending}
                              size="sm"
                              variant="destructive"
                              className="mr-2"
                              title="Reject Request"
                            >
                              <XCircle className="mr-1 h-4 w-4" /> Reject
                            </Button>
                          </>
                        )}
                        {req.status === PayslipRequestStatus.APPROVED && (
                          <Button
                            onClick={() => handleProcessAndReleaseClick(req.id)}
                            disabled={isPending}
                            size="sm"
                            className="bg-green-600 text-white hover:bg-green-700"
                            title="Process and Release Payslip"
                          >
                            <DollarSign className="mr-1 h-4 w-4" /> Release
                            Payslip
                          </Button>
                        )}
                        {/* Optional: Button to view the generated payslip */}
                        {req.status === PayslipRequestStatus.PROCESSED &&
                          req.relatedPayslipId && (
                            <Button
                              onClick={() => {
                                /* Implement navigation or modal to view payslip using req.relatedPayslipId */
                                toast.info("View Payslip", {
                                  description: `Feature not yet implemented. Payslip ID: ${req.relatedPayslipId}`,
                                  duration: 5000,
                                });
                              }}
                              disabled={isPending}
                              size="sm"
                              variant="outline"
                              title="View Generated Payslip"
                            >
                              <Eye size={14} className="mr-1" /> View Payslip
                            </Button>
                          )}
                        {(req.status === PayslipRequestStatus.REJECTED ||
                          req.status === PayslipRequestStatus.FAILED) && (
                          <span className="text-sm text-muted-foreground">
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
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm Approve Dialog */}
      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve Payslip Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this payslip request for{" "}
              <span className="font-semibold">
                {selectedRequest?.account.name}
              </span>
              ? This will allow the payslip to be processed and released.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmApproveOpen(false);
                setPendingActionRequestId(null);
                setPendingActionType(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleConfirmUpdateStatus()}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Reject Dialog */}
      <Dialog open={confirmRejectOpen} onOpenChange={setConfirmRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Payslip Request</DialogTitle>
            <DialogDescription>
              Are you sure you want to reject this payslip request for{" "}
              <span className="font-semibold">
                {selectedRequest?.account.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmRejectOpen(false);
                setPendingActionRequestId(null);
                setPendingActionType(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleConfirmUpdateStatus()}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Release Dialog */}
      <Dialog open={confirmReleaseOpen} onOpenChange={setConfirmReleaseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process and Release Payslip</DialogTitle>
            <DialogDescription>
              Are you sure you want to process and release this payslip for{" "}
              <span className="font-semibold">
                {selectedRequest?.account.name}
              </span>
              ? This action cannot be undone and will finalize earnings for the
              requested period.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setConfirmReleaseOpen(false);
                setPendingActionRequestId(null);
                setPendingActionType(null);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmProcessAndRelease}
              disabled={isPending}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Release Payslip
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
