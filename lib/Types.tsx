import type {
  Role,
  PaymentMethod,
  Service,
  Account,
  Branch,
  Attendance,
  DiscountRule,
} from "@prisma/client"; // Import Prisma enum if possible
import { Socket } from "socket.io-client"; // Import Socket type
// Represents the essential data for the logged-in account

import Select, { MultiValue, ActionMeta } from "react-select"; // Import react-select

export type AccountData = {
  id: string;
  name: string;
  role: Role[]; // Use the Prisma enum array type
  salary: number;
} | null;

// Represents a single item contributing to the salary breakdown
export type SalaryBreakdownItem = {
  id: string;
  serviceTitle: string;
  customerName: string;
  // Renaming for clarity, maps to transaction.createdAt
  transactionDate: Date; // Changed from completedAt
  servicePrice: number;
  commissionEarned: number;
};

// Configuration (Keep as is)
export const SALARY_COMMISSION_RATE = 0.1; // 10%

export type CustomerProp = {
  email: string | null;
  id: string;
  name: string;
};

export type ServiceProps = {
  title: string;
  id: string;
};

export type AccountInfo = {
  id: string;
  name: string;
} | null;

export type AvailedServicesProps = {
  id: string;
  price: number;
  quantity: number;
  serviceId: string;
  transactionId: string;
  service: ServiceProps;
  checkedById: string | null;
  checkedBy: AccountInfo;
  servedById: string | null; // Keep for display/styling info if needed
  servedBy: AccountInfo; // Keep for display/styling info if needed
};

export type MonthlySalesWithPaymentBreakdown = {
  month: string; // e.g., "Jan '24"
  yearMonth: string; // e.g., "2024-01" for sorting
  totalSales: number; // Total for the month
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
};

// Keep the overall totals separate for the summary view
export type PaymentMethodTotals = {
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
};
export type TransactionSuccessResponse = {
  success: true;
  transactionId: string; // ID of the created transaction
  // You can add other success data here if your action returns more
};

export type TransactionErrorResponse = {
  success: false;
  message: string; // General error message (make sure action always provides this on error)
  errors?: Record<string, string[]>; // Optional field-specific errors from validation
};

// Union type representing either success or error
export type TransactionSubmissionResponse =
  | TransactionSuccessResponse
  | TransactionErrorResponse;

// Updated main data structure
export type SalesDataDetailed = {
  // Use the new monthly type
  monthlySales: MonthlySalesWithPaymentBreakdown[];
  // Keep overall totals
  paymentMethodTotals: PaymentMethodTotals;
  grandTotal: number;
};

// Keep the simpler MonthlySales type for the preview chart if desired
export type MonthlySales = {
  month: string;
  yearMonth: string;
  totalSales: number;
};
export type TransactionProps = {
  id: string;
  createdAt: Date;
  bookedFor: Date;
  customer: CustomerProp;
  customerId: string;
  voucherId: string | null;
  discount: number;
  paymentMethod: string | null;
  availedServices: AvailedServicesProps[];
  grandTotal: number;
  status: "PENDING" | "DONE" | "CANCELLED";
};

export type CheckGCResult =
  | {
      status: "valid";
      id: string;
      services: Pick<Service, "id" | "title">[];
      expiresAt: Date | null;
    }
  | { status: "used"; code: string; usedAt: Date }
  | { status: "expired"; code: string; expiresAt: Date }
  | { status: "not_found"; code: string }
  | { status: "error"; message: string };

export type GiftCertificateValidationResult =
  | {
      status: "valid";
      id: string;
      services: Pick<Service, "id" | "title">[];
      expiresAt: Date | null;
    }
  | { status: "used"; code: string; usedAt: Date }
  | { status: "expired"; code: string; expiresAt: Date }
  | { status: "not_found"; code: string }
  | { status: "error"; message: string };

// You might also want a simpler type for just the 'valid' case if used often
export type ValidGiftCertificateResult = Extract<
  GiftCertificateValidationResult,
  { status: "valid" }
>;

export type FetchedItem = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set"; // Ensure this is NOT optional 'type?'
  // Add other fields returned by your fetch action if needed
};

export type UIDiscountRuleWithServices = Omit<
  DiscountRule,
  "startDate" | "endDate" | "createdAt" | "updatedAt"
> & {
  startDate: string; // MUST be string
  endDate: string; // MUST be string
  createdAt: string; // MUST be string
  updatedAt: string; // MUST be string
  applyToAll: boolean; // Ensure this is included
  services?: Pick<Service, "id" | "title">[];
};
export type ServiceOption = Pick<Service, "id" | "title">;

export type AccountForManagement = Omit<Account, "password" | "salary"> & {
  dailyRate: number; // Ensure this is number
  branch?: Pick<Branch, "id" | "title"> | null;
};

export type BranchForSelect = {
  id: string;
  title: string;
};

export type EmployeeForAttendance = Pick<
  Account,
  "id" | "name" | "dailyRate"
> & {
  branchTitle: string | null; // Include branch title for display/filtering
  todaysAttendance: Pick<Attendance, "id" | "isPresent" | "notes"> | null; // Include today's status
};

export interface MultiSelectProps {
  name: string;
  options: { value: string; label: string }[];
  isLoading?: boolean;
  placeholder?: string;
  value: MultiValue<{ value: string; label: string }>;
  onChange: (
    newValue: MultiValue<{ value: string; label: string }>,
    actionMeta: ActionMeta<{ value: string; label: string }>,
  ) => void;
  required?: boolean;
}
