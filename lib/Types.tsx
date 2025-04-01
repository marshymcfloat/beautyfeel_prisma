import type { Role } from "@prisma/client"; // Import Prisma enum if possible
import { Socket } from "socket.io-client"; // Import Socket type
// Represents the essential data for the logged-in account
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

export type ExpandedListedServicesProps = {
  services: AvailedServicesProps[]; // Expects services CHECKED BY the current user
  accountId: string; // ID of the logged-in user
  socket: Socket | null; // Socket instance for emitting events
  onClose: () => void; // Function to close the container (e.g., a dialog)
  // Pass down processing state management from parent if needed globally
  // Or manage processing state locally if this component is self-contained enough
  processingServeActions: Set<string>;
  setProcessingServeActions: React.Dispatch<React.SetStateAction<Set<string>>>;
};
