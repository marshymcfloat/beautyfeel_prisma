"use client";

import React, { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import {
  getPayslipRequestsAction,
  processAndReleasePayslipAction,
  getEmployeesForPayslipManagement,
  updateEmployeePayslipPermissionAction,
} from "@/lib/SalaryActions";
import { PayslipReviewModal } from "./PayslipReviewModal";
import {
  Loader2,
  FileCog,
  ShieldCheck,
  AlertCircle,
  Settings,
  RefreshCw,
  CheckCircle2,
  X,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { validatePayslipAction } from "@/lib/serverValidationActions";

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
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
      checked ? "border-primary bg-primary" : "border-muted bg-muted"
    }`}
  >
    <span
      aria-hidden="true"
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
        checked ? "translate-x-5" : "translate-x-0"
      }`}
    />
  </button>
);

// Confirmation Dialog Component
const ConfirmReleaseDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  employeeName?: string;
}> = ({ isOpen, onClose, onConfirm, employeeName }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm Payslip Release</DialogTitle>
          <DialogDescription>
            This will finalize and release the payslip for payment.
            {employeeName && (
              <span className="block mt-1 font-semibold text-foreground">
                Employee: {employeeName}
              </span>
            )}
            <span className="block mt-2 text-destructive font-medium">
              This action is irreversible.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <ShieldCheck className="mr-2 h-4 w-4" />
            Confirm & Release
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
  const [confirmReleaseOpen, setConfirmReleaseOpen] = useState(false);
  const [pendingReleaseRequestId, setPendingReleaseRequestId] = useState<
    string | null
  >(null);
  const [validatingRequestId, setValidatingRequestId] = useState<string | null>(null);

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
      toast.success("Data refreshed", {
        description: "Payslip dashboard has been updated.",
        duration: 2000,
      });
    } catch (e: any) {
      const errorMsg = e.message || "An unknown error occurred.";
      setError(errorMsg);
      toast.error("Failed to refresh", {
        description: errorMsg,
      });
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

  const handleGeneratePayslipClick = (requestId: string, employeeName?: string) => {
    setPendingReleaseRequestId(requestId);
    setSelectedRequest(requests.find((r) => r.id === requestId) || null);
    setConfirmReleaseOpen(true);
  };

  const handleConfirmRelease = async () => {
    if (!pendingReleaseRequestId || !sessionData.data?.user.id) {
      toast.error("Error", {
        description: "Missing request ID or user ID.",
      });
      setConfirmReleaseOpen(false);
      return;
    }

    setIsProcessing(true);
    setConfirmReleaseOpen(false);

    try {
      const result = await processAndReleasePayslipAction(
        pendingReleaseRequestId,
        sessionData.data.user.id,
      );

      if (result.success) {
        toast.success("Payslip released", {
          description: result.message || "Payslip has been successfully released.",
        });
        await fetchDashboardData();
      } else {
        toast.error("Failed to release payslip", {
          description: result.error || "An unexpected error occurred.",
        });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to release payslip.",
      });
    } finally {
      setIsProcessing(false);
      setPendingReleaseRequestId(null);
    }
  };

  const handleValidatePayslip = async (requestId: string) => {
    setValidatingRequestId(requestId);
    try {
      const result = await validatePayslipAction(requestId);
      
      if (result.success && result.data) {
        if (result.data.isValid) {
          toast.success("Validation passed", {
            description: "Request and release amounts match exactly.",
            duration: 5000,
          });
        } else {
          const discrepancies = result.data.discrepancies;
          const errorMsg = discrepancies.length > 0
            ? discrepancies.map((d) => 
                `${d.field}: ₱${d.difference.toLocaleString()} difference`
              ).join(", ")
            : "Amounts do not match.";
          
          toast.error("Validation failed", {
            description: errorMsg,
            duration: 8000,
          });
          
          // Log detailed discrepancies to console for debugging
          console.error("Payslip validation discrepancies:", result.data);
        }
      } else {
        toast.error("Validation error", {
          description: result.error || "Failed to validate payslip.",
        });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to validate payslip.",
      });
    } finally {
      setValidatingRequestId(null);
    }
  };

  const handleTogglePermission = async (
    employeeId: string,
    currentStatus: boolean,
  ) => {
    setProcessingEmployeeId(employeeId);
    try {
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
        toast.success(
          `Permission ${!currentStatus ? "enabled" : "disabled"}`,
          {
            description: `Employee can now ${!currentStatus ? "request" : "not request"} payslips.`,
            duration: 2000,
          },
        );
      } else {
        toast.error("Failed to update permission", {
          description: result.error || "An unexpected error occurred.",
        });
      }
    } catch (error: any) {
      toast.error("Error", {
        description: error.message || "Failed to update permission.",
      });
    } finally {
      setProcessingEmployeeId(null);
    }
  };

  if (isLoading && requests.length === 0 && employees.length === 0) {
    return (
      <Card className="m-4">
        <CardContent className="flex min-h-[400px] flex-col items-center justify-center space-y-4 p-12 text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">
            Loading Payslip Dashboard...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error && requests.length === 0 && employees.length === 0) {
    return (
      <Card className="m-4">
        <CardContent className="flex min-h-[400px] flex-col items-center justify-center space-y-4 p-12 text-center">
          <AlertCircle className="h-12 w-12 text-destructive" />
          <h2 className="text-2xl font-semibold">Failed to Load Data</h2>
          <p className="max-w-md text-muted-foreground">{error}</p>
          <Button onClick={fetchDashboardData} variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Try Again
          </Button>
        </CardContent>
      </Card>
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
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center">
          {title}
          <Badge variant="secondary" className="ml-3">
            {reqs.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {reqs.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-muted bg-muted/50 p-8 text-center text-muted-foreground">
            <p>No requests in this category.</p>
          </div>
        ) : (
          <ul className="space-y-4">
            {reqs.map((req) => (
              <Card key={req.id} className="transition-shadow hover:shadow-md">
                <CardContent className="p-4">
                  <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex-1 space-y-1">
                      <p className="text-lg font-bold">{req.account.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Period:{" "}
                        <span className="font-medium text-foreground">
                          {format(new Date(req.periodStartDate), "PP")} -{" "}
                          {format(new Date(req.periodEndDate), "PP")}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Requested On:{" "}
                        {format(new Date(req.requestTimestamp), "PPpp")}
                      </p>
                      {req.notes && (
                        <div className="mt-2 rounded-md bg-yellow-50 p-2 text-sm italic text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400">
                          Notes: "{req.notes}"
                        </div>
                      )}
                    </div>
                    <div className="flex w-full flex-shrink-0 items-center justify-end gap-2 md:w-auto">
                      {req.status === "PENDING" && (
                        <Button
                          onClick={() => handleReviewClick(req)}
                          disabled={isProcessing}
                          variant="outline"
                          size="sm"
                        >
                          <FileCog className="mr-2 h-4 w-4" />
                          Review
                        </Button>
                      )}
                      {req.status === "APPROVED" && (
                        <Button
                          onClick={() =>
                            handleGeneratePayslipClick(req.id, req.account.name)
                          }
                          disabled={isProcessing}
                          variant="default"
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                        >
                          {isProcessing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Generate & Release
                            </>
                          )}
                        </Button>
                      )}
                      {req.status === "PROCESSED" && (
                        <Button
                          onClick={() => handleValidatePayslip(req.id)}
                          disabled={validatingRequestId === req.id || isProcessing}
                          variant="outline"
                          size="sm"
                          title="Validate that request and release amounts match"
                        >
                          {validatingRequestId === req.id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Validating...
                            </>
                          ) : (
                            <>
                              <ShieldCheck className="mr-2 h-4 w-4" />
                              Validate
                            </>
                          )}
                        </Button>
                      )}
                      {req.status !== "PENDING" && req.status !== "APPROVED" && req.status !== "PROCESSED" && (
                        <Badge
                          variant={
                            req.status === "REJECTED"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {req.status}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-8">
        <Card>
          <CardHeader>
            <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
              <CardTitle className="text-4xl">Payslip Dashboard</CardTitle>
              <Button
                onClick={fetchDashboardData}
                disabled={isLoading}
                variant="outline"
                size="sm"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
        </Card>

        <RequestList title="Action Required: Pending Review" reqs={pendingRequests} />
        <RequestList title="Ready to Process" reqs={approvedRequests} />
        <RequestList title="History" reqs={otherRequests} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="mr-3 h-6 w-6" />
              Employee Payslip Permissions
            </CardTitle>
            <CardDescription>
              Enable or disable the ability for an employee to request a payslip
              from their dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <p className="text-center text-muted-foreground">
                No employees found.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {employees.map((employee) => (
                  <li
                    key={employee.id}
                    className="flex items-center justify-between py-3"
                  >
                    <span className="font-medium">{employee.name}</span>
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
            )}
          </CardContent>
        </Card>

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

        <ConfirmReleaseDialog
          isOpen={confirmReleaseOpen}
          onClose={() => {
            setConfirmReleaseOpen(false);
            setPendingReleaseRequestId(null);
          }}
          onConfirm={handleConfirmRelease}
          employeeName={selectedRequest?.account.name}
        />
      </div>
    </div>
  );
};

export default PayslipRequestManager;
