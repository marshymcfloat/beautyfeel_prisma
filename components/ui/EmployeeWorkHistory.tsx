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
    className={`block text-sm font-medium text-customBlack/80 ${className}`}
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
        <p>{error.message}</p>
        <button onClick={handleRefresh} className="btn-primary mt-4">
          Try Again
        </button>
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
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="btn-primary"
          >
            {isLoading ? (
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            ) : null}{" "}
            Refresh Data
          </button>
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
          <button
            onClick={() => setIsRequestFormModalOpen(true)}
            className="btn-primary mt-4"
            disabled={isRequestPendingLocal}
          >
            Request Payslip Release
          </button>
        )}

        <Modal
          isOpen={isRequestFormModalOpen}
          onClose={() => {
            if (!isRequestPendingLocal) setIsRequestFormModalOpen(false);
          }}
          title={<DialogTitle>Request Payslip</DialogTitle>}
          size="md"
        >
          <div className="space-y-4 p-4">
            <p className="mb-2 mt-1 text-sm text-customBlack/70">
              This will submit a request for all unpaid earnings from the start
              of the current work period **up to and including today's date**.
            </p>
            <div className="grid gap-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="periodStartDate" className="text-right">
                  Period Start
                </Label>
                <Input
                  id="periodStartDate"
                  type="date"
                  className="col-span-3"
                  readOnly
                  value={
                    currentPeriodStartDate
                      ? format(currentPeriodStartDate, "yyyy-MM-dd")
                      : ""
                  }
                  disabled
                />
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Period End</Label>
                <div className="col-span-3 rounded-md border border-customGray/50 bg-customGray/10 px-3 py-2 text-sm text-customBlack/70">
                  Today's Date (Set Automatically)
                </div>
              </div>

              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">
                  Notes (Optional)
                </Label>
                <Textarea
                  id="notes"
                  rows={3}
                  className="col-span-3"
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  disabled={isRequestPendingLocal}
                />
              </div>

              {requestMessage && (
                <p
                  className={`col-span-4 mt-2 text-center text-sm ${requestSuccess ? "text-green-700" : "text-red-600"}`}
                >
                  {requestMessage}
                </p>
              )}
              {requestErrorsDetail?.general && (
                <p className="col-span-4 mt-2 text-center text-sm text-red-600">
                  {requestErrorsDetail.general.join(", ")}
                </p>
              )}

              <div className="col-span-4 flex justify-end gap-2 border-t pt-4">
                <button
                  type="button"
                  onClick={handleSubmitRequest}
                  className="btn-primary"
                  disabled={isRequestPendingLocal || requestSuccess}
                >
                  {isRequestPendingLocal && (
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  )}
                  {isRequestPendingLocal ? "Submitting..." : "Submit Request"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsRequestFormModalOpen(false)}
                  className="btn-secondary"
                  disabled={isRequestPendingLocal || requestSuccess}
                >
                  Cancel
                </button>
              </div>
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
