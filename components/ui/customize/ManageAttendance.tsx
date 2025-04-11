// src/app/(app)/attendance/_components/ManageAttendance.tsx
"use client";

import React, {
  useState,
  useEffect,
  useTransition,
  useCallback,
  useMemo,
} from "react";
import {
  getEmployeesForAttendanceAction,
  markAttendanceAction,
  getBranchesForSelectAction, // For filtering
} from "@/lib/ServerAction"; // Adjust path if needed
import Button from "@/components/Buttons/Button"; // Use your Button component
import { EmployeeForAttendance, BranchForSelect } from "@/lib/Types";

import { ParamValue } from "next/dist/server/request/params";

// Assume you get the current user's ID from auth context or session
// Replace this with your actual method of getting the logged-in user's ID

export default function ManageAttendance({
  currentUserId,
}: {
  currentUserId: ParamValue;
}) {
  const [employees, setEmployees] = useState<EmployeeForAttendance[]>([]);
  const [branches, setBranches] = useState<BranchForSelect[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>(""); // '' means All
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // --- Load Data ---
  const loadData = useCallback(async () => {
    console.log("Client: loadData (Attendance) called");
    setIsLoading(true);
    setError(null);
    try {
      console.log("Client: Calling attendance/branch actions...");
      // Pass filters to action if implemented server-side later
      const [fetchedEmployees, fetchedBranches] = await Promise.all([
        getEmployeesForAttendanceAction(/* Pass checker/filter details if needed */),
        getBranchesForSelectAction(),
      ]);
      console.log("Client: Data received", {
        fetchedEmployees,
        fetchedBranches,
      });
      setEmployees(fetchedEmployees);
      setBranches(fetchedBranches);
    } catch (err: any) {
      console.error("Client: Failed to load attendance data:", err);
      setError(err.message || "Failed to load data. Please refresh.");
    } finally {
      setIsLoading(false);
      console.log("Client: loadData (Attendance) finished.");
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // --- Filter Employees Client-Side ---
  const filteredEmployees = useMemo(() => {
    if (!selectedBranchId) {
      return employees; // Show all if no branch selected
    }
    // Find the title of the selected branch ID
    const selectedBranchTitle = branches.find(
      (b) => b.id === selectedBranchId,
    )?.title;
    if (!selectedBranchTitle) return employees; // Should not happen if selection is valid

    return employees.filter((emp) => emp.branchTitle === selectedBranchTitle);
  }, [employees, selectedBranchId, branches]);

  // --- Action Handler ---
  const handleMarkAttendance = (
    accountId: string,
    isPresent: boolean,
    currentStatus?: boolean | null, // Pass current status to avoid redundant calls if needed
  ) => {
    // Optional: Check if status is already the desired one
    // if (currentStatus === isPresent) {
    //     console.log(`Attendance already marked as ${isPresent} for ${accountId}`);
    //     return; // Or show feedback
    // }

    startTransition(async () => {
      setError(null); // Clear previous errors
      console.log(
        `Client: Calling markAttendanceAction for ${accountId}, present: ${isPresent}`,
      );
      try {
        const result = await markAttendanceAction(
          accountId,
          isPresent,
          null, // Add notes input later if needed
          currentUserId, // Pass the actual checker ID
        );
        console.log("Client: Mark attendance result:", result);
        if (result.success) {
          // Reload data to show updated status and potentially salary elsewhere
          await loadData();
          // Or update state optimistically (more complex)
        } else {
          setError(result.message); // Show error message
        }
      } catch (err: any) {
        console.error("Client: Error calling markAttendanceAction:", err);
        setError(err.message || "An unexpected error occurred.");
      }
    });
  };

  // --- Today's Date String ---
  const todayString = useMemo(() => {
    return new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD format
  }, []);

  // --- Styles (reuse or adapt from ManageAccounts) ---
  const thStyle =
    "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdStyle =
    "px-4 py-3 whitespace-nowrap text-sm text-gray-600 align-middle"; // Align middle
  const tdFirstChildStyle = `${tdStyle} font-medium text-gray-900`;
  const errorStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";
  const buttonStylePresent =
    "px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed";
  const buttonStyleAbsent =
    "px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 disabled:cursor-not-allowed ml-2";
  const statusBadgeBase =
    "px-2.5 py-0.5 rounded-full text-xs font-medium inline-block";
  const statusBadgePresent = `${statusBadgeBase} bg-green-100 text-green-800`;
  const statusBadgeAbsent = `${statusBadgeBase} bg-red-100 text-red-800`;
  const statusBadgeNotMarked = `${statusBadgeBase} bg-gray-100 text-gray-800`;

  return (
    <div className="p-4">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-customBlack">
          Daily Attendance ({todayString})
        </h2>
        {/* Branch Filter Dropdown */}
        <div>
          <label
            htmlFor="branchFilter"
            className="mr-2 text-sm font-medium text-customBlack"
          >
            Filter by Branch:
          </label>
          <select
            id="branchFilter"
            name="branchFilter"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="rounded border border-customGray p-2 text-sm shadow-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink"
            disabled={isLoading}
          >
            <option value="">-- All Branches --</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Error Display */}
      {error && <p className={errorStyle}>{error}</p>}

      {/* Table Display */}
      {isLoading ? (
        <div className="py-10 text-center text-customBlack/70">
          Loading employees...
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-10 text-center text-customBlack/60">
          No employees found{selectedBranchId ? " for this branch" : ""}.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-customGray/50 bg-white bg-opacity-60 shadow-md">
          <table className="min-w-full divide-y divide-customGray/30">
            <thead className="bg-customGray/10">
              <tr>
                <th className={thStyle}>Employee Name</th>
                <th className={thStyle}>Branch</th>
                <th className={thStyle}>Status Today</th>
                {/* <th className={thStyle}>Notes</th> */}
                <th className={`${thStyle} text-center`}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-customGray/30">
              {filteredEmployees.map((employee) => {
                const attendance = employee.todaysAttendance;
                const isPresent = attendance?.isPresent;
                const isMarked = attendance !== null;

                return (
                  <tr key={employee.id} className="hover:bg-customLightBlue/20">
                    <td className={tdFirstChildStyle}>{employee.name}</td>
                    <td className={tdStyle}>
                      {employee.branchTitle ?? (
                        <span className="italic text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className={tdStyle}>
                      {/* Status Badge */}
                      <span
                        className={
                          isMarked
                            ? isPresent
                              ? statusBadgePresent
                              : statusBadgeAbsent
                            : statusBadgeNotMarked
                        }
                      >
                        {isMarked
                          ? isPresent
                            ? "Present"
                            : "Absent"
                          : "Not Marked"}
                      </span>
                    </td>
                    {/* Notes Column (Optional) */}
                    {/* <td className={tdStyle}>{attendance?.notes ?? '-'}</td> */}
                    <td className={`${tdStyle} text-center`}>
                      {/* Action Buttons */}
                      <button
                        onClick={() =>
                          handleMarkAttendance(employee.id, true, isPresent)
                        }
                        disabled={isPending || isPresent === true} // Disable if pending or already present
                        className={`${buttonStylePresent} ${isPresent === true ? "cursor-not-allowed opacity-50" : ""}`}
                        title={
                          isPresent === true
                            ? "Already marked present"
                            : "Mark as Present"
                        }
                      >
                        Present
                      </button>
                      <button
                        onClick={() =>
                          handleMarkAttendance(employee.id, false, isPresent)
                        }
                        disabled={isPending || isPresent === false} // Disable if pending or already absent
                        className={`${buttonStyleAbsent} ${isPresent === false ? "cursor-not-allowed opacity-50" : ""}`}
                        title={
                          isPresent === false
                            ? "Already marked absent"
                            : "Mark as Absent"
                        }
                      >
                        Absent
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
