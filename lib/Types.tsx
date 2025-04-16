import type {
  Role,
  PaymentMethod,
  Service,
  Account,
  Branch,
  Attendance,
  DiscountRule,
  Status,
  PayslipStatus,
} from "@prisma/client";
import { MultiValue, ActionMeta } from "react-select";

export interface AccountData {
  id: string;
  name: string;
  role: Role[];
  salary: number;
  dailyRate: number;
}

export type SalaryBreakdownItem = {
  id: string;
  serviceTitle: string;
  customerName: string;
  transactionDate: Date;
  servicePrice: number;
  commissionEarned: number;
};

export const SALARY_COMMISSION_RATE = 0.1;

export type CustomerProp = {
  email?: string | null;
  id: string;
  name: string;
};

export type PayslipStatusOption = PayslipStatus | "NOT_FOUND" | null;

export type ServiceProps = {
  title: string;
  id: string;
  price: number;
  quantity: number;
};

export type AccountInfo = {
  id: string;
  name: string;
} | null;

export type ServiceInfo = {
  id: string;
  title: string;
} | null;
export interface AvailedServicesProps {
  id: string;
  transactionId: string;
  serviceId: string | null;
  service: ServiceInfo;
  quantity: number;
  price: number;
  commissionValue: number;
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  checkedById: string | null;
  checkedBy: AccountInfo;
  servedById: string | null;
  servedBy: AccountInfo;
  status: Status;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/* export type AvailedServicesProps = {
  id: string; // AvailedService ID
  price: number; // Price snapshot
  quantity: number;
  serviceId: string; // Foreign key
  transactionId: string; // Foreign key
  service: ServiceProps; // Nested basic service info
  checkedById: string | null;
  checkedBy: AccountInfo; // Nested basic account info (or null)
  servedById: string | null;
  servedBy: AccountInfo; // Nested basic account info (or null)
};
 */
export type TransactionProps = {
  id: string;
  createdAt: Date;
  bookedFor: Date;
  customer: CustomerProp;
  customerId: string;
  voucherId?: string | null;
  discount: number;
  paymentMethod?: PaymentMethod | null;
  availedServices: AvailedServicesProps[];
  grandTotal: number;
  status: Status;
};

export interface AttendanceRecord {
  date: Date;
  isPresent: boolean;
  notes?: string | null;
}

export type MonthlySalesWithPaymentBreakdown = {
  month: string;
  yearMonth: string;
  totalSales: number;
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
};

export type PaymentMethodTotals = {
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
};

export type SalesDataDetailed = {
  monthlySales: MonthlySalesWithPaymentBreakdown[];
  paymentMethodTotals: PaymentMethodTotals;
  grandTotal: number;
};

export type MonthlySales = {
  month: string;
  yearMonth: string;
  totalSales: number;
};

export type RequestPayslipHandler = (
  accountId: string,
  periodStartDate: Date,
  periodEndDate: Date,
) => Promise<{
  success: boolean;
  message: string;
  payslipId?: string;
  status?: PayslipStatus;
}>;

export type PayslipData = {
  id: string;
  employeeId: string;
  employeeName: string;
  periodStartDate: Date;
  periodEndDate: Date;
  baseSalary: number;
  totalCommissions: number;
  totalDeductions?: number;
  totalBonuses?: number;
  netPay: number;
  status: PayslipStatus;
  releasedDate?: Date | null;
  breakdownItems?: SalaryBreakdownItem[];
};

export type ReleaseSalaryHandler = (payslipId: string) => Promise<void>;

export type TransactionSuccessResponse = {
  success: true;
  transactionId: string;
};

export type TransactionErrorResponse = {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
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

export type GiftCertificateValidationResult = CheckGCResult;

export type ValidGiftCertificateResult = Extract<
  GiftCertificateValidationResult,
  { status: "valid" }
>;

export type FetchedItem = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set";
};

export enum DisplayAttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  NO_RECORD = "NO_RECORD",
  OUTSIDE_PERIOD = "OUTSIDE_PERIOD",
}

export type UIDiscountRuleWithServices = Omit<
  DiscountRule,
  "startDate" | "endDate" | "createdAt" | "updatedAt"
> & {
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  applyToAll: boolean;
  services?: Pick<Service, "id" | "title">[];
};
export type ServiceOption = Pick<Service, "id" | "title">;

export type AccountForManagement = Omit<Account, "password" | "salary"> & {
  dailyRate: number;
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
  branchTitle: string | null;
  todaysAttendance: Pick<Attendance, "id" | "isPresent" | "notes"> | null;
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

export type AvailedItem = {
  id: string; // Can be Service ID or ServiceSet ID
  name: string; // Title of the service or set
  price: number; // The price used for display/calculation in the cart (current price, might be discounted)
  quantity: number; // How many of this item (usually 1 for sets)
  type: "service" | "set"; // <<< REQUIRED: Discriminator
  originalPrice: number; // <<< REQUIRED: Price before discounts
  discountApplied?: number; // Optional: Discount on this specific item
};

export type TransactionSubmissionResponse = {
  success: boolean;
  transactionId?: string; // Included on success
  message?: string; // Included on error (and sometimes success)
  errors?: Record<string, string[]>; // Field-specific errors on validation/submission failure
};

export type ActiveTab =
  | "services"
  | "serviceSets"
  | "accounts"
  | "payslips"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches";

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}
