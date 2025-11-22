// File: components/ui/ManagePaySlipModal.tsx
"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  format,
  isValid,
  startOfMonth,
  startOfDay,
  addDays,
  isBefore,
  isEqual,
  isAfter,
} from "date-fns";
import {
  DayPicker,
  Modifiers,
} from "react-day-picker";
import "react-day-picker/dist/style.css";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/Separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Loader2,
  AlertCircle,
  CheckCircle,
  User,
  Tag,
  PhilippinePeso,
  CalendarDays,
  DollarSign,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

import {
  PayslipData,
  ReleaseSalaryHandler,
  AttendanceRecord,
  SalaryBreakdownItem,
} from "@/lib/Types";
import { PayslipStatus } from "@prisma/client";

type ManagePayslipModalProps = {
  isOpen: boolean;
  onClose: () => void;
  payslipData: PayslipData;
  onReleaseSalary: ReleaseSalaryHandler;
  isReleasing: boolean;
  releaseError: string | null;

  attendanceRecords: AttendanceRecord[];
  breakdownItems: SalaryBreakdownItem[];

  lastReleasedPayslipEndDate: Date | null | undefined;
  lastReleasedTimestamp: Date | null | undefined;

  isModalDataLoading: boolean;
  modalDataError: string | null;
};

const formatCurrency = (value: number | null | undefined): string => {
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
};

const formatDate = (dateInput: Date | string | null | undefined): string => {
  if (!dateInput) return "N/A";
  try {
    const d = new Date(dateInput);
    if (!isValid(d)) {
      console.warn("Invalid date passed to formatDate:", dateInput);
      return "Invalid Date";
    }
    return format(d, "MMM d, yyyy");
  } catch (e) {
    console.error("Error in formatDate:", e, { dateInput });
    return "Invalid Date Format";
  }
};

const formatDateRange = (start: Date | string, end: Date | string): string => {
  try {
    const validStart = typeof start === "string" ? new Date(start) : start;
    const validEnd = typeof end === "string" ? new Date(end) : end;

    if (
      !(validStart instanceof Date) ||
      !(validEnd instanceof Date) ||
      isNaN(validStart.getTime()) ||
      isNaN(validEnd.getTime())
    ) {
      console.warn("formatDateRange: Invalid date inputs", { start, end });
      return "Invalid Period";
    }

    const startDay = startOfDay(validStart);
    const endDay = startOfDay(validEnd);

    if (
      startDay.getMonth() === endDay.getMonth() &&
      startDay.getFullYear() === endDay.getFullYear()
    )
      return `${format(startDay, "MMM dd")} - ${format(endDay, "dd, yyyy")}`;
    else if (startDay.getFullYear() === endDay.getFullYear())
      return `${format(startDay, "MMM dd")} - ${format(endDay, "MMM dd, yyyy")}`;
    else return `${format(startDay, "PP")} - ${format(endDay, "PP")}`;
  } catch (e) {
    console.error("formatDateRange error:", e, { start, end });
    return "Error Formatting";
  }
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
    opacity: 0.9,
    borderRadius: "50%",
  },
  paid: {
    backgroundColor: "#E5E7EB",
    color: "#9CA3AF",
    textDecoration: "line-through",
  },
};

export default function ManagePayslipModal({
  isOpen,
  onClose,
  payslipData,
  onReleaseSalary,
  isReleasing,
  releaseError,

  attendanceRecords: rawAttendanceRecords,
  breakdownItems: rawBreakdownItems,

  lastReleasedPayslipEndDate,
  lastReleasedTimestamp,

  isModalDataLoading,
  modalDataError,
}: ManagePayslipModalProps) {
  const periodStartDate = useMemo(() => {
    const date = new Date(payslipData.periodStartDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodStartDate]);

  const periodEndDate = useMemo(() => {
    const date = new Date(payslipData.periodEndDate);
    return isValid(date) ? date : undefined;
  }, [payslipData.periodEndDate]);

  const initialMonth = useMemo(() => {
    const endDate =
      payslipData.periodEndDate instanceof Date &&
      !isNaN(payslipData.periodEndDate.getTime())
        ? payslipData.periodEndDate
        : null;
    const startDate =
      payslipData.periodStartDate instanceof Date &&
      !isNaN(payslipData.periodStartDate.getTime())
        ? payslipData.periodStartDate
        : null;
    return startOfMonth(endDate || startDate || new Date());
  }, [payslipData.periodEndDate, payslipData.periodStartDate]);

  const [currentMonth, setCurrentMonth] = useState<Date>(initialMonth);

  useEffect(() => {
    const newInitialMonth = startOfMonth(
      new Date(payslipData.periodEndDate) ||
        new Date(payslipData.periodStartDate) ||
        new Date(),
    );
    if (
      isValid(newInitialMonth) &&
      !isEqual(startOfMonth(currentMonth), newInitialMonth)
    ) {
      setCurrentMonth(newInitialMonth);
    }
  }, [payslipData.id, payslipData.periodEndDate, payslipData.periodStartDate, currentMonth]);

  const handleReleaseClick = () => {
    if (isReleasing || payslipData.status !== PayslipStatus.PENDING) return;
    onReleaseSalary(payslipData.id);
  };

  const attendanceCountingStartDate = useMemo(() => {
    if (
      !lastReleasedPayslipEndDate ||
      !isValid(new Date(lastReleasedPayslipEndDate))
    ) {
      const payslipStart = new Date(payslipData.periodStartDate);
      return isValid(payslipStart) ? startOfDay(payslipStart) : new Date(0);
    }
    return startOfDay(addDays(new Date(lastReleasedPayslipEndDate), 1));
  }, [lastReleasedPayslipEndDate, payslipData.periodStartDate]);

  const filteredAttendanceRecordsForDisplay = useMemo(() => {
    if (!rawAttendanceRecords) return [];
    const startDate = attendanceCountingStartDate;
    return rawAttendanceRecords.filter((r) => {
      const recordDate = new Date(r.date);
      return (
        isValid(recordDate) && !isBefore(startOfDay(recordDate), startDate)
      );
    });
  }, [rawAttendanceRecords, attendanceCountingStartDate]);

  const presentDays = useMemo(
    () =>
      filteredAttendanceRecordsForDisplay
        ?.filter((r) => r.isPresent)
        .map((r) => startOfDay(new Date(r.date)))
        .filter(isValid) ?? [],
    [filteredAttendanceRecordsForDisplay],
  );

  const absentDays = useMemo(
    () =>
      filteredAttendanceRecordsForDisplay
        ?.filter((r) => !r.isPresent)
        .map((r) => startOfDay(new Date(r.date)))
        .filter(isValid) ?? [],
    [filteredAttendanceRecordsForDisplay],
  );

  const paidDays = useMemo(() => {
    if (!periodStartDate || !periodEndDate || !lastReleasedPayslipEndDate)
      return [];

    const start = startOfDay(new Date(periodStartDate));
    const end = startOfDay(new Date(periodEndDate));
    const lastPaidEnd = startOfDay(new Date(lastReleasedPayslipEndDate));

    const paidDates: Date[] = [];
    let currentDate = start;

    while (
      isValid(currentDate) &&
      !isAfter(currentDate, end) &&
      !isAfter(currentDate, lastPaidEnd)
    ) {
      if (!isBefore(currentDate, start)) {
        paidDates.push(currentDate);
      }
      currentDate = addDays(currentDate, 1);
    }
    return paidDates;
  }, [periodStartDate, periodEndDate, lastReleasedPayslipEndDate]);

  const commissionFilteringTimestamp = useMemo(() => {
    if (!lastReleasedTimestamp || !isValid(new Date(lastReleasedTimestamp))) {
      const payslipStart = new Date(payslipData.periodStartDate);
      return isValid(payslipStart) ? payslipStart : new Date(0);
    }
    return new Date(lastReleasedTimestamp);
  }, [lastReleasedTimestamp, payslipData.periodStartDate]);

  const filteredBreakdownItemsForDisplay = useMemo(() => {
    if (!rawBreakdownItems) return [];
    const cutoffTimestamp = commissionFilteringTimestamp;

    return rawBreakdownItems.filter((item) => {
      if (!item.completedAt) return false;
      const itemTimestamp = new Date(item.completedAt);
      if (!isValid(itemTimestamp)) return false;

      return isAfter(itemTimestamp, cutoffTimestamp);
    });
  }, [rawBreakdownItems, commissionFilteringTimestamp]);

  // Show toast for release errors
  useEffect(() => {
    if (releaseError) {
      toast.error("Failed to release salary", {
        description: releaseError,
      });
    }
  }, [releaseError]);

  // Show toast for modal data errors
  useEffect(() => {
    if (modalDataError) {
      toast.error("Failed to load payslip details", {
        description: modalDataError,
      });
    }
  }, [modalDataError]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {payslipData.status === PayslipStatus.PENDING
              ? "Manage Payslip"
              : "Payslip Details"}
          </DialogTitle>
          <DialogDescription>
            Review attendance and commission details for {payslipData.employeeName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Payslip Summary Card */}
          <Card>
            <CardHeader>
              <CardTitle>Payslip Summary</CardTitle>
              <CardDescription>
                Period:{" "}
                {periodStartDate && periodEndDate
                  ? formatDateRange(periodStartDate, periodEndDate)
                  : "Invalid Period Dates"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {payslipData.status === PayslipStatus.RELEASED &&
                payslipData.releasedDate && (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800">
                      Released: {format(new Date(payslipData.releasedDate), "PPpp")}
                    </span>
                  </div>
                )}

              <div className="space-y-2 rounded-lg bg-muted/50 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Base Salary:</span>
                  <span className="font-medium">{formatCurrency(payslipData.baseSalary)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Commissions:</span>
                  <span className="font-medium text-green-600">
                    +{formatCurrency(payslipData.totalCommissions)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Bonuses:</span>
                  <span className="font-medium text-green-600">
                    +{formatCurrency(payslipData.totalBonuses)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Deductions:</span>
                  <span className="font-medium text-red-600">
                    -{formatCurrency(payslipData.totalDeductions)}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between text-base font-bold">
                  <span>Net Pay:</span>
                  <span className="text-blue-700">{formatCurrency(payslipData.netPay)}</span>
                </div>
              </div>

              <div className="space-y-1 rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
                <p>
                  <span className="font-medium">Attendance counted from:</span>{" "}
                  {attendanceCountingStartDate && isValid(attendanceCountingStartDate)
                    ? format(attendanceCountingStartDate, "PP")
                    : "Beginning (No prior release)"}
                </p>
                <p>
                  <span className="font-medium">Commissions counted from:</span>{" "}
                  {commissionFilteringTimestamp &&
                  isValid(commissionFilteringTimestamp)
                    ? format(commissionFilteringTimestamp, "PPpp")
                    : "Beginning (No prior release)"}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Loading State */}
          {isModalDataLoading && (
            <Card>
              <CardContent className="flex items-center justify-center py-8">
                <Loader2 className="mr-2 h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Loading details...</span>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {modalDataError && !isModalDataLoading && (
            <Card>
              <CardContent className="flex items-center gap-3 py-6 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <span>{modalDataError}</span>
              </CardContent>
            </Card>
          )}

          {/* Attendance Calendar and Commission Breakdown */}
          {!isModalDataLoading && !modalDataError && (
            <>
              {/* Attendance Calendar Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarDays className="h-5 w-5" />
                    Attendance ({format(currentMonth, "MMMM yyyy")})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col items-center">
                    {periodStartDate && periodEndDate ? (
                      <DayPicker
                        key={currentMonth.toISOString()}
                        showOutsideDays
                        fixedWeeks
                        month={currentMonth}
                        onMonthChange={setCurrentMonth}
                        fromDate={periodStartDate}
                        toDate={periodEndDate}
                        modifiers={{
                          present: presentDays,
                          absent: absentDays,
                          paid: paidDays,
                        }}
                        modifiersStyles={modifierStyles}
                        className="text-sm [&_button:focus]:ring-1 [&_button:focus]:ring-offset-1 [&_button]:rounded-full [&_button]:border-0"
                        captionLayout="dropdown"
                        fromYear={periodStartDate.getFullYear()}
                        toYear={periodEndDate.getFullYear()}
                      />
                    ) : (
                      <div className="py-8 text-center text-destructive">
                        Cannot display calendar due to invalid period dates.
                      </div>
                    )}
                    <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: modifierStyles.present.backgroundColor,
                          }}
                        />
                        Present ({presentDays.length})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: modifierStyles.absent.backgroundColor,
                          }}
                        />
                        Absent ({absentDays.length})
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: modifierStyles.paid.backgroundColor,
                          }}
                        />
                        Paid/Covered ({paidDays.length})
                      </span>
                    </div>
                  </div>
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Calendar shows attendance within the payslip period (
                    {periodStartDate && periodEndDate
                      ? formatDateRange(periodStartDate, periodEndDate)
                      : "Invalid Range"}
                    ). Days covered by a previous payout (
                    {lastReleasedPayslipEndDate
                      ? `up to ${format(new Date(lastReleasedPayslipEndDate), "PP")}`
                      : "none"}
                    ) are marked as Paid/Covered.
                  </p>
                </CardContent>
              </Card>

              {/* Commission Breakdown Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Commission Breakdown for Period
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {filteredBreakdownItemsForDisplay.length > 0 ? (
                    <ScrollArea className="h-[300px] pr-4">
                      <div className="space-y-3">
                        {filteredBreakdownItemsForDisplay.map((item) => (
                          <div
                            key={item.id}
                            className="rounded-lg border bg-card p-4 shadow-sm"
                          >
                            <div className="mb-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Tag className="h-4 w-4 text-blue-500" />
                                <span className="font-medium text-sm">
                                  {item.serviceTitle || "Unknown Service"}
                                </span>
                              </div>
                              <Badge className="bg-green-600 text-white">
                                +{formatCurrency(item.commissionEarned)}
                              </Badge>
                            </div>
                            <div className="space-y-1.5 text-xs text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <User className="h-3 w-3" />
                                <span>Client: {item.customerName || "N/A"}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <PhilippinePeso className="h-3 w-3" />
                                <span>Price: {formatCurrency(item.servicePrice)}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <CalendarDays className="h-3 w-3" />
                                <span>
                                  Date Served:{" "}
                                  {format(new Date(item.completedAt!), "PPpp")}
                                </span>
                              </div>
                              {item.originatingSetTitle && (
                                <div className="flex items-center gap-2">
                                  <Tag className="h-3 w-3" />
                                  <span>Set: {item.originatingSetTitle}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      {rawBreakdownItems?.length > 0 &&
                      commissionFilteringTimestamp &&
                      isValid(commissionFilteringTimestamp)
                        ? `No commissions earned after ${format(commissionFilteringTimestamp, "PPpp")}.`
                        : "No commissions earned yet in this period."}
                    </div>
                  )}
                  <p className="mt-4 text-center text-xs text-muted-foreground">
                    Commissions included are those completed after{" "}
                    {commissionFilteringTimestamp &&
                    isValid(commissionFilteringTimestamp)
                      ? format(commissionFilteringTimestamp, "PPpp")
                      : "the employee's start date"}
                    .
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row sm:justify-between sm:gap-0 gap-2">
          {releaseError && (
            <div className="flex w-full items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:w-auto">
              <AlertCircle className="h-4 w-4" />
              <span>{releaseError}</span>
            </div>
          )}
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="outline" onClick={onClose} disabled={isReleasing}>
              Close
            </Button>
            {payslipData.status === PayslipStatus.PENDING && (
              <Button
                onClick={handleReleaseClick}
                disabled={isReleasing || isModalDataLoading}
                className="bg-green-600 hover:bg-green-700"
              >
                {isReleasing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Releasing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Release Salary
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
