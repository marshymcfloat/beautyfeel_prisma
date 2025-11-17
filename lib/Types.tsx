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
  RecommendedAppointment,
  PayslipRequestStatus,
} from "@prisma/client";
import { MultiValue, ActionMeta } from "react-select";
/* 
export type AccountDataBranch = {
  title?: string;
};

export type ClientAccountIncluded = { id: string; name: string };
export type ClientCustomerIncluded = {
  id: string;
  name: string;
  email?: string | null;
};
export type ClientServiceIncluded = {
  id: string;
  title: string;
  price?: number;
  branchId?: string | null;
};
export type ClientServiceSetIncluded = { id: string; title: string };
export type ClientBranchIncluded = { id: string; title: string; code: string };
export type ClientVoucherIncluded = { id: string; code: string };

export type TimePeriod = "daily" | "monthly" | "yearly";

export interface FormattedBranchData {
  id: string;
  code: string;
  title: string;
  totalSales: number;
}

export interface RawAggregatedSales {
  chartDataItems: SalesDataPoint[];
  paymentTotalsForPeriod: PaymentMethodTotals;
  totalSalesForPeriod: number;
  totalExpensesForPeriod: number;
  // Note: It does NOT include periodRangeString, branches, or meta
}

export interface SalesDataForSpecificPeriod {
  chartDataItems: SalesDataPoint[];
  paymentTotalsForPeriod: PaymentMethodTotals;
  totalSalesForPeriod: number;
  totalExpensesForPeriod: number;
  periodRangeString: string;
  branches: Branch[]; // List of all branches, useful for consistent coloring and legends
  meta?: {
    // Add the meta property definition
    fetchedPeriod: TimePeriod;
    fetchedTimestamp: number | null; // Timestamp can be a number (Date.now()) or null
  };
}

export type SalesDataPoint = {
  periodLabel: string; // X-axis label: e.g., "2023-10-27", "Oct 2023", "2023"
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
  totalSalesInPeriod: number; // Sum of payment methods for this specific data point
  totalExpenses?: number; // Expenses for this specific data point
  branchPeriodSales?: { [branchTitle: string]: number }; // Sales per branch for this specific data point
};

export type AccountData = {
  id: string;
  name: string;
  email: string | null;
  role: Role[]; // Assuming roles are fetched as an array
  salary: number; // Assuming this is total accumulated amount
  dailyRate: number;
  branchId: string | null; // <-- ADDED THIS FIELD to match select
  canRequestPayslip: boolean; // <-- ADDED THIS FIELD PREVIOUSLY
  branch?: AccountDataBranch;
};

export type SalaryBreakdownItem = {
  id: string; // NOW this is the AvailedServiceUnit ID
  serviceTitle: string | null; // Title (from parent AvailedService)
  servicePrice: number; // Price PER UNIT (derived from parent.price / parent.quantity or service.price)
  commissionEarned: number; // Commission EARNED FOR THIS UNIT (derived from parent.commissionValue / parent.quantity)
  customerName: string | null; // Customer name (from parent AvailedService's transaction)
  completedAt: Date | null; // Completion time (servedAt) for THIS UNIT
  originatingSetId: string | null; // From parent AvailedService
  originatingSetTitle: string | null; // From parent AvailedService
  // You might also want the parent AvailedService ID for linking:
  // availedServiceId: string;
};



export type CustomerProp = {
  email?: string | null;
  id: string;
  name: string;
};

export type PayslipStatusOption = PayslipStatus | "NOT_FOUND" | null;

export interface CurrentSalaryDetailsData {
  attendanceRecords: AttendanceRecord[]; // Still represents date-based attendance
  breakdownItems: SalaryBreakdownItem[]; // Use the updated SalaryBreakdownItem (per unit served)
  accountData: AccountData | null; // Basic account data

  // Date fields remain the same, representing the calculation boundaries
  currentPeriodStartDate: Date | null; // Attendance calculation start date (start of day after last release date)
  currentPeriodEndDate: Date | null; // End of today
  lastReleasedPayslipEndDate: Date | null; // Last period end date (for context)
  lastReleasedTimestamp: Date | null; // Last release timestamp (for context and UI notes)
  commissionCalculationStartTime: Date | null; // Exact time for commission calculation start

  // Add the estimatedGrossPay if it's being passed down
  estimatedGrossPay?: number | null; // Optional as it's calculated client-side in the employee modal but passed from parent in admin modal
}

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

export type AvailedServiceUnitProps = {
  id: string;
  availedServiceId: string; // Link back to the parent AvailedService (required field)
  unitIndex: number; // 0-based index of the unit
  status: Status; // Status for this specific unit
  completedAt: Date | null; // Completion timestamp for this specific unit

  checkedById: string | null; // Who checked this specific unit
  checkedBy: ClientAccountIncluded | null; // Included relation
  checkedAt: Date | null; // When this specific unit was checked

  servedById: string | null; // Who served this specific unit
  servedBy: ClientAccountIncluded | null; // Included relation
  servedAt: Date | null; // When this specific unit was served

  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  // Derived values for client convenience (calculated in server actions or frontend)
  unitPrice: number; // Price per unit (derived from parent.price / parent.quantity or service.price)
  unitCommissionValue: number; // Commission earned for THIS UNIT (derived from parent.commissionValue / parent.quantity)
};

export interface AvailedServicesProps {
  id: string; // Original AvailedService ID
  transactionId: string; // Transaction ID (required field)
  serviceId: string | null; // Link to Service model (nullable)

  // Use the standard client export type for Service relation (optional/nullable)
  service: ClientServiceIncluded | null;

  quantity: number; // Total quantity for this line item (required field)
  price: number; // Total price for this line item (required field)
  commissionValue: number; // Total commission for this line item (required field)

  // Fields for sets (optional/nullable)
  originatingSetId?: string | null;
  originatingSetTitle?: string | null; // Use the standard client export type or simple { id, title }
  originatingSet?: ClientServiceSetIncluded | null; // Include relation if fetched

  serviceSetId?: string | null; // Keep if used, optional and nullable

  // REMOVED fields that moved to AvailedServiceUnit
  // checkedById: string | null;
  // checkedBy?: AccountInfo; // Use ClientAccountIncluded now anyway
  // servedById: string | null;
  // servedBy?: AccountInfo; // Use ClientAccountIncluded now anyway
  // status: Status; // Status is now on the unit level
  // completedAt?: Date | null; // Completion time is now on the unit level

  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  postTreatmentEmailSentAt?: Date | null; // Optional and nullable timestamp

  // NEW: Array of individual units for this line item
  units: AvailedServiceUnitProps[];

  // Include transaction relation if needed, make it optional/nullable
  // transaction?: { customer?: { name: string | null } | null; } | null; // Example if needed
}

export type TransactionProps = {
  id: string;
  createdAt: Date; // Server should map to Date object
  bookedFor: Date | null; // Server should map to Date | null
  customerId: string; // Required field
  customer: ClientCustomerIncluded | null; // Use client export type for customer relation (can be null in some fetches?)

  // Use the updated AvailedServicesProps type
  availedServices: AvailedServicesProps[]; // Array of updated AvailedServicesProps

  voucherId?: string | null; // Optional and nullable
  voucherUsed?: ClientVoucherIncluded | null; // Use client export type if included

  discount: number; // Required field
  paymentMethod: PaymentMethod | null; // Optional and nullable enum

  grandTotal: number; // Required field
  status: Status; // Transaction status (still on parent Transaction)

  branchId?: string | null; // Optional and nullable
  branch?: ClientBranchIncluded | null; // Use client export type if included

  bookingReminderSentAt?: Date | null; // Optional and nullable timestamp

  giftCertificateId?: string | null; // Optional and nullable
  giftCertificateUsed?: any | null; // Use a specific export type if details are included

  // Include RecommendedAppointment relations if fetched (make them optional/nullable if not always present)
  originatingRecommendations?: RecommendedAppointmentProps[];
  attendedAppointment?: RecommendedAppointmentProps | null;

  // Add other fields from Transaction model if needed client-side
};

export type AttendanceRecord = {
  id: string;
  date: string | Date; // Field present in optimistic update
  isPresent: boolean;
  notes?: string | null; // Field is optional -> string | null | undefined
  // Potentially other fields like accountId, checkedById if your optimistic update adds them
  // to the object you export type as AttendanceRecord
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

  // --- *** CHANGE HERE: The export type of 'branches' was modified to match the error requirement *** ---
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
 */
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

/* export interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string | null;
  servicesAvailed: AvailedItem[];
  serviceType: "single" | "set";
  voucherCode: string;
  voucherDiscountValue: number;
  serveTime: "now" | "later";
  paymentMethod: PaymentMethod | null;
  subTotal: number;
  grandTotal: number;
  totalDiscount: number;
  appliedDiscountRules: UIDiscountRuleWithServices[];
  customerRecommendations: RecommendedAppointmentData[];
  selectedRecommendedAppointmentId: string | null;
  generateNewFollowUpForFulfilledRA: boolean;
  customerId: string | null;
  originBranchId: string | null; // ADDED THIS FIELD
} */

/* export type MonthlySales = {
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
}; */

/* export type MonthlyExpensesTotal = {
  month: string; // e.g., "Jan"
  yearMonth: string; // e.g., "yyyy-MM" for sorting
  totalExpenses: number; // Total expenses for the month
}; */

/* export type RequestPayslipHandler = (
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
  employeeId: string; // Changed accountId to employeeId based on usage
  employeeName: string;
  periodStartDate: Date; // Server maps to Date object
  periodEndDate: Date; // Server maps to Date object
  baseSalary: number;
  totalCommissions: number;
  totalDeductions: number;
  totalBonuses: number;
  netPay: number;
  status: PayslipStatus;
  releasedDate: Date | null; // Server maps to Date | null
  // --- Added for Modal Display ---
  accountData?: AccountData | null; // Include basic account info needed by modal, optional/nullable
}; */

/* export type ReleaseSalaryHandler = (payslipId: string) => Promise<void>;

export type TransactionSuccessResponse = {
  success: true;
  transactionId: string;
};

export type TransactionErrorResponse = {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}; */

/* export type CheckGCResult =
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
>; */

/* export type FetchedItem = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set";
}; */

/* export enum DisplayAttendanceStatus {
  PRESENT = "PRESENT",
  ABSENT = "ABSENT",
  NO_RECORD = "NO_RECORD",
  OUTSIDE_PERIOD = "OUTSIDE_PERIOD",
} */

/*  */

/* export type ServerTodaysAttendance = Pick<
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
}; */

/* export type BranchForSelect = {
  id: string;
  title: string;
}; */

/* export type EmployeeForAttendance = Pick<
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
}; */

/* export interface MultiSelectProps {
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
} */

/* export type AvailedItem = {
  id: string;
  name: string;
  // Removed the 'price: number;' property here
  quantity: number;
  type: "service" | "set";
  originalPrice: number; // Keep originalPrice
  discountApplied: number;
}; */
/* 
export interface TransactionSubmissionResponse {
  success: boolean;
  message?: string;
  transactionId?: string;
  errors?: Record<string, string[]>;
  warning?: string; // Added warning property
} */

/* export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
} */

/* export type TransactionForManagement = Omit<
  Transaction,
  | "customer"
  | "voucherUsed"
  | "availedServices"
  | "branch"
  | "bookingReminderSentAt"
  | "giftCertificateId"
  | "giftCertificateUsed"
  | "originatingRecommendations"
  | "attendedAppointment"
> & {
  customer: ClientCustomerIncluded | null; // Include customer { name, email }
  voucherUsed: ClientVoucherIncluded | null; // Include voucher { code }
  availedServices: AvailedServicesPropsForManagement[]; // Array of AS with units
  branch: ClientBranchIncluded | null; // Include branch { id, title, code }
  bookingReminderSentAt: Date | null; // Included timestamp
  giftCertificateId: string | null; // Field on Transaction
  giftCertificateUsed: any | null; // Example if included

  originatingRecommendations: RecommendedAppointmentProps[]; // Included RA
  attendedAppointment: RecommendedAppointmentProps | null; // Included RA

  // Add other top-level transaction scalar fields if needed (e.g., discount, grandTotal, paymentMethod, status)
  discount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod | null;
  status: Status;
}; */
/* 
export type AvailedServiceUnitPropsForManagement = {
  id: string;
  unitIndex: number;
  status: Status;
  completedAt: Date | null;
  servedBy: ClientAccountIncluded | null; // ServedBy is on the unit
  checkedBy: ClientAccountIncluded | null; // CheckedBy is on the unit
  checkedAt: Date | null;
  servedAt: Date | null;
  availedServiceId: string; // Include parent ID
}; */

/* export type AvailedServicesPropsForManagement = Omit<
  AvailedService,
  // Exclude relations and unit-level fields no longer on parent
  | "service"
  | "originatingSet"
  | "units"
  | "checkedById"
  | "checkedBy"
  | "servedById"
  | "servedBy"
  | "status"
  | "completedAt"
> & {
  service: { id: string; title: string } | null; // Included service details
  originatingSet: ClientServiceSetIncluded | null; // Included originatingSet
  // Add the units array
  units: AvailedServiceUnitPropsForManagement[];
  // Explicitly include scalar fields needed from AvailedService
  postTreatmentEmailSentAt: Date | null; // Included scalar field
  // Add other scalar fields if needed (e.g., price, quantity, commissionValue, originatingSetId, serviceSetId, createdAt, updatedAt)
  // Actually, let's be explicit and include all needed scalar fields here for clarity
  id: string;
  transactionId: string;
  serviceId: string | null;
  quantity: number;
  price: number;
  commissionValue: number;
  originatingSetId: string | null;
  originatingSetTitle: string | null; // Assuming this is derived or fetched
  serviceSetId: string | null;
  createdAt: Date;
  updatedAt: Date;
}; */

/* export type ActiveTab =
  | "services"
  | "serviceSets"
  | "accounts"
  | "payslips"
  | "customers"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches"
  | "advertisements"
  | "transactions"
  | "emailTemplate";

export type ServerActionResponse<T = any> =
  | { success: true; data?: T; message?: string }
  | {
      success: false;
      message?: string;
      errors?: Record<string, string[] | string | undefined | null>;
    }; // <--- Allow more types
 */
/* export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType; // Or specific icon export type like LucideIcon
} */

/* export interface GetTransactionsFilters {
  startDate?: string; // ISO Date string or undefined
  endDate?: string; // ISO Date string or undefined
  status?: Status;
  // Removed: branchId?: string;
  // Add pagination parameters if needed: page?: number; pageSize?: number;
} */

/* export type PayslipModalData = {
  attendanceRecords: AttendanceRecord[]; // Still same structure (date-based)
  breakdownItems: SalaryBreakdownItem[]; // Use the updated SalaryBreakdownItem (per unit)
  relevantLastPayslipEndDate: Date | null; // Date | null
  relevantLastReleasedTimestamp: Date | null; // Date | null
  // Add the calculated commission calculation timestamp for display context
  commissionCalculationStartTime: Date | null; // Added for consistency with component
  // Include payslip data itself if needed, although ManagePayslips already has it
  // payslip: PayslipData; // Potentially include this
}; */

/* export type AvailedServicesPropsForListData = Omit<
  AvailedServicesProps,
  "service" | "originatingSet" | "units"
> & {
  service: { id: string; title: string; price: number } | null; // updateTransactionDetails includes service with price
  originatingSet: ClientServiceSetIncluded | null; // updateTransactionDetails includes set
  // Add the units array
  units: AvailedServiceUnitProps[]; // TransactionListData includes units
  // Removed: checkedById, servedById, status, completedAt from the AS level type
  // Add other fields included in the updateTransactionDetails AS include if any
  postTreatmentEmailSentAt: Date | null; // updateTransactionDetails includes this
}; */

/* export interface TransactionListData {
  id: string;
  createdAt: Date; // Server should map to Date object
  bookedFor: Date | null; // Server should map to Date | null
  bookingReminderSentAt: Date | null; // Server should map to Date | null
  customerId: string; // Required field
  customer: ClientCustomerIncluded | null; // updateTransactionDetails includes customer { id, name, email } - email will be undefined if not fetched
  // Use the specific AvailedServicesPropsForListData type
  availedServices: AvailedServicesPropsForListData[]; // updateTransactionDetails includes AvailedServices with units and service price

  voucherId: string | null; // Optional/nullable field
  voucherUsed: ClientVoucherIncluded | null; // updateTransactionDetails includes voucherUsed

  discount: number; // Required field
  paymentMethod: PaymentMethod | null; // Optional/nullable enum

  grandTotal: number; // Required field
  status: Status; // Transaction status (still on parent)

  branchId: string | null; // Optional/nullable field
  branch: ClientBranchIncluded | null; // updateTransactionDetails includes branch

  // Add other fields included in updateTransactionDetails fetch if any
  giftCertificateId: string | null;
  giftCertificateUsed?: any | null; // Example
  originatingRecommendations?: RecommendedAppointmentProps[]; // Example - Assuming included
  attendedAppointment?: RecommendedAppointmentProps | null; // Example - Assuming included
}

export type AvailedServiceWithServiceAndBranch = {
  id: string;
  transactionId: string;
  serviceId: string | null;
  quantity: number;
  price: number; // Price snapshot at transaction time
  commissionValue: number;
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  status: Status; // Assuming Status export enum is imported or defined
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
}; */

// Type for aggregated sales data per branch for the chart
/* 
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
export interface NewAvailedServiceInput {
  serviceId: string;
  quantity: number;
  price: number;
  // serviceTitle and branchId might be needed if not fetched from Service model during creation
  serviceTitle: string; // For AvailedService.originatingSetTitle if it's a standalone service
  branchId: string; // For AvailedService if it's not part of a set
} */

/* export type RecommendedAppointmentProps = {
  id: string;
  customerId: string;
  recommendedDate: Date; // Server should map to Date object
  originatingTransactionId: string | null;
  originatingAvailedServiceId: string; // Links to the parent AvailedService, not Unit
  originatingServiceId: string;
  status: RecommendedAppointmentStatus;
  attendedTransactionId: string | null;
  suppressNextFollowUpGeneration: boolean;
  // Timestamps should be Date | null after server mapping
  reminder3DaySentAt: Date | null;
  reminder2DaySentAt: Date | null;
  reminder1DaySentAt: Date | null;
  reminderTodaySentAt: Date | null;
  reminder1DayAfterSentAt: Date | null;
  reminder7DaySentAt: Date | null;
  reminder7DayAfterSentAt: Date | null;
  reminder14DayAfterSentAt: Date | null;
  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  // Include relations if fetched (make them optional/nullable if not always included)
  originatingService?: {
    id: string;
    title: string;
    followUpPolicy: FollowUpPolicy;
  } | null;
  attendedTransaction?: { id: string } | null; // Assuming minimal details are included
}; */
/* 
export interface UpdateTransactionInput {
  transactionId: string;
  status?: Status;
  paymentMethod?: PaymentMethod | null;
  discount?: number; // Total discount value
  bookedForDate?: string | null; // YYYY-MM-DD
  bookedForTime?: string | null; // HH:mm
  availedServicesUpdates?: Array<{
    availedServiceId: string;
    price?: number; // Assuming this is the NEW UNIT PRICE for the existing item
    quantity?: number;
  }>;
  newAvailedServices?: NewAvailedServiceInput[]; // Using the new interface
  branchId?: string | null; // <--- ADDED branchId here
} */

export const SALARY_COMMISSION_RATE = 0.1;

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
// This export type should now reflect that recommendations have string dates
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

/* export type CustomerForEmail = {
    name: string;
    email: string | null;
  }; */

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
  paymentMethod: string; // Matches PaymentMethod export enum string value
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
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  // *** Changed property names to match CurrentSalaryDetailsData ***
  breakdownItems: SalaryBreakdownItem[]; // Changed from currentBreakdownItems
  attendanceRecords: AttendanceRecord[]; // Changed from currentAttendanceRecords
  // *** End Fix ***
  accountData: AccountData | null;
  periodStartDate?: Date | null;
  periodEndDate?: Date | null;
  lastReleasedPayslipEndDate?: Date | null;
  lastReleasedTimestamp?: Date | null;
  commissionCalculationStartTime?: Date | null; // Added this as it's in CurrentSalaryDetailsData
  estimatedGrossPay?: number | null; // Added this as it's in CurrentSalaryDetailsData
  // Ensure the function signature matches how the modal uses it
  onRequestCurrentPayslip: (
    accountId: string,
    // The component passes Date | null, so the prop export type should accept that.
    // Adding 'undefined' as well for maximum safety, though 'null' is what's passed from '?? null'.
    periodStartDate: Date | null | undefined, // Changed to allow undefined
    periodEndDate: Date | null | undefined, // Changed to allow undefined
  ) => Promise<RequestPayslipResult>; // Use the specific result type
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

/* export type CustomerForEmail = Pick<Customer, "id" | "name" | "email">;
 */
export interface CustomerForEmail {
  id: string;
  name: string;
  email: string;
  // Add any other fields you might want for placeholders
}

export interface EmailTemplateForSelection {
  id: string;
  name: string;
  subject: string;
  body: string;
  placeholders: string[]; // To show available placeholders for this template
}

export interface ServiceSimple {
  id: string;
  title: string;
  price: number;
  branchId: string; // Or optional if not always needed client-side
}

export type AvailedServiceWithDetails = Prisma.AvailedServiceGetPayload<{
  // This implies all scalar fields of AvailedService are included by default
  include: {
    service: {
      select: {
        id: true;
        title: true; // Corrected from: title: string
      };
    };
    originatingSet: {
      select: {
        id: true;
        title: true; // Corrected from: title: string
      };
    };
    // To match AvailedServicesProps, you might need to include checkedBy and servedBy
    // Ensure your server-side Prisma query also includes these.
    // Example:
    // checkedBy: { select: { id: true, name: true } },
    // servedBy: { select: { id: true, name: true } },
  };
}>;

export type EditableAvailedServiceState = {
  id: string; // Can be DB id or temporary client_id
  serviceId?: string; // For new items, the ID of the service from Service model
  serviceTitle: string;
  price: number;
  quantity: number;
  originalPrice: number; // For existing, for new, this is same as price
  originalQuantity: number; // For existing, for new, this is same as quantity
  isNew?: boolean; // Flag for newly added items not yet saved
  branchId?: string; // Store the branchId of the service, may be needed for creation logic
};

export type TransactionWithDetails = {
  id: string;
  createdAt: Date;
  bookedFor: Date | null;
  customerId: string;
  customer: { name: string } | null;
  availedServices: {
    id: string;
    transactionId: string;
    serviceId: string | null;
    service: { id: string; title: string; branchId: string } | null;
    quantity: number;
    price: number;
    commissionValue: number;
    originatingSetId: string | null;
    originatingSetTitle: string | null; // Added this as it's in your component usage
    checkedById: string | null;
    checkedBy: { id: string; name: string } | null;
    servedById: string | null;
    servedBy: { id: string; name: string } | null;
    status: "PENDING" | "DONE" | "CANCELLED"; // Adjust Status export type if needed
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    // Include other fields from AvailedService you need
  }[];
  // Include other top-level Transaction fields you need
  discount: number;
  grandTotal: number;
  status: "PENDING" | "DONE" | "CANCELLED"; // Adjust Status export type if needed
  branchId: string | null; // Assuming Transaction can have a branchId field directly
  // ... potentially other fields from your Transaction model
};

// Add types for other included relations if needed (e.g., GiftCertificateProps if included)

// Add the definition for RecommendedAppointmentProps (assuming you've added this now)
/* export type RecommendedAppointmentProps = {
  id: string;
  customerId: string;
  recommendedDate: Date; // Server should map to Date object
  originatingTransactionId: string | null;
  originatingAvailedServiceId: string; // Links to the parent AvailedService, not Unit
  originatingServiceId: string;
  status: RecommendedAppointmentStatus;
  attendedTransactionId: string | null;
  suppressNextFollowUpGeneration: boolean;
  // Timestamps should be Date | null after server mapping
  reminder3DaySentAt: Date | null;
  reminder2DaySentAt: Date | null;
  reminder1DaySentAt: Date | null;
  reminderTodaySentAt: Date | null;
  reminder1DayAfterSentAt: Date | null;
  reminder7DaySentAt: Date | null;
  reminder7DayAfterSentAt: Date | null;
  reminder14DayAfterSentAt: Date | null;
  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  // Include relations if fetched (make them optional/nullable if not always included)
  originatingService?: {
    id: string;
    title: string;
    followUpPolicy: FollowUpPolicy;
  } | null;
  attendedTransaction?: { id: string } | null; // Assuming minimal details are included
}; */

// Define the client-side export type for an AvailedService item within a transaction
export type AvailedServicesPropsForTransactions = Omit<
  AvailedServicesProps,
  "service" | "originatingSet" | "units"
> & {
  service: ClientServiceIncluded | null; // getActiveTransactions includes service { id, title, branchId }
  originatingSet: ClientServiceSetIncluded | null; // getActiveTransactions includes originatingSet { id, title }
  units: AvailedServiceUnitProps[]; // getActiveTransactions includes units with their relations
  // Add other fields included in getActiveTransactions AS include if any
  postTreatmentEmailSentAt: Date | null; // getActiveTransactions includes this
};

export type TransactionPropsForTransactions = Omit<
  TransactionProps,
  | "customer"
  | "availedServices"
  | "voucherUsed"
  | "branch"
  | "bookingReminderSentAt"
  | "giftCertificateId"
  | "giftCertificateUsed"
  | "originatingRecommendations"
  | "attendedAppointment" // Exclude properties that will be replaced by explicit includes
> & {
  customer: ClientCustomerIncluded | null; // getActiveTransactions includes customer { id, name }
  availedServices: AvailedServicesPropsForTransactions[]; // getActiveTransactions includes AvailedServices with their specific includes (like units)
  voucherUsed: ClientVoucherIncluded | null; // getActiveTransactions includes voucherUsed
  branch: ClientBranchIncluded | null; // getActiveTransactions includes branch
  bookingReminderSentAt: Date | null; // getActiveTransactions includes this
  giftCertificateId: string | null; // Field on Transaction
  giftCertificateUsed: any | null; // getActiveTransactions includes this (using 'any' as placeholder)

  originatingRecommendations: RecommendedAppointmentProps[]; // getActiveTransactions includes this
  attendedAppointment: RecommendedAppointmentProps | null; // getActiveTransactions includes this

  // Add other fields from Transaction included in getActiveTransactions if any
};

const transactionSelectConfig = {
  id: true,
  createdAt: true,
  bookedFor: true,
  bookingReminderSentAt: true,
  discount: true,
  status: true,
  customerId: true,
  paymentMethod: true,
  grandTotal: true,

  voucherId: true, // Include scalar voucherId here

  customer: { select: { id: true, name: true, email: true } },
  availedServices: {
    include: {
      units: {
        select: {
          id: true,
          availedServiceId: true,
          unitIndex: true,
          status: true,
          completedAt: true,
          checkedById: true,
          checkedBy: { select: { id: true, name: true } },
          servedById: true,
          servedBy: { select: { id: true, name: true } },
          checkedAt: true,
          servedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { unitIndex: "asc" as const },
      },
      service: {
        select: { id: true, title: true, price: true, branchId: true },
      },
      originatingSet: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  voucherUsed: { select: { id: true, code: true } },
  branchId: true, // <-- Ensure branchId is selected here
  branch: { select: { id: true, title: true, code: true } },
  originatingRecommendations: {
    include: {
      originatingService: true,
      attendedTransaction: { select: { id: true } },
    },
  },
  attendedAppointment: {
    include: {
      originatingService: true,
      attendedTransaction: { select: { id: true } },
    },
  },
  giftCertificateId: true,
  giftCertificateUsed: true,
} satisfies Prisma.TransactionSelect;

const transactionSelectConfigForRecentTransactions = {
  id: true,
  createdAt: true,
  bookedFor: true,
  bookingReminderSentAt: true,
  discount: true,
  status: true,
  customerId: true,
  paymentMethod: true,
  grandTotal: true,

  voucherId: true, // Include scalar voucherId here

  customer: { select: { id: true, name: true, email: true } }, // ClientCustomerIncluded
  voucherUsed: { select: { id: true, code: true } }, // ClientVoucherIncluded
  branchId: true, // <-- Explicitly select scalar branchId here
  branch: { select: { id: true, title: true, code: true } }, // ClientBranchIncluded

  giftCertificateId: true,
  giftCertificateUsed: true, // Include relation if TransactionListData expects it (type 'any' or specific)

  // Include RecommendedAppointment relations if needed in TransactionListData
  originatingRecommendations: {
    include: {
      originatingService: true, // Includes all fields of originatingService as per schema
      attendedTransaction: { select: { id: true } }, // Select minimal details
    },
  },
  attendedAppointment: {
    include: {
      originatingService: true, // Includes all fields of originatingService as per schema
      attendedTransaction: { select: { id: true } }, // Select minimal details
    },
  },

  availedServices: {
    select: {
      // Select scalar fields AND relations on AvailedService
      // Scalar fields from AvailedService (implicitly included when not using top-level select, but explicit is safer)
      id: true,
      transactionId: true,
      serviceId: true,
      quantity: true,
      price: true, // Total price for the item
      commissionValue: true, // Total commission for the item
      originatingSetId: true,
      originatingSetTitle: true,
      serviceSetId: true,
      createdAt: true,
      updatedAt: true,
      postTreatmentEmailSentAt: true, // Explicitly select this scalar field

      // Include relations on AvailedService (matching AvailedServicesPropsForListData structure)
      service: { select: { id: true, title: true, price: true } }, // Service { id, title, price }
      originatingSet: { select: { id: true, title: true } }, // OriginatingSet { id, title }

      // Include the 'units' relation with its select (matching AvailedServiceUnitProps structure)
      units: {
        select: {
          // Select fields on AvailedServiceUnit
          id: true,
          availedServiceId: true, // Link back to parent
          unitIndex: true,
          status: true, // Include unit status
          completedAt: true, // Include unit completion time
          servedById: true, // Include servedById
          servedBy: { select: { id: true, name: true } }, // Include servedBy relation
          checkedById: true, // Include checkedById
          checkedBy: { select: { id: true, name: true } }, // Include checkedBy relation
          checkedAt: true, // Include checkedAt
          servedAt: true, // Include servedAt
          createdAt: true, // Include createdAt for unit
          updatedAt: true, // Include updatedAt for unit
        },
        orderBy: { unitIndex: "asc" as const }, // Order units
      },
    },
    orderBy: {
      createdAt: "asc" as const, // Order availed services within transaction
    },
  },
} satisfies Prisma.TransactionSelect;

export type RecentTransactionPayload = Prisma.TransactionGetPayload<{
  select: typeof transactionSelectConfigForRecentTransactions;
}>;

// Helper export type for an AvailedService item included in the fetch
export type IncludedAvailedServiceRecent =
  RecentTransactionPayload["availedServices"][number];

// Helper export type for an AvailedServiceUnit item included in the fetch
export type IncludedAvailedServiceUnitRecent =
  IncludedAvailedServiceRecent["units"][number];

// Helper export type for a RecommendedAppointment item included in the fetch
export type IncludedRecommendedAppointmentRecent =
  RecentTransactionPayload["originatingRecommendations"][number];

export type AccountDataBranch = {
  title?: string;
};

export type ClientAccountIncluded = {
  id: string;
  username: string;
  name: string;
  email: string | null;
  role: Role[]; // Array of roles
  salary: number;
  dailyRate: number;
  branchId: string | null;
  // branch: Branch | null; // Uncomment if needed
  canRequestPayslip: boolean;
  mustChangePassword: boolean;
};

export type ClientCustomerIncluded = {
  id: string;
  name: string;
  email?: string | null; // Made email optional as it might not always be selected
};
export type ClientServiceIncluded = {
  id: string;
  title: string;
  price?: number; // Price might be needed sometimes
  branchId?: string | null; // Include branchId if used
};
export type ClientServiceSetIncluded = { id: string; title: string };
export type ClientBranchIncluded = { id: string; title: string; code: string };
export type ClientVoucherIncluded = { id: string; code: string };

export type TimePeriod = "daily" | "monthly" | "yearly";

export interface FormattedBranchData {
  id: string;
  code: string;
  title: string;
  totalSales: number;
}

export interface RawAggregatedSales {
  chartDataItems: SalesDataPoint[];
  paymentTotalsForPeriod: PaymentMethodTotals;
  totalSalesForPeriod: number;
  totalExpensesForPeriod: number;
  // Note: It does NOT include periodRangeString, branches, or meta
}

export interface SalesDataForSpecificPeriod {
  chartDataItems: SalesDataPoint[];
  paymentTotalsForPeriod: PaymentMethodTotals;
  totalSalesForPeriod: number;
  totalExpensesForPeriod: number;
  periodRangeString: string;
  branches: Branch[]; // List of all branches, useful for consistent coloring and legends
  meta?: {
    // Add the meta property definition
    fetchedPeriod: TimePeriod;
    fetchedTimestamp: number | null; // Timestamp can be a number (Date.now()) or null
  };
}

export type SalesDataPoint = {
  periodLabel: string; // X-axis label: e.g., "2023-10-27", "Oct 2023", "2023"
  cash: number;
  ewallet: number;
  bank: number;
  unknown: number;
  totalSalesInPeriod: number; // Sum of payment methods for this specific data point
  totalExpenses?: number; // Expenses for this specific data point
  branchPeriodSales?: { [branchTitle: string]: number }; // Sales per branch for this specific data point
};

export type AccountData = {
  id: string;
  name: string;
  email: string | null;
  role: Role[]; // Assuming roles are fetched as an array
  salary: number; // Assuming this is total accumulated amount
  dailyRate: number;
  branchId: string | null; // <-- ADDED THIS FIELD to match select
  canRequestPayslip: boolean; // <-- ADDED THIS FIELD PREVIOUSLY
  branch?: AccountDataBranch;
};

export interface SalaryBreakdownItem {
  id: string; // THIS IS THE AvailedServiceUnit ID
  transactionId: string; // Added to match server action
  availedServiceId: string; // Added: Useful to link back to the parent AS
  unitId: string; // Added for clarity, although 'id' is already the unit ID
  serviceTitle: string | null; // Title of the Service
  servicePrice: number; // Price per unit (calculated from parent AS price / quantity or service.price)
  customerName: string | null; // Name of the Customer from the Transaction
  completedAt: Date | null; // Completion time (servedAt) for THIS UNIT
  commissionEarned: number; // Commission calculated FOR THIS UNIT
  originatingSetTitle: string | null; // Title from the originating ServiceSet
}

export type CustomerProp = {
  email?: string | null;
  id: string;
  name: string;
};

export type PayslipStatusOption = PayslipStatus | "NOT_FOUND" | null;

export interface CurrentSalaryDetailsData {
  attendanceRecords: AttendanceRecord[]; // Still represents date-based attendance
  breakdownItems: SalaryBreakdownItem[]; // Use the updated SalaryBreakdownItem (per unit served)
  accountData: AccountData | null; // Basic account data

  // Date fields remain the same, representing the calculation boundaries
  currentPeriodStartDate: Date | null; // Attendance calculation start date (start of day after last release date)
  currentPeriodEndDate: Date | null; // End of today
  lastReleasedPayslipEndDate: Date | null; // Last period end date (for context)
  lastReleasedTimestamp: Date | null; // Last release timestamp (for context and UI notes)
  commissionCalculationStartTime: Date | null; // Exact time for commission calculation start

  // Add the estimatedGrossPay if it's being passed down
  estimatedGrossPay?: number | null; // Optional as it's calculated client-side in the employee modal but passed from parent in admin modal
}

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

export type AvailedServiceUnitProps = {
  id: string;
  availedServiceId: string; // Link back to the parent AvailedService (required field)
  unitIndex: number; // 0-based index of the unit
  status: Status; // Status for this specific unit (using the imported Status enum)
  completedAt: Date | null; // Completion timestamp for this specific unit

  checkedById: string | null; // Who checked this specific unit
  checkedBy: ClientAccountIncluded | null; // Included relation
  checkedAt: Date | null; // When this specific unit was checked

  servedById: string | null; // Who served this specific unit
  servedBy: ClientAccountIncluded | null; // Included relation
  servedAt: Date | null; // When this specific unit was served

  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  // Include the parent AvailedService relation (or parts of it) for accessing parent data like transactionId
  // It should be included by the server when fetching AvailedServices with units.
  availedService?: { transactionId: string } | null;

  // Derived unit values for client convenience (calculated in server actions or frontend)
  // These might be calculated on the fly in the component now
  // unitPrice: number; // Calculated as AvailedService.price / AvailedService.quantity or service.price (per unit)
  // unitCommissionValue: number; // Calculated as AvailedService.commissionValue / AvailedService.quantity (per unit)
};

export type AvailedServicesProps = {
  id: string;
  transactionId: string;
  serviceId: string | null;
  // transaction: Transaction | null; // Uncomment if needed
  service: {
    id: string;
    title: string;
    price: number; // Price per unit from the Service model
    // Add other service fields if needed (e.g., description, commission info)
    // branchId: string;
    // totalSales: number;
    // branch: Branch;
    // ...
  } | null;
  quantity: number;
  price: number; // Total price for this AvailedService line item (quantity * unit price)
  commissionValue: number; // Total commission for this AvailedService line item

  originatingSetId: string | null;
  originatingSetTitle: string | null;
  // originatingSet: ServiceSet | null; // Uncomment if needed

  serviceSetId: string | null; // Appears redundant with originatingSetId, but kept from schema
  // serviceSet: ServiceSet | null; // Uncomment if needed

  // The AvailedService itself doesn't have individual status/checked/served fields anymore, they are on the units
  // status: Status; // REMOVED from AS level
  // checkedById: string | null; // REMOVED from AS level
  // checkedBy: ClientAccountIncluded | null; // REMOVED from AS level
  // servedById: string | null; // REMOVED from AS level
  // servedBy: ClientAccountIncluded | null; // REMOVED from AS level
  // completedAt: Date | null; // REMOVED from AS level

  createdAt: Date;
  updatedAt: Date;

  postTreatmentEmailSentAt: Date | null;

  // ADD units relation here as fetched by the parent component
  units: AvailedServiceUnitProps[];

  // recommendedAppointment: RecommendedAppointment | null; // Uncomment if needed
};

export type RequestPayslipResult = {
  success: boolean;
  message?: string;
  error?: string;
  payslipId?: string;
  status?: PayslipRequestStatus | "NOT_FOUND" | null;
};

export type TransactionProps = {
  id: string;
  createdAt: Date; // Server should map to Date object
  bookedFor: Date | null; // Server should map to Date | null
  customerId: string; // Required field
  customer: ClientCustomerIncluded | null; // Use client export type for customer relation (can be null in some fetches?)

  // Use the updated AvailedServicesProps type
  availedServices: AvailedServicesProps[]; // Array of updated AvailedServicesProps

  voucherId?: string | null; // Optional and nullable
  voucherUsed?: ClientVoucherIncluded | null; // Use client export type if included

  discount: number; // Required field
  paymentMethod: PaymentMethod | null; // Optional and nullable enum

  grandTotal: number; // Required field
  status: Status; // Transaction status (still on parent Transaction)

  branchId?: string | null; // Optional and nullable
  branch?: ClientBranchIncluded | null; // Use client export type if included

  bookingReminderSentAt?: Date | null; // Optional and nullable timestamp

  giftCertificateId?: string | null;
  giftCertificateUsed?: any | null; // Use a specific export type if details are included

  // Include RecommendedAppointment relations if fetched (make them optional/nullable if not always present)
  originatingRecommendations?: RecommendedAppointmentProps[]; // Assuming this export type is defined later
  attendedAppointment?: RecommendedAppointmentProps | null; // Assuming this export type is defined later

  // Add other fields from Transaction model if needed client-side
};

export interface AttendanceRecord {
  id: string;
  date: Date; // Start of day UTC
  isPresent: boolean;
  notes: string | null;
  checkedAt: Date | null;
  checkedBy: { name: string } | null;
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
  monthlySales: MonthlySales[]; // Array of aggregated monthly sales data

  paymentMethodTotals: PaymentMethodTotals; // Overall payment method breakdown

  grandTotal: number; // Overall total sales across all months

  uniqueBranchTitles: string[]; // Sorted array of unique branch titles (strings)

  branches: {
    id: string; // Branch ID
    code: string; // Branch code (as inferred from the error message)
    title: string; // Branch title
    totalSales: number; // Total sales for this branch across the *entire period* (as inferred from the error message)
  }[];

  monthlyExpenses: MonthlyExpensesTotal[]; // Array of aggregated monthly expenses (REQUIRED by SalesDataDetailed, confirmed/added)

  overallTotalExpenses: number; // Overall total expenses across all months (added previously)
};
export type SuccessfulTransactionPayload = Prisma.TransactionGetPayload<{
  select: typeof transactionSelectConfig;
}>;

export type TransactionTxError = {
  success: false;
  message?: string;
  errors?: Record<string, string[] | string | undefined | null>;
};

export type TransactionTxResult =
  | SuccessfulTransactionPayload
  | {
      success: false;
      message?: string;
      errors?: Record<string, string[] | string | undefined | null>;
    };

export interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string | null;
  servicesAvailed: AvailedItem[];
  serviceType: "single" | "set";
  voucherCode: string;
  voucherDiscountValue: number;
  serveTime: "now" | "later";
  paymentMethod: PaymentMethod | null;
  subTotal: number;
  grandTotal: number;
  totalDiscount: number;
  appliedDiscountRules: UIDiscountRuleWithServices[];
  customerRecommendations: RecommendedAppointmentData[];
  selectedRecommendedAppointmentId: string | null;
  generateNewFollowUpForFulfilledRA: boolean;
  customerId: string | null;
  originBranchId: string | null; // ADDED THIS FIELD
}

export type IncludedAvailedServiceUnit = Prisma.AvailedServiceUnitGetPayload<{
  select: {
    id: true;
    availedServiceId: true;
    unitIndex: true;
    status: true;
    completedAt: true; // Should be true, not Date | null
    checkedById: true; // Should be true, not string | null
    checkedBy: { select: { id: true; name: true } }; // Should be { select: { ... } }, not { ... } | null
    servedById: true; // Should be true, not string | null
    servedBy: { select: { id: true; name: true } }; // Should be { select: { ... } }, not { ... } | null
    checkedAt: true; // Should be true, not Date | null
    servedAt: true; // Should be true, not Date | null
    createdAt: true; // Should be true, not Date
    updatedAt: true; // Should be true, not Date
  };
}>;
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
  employeeId: string; // Changed accountId to employeeId based on usage
  employeeName: string;
  periodStartDate: Date; // Server maps to Date object
  periodEndDate: Date; // Server maps to Date object
  baseSalary: number;
  totalCommissions: number;
  totalDeductions: number;
  totalBonuses: number;
  netPay: number;
  status: PayslipStatus;
  releasedDate: Date | null; // Server maps to Date | null
  // --- Added for Modal Display ---
  accountData?: AccountData | null; // Include basic account info needed by modal, optional/nullable
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

/* export type UIDiscountRuleWithServices = Omit<
  DiscountRule,
  "startDate" | "endDate" | "createdAt" | "updatedAt"
> & {
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
  applyToAll: boolean;
  services?: Pick<Service, "id" | "title">[];
}; */
/* export type ServiceOption = Pick<Service, "id" | "title">;

export type AccountForManagement = Omit<Account, "password" | "salary"> & {
  dailyRate: number;
  branch?: Pick<Branch, "id" | "title"> | null;
}; */

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

export interface TransactionSubmissionResponse {
  success: boolean;
  message?: string;
  transactionId?: string;
  errors?: Record<string, string[]>;
  warning?: string; // Added warning property
}

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}

export type TransactionForManagement = Omit<
  TransactionProps, // Use TransactionProps as the base
  | "customer"
  | "availedServices"
  | "voucherUsed"
  | "branch"
  | "bookingReminderSentAt"
  | "giftCertificateId" // Keep scalar FK
  | "giftCertificateUsed"
  | "originatingRecommendations"
  | "attendedAppointment" // Exclude relations
> & {
  // Re-add relations with specific inclusion types
  customer: ClientCustomerIncluded | null; // Include customer { name, email }
  voucherUsed: ClientVoucherIncluded | null; // Include voucher { code }
  availedServices: AvailedServicesPropsForManagement[]; // Array of AS with units (using Management version)
  branch: ClientBranchIncluded | null; // Include branch { id, title, code }

  // Include scalar fields that might have been omitted or explicitly re-list them
  bookingReminderSentAt: Date | null; // Included timestamp from base TransactionProps
  giftCertificateId: string | null; // Field on Transaction from base TransactionProps
  // Include relation if fetched (using 'any' or a specific type)
  giftCertificateUsed: any | null; // Example if included

  // Include RecommendedAppointment relations if fetched
  originatingRecommendations: RecommendedAppointmentProps[]; // Included RA
  attendedAppointment: RecommendedAppointmentProps | null; // Included RA

  // Add any other top-level transaction scalar fields if needed that aren't covered by Omit/Pick
  // e.g., discount, grandTotal, paymentMethod, status should be included from TransactionProps
};

export type AvailedServiceUnitPropsForManagement = {
  id: string;
  unitIndex: number;
  status: Status;
  completedAt: Date | null;
  servedBy: ClientAccountIncluded | null; // ServedBy is on the unit
  checkedBy: ClientAccountIncluded | null; // CheckedBy is on the unit
  checkedAt: Date | null;
  servedAt: Date | null;
  availedServiceId: string; // Include parent ID
  // Also include derived unit prices/commissions if needed in management context
  unitPrice: number;
  unitCommissionValue: number;
};

// Re-define AvailedServicesPropsForManagement mirroring AvailedServicesProps but with Management unit type
export interface AvailedServicesPropsForManagement {
  id: string;
  transactionId: string;
  serviceId: string | null;
  // Corrected: Include price in the service type
  service: { id: string; title: string; price: number } | null;
  quantity: number;
  price: number; // Total price for this line item
  commissionValue: number; // Total commission for this line item
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  originatingSet: ClientServiceSetIncluded | null;
  serviceSetId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  postTreatmentEmailSentAt: Date | null; // Included scalar field

  units: AvailedServiceUnitPropsForManagement[];
}

export type ActiveTab =
  | "services"
  | "serviceSets"
  | "accounts"
  | "payslips"
  | "customers"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches"
  | "advertisements"
  | "transactions"
  | "emailTemplate";

export type ServerActionResponse<T = any> =
  | { success: true; data?: T; message?: string }
  | {
      success: false;
      message?: string;
      errors?: Record<string, string[] | string | undefined | null>;
    };

export interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType; // Or specific icon export type like LucideIcon
}

export interface GetTransactionsFilters {
  startDate?: string; // ISO Date string or undefined
  endDate?: string; // ISO Date string or undefined
  status?: Status;
}

export type PayslipModalData = {
  attendanceRecords: AttendanceRecord[]; // Still same structure (date-based)
  breakdownItems: SalaryBreakdownItem[]; // Use the updated SalaryBreakdownItem (per unit)
  relevantLastPayslipEndDate: Date | null; // Date | null
  relevantLastReleasedTimestamp: Date | null; // Date | null
  // Add the calculated commission calculation timestamp for display context
  commissionCalculationStartTime: Date | null; // Added for consistency with component
  // Include payslip data itself if needed, although ManagePayslips already has it
  // payslip: PayslipData; // Potentially include this
};

// Redefine AvailedServicesPropsForListData to match the return structure AND the base AvailedServicesProps structure
export type AvailedServicesPropsForListData = Omit<
  AvailedServicesProps, // Start with the base AS props which includes necessary scalars
  "service" | "originatingSet" | "units" // Omit relations/units to redefine them
> & {
  // Redefine the relations/units with the specific include structure from the fetch
  service: { id: string; title: string; price: number } | null; // Matches fetch select
  originatingSet: ClientServiceSetIncluded | null; // Matches fetch select
  units: AvailedServiceUnitProps[]; // Matches fetch include and mapped unit type
  // Other scalar fields like transactionId, quantity, price, commissionValue,
  // originatingSetId, originatingSetTitle, serviceSetId, createdAt, updatedAt,
  // postTreatmentEmailSentAt are preserved from the base AvailedServicesProps due to Omit
};

export interface TransactionListData {
  id: string;
  createdAt: Date; // Server should map to Date object
  bookedFor: Date | null; // Server should map to Date | null
  bookingReminderSentAt: Date | null; // Server should map to Date | null
  customerId: string; // Required field
  customer: ClientCustomerIncluded | null; // updateTransactionDetails includes customer { id, name, email } - email will be undefined if not fetched
  // Use the specific AvailedServicesPropsForListData type
  availedServices: AvailedServicesPropsForListData[]; // updateTransactionDetails includes AvailedServices with units and service price

  voucherId: string | null; // Optional/nullable field
  voucherUsed: ClientVoucherIncluded | null; // updateTransactionDetails includes voucherUsed

  discount: number; // Required field
  paymentMethod: PaymentMethod | null; // Optional/nullable enum

  grandTotal: number; // Required field
  status: Status; // Transaction status (still on parent)

  branchId: string | null; // Optional/nullable field
  branch: ClientBranchIncluded | null; // updateTransactionDetails includes branch

  // Add other fields included in updateTransactionDetails fetch if any
  giftCertificateId: string | null;
  giftCertificateUsed?: any | null; // Example
  originatingRecommendations?: RecommendedAppointmentProps[]; // Example - Assuming included
  attendedAppointment?: RecommendedAppointmentProps | null; // Example - Assuming included
}

export type AvailedServiceWithServiceAndBranch = {
  id: string;
  transactionId: string;
  serviceId: string | null;
  quantity: number;
  price: number; // Price snapshot at transaction time
  commissionValue: number;
  originatingSetId?: string | null;
  originatingSetTitle?: string | null;
  status: Status; // Assuming Status export enum is imported or defined
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

export interface NewAvailedServiceInput {
  serviceId: string;
  quantity: number;
  price?: number | null; // Assuming this is Optional UNIT price from form
  serviceTitle: string; // Passed for AvailedService.originatingSetTitle
  branchId: string; // Branch ID of the service being added
}

export interface UpdateTransactionInput {
  transactionId: string;
  status?: Status;
  paymentMethod?: PaymentMethod | null;
  discount?: number | null; // Allow setting discount to 0 or null
  bookedForDate?: string | null; // YYYY-MM-DD
  bookedForTime?: string | null; // HH:mm
  availedServicesUpdates?: Array<{
    availedServiceId: string;
    price?: number | null; // Allow setting price to 0 or null (UNIT PRICE)
    quantity?: number;
  }>;
  newAvailedServices?: NewAvailedServiceInput[]; // Using the new interface
  branchId?: string | null; // <--- ADDED branchId here
}

// Define the client-side export type for RecommendedAppointment when fetched with specific includes
export type RecommendedAppointmentProps = {
  id: string;
  customerId: string;
  recommendedDate: Date; // Server should map to Date object
  originatingTransactionId: string | null;
  originatingAvailedServiceId: string; // Links to the parent AvailedService, not Unit
  originatingServiceId: string;
  status: RecommendedAppointmentStatus;
  attendedTransactionId: string | null;
  suppressNextFollowUpGeneration: boolean;
  // Timestamps should be Date | null after server mapping
  reminder3DaySentAt: Date | null;
  reminder2DaySentAt: Date | null;
  reminder1DaySentAt: Date | null;
  reminderTodaySentAt: Date | null;
  reminder1DayAfterSentAt: Date | null;
  reminder7DaySentAt: Date | null;
  reminder7DayAfterSentAt: Date | null;
  reminder14DayAfterSentAt: Date | null;
  createdAt: Date; // Server should map to Date object
  updatedAt: Date; // Server should map to Date object

  // Include relations if fetched (make them optional/nullable if not always included)
  originatingService?: {
    id: string;
    title: string;
    followUpPolicy: FollowUpPolicy;
  } | null;
  attendedTransaction?: { id: string } | null; // Assuming minimal details are included
};

// --- End of Type Definitions ---

// Helper export type for the selected fields of AvailedServiceUnit
export type AvailedServiceUnitSelected = Prisma.AvailedServiceUnitGetPayload<{
  select: {
    id: true;
    availedServiceId: true;
    unitIndex: true;
    status: true;
    completedAt: true;
    checkedById: true;
    checkedBy: { select: { id: true; name: true } };
    servedById: true;
    servedBy: { select: { id: true; name: true } };
    checkedAt: true;
    servedAt: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

export type RecommendedAppointmentIncluded =
  Prisma.RecommendedAppointmentGetPayload<{
    include: {
      originatingService: true;
      attendedTransaction: { select: { id: true } };
    };
  }>;

export interface CustomerWithDetails {
  id: string;
  name: string;
  email: string | null;
  totalPaid: number;
  nextAppointment: Date | null;
  transactions: Array<
    Pick<
      Transaction,
      "id" | "createdAt" | "grandTotal" | "status" | "bookedFor"
    > & {
      availedServices: Array<{
        service?: { title: string } | null;
        originatingSetTitle?: string | null;
      }>;
    }
  >;
  recommendedAppointments: Array<
    Pick<RecommendedAppointment, "id" | "recommendedDate" | "status"> & {
      originatingService?: { title: string } | null;
    }
  >;
  purchasedGiftCertificatesCount: number;
}

export type IncludedAvailedService =
  SuccessfulTransactionPayload["availedServices"][number];

export type IncludedRecommendedAppointment =
  SuccessfulTransactionPayload["originatingRecommendations"][number];

export interface GcCreationData {
  code: string;
  itemIds: string[];
  itemType: "service" | "set";
  purchaserCustomerId?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  expiresAt?: string | null;
}

export interface ActionResult {
  success: boolean;
  message: string;
}

export interface ActionResult {
  success: boolean;
  message: string;
  errors?: Record<string, string[] | undefined>;
  account?: {
    id: string;
    username: string;
    email: string | null;
    name: string;
  };
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
