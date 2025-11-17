"use client";

import React, { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import {
  getPayslipBreakdownForPeriod,
  updatePayslipRequestStatusAction,
} from "@/lib/SalaryActions";
import { format } from "date-fns";
import { Loader2, Calendar, DollarSign, AlertCircle } from "lucide-react";

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

const SimpleScrollArea: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={`overflow-y-auto ${className}`}>{children}</div>
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

  const fetchBreakdown = useCallback(async (reqId: string) => {
    setIsLoading(true);
    setError(null);
    const result = await getPayslipBreakdownForPeriod(reqId);
    if (result.success && result.data) {
      setBreakdown(result.data);
    } else {
      setError(result.error || "Failed to load breakdown data.");
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isOpen && request && !breakdown && !isLoading) {
      fetchBreakdown(request.id);
    }
    if (!isOpen) {
      setBreakdown(null);
      setError(null);
      setIsProcessingAction(false);
    }
  }, [isOpen, request, breakdown, isLoading, fetchBreakdown]);

  const handleAction = async (action: "APPROVED" | "REJECTED") => {
    if (!request) return;

    let notes: string | null = null;
    if (action === "REJECTED") {
      notes = prompt("Please provide a reason for rejection (optional):");
      if (notes === null) return;
    }

    if (
      !confirm(
        `You are about to ${action.toLowerCase()} this request for ${
          request.account.name
        }.\n\nDo you want to proceed?`,
      )
    )
      return;

    setIsProcessingAction(true);
    const result = await updatePayslipRequestStatusAction(
      request.id,
      action,
      notes || undefined,
    );

    if (result.success) {
      alert(
        `Request successfully ${action.toLowerCase()}. The list will now refresh.`,
      );
      onActionComplete();
      onClose();
    } else {
      alert(`Error: ${result.error}`);
      setIsProcessingAction(false);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center">
          <Loader2 className="text-customBlue h-8 w-8 animate-spin" />
          <p className="mt-4 text-customBlack/70">
            Loading accurate payslip breakdown...
          </p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center text-red-600">
          <AlertCircle className="h-10 w-10" />
          <h3 className="mt-4 text-xl font-semibold">An Error Occurred</h3>
          <p className="mt-1">{error}</p>
          <button
            onClick={() => request && fetchBreakdown(request.id)}
            className="btn-primary mt-4"
          >
            Retry
          </button>
        </div>
      );
    }

    if (breakdown && request) {
      return (
        <div className="space-y-6 p-4 sm:p-6">
          <div className="grid grid-cols-1 gap-4 rounded-lg border bg-customGray/10 p-4 text-center md:grid-cols-3">
            <div>
              <p className="text-sm text-customBlack/70">Employee</p>
              <p className="text-primary-dark text-lg font-bold">
                {request.account.name}
              </p>
            </div>
            <div>
              <p className="text-sm text-customBlack/70">
                Period for Calculation
              </p>
              <p className="text-lg font-bold">
                {format(new Date(breakdown.request.periodStartDate), "PPpp")} -{" "}
                {format(new Date(breakdown.request.periodEndDate), "PPpp")}
              </p>
            </div>
            <div>
              <p className="text-sm text-customBlack/70">Total Net Pay</p>
              <p className="text-2xl font-extrabold text-green-600">
                ₱{breakdown.netPay.toLocaleString()}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-2 flex items-center text-lg font-semibold text-customBlack">
                <Calendar className="text-customBlue mr-2 h-5 w-5" /> Attendance
              </h3>
              <SimpleScrollArea className="max-h-60 pr-2">
                {breakdown.attendanceRecords.length > 0 ? (
                  <ul className="space-y-1 text-sm">
                    {breakdown.attendanceRecords.map((att) => (
                      <li
                        key={att.date.toISOString()}
                        className={`flex justify-between rounded p-2 ${
                          att.isPresent
                            ? "bg-green-50 text-green-800"
                            : "bg-red-50 text-red-800"
                        }`}
                      >
                        <span>{format(att.date, "MMM dd, yyyy (eee)")}</span>
                        <span className="font-semibold">
                          {att.isPresent ? "PRESENT" : "ABSENT"}
                          {!att.hasRecord && (
                            <span className="ml-1 text-xs opacity-70">
                              (no record)
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center italic text-customBlack/60">
                    No attendance data for this period.
                  </div>
                )}
              </SimpleScrollArea>
              <div className="mt-4 flex justify-between border-t pt-3 font-semibold text-customBlack">
                <span>Base Salary (from Attendance):</span>
                <span>₱{breakdown.baseSalaryForPeriod.toLocaleString()}</span>
              </div>
            </div>

            <div className="rounded-lg border bg-white p-4">
              <h3 className="mb-2 flex items-center text-lg font-semibold text-customBlack">
                <DollarSign className="text-customGreen mr-2 h-5 w-5" />{" "}
                Commissions
              </h3>
              <SimpleScrollArea className="max-h-60 pr-2">
                {breakdown.commissionDetails.length > 0 ? (
                  <ul className="space-y-3 text-sm">
                    {breakdown.commissionDetails.map((entry, index) => (
                      <li
                        key={`${entry.availedServiceId}-${index}`}
                        className="border-b border-customGray/20 pb-2 last:border-b-0"
                      >
                        <p className="font-medium text-customBlack">
                          {entry.title}
                        </p>
                        <div className="flex items-center justify-between text-customBlack/70">
                          <span>
                            Units by employee: {entry.servedUnitCount}
                          </span>
                          <span className="text-customGreen text-base font-bold">
                            ₱
                            {entry.totalCommissionForThisASItem.toLocaleString()}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-4 text-center italic text-customBlack/60">
                    No commissions earned in this period.
                  </div>
                )}
              </SimpleScrollArea>
              <div className="mt-4 flex justify-between border-t pt-3 font-semibold text-customBlack">
                <span>Total Commissions:</span>
                <span>
                  ₱{breakdown.totalCommissionsForPeriod.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-4 rounded-lg border-2 border-yellow-400 bg-yellow-50 p-4 sm:flex-row sm:justify-end">
            <p className="flex-grow text-center text-sm font-medium text-yellow-900 sm:text-left">
              Approving this will move the request to "Ready to Process".
            </p>
            <button
              className="btn-reject w-full sm:w-auto"
              onClick={() => handleAction("REJECTED")}
              disabled={isProcessingAction}
            >
              {isProcessingAction && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Request
            </button>
            <button
              className="btn-approve w-full sm:w-auto"
              onClick={() => handleAction("APPROVED")}
              disabled={isProcessingAction}
            >
              {isProcessingAction && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Approve Request
            </button>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={isProcessingAction ? () => {} : onClose}
      size="3xl"
    >
      <DialogTitle>Review Payslip Request</DialogTitle>
      {renderContent()}

      <style jsx global>{`
        .btn-primary {
          @apply bg-customBlue hover:bg-customBlue/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50;
        }
        .btn-approve {
          @apply inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50;
        }
        .btn-reject {
          @apply inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50;
        }
      `}</style>
    </Modal>
  );
};
