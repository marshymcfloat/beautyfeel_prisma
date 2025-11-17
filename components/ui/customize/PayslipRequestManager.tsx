"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  getPayslipRequestsAction,
  processAndReleasePayslipAction,
  getEmployeesForPayslipManagement,
  updateEmployeePayslipPermissionAction,
} from "@/lib/SalaryActions"; // Adjust path as needed
import { PayslipReviewModal } from "./PayslipReviewModal";
import {
  Loader2,
  FileCog,
  ShieldCheck,
  AlertCircle,
  Settings,
} from "lucide-react";
import { useSession } from "next-auth/react";

// In a real application, you would get this from your authentication session.
const ADMIN_ACCOUNT_ID = "admin-user-id-placeholder";

// Type for a payslip request with its related account data
type PayslipRequestWithAccounts = Awaited<
  ReturnType<typeof getPayslipRequestsAction>
>["data"][0];

// Type for the employee data used in the permissions section
type Employee = {
  id: string;
  name: string;
  canRequestPayslip: boolean;
};

// --- A reusable Toggle Switch component ---
const ToggleSwitch = ({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    disabled={disabled}
    className={`focus:ring-customBlue border-black/ relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? "bg-customBlue" : "bg-gray-300"
    }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-green-400 shadow ring-0 transition duration-200 ease-in-out ${
        checked ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

// Main Component
const PayslipRequestManager: React.FC<{
  initialRequests?: PayslipRequestWithAccounts[];
  initialEmployees?: Employee[];
}> = ({ initialRequests, initialEmployees }) => {
  const sessionData = useSession();

  const [requests, setRequests] = useState<PayslipRequestWithAccounts[]>(
    initialRequests || [],
  );
  const [employees, setEmployees] = useState<Employee[]>(
    initialEmployees || [],
  );
  const [isLoading, setIsLoading] = useState(!initialRequests || !initialEmployees);
  const [error, setError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] =
    useState<PayslipRequestWithAccounts | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingEmployeeId, setProcessingEmployeeId] = useState<
    string | null
  >(null);

  const fetchDashboardData = useCallback(async () => {
    if (!isLoading) setIsLoading(true);
    setError(null);
    try {
      const [requestsResult, employeesResult] = await Promise.all([
        getPayslipRequestsAction(),
        getEmployeesForPayslipManagement(),
      ]);

      if (requestsResult.error || employeesResult.error) {
        throw new Error(
          requestsResult.error ||
            employeesResult.error ||
            "Failed to fetch data.",
        );
      }
      setRequests(requestsResult.data);
      setEmployees(employeesResult.data || []);
    } catch (e: any) {
      setError(e.message || "An unknown error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  useEffect(() => {
    // Only fetch if initial data not provided
    if (!initialRequests || !initialEmployees) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewClick = (request: PayslipRequestWithAccounts) => {
    setSelectedRequest(request);
    setIsReviewModalOpen(true);
  };

  const handleGeneratePayslip = async (requestId: string) => {
    if (
      !confirm(
        "This will finalize and release the payslip for payment. This action is irreversible. Continue?",
      )
    )
      return;
    setIsProcessing(true);

    if (sessionData.data?.user.id) {
      const result = await processAndReleasePayslipAction(
        requestId,
        sessionData.data?.user.id,
      );
      if (result.success) {
        alert(result.message);
        await fetchDashboardData();
      } else {
        alert(`Error: ${result.error}`);
      }
      setIsProcessing(false);
    }
  };

  const handleTogglePermission = async (
    employeeId: string,
    currentStatus: boolean,
  ) => {
    setProcessingEmployeeId(employeeId);
    const result = await updateEmployeePayslipPermissionAction(
      employeeId,
      !currentStatus,
    );

    if (result.success) {
      setEmployees((prev) =>
        prev.map((emp) =>
          emp.id === employeeId
            ? { ...emp, canRequestPayslip: !currentStatus }
            : emp,
        ),
      );
    } else {
      alert(`Error: ${result.error}`);
    }
    setProcessingEmployeeId(null);
  };

  if (isLoading && requests.length === 0) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center text-center">
        <Loader2 className="text-customBlue h-10 w-10 animate-spin" />
        <p className="mt-4 text-lg text-customBlack/70">
          Loading Payslip Dashboard...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center text-red-600">
        <AlertCircle className="h-12 w-12" />
        <h2 className="mt-4 text-2xl font-semibold">Failed to Load Data</h2>
        <p className="mt-2 max-w-md">{error}</p>
        <button onClick={fetchDashboardData} className="btn-primary mt-6">
          Try Again
        </button>
      </div>
    );
  }

  const pendingRequests = requests.filter((r) => r.status === "PENDING");
  const approvedRequests = requests.filter((r) => r.status === "APPROVED");
  const otherRequests = requests.filter(
    (r) => !["PENDING", "APPROVED"].includes(r.status),
  );

  const RequestList = ({
    title,
    reqs,
  }: {
    title: string;
    reqs: PayslipRequestWithAccounts[];
  }) => (
    <div className="mb-8">
      <h2 className="mb-4 flex items-center text-2xl font-bold text-customBlack">
        {title}{" "}
        <span className="bg-customBlue ml-3 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold text-white">
          {reqs.length}
        </span>
      </h2>
      {reqs.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-customGray/40 bg-white p-8 text-center text-customBlack/60">
          <p>No requests in this category.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {reqs.map((req) => (
            <li
              key={req.id}
              className="rounded-lg border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-col items-start justify-between md:flex-row md:items-center">
                <div className="flex-1">
                  <p className="text-primary-dark text-lg font-bold">
                    {req.account.name}
                  </p>
                  <p className="text-sm text-customBlack/70">
                    Period:{" "}
                    <span className="font-medium text-customBlack">
                      {format(new Date(req.periodStartDate), "PP")} -{" "}
                      {format(new Date(req.periodEndDate), "PP")}
                    </span>
                  </p>
                  <p className="text-xs text-customBlack/60">
                    Requested On:{" "}
                    {format(new Date(req.requestTimestamp), "PPpp")}
                  </p>
                  {req.notes && (
                    <p className="mt-1 rounded bg-yellow-50 p-2 text-sm italic text-yellow-800">
                      Notes: "{req.notes}"
                    </p>
                  )}
                </div>
                <div className="mt-4 flex w-full flex-shrink-0 items-center justify-end space-x-2 md:mt-0 md:w-auto">
                  {req.status === "PENDING" && (
                    <button
                      onClick={() => handleReviewClick(req)}
                      disabled={isProcessing}
                      className="btn-secondary"
                    >
                      <FileCog className="mr-2 h-4 w-4" /> Review
                    </button>
                  )}
                  {req.status === "APPROVED" && (
                    <button
                      onClick={() => handleGeneratePayslip(req.id)}
                      disabled={isProcessing}
                      className="btn-generate"
                    >
                      {isProcessing ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="mr-2 h-4 w-4" />
                      )}
                      Generate & Release
                    </button>
                  )}
                  {req.status !== "PENDING" && req.status !== "APPROVED" && (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${
                        req.status === "PROCESSED"
                          ? "bg-green-100 text-green-800"
                          : ""
                      } ${
                        req.status === "REJECTED"
                          ? "bg-red-100 text-red-800"
                          : ""
                      }`}
                    >
                      {req.status}
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-customGray/10 p-4 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col items-start justify-between border-b pb-4 sm:flex-row sm:items-center">
          <h1 className="text-4xl font-extrabold text-customBlack">
            Payslip Dashboard
          </h1>
          <button
            onClick={fetchDashboardData}
            disabled={isLoading}
            className="btn-primary mt-4 sm:mt-0"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        <RequestList
          title="Action Required: Pending Review"
          reqs={pendingRequests}
        />
        <RequestList title="Ready to Process" reqs={approvedRequests} />
        <RequestList title="History" reqs={otherRequests} />

        <div className="mt-12">
          <h2 className="mb-4 flex items-center text-2xl font-bold text-customBlack">
            <Settings className="mr-3 h-6 w-6" /> Employee Payslip Permissions
          </h2>
          <div className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="mb-4 text-sm text-customBlack/70">
              Enable or disable the ability for an employee to request a payslip
              from their dashboard.
            </p>
            <ul className="divide-y divide-customGray/20">
              {employees.map((employee) => (
                <li
                  key={employee.id}
                  className="flex items-center justify-between py-3"
                >
                  <span className="font-medium text-customBlack">
                    {employee.name}
                  </span>
                  <div className="flex items-center gap-4">
                    {processingEmployeeId === employee.id ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ToggleSwitch
                        checked={employee.canRequestPayslip}
                        onChange={() =>
                          handleTogglePermission(
                            employee.id,
                            employee.canRequestPayslip,
                          )
                        }
                        disabled={processingEmployeeId !== null}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {selectedRequest && (
          <PayslipReviewModal
            isOpen={isReviewModalOpen}
            onClose={() => {
              if (isProcessing) return;
              setIsReviewModalOpen(false);
            }}
            request={selectedRequest}
            onActionComplete={fetchDashboardData}
          />
        )}
      </div>

      <style jsx global>{`
        .btn-primary {
          @apply bg-customBlue hover:bg-customBlue/90 inline-flex items-center rounded-md px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50;
        }
        .btn-secondary {
          @apply inline-flex items-center rounded-md bg-gray-200 px-4 py-2 text-sm font-medium text-gray-800 shadow-sm transition-colors hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50;
        }
        .btn-generate {
          @apply inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50;
        }
      `}</style>
    </div>
  );
};

export default PayslipRequestManager;
