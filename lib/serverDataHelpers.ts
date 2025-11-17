"use server";

/**
 * Server-side data fetching helpers for common patterns
 * These functions can be used to fetch initial data for server components
 */

import {
  getEmployeesForAttendanceAction,
  getBranchesForSelectAction,
} from "./ServerAction";
import {
  getPayslipRequestsAction,
  getEmployeesForPayslipManagement,
} from "./SalaryActions";
import type {
  EmployeeForAttendance,
  BranchForSelect,
} from "./Types";
import type {
  PayslipRequestWithAccounts,
  Employee,
} from "./SalaryActions";

/**
 * Fetch attendance management data
 */
export async function fetchAttendanceData() {
  try {
    const [employees, branches] = await Promise.all([
      getEmployeesForAttendanceAction(),
      getBranchesForSelectAction(),
    ]);
    return {
      employees: employees || [],
      branches: branches || [],
    };
  } catch (error) {
    console.error("Error fetching attendance data:", error);
    return {
      employees: [] as EmployeeForAttendance[],
      branches: [] as BranchForSelect[],
    };
  }
}

/**
 * Fetch payslip management data
 */
export async function fetchPayslipManagementData() {
  try {
    const [requestsResult, employeesResult] = await Promise.all([
      getPayslipRequestsAction(),
      getEmployeesForPayslipManagement(),
    ]);

    return {
      requests: requestsResult.error ? [] : requestsResult.data,
      employees: employeesResult.error || !employeesResult.success
        ? []
        : employeesResult.data || [],
      error: requestsResult.error || (employeesResult.error ? employeesResult.error : null),
    };
  } catch (error) {
    console.error("Error fetching payslip management data:", error);
    return {
      requests: [] as PayslipRequestWithAccounts[],
      employees: [] as Employee[],
      error: error instanceof Error ? error.message : "Failed to fetch data",
    };
  }
}

