"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/Separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getPayslipBreakdownForPeriod,
  updatePayslipRequestStatusAction,
} from "@/lib/SalaryActions";
import { format } from "date-fns";
import {
  Loader2,
  Calendar,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// Types
type BreakdownData = Awaited<
  ReturnType<typeof getPayslipBreakdownForPeriod>
>["data"];
type PayslipRequestWithAccounts = NonNullable<BreakdownData>["request"];

interface PayslipReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: PayslipRequestWithAccounts | null;
  onActionComplete: () => void;
  adminAccountId?: string;
}

// Rejection Notes Dialog Component
const RejectionNotesDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (notes: string | null) => void;
  employeeName: string;
}> = ({ isOpen, onClose, onConfirm, employeeName }) => {
  const [notes, setNotes] = useState("");

  const handleConfirm = () => {
    onConfirm(notes.trim() || null);
    setNotes("");
  };

  const handleCancel = () => {
    setNotes("");
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Reject Payslip Request</DialogTitle>
          <DialogDescription>
            Please provide a reason for rejecting {employeeName}'s payslip
            request (optional).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="rejection-notes">Rejection Reason</Label>
            <Input
              id="rejection-notes"
              placeholder="Enter reason for rejection..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirm Rejection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// Loading skeleton component
const BreakdownSkeleton = () => (
  <div className="space-y-6 p-6">
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {[1, 2].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[1, 2, 3].map((j) => (
                <Skeleton key={j} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
);

export const PayslipReviewModal: React.FC<PayslipReviewModalProps> = ({
  isOpen,
  onClose,
  request,
  onActionComplete,
}) => {
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRejectionDialog, setShowRejectionDialog] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "APPROVED" | "REJECTED" | null
  >(null);

  const fetchBreakdown = useCallback(async (reqId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getPayslipBreakdownForPeriod(reqId);
      if (result.success && result.data) {
        setBreakdown(result.data);
      } else {
        const errorMsg = result.error || "Failed to load breakdown data.";
        setError(errorMsg);
        toast.error("Failed to load payslip breakdown", {
          description: errorMsg,
        });
      }
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(errorMsg);
      toast.error("Failed to load payslip breakdown", {
        description: errorMsg,
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && request && !breakdown && !isLoading) {
      fetchBreakdown(request.id);
    }
    if (!isOpen) {
      setBreakdown(null);
      setError(null);
      setIsProcessingAction(false);
      setShowRejectionDialog(false);
      setPendingAction(null);
    }
  }, [isOpen, request, breakdown, isLoading, fetchBreakdown]);

  const handleActionConfirm = useCallback(
    async (action: "APPROVED" | "REJECTED", notes?: string | null) => {
      if (!request) return;

      setIsProcessingAction(true);
      try {
        const result = await updatePayslipRequestStatusAction(
          request.id,
          action,
          notes || undefined,
        );

        if (result.success) {
          toast.success(`Request ${action.toLowerCase()} successfully`, {
            description: `The payslip request for ${request.account.name} has been ${action.toLowerCase()}.`,
          });
          onActionComplete();
          onClose();
        } else {
          toast.error(`Failed to ${action.toLowerCase()} request`, {
            description: result.error || "An unexpected error occurred.",
          });
        }
      } catch (err) {
        toast.error(`Failed to ${action.toLowerCase()} request`, {
          description:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred.",
        });
      } finally {
        setIsProcessingAction(false);
        setPendingAction(null);
      }
    },
    [request, onActionComplete, onClose],
  );

  const handleApprove = useCallback(() => {
    if (!request) return;
    setPendingAction("APPROVED");
    handleActionConfirm("APPROVED");
  }, [request, handleActionConfirm]);

  const handleReject = useCallback(() => {
    if (!request) return;
    setPendingAction("REJECTED");
    setShowRejectionDialog(true);
  }, [request]);

  const handleRejectionConfirm = useCallback(
    (notes: string | null) => {
      setShowRejectionDialog(false);
      handleActionConfirm("REJECTED", notes);
    },
    [handleActionConfirm],
  );

  const renderContent = () => {
    if (isLoading) {
      return <BreakdownSkeleton />;
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="mb-4 h-12 w-12 text-destructive" />
          <h3 className="mb-2 text-xl font-semibold">An Error Occurred</h3>
          <p className="mb-4 text-muted-foreground">{error}</p>
          <Button
            onClick={() => request && fetchBreakdown(request.id)}
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      );
    }

    if (breakdown && request) {
      return (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Employee
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold">{request.account.name}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm font-medium">
                  {format(
                    new Date(breakdown.request.periodStartDate),
                    "MMM dd, yyyy",
                  )}{" "}
                  -{" "}
                  {format(
                    new Date(breakdown.request.periodEndDate),
                    "MMM dd, yyyy",
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Total Net Pay
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-extrabold text-green-600">
                  ₱{breakdown.netPay.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Attendance and Commissions */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Attendance Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <Calendar className="mr-2 h-5 w-5 text-blue-600" />
                  Attendance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[240px] pr-4">
                  {breakdown.attendanceRecords.length > 0 ? (
                    <div className="space-y-2">
                      {breakdown.attendanceRecords.map((att) => (
                        <div
                          key={att.date.toISOString()}
                          className={`flex items-center justify-between rounded-lg p-3 ${
                            att.isPresent
                              ? "bg-green-50 text-green-900"
                              : "bg-red-50 text-red-900"
                          }`}
                        >
                          <span className="text-sm font-medium">
                            {format(att.date, "MMM dd, yyyy (eee)")}
                          </span>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={
                                att.isPresent ? "default" : "destructive"
                              }
                              className={
                                att.isPresent
                                  ? "bg-green-600 hover:bg-green-700"
                                  : ""
                              }
                            >
                              {att.isPresent ? "PRESENT" : "ABSENT"}
                            </Badge>
                            {!att.hasRecord && (
                              <span className="text-xs text-muted-foreground">
                                (no record)
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No attendance data for this period.
                    </div>
                  )}
                </ScrollArea>
                <Separator />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Base Salary:</span>
                  <span>₱{breakdown.baseSalaryForPeriod.toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>

            {/* Commissions Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center text-lg">
                  <DollarSign className="mr-2 h-5 w-5 text-green-600" />
                  Commissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ScrollArea className="h-[240px] pr-4">
                  {breakdown.commissionDetails.length > 0 ? (
                    <div className="space-y-3">
                      {breakdown.commissionDetails.map((entry, index) => (
                        <div
                          key={`${entry.availedServiceId}-${index}`}
                          className="rounded-lg border p-3"
                        >
                          <p className="mb-2 text-sm font-medium">
                            {entry.title}
                          </p>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">
                              Units: {entry.servedUnitCount}
                            </span>
                            <span className="font-bold text-green-600">
                              ₱
                              {entry.totalCommissionForThisASItem.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      No commissions earned in this period.
                    </div>
                  )}
                </ScrollArea>
                <Separator />
                <div className="flex items-center justify-between text-sm font-semibold">
                  <span>Total Commissions:</span>
                  <span>
                    ₱{breakdown.totalCommissionsForPeriod.toLocaleString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review Payslip Request</DialogTitle>
            <DialogDescription>
              Review the attendance and commission details before approving or
              rejecting this payslip request.
            </DialogDescription>
          </DialogHeader>

          {renderContent()}

          {breakdown && request && !isLoading && !error && (
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between sm:gap-0">
              <div className="flex w-full items-center gap-2 rounded-md bg-yellow-50 px-3 py-2 text-sm text-yellow-700 sm:w-auto">
                <AlertTriangle className="h-4 w-4" />
                <span>
                  Approving will move the request to "Ready to Process"
                </span>
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button
                  variant="destructive"
                  onClick={handleReject}
                  disabled={isProcessingAction}
                  className="flex-1 sm:flex-initial"
                >
                  {isProcessingAction && pendingAction === "REJECTED" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={isProcessingAction}
                  className="flex-1 sm:flex-initial"
                >
                  {isProcessingAction && pendingAction === "APPROVED" ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Approve
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Rejection Notes Dialog */}
      {request && (
        <RejectionNotesDialog
          isOpen={showRejectionDialog}
          onClose={() => {
            setShowRejectionDialog(false);
            setPendingAction(null);
          }}
          onConfirm={handleRejectionConfirm}
          employeeName={request.account.name}
        />
      )}
    </>
  );
};
