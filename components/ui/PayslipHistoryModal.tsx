"use client";

import React from "react";
import { format } from "date-fns";

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Button from "../Buttons/Button";
import {
  Loader2,
  AlertCircle,
  X,
  ReceiptText,
  CalendarRange,
} from "lucide-react";

import { PayslipData } from "@/lib/Types";

type PayslipHistoryModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  payslips: PayslipData[];
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
const formatDate = (date: Date | string | null | undefined): string => {
  if (!date) return "N/A";
  try {
    return format(new Date(date), "MMM d, yyyy");
  } catch {
    return "Invalid Date";
  }
};
const formatDateRange = (start: Date, end: Date): string => {
  if (
    !start ||
    !end ||
    !(start instanceof Date) ||
    !(end instanceof Date) ||
    isNaN(start.getTime()) ||
    isNaN(end.getTime())
  )
    return "Invalid Period";
  try {
    if (
      start.getMonth() === end.getMonth() &&
      start.getFullYear() === end.getFullYear()
    )
      return `${format(start, "MMM dd")} - ${format(end, "dd, yyyy")}`;
    else if (start.getFullYear() === end.getFullYear())
      return `${format(start, "MMM dd")} - ${format(end, "MMM dd, yyyy")}`;
    else return `${format(start, "PP")} - ${format(end, "PP")}`;
  } catch {
    return "Invalid Period";
  }
};

export default function PayslipHistoryModal({
  isOpen,
  onClose,
  isLoading,
  error,
  payslips,
}: PayslipHistoryModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={<DialogTitle>Payslip History</DialogTitle>}
      containerClassName="relative m-auto max-h-[85vh] w-full max-w-xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      <button
        onClick={onClose}
        className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-600 focus:outline-none"
        aria-label="Close modal"
      >
        <X size={20} />
      </button>

      <div className="flex-grow overflow-y-auto p-4 sm:p-6">
        {isLoading && (
          <div className="flex h-[200px] items-center justify-center text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading history...
          </div>
        )}
        {error && !isLoading && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={18} /> <span>{error}</span>
          </div>
        )}
        {!isLoading && !error && payslips.length === 0 && (
          <p className="py-10 text-center italic text-gray-500">
            No released payslips found.
          </p>
        )}
        {!isLoading && !error && payslips.length > 0 && (
          <ul className="space-y-3">
            {payslips.map((p) => (
              <li
                key={p.id}
                className="rounded border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  <div className="mb-2 sm:mb-0">
                    <p className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
                      <CalendarRange size={14} className="text-gray-500" />
                      Period:{" "}
                      {formatDateRange(p.periodStartDate, p.periodEndDate)}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                      {}
                      <ReceiptText size={14} className="text-green-500" />
                      Released: {formatDate(p.releasedDate)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end sm:space-x-4">
                    <p className="text-base font-semibold text-blue-600">
                      {formatCurrency(p.netPay)}
                    </p>
                    {}
                    {}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end border-t border-gray-200 bg-gray-50 p-4">
        <Button type="button" onClick={onClose} invert={true} size="sm">
          {" "}
          Close{" "}
        </Button>
      </div>
    </Modal>
  );
}
