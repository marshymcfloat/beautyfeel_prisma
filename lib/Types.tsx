import type {
  Role,
  Prisma,
  PaymentMethod,
  Service,
  Account,
  Branch,
  Attendance,
  DiscountRule,
  AvailedService,
  Transaction,
  Status,
  Customer,
  PayslipStatus,
  FollowUpPolicy,
  RecommendedAppointmentStatus,
  PayslipRequestStatus,
} from "@prisma/client";
import { MultiValue, ActionMeta } from "react-select";

export type AccountData = {
  id: string;
  name: string;
  email: string | null;
  role: Role[]; // Assuming roles are fetched as an array
  salary: number; // Assuming this is total accumulated amount
  dailyRate: number;
  branchId: string | null; // <-- ADDED THIS FIELD to match select
  canRequestPayslip: boolean; // <-- ADDED THIS FIELD PREVIOUSLY
};
export type SalaryBreakdownItem = {
  id: string; // AvailedService ID
  serviceTitle: string | null;
  servicePrice: number;
  commissionEarned: number;
  customerName: string | null;
  // FIX: Changed name from transactionDate to completedAt
  completedAt: Date | null; // This should be the AvailedService.completedAt timestamp
  originatingSetId: string | null;
  originatingSetTitle: string | null;
};

export const SALARY_COMMISSION_RATE = 0.1;

export type CustomerProp = {
  email?: string | null;
  id: string;
  name: string;
};

export type PayslipStatusOption = PayslipStatus | "NOT_FOUND" | null;

export type CurrentSalaryDetailsData = {
  attendanceRecords: AttendanceRecord[];
  breakdownItems: SalaryBreakdownItem[];
  accountData: AccountData | null;
  // Using Date type for clarity, though Prisma might return strings depending on setup/version
  // It's best practice to work with Date objects once fetched
  currentPeriodStartDate: Date | null;
  currentPeriodEndDate: Date | null;
  lastReleasedPayslipEndDate: Date | null;
  lastReleasedTimestamp: Date | null; // Exact timestamp of last release
};

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
  transactionId: string; // Keep transactionId as it might be useful elsewhere
  serviceId: string | null;

  // Ensure ServiceInfo requires 'id' and 'title', and the server fetches both.
  // This matches what the component uses (title) and what ServiceInfo expects (id, title).
  service: ServiceInfo;

  quantity: number;
  price: number;
  commissionValue: number;
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  checkedById: string | null;
  checkedBy?: AccountInfo; // Made optional in previous step

  servedById: string | null;
  servedBy?: AccountInfo; // Made optional in previous step

  status: Status;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;

  // *** FIX START: Add the 'transaction' property to the type ***
  // Based on the error message structure and component usage (item.transaction?.customer?.name)
  // The server returns transaction including nested customer with name.
  transaction?: {
    // Make transaction object optional as well if it might not always be included
    customer?: {
      // Make customer object optional within transaction
      name: string | null; // Customer name can be null
    } | null; // Make the customer object itself potentially null
    // You might need to add other transaction fields here
    // if getServedServicesTodayByUser includes them and they are used elsewhere
    // e.g., status: Status; id: string; createdAt: Date; bookedFor: Date;
    // But for this component's needs, only the customer name path is used.
    // Let's add just the required path based on usage and error message structure.
  } | null; // The transaction object itself can be null
  // *** FIX END ***
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
  // *** FIX START: Allow Date | undefined to match the data transformation ***
  // If the original Prisma field is Date | null and your map converts null to undefined,
  // Date | undefined is sufficient here. If you want to be explicit about the null source:
  // createdAt: Date | null | undefined;
  createdAt: Date | undefined; // *** MODIFIED ***
  // If the original Prisma field is Date | null and your map converts null to undefined:
  // bookedFor: Date | null | undefined;
  bookedFor: Date | undefined; // *** MODIFIED ***
  // *** FIX END ***
  customer: CustomerProp;
  customerId: string; // Assuming customerId is always present
  voucherId?: string | null; // Optional and nullable
  discount: number;
  paymentMethod?: PaymentMethod | null; // Optional and nullable
  availedServices: AvailedServicesProps[];
  grandTotal: number;
  status: Status; // Assuming Status enum is imported
};

export type AttendanceRecord = {
  id: string;
  date: string | Date; // Field present in optimistic update
  isPresent: boolean;
  notes?: string | null; // Field is optional -> string | null | undefined
  // Potentially other fields like accountId, checkedById if your optimistic update adds them
  // to the object you type as AttendanceRecord
};
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
  monthlySales: MonthlySales[]; // Array of aggregated monthly sales data

  paymentMethodTotals: PaymentMethodTotals; // Overall payment method breakdown

  grandTotal: number; // Overall total sales across all months

  uniqueBranchTitles: string[]; // Sorted array of unique branch titles (strings)

  // --- *** CHANGE HERE: The type of 'branches' was modified to match the error requirement *** ---
  // The error message indicated it expected an array of objects with 'id', 'code', 'title', and 'totalSales'.
  branches: {
    id: string; // Branch ID
    code: string; // Branch code (as inferred from the error message)
    title: string; // Branch title
    totalSales: number; // Total sales for this branch across the *entire period* (as inferred from the error message)
  }[];
  // --- *** END CHANGE *** ---

  monthlyExpenses: MonthlyExpensesTotal[]; // Array of aggregated monthly expenses (REQUIRED by SalesDataDetailed, confirmed/added)

  overallTotalExpenses: number; // Overall total expenses across all months (added previously)
};

/* export type MonthlySales = {
  month: string; // "Jan", "Feb", etc.
  yearMonth: string; // "YYYY-MM" for sorting/keys

  // Monthly totals (calculated from transaction grandTotal)
  totalSales: number;
  cash: number; // Monthly sales paid via Cash
  ewallet: number; // Monthly sales paid via E-wallet
  bank: number; // Monthly sales paid via Bank Transfer
  unknown: number; // Monthly sales paid via Unknown method

  branchSales: BranchSalesDataPoint[];

  branchMonthlySales: { [branchTitle: string]: number };
}; */

export type MonthlySales = {
  month: string; // Short month name (e.g., "Jan")
  yearMonth: string; // Full year-month key (e.g., "YYYY-MM") for sorting
  totalSales: number; // Total sales for the month (sum of transaction grandTotals)
  cash: number; // Total sales paid via Cash for the month
  ewallet: number; // Total sales paid via E-wallet for the month
  bank: number; // Total sales paid via Bank Transfer for the month
  unknown: number; // Total sales paid via Unknown payment method for the month
  branchSales: BranchSalesDataPoint[]; // Array for monthly branch sales (often used for tooltips)
  branchMonthlySales: { [branchTitle: string]: number }; // Object/Map for monthly branch sales (often used for chart series data)
  totalExpenses: number; // Total expenses for the month (REQUIRED by SalesDataDetailed)
};

export type MonthlyExpensesTotal = {
  month: string; // e.g., "Jan"
  yearMonth: string; // e.g., "yyyy-MM" for sorting
  totalExpenses: number; // Total expenses for the month
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
  totalDeductions: number;
  totalBonuses: number;
  netPay: number;
  status: PayslipStatus;
  releasedDate: Date | null;
  // --- Added for Modal Display ---
  accountData?: AccountData | null; // Include basic account info needed by modal
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

export type ServerTodaysAttendance = Pick<
  Attendance,
  "id" | "isPresent" | "notes"
>;

export type OptimisticUpdateAttendanceRecord = {
  id: string;
  date: string | Date; // This makes it different from ServerTodaysAttendance
  isPresent: boolean;
  notes?: string | null; // This makes notes: string | null | undefined
  // Include any other fields your optimistic update actually puts into this object
  // For example, if your optimistic update code was:
  // const optimisticAttendanceRecord: AttendanceRecord = { id: ..., date: ..., isPresent: ..., notes: ..., accountId: ..., checkedById: ... }
  // then accountId and checkedById should be in this type.
  // For simplicity, I'm using the core fields shown in your original error context.
  // The key is that `emp.todaysAttendance` (from server) and `optimisticAttendanceRecord` (from client update)
  // might have different shapes.
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
  // TodaysAttendance can be what the server initially sends, or what the optimistic update creates
  todaysAttendance:
    | ServerTodaysAttendance
    | OptimisticUpdateAttendanceRecord
    | null;
  lastPayslipEndDate: Date | string | null; // Ensure this is added
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
  id: string;
  name: string;
  // Removed the 'price: number;' property here
  quantity: number;
  type: "service" | "set";
  originalPrice: number; // Keep originalPrice
  discountApplied: number;
};

export type TransactionSubmissionResponse = {
  success: boolean;
  transactionId?: string; // Included on success
  message?: string; // Included on error (and sometimes success)
  errors?: Record<string, string[]>; // Field-specific errors on validation/submission failure
};

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}

export type TransactionForManagement = Transaction & {
  customer: { name: string; email: string | null } | null;
  // Removed: branch: { title: string } | null;
  voucherUsed: { code: string } | null;
  availedServices: (AvailedService & {
    service: { title: string } | null;
    servedBy: { name: string } | null;
  })[];
};

export type ActiveTab =
  | "services"
  | "serviceSets"
  | "accounts"
  | "payslips"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches"
  | "transactions";

export type ServerActionResponse<T = null> =
  | { success: true; data?: T; message?: string; status?: PayslipStatusOption } // Add status for payslip actions
  | { success: false; message: string; errors?: Record<string, string[]> };

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType; // Or specific icon type like LucideIcon
}

export interface GetTransactionsFilters {
  startDate?: string; // ISO Date string or undefined
  endDate?: string; // ISO Date string or undefined
  status?: Status;
  // Removed: branchId?: string;
  // Add pagination parameters if needed: page?: number; pageSize?: number;
}

export type TransactionListData = Transaction & {
  customer: { name: string; email: string | null } | null;
  // branch is NOT included here
  voucherUsed: { code: string } | null;
  availedServices: (AvailedService & {
    service: { title: string } | null;
    servedBy: { name: string } | null;
  })[];
};

export type AvailedServiceWithServiceAndBranch = {
  id: string;
  transactionId: string;
  serviceId: string | null;
  quantity: number;
  price: number; // Price snapshot at transaction time
  commissionValue: number;
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  status: Status; // Assuming Status enum is imported or defined
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  service: {
    // Include the Service details
    id: string;
    title: string;
    branchId: string;
    branch: {
      // Include the Branch details
      id: string;
      title: string;
    };
  } | null; // Service can be null if it was deleted or similar edge cases
};

export type DetailedTransactionWithBranch = {
  id: string;
  createdAt: Date; // As Date object
  bookedFor: Date; // As Date object
  customerId: string;
  customer: Pick<Customer, "id" | "name" | "email"> | null; // Include customer details
  voucherId: string | null;
  discount: number; // In smallest unit
  paymentMethod: PaymentMethod | null;
  grandTotal: number; // In smallest unit
  status: Status;
  branchId: string | null; // Transaction might also have a branchId
  availedServices: AvailedServiceWithServiceAndBranch[];
};

// Type for aggregated sales data per branch for the chart

export type BasicAccountInfo = Pick<
  Account,
  "id" | "name" | "role" | "canRequestPayslip"
>;

export type PayslipRequestData = {
  id: string;
  accountId: string;
  employeeName: string;
  requestTimestamp: Date;
  periodStartDate: Date;
  periodEndDate: Date;
  status: PayslipRequestStatus; // Use the specific enum
  notes?: string | null;
};

export interface RecommendedAppointmentData {
  id: string;
  recommendedDate: Date | string; // Keep as is, your server action converts to string
  status: RecommendedAppointmentStatus;

  // Fields related to the service that triggered this recommendation
  originatingService?: {
    // This part seems fine and is being populated
    id: string;
    title: string;
    followUpPolicy: FollowUpPolicy;
  } | null;

  // --- Fields that were causing the error ---
  // If your client doesn't strictly need these on every RA object from this specific fetch, make them optional.
  customerId?: string; // Make optional
  originatingServiceId?: string; // Make optional (though often linked to originatingService.id)
  suppressNextFollowUpGeneration?: boolean; // Make optional

  // Optional fields that might be useful, keep them optional if not always present/needed
  originatingTransactionId?: string | null;
  attendedTransactionId?: string | null;
}

// Type for Customer data returned by server action (includes recommendations)
// This type should now reflect that recommendations have string dates
export type CustomerWithRecommendations = {
  id: string;
  name: string;
  email: string | null;
  recommendedAppointments: RecommendedAppointmentData[]; // Array of recommendations with string dates
};

export type BranchSalesDataPoint = {
  branchTitle: string;
  totalSales: number;
};

export type CustomerForEmail = {
  name: string;
  email: string | null;
};

export enum ExpenseCategory {
  RENT = "RENT",
  UTILITIES = "UTILITIES",
  SALARIES = "SALARIES",
  SUPPLIES = "SUPPLIES",
  MARKETING = "MARKETING",
  MAINTENANCE = "MAINTENANCE",
  OTHER = "OTHER",
}

export type ManualSaleData = {
  id: string;
  date: Date;
  amount: number;
  paymentMethod: string; // Matches PaymentMethod enum string value
  description: string | null;
  recordedBy: { id: string; name: string }; // Include partial account info
  branch: { id: string; title: string } | null; // Include partial branch info
  createdAt: Date;
};

export type ExpenseData = {
  id: string;
  date: Date;
  amount: number;
  category: ExpenseCategory;
  description: string | null;
  recordedBy: { id: string; name: string }; // Include partial account info
  branch: { id: string; title: string } | null; // Include partial branch info
  createdAt: Date;
};

export interface CurrentSalaryDetailsModalProps {
  isOpen: boolean; // Make sure isOpen is also defined if it's passed directly
  onClose: () => void; // Make sure onClose is also defined if it's passed directly
  isLoading: boolean;
  error: string | null;
  currentBreakdownItems: SalaryBreakdownItem[];
  currentAttendanceRecords: AttendanceRecord[];
  accountData: AccountData | null;
  // ADD or CORRECT these two properties:
  periodStartDate?: Date | null;
  periodEndDate?: Date | null;
  // Keep the existing ones:
  lastReleasedPayslipEndDate?: Date | null;
  lastReleasedTimestamp?: Date | null;
  onRequestCurrentPayslip: (
    accountId: string,
    periodStartDate: Date,
    periodEndDate: Date,
  ) => Promise<{
    success: boolean;
    message: string;
    payslipId?: string;
    status?: PayslipStatus;
    error?: string;
  }>; // Ensure the handler type matches what's expected
}

export type SelectOption = {
  value: string; // Typically the ID or a unique key
  label: string; // The human-readable text displayed to the user
  // You can add other optional properties if your select component needs them
  // For example:
  // isDisabled?: boolean;
  // price?: number; // If you need to access the price directly from the option later
};

export type MobileWidgetKey =
  | "attendance"
  | "sales"
  | "claimedServices"
  | "salary"
  | "customerHistory"
  | "claimGC"
  | "workQueueLink"
  | "transactionsLink";
