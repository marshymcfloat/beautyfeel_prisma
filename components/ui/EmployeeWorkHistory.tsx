"use client";

import React, { useState, useEffect, useCallback } from "react";
import Modal from "../Dialog/Modal"; // Adjust path as needed
import DialogTitle from "../Dialog/DialogTitle"; // Adjust path as needed
import {
  getEmployeeWorkHistory,
  requestPayslipAction,
} from "@/lib/SalaryActions"; // Adjust path as needed
import { format } from "date-fns";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "./button";

// --- Type Definitions ---
type PayslipActionResult = {
  success: boolean;
  message: string;
  errors?: Record<string, string[]>;
};

type EmployeeWorkHistoryData = {
  account: {
    id: string;
    name: string;
    dailyRate: number;
    salary: number;
    canRequestPayslip: boolean;
  };
  lastPayslip: { periodEndDate: Date } | null;
  commissionSummary: {
    totalCommissionSinceCutoff: number;
    entries: Array<{
      availedServiceId: string;
      transactionId: string;
      transactionCreatedAt: Date;
      title: string;
      itemQuantity: number;
      servedUnitCount: number;
      totalCommissionForThisASItem: number;
    }>;
  };
  payslipRequests: Array<{
    id: string;
    status: string;
    requestTimestamp: Date;
    periodStartDate: Date;
    periodEndDate: Date;
    notes: string | null;
  }>;
  currentPeriodStartDate: Date | null;
};

interface EmployeeWorkHistoryProps {
  accountId: string;
  isOpen: boolean;
  onClose: () => void;
}

// --- Helper UI Components (unchanged) ---
const SimpleScrollArea: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div className={`overflow-y-auto ${className}`}>{children}</div>
);
const Label: React.FC<React.LabelHTMLAttributes<HTMLLabelElement>> = ({
  className,
  children,
  ...props
}) => (
  <label
    className={`mb-1.5 block text-sm font-medium text-customBlack ${className}`}
    {...props}
  >
    {children}
  </label>
);
const Input: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = ({
  className,
  ...props
}) => (
  <input
    className={`focus:ring-customBlue block w-full rounded-md border border-customGray/50 px-3 py-2 shadow-sm focus:outline-none disabled:cursor-not-allowed disabled:bg-customGray/10 sm:text-sm ${className}`}
    {...props}
  />
);
const Textarea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = ({
  className,
  ...props
}) => (
  <textarea
    className={`focus:ring-customBlue block w-full rounded-md border border-customGray/50 px-3 py-2 shadow-sm focus:outline-none sm:text-sm ${className}`}
    {...props}
  ></textarea>
);

// --- Main Component ---
const EmployeeWorkHistory: React.FC<EmployeeWorkHistoryProps> = ({
  accountId,
  isOpen,
  onClose,
}) => {
  const [data, setData] = useState<EmployeeWorkHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [isRequestFormModalOpen, setIsRequestFormModalOpen] = useState(false);
  const [isRequestPendingLocal, setIsRequestPendingLocal] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);
  const [requestMessage, setRequestMessage] = useState("");
  const [requestErrorsDetail, setRequestErrorsDetail] =
    useState<Record<string, string[]>>();
  const [notesInput, setNotesInput] = useState("");

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedData = await getEmployeeWorkHistory(accountId);
      console.log(fetchedData);
      setData(fetchedData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    if (isOpen && !data && accountId) {
      fetchData();
    }
    if (!isOpen) {
      setData(null);
      setError(null);
      setIsRequestFormModalOpen(false);
      setIsRequestPendingLocal(false);
      setRequestSuccess(false);
      setRequestMessage("");
      setRequestErrorsDetail(undefined);
      setNotesInput("");
    }
  }, [isOpen, data, accountId, fetchData]);

  const handleRefresh = useCallback(async () => {
    if (!accountId || isLoading) return;
    setIsLoading(true);
    setError(null);
    try {
      const refreshedData = await getEmployeeWorkHistory(accountId);
      setData(refreshedData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [accountId, isLoading]);

  // --- MODIFIED: This function is updated to match the new server action ---
  const handleSubmitRequest = useCallback(async () => {
    if (!accountId) return;

    setIsRequestPendingLocal(true);
    setRequestSuccess(false);
    setRequestMessage("");
    setRequestErrorsDetail(undefined);

    // The notes are still needed, but periodEndDateString is not.
    const notes = notesInput.trim();

    try {
      // Call the action without periodEndDateString. The server sets the date.
      const result: PayslipActionResult = await requestPayslipAction({
        accountId,
        notes: notes || undefined,
      });

      if (result.success) {
        setRequestSuccess(true);
        setRequestMessage(result.message);
      } else {
        setRequestMessage(result.message);
        setRequestErrorsDetail(result.errors);
      }
    } catch (err: any) {
      setRequestMessage(
        `An unexpected error occurred: ${err.message || String(err)}`,
      );
    } finally {
      setIsRequestPendingLocal(false);
    }
  }, [accountId, notesInput]);

  useEffect(() => {
    if (requestSuccess && isRequestFormModalOpen) {
      const timer = setTimeout(() => {
        setIsRequestFormModalOpen(false);
        handleRefresh();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [requestSuccess, isRequestFormModalOpen, handleRefresh]);

  // --- The rest of the component remains the same ---
  // ... (all the JSX from your original component) ...

  const currentPeriodStartDate = data?.currentPeriodStartDate || null;
  const currentPeriodDisplayStart = currentPeriodStartDate
    ? format(currentPeriodStartDate, "PP")
    : "Beginning of Employment";

  if (isLoading && !data) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center p-6 text-customBlack">
        <Loader2 className="text-customBlue mb-4 h-8 w-8 animate-spin" />
        <p>Loading work history...</p>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="text-customRed flex min-h-[300px] flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="mb-4 h-10 w-10" />
        <h2 className="mb-2 text-xl font-semibold">Error Loading Data</h2>
        <p className="mb-4">{error.message}</p>
        <Button onClick={handleRefresh} variant="outline">
          Try Again
        </Button>
      </div>
    );
  }

  if (!isOpen || !data) {
    return null;
  }

  return (
    <div className="space-y-6 py-4">
      <div className="grid grid-cols-1 gap-4 rounded-md border bg-white p-4 shadow-sm md:grid-cols-3">
        <div className="md:col-span-3">
          <h1 className="mb-4 text-2xl font-bold text-customBlack">
            Performance & Earnings for {data.account.name}
          </h1>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-customBlack/70">
            Current Total Earnings (Gross)
          </p>
          <p className="text-primary-dark text-2xl font-extrabold">
            ₱{data.account.salary.toLocaleString()}
          </p>
          <p className="text-xs text-customBlack/50">
            (Includes daily rate & commissions)
          </p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-customBlack/70">
            Commission Since Last Payout
          </p>
          <p className="text-customGreen text-xl font-bold">
            ₱
            {data.commissionSummary.totalCommissionSinceCutoff.toLocaleString()}
          </p>
          <p className="text-xs text-customBlack/50">
            ({data.commissionSummary.entries.length} contributing items)
          </p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p className="text-sm text-customBlack/70">Latest Daily Rate</p>
          <p className="text-xl font-bold text-customBlack/90">
            ₱{data.account.dailyRate.toLocaleString()} / day
          </p>
        </div>
        <div className="mt-4 flex justify-center md:col-span-3">
          <Button
            onClick={handleRefresh}
            disabled={isLoading}
            variant="outline"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Refresh Data
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-customBlack">
          Payslip Status
        </h2>
        <p className="text-sm text-customBlack/70">
          {data.lastPayslip
            ? `Last Payslip Released covers period ending: ${format(new Date(data.lastPayslip.periodEndDate), "PP")}`
            : "No previous payslip released on record."}
        </p>
        <p className="mt-1 text-sm text-customBlack/70">
          Current Work Period starts from: {currentPeriodDisplayStart}
        </p>

        <h3 className="mt-4 text-base font-medium text-customBlack">
          Payslip Requests for Current Period
        </h3>
        {data.payslipRequests.length > 0 ? (
          <SimpleScrollArea className="h-auto max-h-[150px] w-full rounded-md border p-2">
            <ul className="space-y-2">
              {data.payslipRequests.map((req) => (
                <li
                  key={req.id}
                  className="flex flex-col rounded p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    Period: {format(new Date(req.periodStartDate), "PP")} -{" "}
                    {format(new Date(req.periodEndDate), "PP")}
                  </span>
                  <span
                    className={`mt-2 whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold sm:mt-0 ${req.status === "PENDING" ? "bg-yellow-200 text-yellow-900" : "bg-green-200 text-green-900"}`}
                  >
                    {req.status}
                  </span>
                </li>
              ))}
            </ul>
          </SimpleScrollArea>
        ) : (
          <p className="text-sm text-customBlack/70">
            No payslip requests submitted for this period yet.
          </p>
        )}

        {data.account.canRequestPayslip && (
          <Button
            onClick={() => setIsRequestFormModalOpen(true)}
            className="btn-primary mt-4"
            disabled={isRequestPendingLocal}
          >
            Request Payslip Release
          </Button>
        )}

        <Modal
          isOpen={isRequestFormModalOpen}
          onClose={() => {
            if (!isRequestPendingLocal) setIsRequestFormModalOpen(false);
          }}
          title={<DialogTitle>Request Payslip</DialogTitle>}
          size="md"
        >
          <div className="space-y-6 p-6">
            <div className="rounded-md bg-blue-50 p-4">
              <p className="text-sm text-customBlack/80">
                This will submit a request for all unpaid earnings from the
                start of the current work period up to and including today's
                date.
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="periodStartDate">
                  Period Start{" "}
                  <span className="font-normal text-customBlack/60">
                    (DateTime)
                  </span>
                </Label>
                <div className="space-y-2">
                  <Input
                    id="periodStartDate"
                    type="datetime-local"
                    readOnly
                    value={
                      currentPeriodStartDate
                        ? (() => {
                            // Convert to local timezone for datetime-local input
                            const localDate = new Date(currentPeriodStartDate);
                            const year = localDate.getFullYear();
                            const month = String(
                              localDate.getMonth() + 1,
                            ).padStart(2, "0");
                            const day = String(localDate.getDate()).padStart(
                              2,
                              "0",
                            );
                            const hours = String(localDate.getHours()).padStart(
                              2,
                              "0",
                            );
                            const minutes = String(
                              localDate.getMinutes(),
                            ).padStart(2, "0");
                            return `${year}-${month}-${day}T${hours}:${minutes}`;
                          })()
                        : ""
                    }
                    disabled
                    className="mb-2"
                  />
                  {currentPeriodStartDate && (
                    <p className="text-xs text-customBlack/60">
                      Full DateTime: {format(currentPeriodStartDate, "PPpp")}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Period End{" "}
                  <span className="font-normal text-customBlack/60">
                    (DateTime)
                  </span>
                </Label>
                <div className="space-y-2">
                  <div className="flex h-10 w-full items-center rounded-md border border-customGray/50 bg-customGray/10 px-3 py-2 text-sm text-customBlack/70">
                    Current DateTime (Set Automatically at Request Time)
                  </div>
                  <p className="text-xs text-customBlack/60">
                    The period will end at the exact moment you submit this
                    request, including the full time component (hours, minutes,
                    seconds).
                  </p>
                  <p className="text-xs font-medium text-customBlack/70">
                    Example: {format(new Date(), "PPpp")}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">
                  Notes <span className="text-customBlack/50">(Optional)</span>
                </Label>
                <Textarea
                  id="notes"
                  rows={4}
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  disabled={isRequestPendingLocal}
                  placeholder="Add any additional notes or comments..."
                />
              </div>
            </div>

            {(requestMessage || requestErrorsDetail?.general) && (
              <div className="space-y-2">
                {requestMessage && (
                  <div
                    className={`rounded-md p-3 text-sm ${
                      requestSuccess
                        ? "bg-green-50 text-green-800"
                        : "bg-red-50 text-red-800"
                    }`}
                  >
                    {requestMessage}
                  </div>
                )}
                {requestErrorsDetail?.general && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
                    {requestErrorsDetail.general.join(", ")}
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsRequestFormModalOpen(false)}
                disabled={isRequestPendingLocal || requestSuccess}
                className="w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSubmitRequest}
                disabled={isRequestPendingLocal || requestSuccess}
                className="w-full sm:w-auto"
              >
                {isRequestPendingLocal && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isRequestPendingLocal ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>

      <div className="rounded-md border bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-lg font-semibold text-customBlack">
          Commissions Since Last Payout Period
        </h2>
        {data.commissionSummary.entries.length > 0 ? (
          <SimpleScrollArea className="h-auto max-h-[300px] w-full rounded-md border p-2">
            <ul className="space-y-4">
              {data.commissionSummary.entries.map((entry) => (
                <li
                  key={entry.availedServiceId}
                  className="border-b pb-3 text-sm last:border-b-0 last:pb-0"
                >
                  <div className="flex justify-between">
                    <span className="font-medium text-customBlack">
                      {entry.title}
                    </span>
                    <span className="text-customGreen text-base font-bold">
                      ₱{entry.totalCommissionForThisASItem.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-xs text-customBlack/60">
                    Transaction:{" "}
                    {format(new Date(entry.transactionCreatedAt), "PPpp")}
                  </p>
                  <p className="text-xs text-customBlack/60">
                    ({entry.servedUnitCount} of {entry.itemQuantity} units by
                    you)
                  </p>
                </li>
              ))}
            </ul>
          </SimpleScrollArea>
        ) : (
          <p className="text-sm text-customBlack/70">
            No completed units with associated commission since the last payslip
            period.
          </p>
        )}
      </div>

      <style jsx global>{`
        .btn-primary {
          @apply bg-customBlue hover:bg-customBlue/90 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50;
        }
        .btn-secondary {
          @apply inline-flex items-center justify-center rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50;
        }
      `}</style>
    </div>
  );
};

export default EmployeeWorkHistory;
