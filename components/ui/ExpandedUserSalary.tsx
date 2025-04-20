// components/ui/ExpandedUserSalary_Alternative.tsx
"use client";

import React, {
  useMemo,
  useState,
  useEffect,
  useCallback,
  useTransition,
} from "react";
import { format, isValid } from "date-fns";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";

// --- UI Components ---
import Button from "../Buttons/Button"; // Adjust path
import {
  CalendarDays,
  User,
  Tag,
  PhilippinePeso,
  AlertCircle,
  Receipt,
  Loader2,
  CheckCircle,
  Info,
  Clock, // Icons
} from "lucide-react";

// --- Types ---
import {
  SalaryBreakdownItem,
  AttendanceRecord,
  AccountData,
  SALARY_COMMISSION_RATE, // Ensure this exists and is correct
  RequestPayslipHandler,
  PayslipStatusOption,
} from "@/lib/Types"; // Adjust path
import { PayslipStatus } from "@prisma/client";
// --- Prop Types ---
type ExpandedUserSalaryProps = {
  breakdownItems: SalaryBreakdownItem[];
  attendanceRecords: AttendanceRecord[];
  accountData: AccountData;
  onClose: () => void;
  isLoading: boolean; // Loading for breakdown/attendance fetched by parent
  periodStartDate: Date;
  periodEndDate: Date;
  attendanceError: string | null;
  // Props for payslip request functionality
  onRequestPayslip: RequestPayslipHandler;
  initialPayslipStatus: PayslipStatusOption;
  isPayslipStatusLoading: boolean;
};

// --- Helper Functions ---
const formatCurrency = (value: number | null | undefined): string => {
  if (
    value == null ||
    typeof value !== "number" ||
    isNaN(value) ||
    !isFinite(value)
  )
    value = 0;
  const amountInPHP = value; // Assumes input is smallest unit
  return amountInPHP.toLocaleString("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};
const modifierStyles = {
  present: {
    backgroundColor: "#A7F3D0",
    color: "#065F46",
    fontWeight: "bold",
    borderRadius: "50%",
  },
  absent: {
    backgroundColor: "#FECACA",
    color: "#991B1B",
    textDecoration: "line-through",
    opacity: 0.8,
    borderRadius: "50%",
  },
  today: { fontWeight: "bold" },
};

// --- Component ---
export default function ExpandedUserSalary({
  breakdownItems,
  attendanceRecords,
  accountData,
  onClose,
  isLoading, // Loading state for main modal data (attendance/breakdown)
  periodStartDate,
  periodEndDate,
  attendanceError,
  onRequestPayslip,
  initialPayslipStatus,
  isPayslipStatusLoading, // Loading state specifically for payslip status check
}: ExpandedUserSalaryProps) {
  const [currentPayslipStatus, setCurrentPayslipStatus] =
    useState<PayslipStatusOption>(initialPayslipStatus);
  const [requestMessage, setRequestMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [isRequesting, startRequestTransition] = useTransition();

  useEffect(() => {
    setCurrentPayslipStatus(initialPayslipStatus);
  }, [initialPayslipStatus]);

  const presentDays = useMemo(
    () =>
      attendanceRecords
        .filter((r) => r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid),
    [attendanceRecords],
  );
  const absentDays = useMemo(
    () =>
      attendanceRecords
        .filter((r) => !r.isPresent)
        .map((r) => new Date(r.date))
        .filter(isValid),
    [attendanceRecords],
  );
  const calculatedBreakdownTotal = useMemo(
    () =>
      breakdownItems.reduce(
        (sum, item) => sum + (item.commissionEarned || 0),
        0,
      ),
    [breakdownItems],
  );
  // Display the base daily rate from account data if needed, or calculated base pay for the period
  const baseDailyRate = accountData?.dailyRate ?? 0; // Example: show daily rate
  // You could recalculate base salary here too if needed, but it's better done server-side for payslip generation

  // --- Payslip Request Handler ---
  const handleRequestPayslipClick = useCallback(() => {
    if (
      isRequesting ||
      !accountData?.id ||
      !periodStartDate ||
      !periodEndDate ||
      currentPayslipStatus !== "NOT_FOUND"
    ) {
      return; // Prevent action if busy, missing data, or payslip already exists/requested
    }
    setRequestMessage(null);

    startRequestTransition(async () => {
      try {
        // Call the server action passed via props
        const result = await onRequestPayslip(
          accountData.id,
          periodStartDate,
          periodEndDate,
        );
        setRequestMessage({
          type: result.success ? "success" : "error",
          text: result.message,
        });
        if (result.success && result.status) {
          setCurrentPayslipStatus(result.status); // Update local status on success
        } else if (!result.success && result.message.includes("already")) {
          // If the error indicates it already exists, update status locally
          // This relies on specific error message text - fragile, better if action returns status reliably
          if (result.message.includes("pending"))
            setCurrentPayslipStatus(PayslipStatus.PENDING);
          else if (result.message.includes("released"))
            setCurrentPayslipStatus(PayslipStatus.RELEASED);
        }
      } catch (error: any) {
        console.error("Payslip request failed:", error);
        setRequestMessage({
          type: "error",
          text: error.message || "An unexpected error occurred.",
        });
      }
    });
  }, [
    isRequesting,
    accountData?.id,
    periodStartDate,
    periodEndDate,
    onRequestPayslip,
    currentPayslipStatus,
  ]);

  // --- Determine Button State ---
  const getRequestButtonState = () => {
    if (isPayslipStatusLoading || isLoading) {
      // If main data or status is loading
      return {
        text: "Loading Status...",
        disabled: true,
        icon: Loader2,
        iconClass: "animate-spin",
      };
    }
    if (isRequesting) {
      // If the request action is running
      return {
        text: "Requesting...",
        disabled: true,
        icon: Loader2,
        iconClass: "animate-spin",
      };
    }
    // Determine state based on fetched/updated status
    switch (currentPayslipStatus) {
      case PayslipStatus.PENDING:
        return {
          text: "Payslip Requested",
          disabled: true,
          icon: Clock,
          iconClass: "text-orange-500",
        };
      case PayslipStatus.RELEASED:
        return {
          text: "Payslip Released",
          disabled: true,
          icon: CheckCircle,
          iconClass: "text-green-500",
        };
      case "NOT_FOUND": // Only allow request if not found
        return {
          text: "Request Payslip",
          disabled: false,
          icon: Receipt,
          iconClass: "text-blue-500",
        };
      default: // Includes null (error loading status) or any unexpected value
        return {
          text: "Status Unavailable",
          disabled: true,
          icon: Info,
          iconClass: "text-gray-500",
        };
    }
  };
  const buttonState = getRequestButtonState();

  // --- Render ---
  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Scrollable Content */}
      <div className="mb-4 flex-grow space-y-5 overflow-y-auto border-y border-gray-200 px-2 py-4 sm:px-4 md:max-h-[calc(75vh-180px)]">
        {" "}
        {/* Adjusted max-h */}
        {/* Attendance Section */}
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
            Attendance ({format(periodStartDate, "MMMM yyyy")})
          </h4>
          {/* Conditional rendering for attendance */}
          {isLoading ? (
            <div className="flex h-[250px] items-center justify-center text-gray-500">
              Loading...
            </div>
          ) : attendanceError ? (
            <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={18} />
              <span>{attendanceError}</span>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <DayPicker
                showOutsideDays
                fixedWeeks
                month={periodStartDate}
                fromDate={periodStartDate}
                toDate={periodEndDate}
                modifiers={{
                  present: presentDays,
                  absent: absentDays,
                  today: new Date(),
                }}
                modifiersStyles={modifierStyles}
              />
              <div className="mt-3 flex justify-center space-x-4 text-xs text-gray-600">
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: modifierStyles.present.backgroundColor,
                    }}
                  ></span>{" "}
                  Present
                </span>
                <span className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: modifierStyles.absent.backgroundColor,
                    }}
                  ></span>{" "}
                  Absent
                </span>
              </div>
            </div>
          )}
        </div>
        {/* Commission Breakdown Section */}
        <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
          <h4 className="mb-3 text-center text-base font-semibold text-gray-800 sm:text-left">
            Salary Commission Breakdown
          </h4>
          {isLoading ? (
            <div className="flex h-[150px] items-center justify-center text-gray-500">
              Loading...
            </div>
          ) : breakdownItems.length > 0 ? (
            <ul className="max-h-[200px] space-y-2 overflow-y-auto pr-1">
              {breakdownItems.map((item) => (
                <li
                  key={item.id}
                  className="rounded-md border border-gray-100 bg-white p-2.5 text-xs"
                >
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="flex items-center gap-1.5 font-medium text-gray-800">
                      <Tag size={12} className="text-blue-500" />{" "}
                      {item.serviceTitle || "Unknown"}
                    </span>
                    <span className="whitespace-nowrap font-semibold text-green-600">
                      +{formatCurrency(item.commissionEarned)}
                    </span>
                  </div>
                  <div className="space-y-0.5 text-gray-500">
                    <p className="flex items-center gap-1">
                      <User size={10} /> Client: {item.customerName || "N/A"}
                    </p>
                    <p className="flex items-center gap-1">
                      <PhilippinePeso size={10} /> Price:{" "}
                      {formatCurrency(item.servicePrice)} (
                      {(SALARY_COMMISSION_RATE * 100).toFixed(0)}% rate)
                    </p>
                    <p className="flex items-center gap-1">
                      <CalendarDays size={10} /> Date:{" "}
                      {item.transactionDate
                        ? format(new Date(item.transactionDate), "PP")
                        : "N/A"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center italic text-gray-500">
              No commission details found for this period.
            </p>
          )}
        </div>
      </div>{" "}
      {/* End Scrollable Content */}
      {/* Summary Section */}
      <div className="mb-4 shrink-0 rounded-md border border-gray-200 bg-blue-50/80 p-3 text-sm text-gray-800 shadow-sm">
        {breakdownItems.length > 0 && (
          <p className="flex justify-between">
            <span className="text-gray-600">Total Commission Shown:</span>
            <span className="font-semibold text-green-700">
              {formatCurrency(calculatedBreakdownTotal)}
            </span>
          </p>
        )}
        {/* Removed Accrued Salary display as it might be confusing alongside payslip request */}
        {/* <p className={`flex justify-between ${breakdownItems.length > 0 ? 'mt-1 border-t border-gray-200 pt-1' : ''}`}><span className="text-gray-600">Current Accrued Salary:</span><span className="font-semibold text-blue-700">{formatCurrency(currentTotalSalary)}</span></p> */}
        <p className="flex justify-between">
          <span className="text-gray-600">Base Daily Rate:</span>
          <span className="font-semibold">{formatCurrency(baseDailyRate)}</span>
        </p>
        {/* Note */}
        <p className="mt-1.5 text-xs italic text-gray-500">
          Note: This view shows commissions earned and attendance. Base pay
          calculation depends on attendance and daily rate.
        </p>
        {/* Attendance Summary */}
        <div className="mt-2 border-t border-gray-200 pt-2">
          <p className="flex justify-between">
            <span className="text-gray-600">Days Present:</span>
            <span className="font-semibold text-green-700">
              {presentDays.length}
            </span>
          </p>
          <p className="mt-0.5 flex justify-between">
            <span className="text-gray-600">Days Absent:</span>
            <span className="font-semibold text-red-700">
              {absentDays.length}
            </span>
          </p>
        </div>
      </div>
      {/* Payslip Request Section */}
      <div className="mb-4 shrink-0 space-y-2 px-2 sm:px-4">
        <Button
          type="button"
          onClick={handleRequestPayslipClick}
          disabled={buttonState.disabled}
          size="sm"
          className={`w-full justify-center ${buttonState.disabled ? "cursor-not-allowed opacity-70" : ""}`}
          // Use invert style for non-primary actions or disabled states
          invert={
            currentPayslipStatus !== "NOT_FOUND" ||
            isRequesting ||
            buttonState.disabled
          }
        >
          <buttonState.icon
            size={16}
            className={`mr-1.5 ${buttonState.iconClass ?? ""}`}
          />
          {buttonState.text}
        </Button>
        {/* Display status message from request */}
        {requestMessage && (
          <p
            className={`text-center text-xs font-medium ${requestMessage.type === "success" ? "text-green-600" : requestMessage.type === "error" ? "text-red-600" : "text-gray-600"}`}
          >
            {requestMessage.text}
          </p>
        )}
      </div>
      {/* Close Button */}
      <div className="flex h-[50px] shrink-0 items-center justify-end border-t border-gray-200 bg-gray-100 px-4">
        <Button type="button" onClick={onClose} invert={true} size="sm">
          Close
        </Button>
      </div>
    </div>
  );
}
