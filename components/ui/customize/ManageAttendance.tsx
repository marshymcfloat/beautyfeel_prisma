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
  getBranchesForSelectAction,
} from "@/lib/ServerAction";
import {
  EmployeeForAttendance,
  BranchForSelect,
  OptimisticUpdateAttendanceRecord,
  ServerTodaysAttendance,
} from "@/lib/Types";

const TARGET_TIMEZONE = "Asia/Manila";

const getStartOfTodayTargetTimezoneUtc = () => {
  const nowUtc = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TARGET_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const targetDateString = formatter.format(nowUtc);
  const [yearStr, monthStr, dayStr] = targetDateString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
};

export default function ManageAttendance({
  viewedAccountId,
  checkerId,
}: {
  viewedAccountId: string | undefined;
  checkerId: string;
}) {
  const [employees, setEmployees] = useState<EmployeeForAttendance[]>([]);
  const [branches, setBranches] = useState<BranchForSelect[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [processingEmployeeIds, setProcessingEmployeeIds] = useState<
    Set<string>
  >(new Set());

  const startOfTodayTargetZoneUtc = useMemo(
    () => getStartOfTodayTargetTimezoneUtc(),
    [],
  );

  const loadData = useCallback(async (isInitialLoad = false) => {
    if (isInitialLoad) {
      console.log("Client: loadData called for INITIAL data load.");
      setIsLoading(true);
    } else {
      console.log("Client: loadData called for data refresh.");
    }

    try {
      const [fetchedEmployees, fetchedBranches] = await Promise.all([
        getEmployeesForAttendanceAction(),
        getBranchesForSelectAction(),
      ]);
      setEmployees(fetchedEmployees);
      setBranches(fetchedBranches);
      setError(null);
    } catch (err: any) {
      console.error(
        `Client: Failed to load attendance data (initial: ${isInitialLoad}):`,
        err,
      );
      setError(err.message || "Failed to load data. Please refresh.");
    } finally {
      if (isInitialLoad) {
        setIsLoading(false);
      }
      console.log(`Client: loadData (initial: ${isInitialLoad}) finished.`);
    }
  }, []);

  useEffect(() => {
    if (!checkerId) {
      console.error("ManageAttendance: checkerId prop is missing!");
      setError("Authentication error: Checker ID not provided.");
      setIsLoading(false);
      return;
    }
    loadData(true);
  }, [checkerId, loadData]);

  const filteredEmployees = useMemo(() => {
    if (!selectedBranchId) return employees;
    const selectedBranch = branches.find((b) => b.id === selectedBranchId);
    if (selectedBranchId !== "" && !selectedBranch) return [];

    return employees.filter((emp) => {
      if (selectedBranchId !== "" && emp.branchTitle === null) return false;
      return (
        selectedBranchId === "" || emp.branchTitle === selectedBranch?.title
      );
    });
  }, [employees, selectedBranchId, branches]);

  const handleMarkAttendance = useCallback(
    (accountId: string, newIsPresentStatus: boolean) => {
      if (!checkerId) {
        setError("Authentication error: Cannot perform action.");
        return;
      }

      setEmployees((prevEmployees) =>
        prevEmployees.map((emp) => {
          if (emp.id === accountId) {
            let dateForOptimisticRecord: string;
            if (
              emp.todaysAttendance &&
              "date" in emp.todaysAttendance &&
              emp.todaysAttendance.date
            ) {
              try {
                const dateObj =
                  typeof emp.todaysAttendance.date === "string"
                    ? new Date(emp.todaysAttendance.date)
                    : emp.todaysAttendance.date;
                dateForOptimisticRecord = !isNaN(dateObj.getTime())
                  ? dateObj.toISOString().split("T")[0]
                  : new Date().toISOString().split("T")[0];
              } catch {
                dateForOptimisticRecord = new Date()
                  .toISOString()
                  .split("T")[0];
              }
            } else {
              dateForOptimisticRecord = new Date().toISOString().split("T")[0];
            }

            const optimisticRecordForUpdate: OptimisticUpdateAttendanceRecord =
              {
                id:
                  emp.todaysAttendance?.id ||
                  `optimistic-${emp.id}-${Date.now()}`,
                date: dateForOptimisticRecord,
                isPresent: newIsPresentStatus,
                notes: emp.todaysAttendance?.notes ?? undefined,
              };
            return { ...emp, todaysAttendance: optimisticRecordForUpdate };
          }
          return emp;
        }),
      );

      setProcessingEmployeeIds((prev) => new Set(prev).add(accountId));
      setError(null);

      startTransition(async () => {
        let actionSuccess = false;
        try {
          const result = await markAttendanceAction(
            accountId,
            newIsPresentStatus,

            employees.find((e) => e.id === accountId)?.todaysAttendance
              ?.notes ?? null,
            checkerId,
          );
          if (result.success) {
            actionSuccess = true;
            console.log(
              `Client: Mark attendance successful for ${accountId}. ${result.message}`,
            );
            if (result.updatedAttendance) {
              setEmployees((prevEmps) =>
                prevEmps.map((emp) =>
                  emp.id === accountId
                    ? {
                        ...emp,
                        todaysAttendance: {
                          id: result.updatedAttendance!.id,
                          isPresent: result.updatedAttendance!.isPresent,
                          notes: result.updatedAttendance!.notes,
                        } as ServerTodaysAttendance,
                      }
                    : emp,
                ),
              );
            }
          } else {
            console.error(
              `Client: Mark attendance failed for ${accountId}. ${result.message}`,
            );
            setError(result.message || "Failed to mark attendance.");
          }
        } catch (err: any) {
          console.error(
            `Client: Unexpected error marking attendance for ${accountId}.`,
            err,
          );
          setError(
            err.message ||
              "An unexpected error occurred while marking attendance.",
          );
        } finally {
          if (!actionSuccess) {
            console.log(
              `Client: Action failed for ${accountId}. Reloading data to revert.`,
            );
            await loadData(false);
          }
          setProcessingEmployeeIds((prev) => {
            const next = new Set(prev);
            next.delete(accountId);
            return next;
          });
          console.log(`Client: Finished processing for ${accountId}.`);
        }
      });
    },
    [checkerId, loadData, employees],
  );

  const todayString = useMemo(() => {
    return new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: TARGET_TIMEZONE,
    });
  }, []);

  const thStyle =
    "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider";
  const tdStyle =
    "px-4 py-3 whitespace-nowrap text-sm text-gray-600 align-middle";
  const tdFirstChildStyle = `${tdStyle} font-medium text-gray-900`;
  const errorStyle =
    "mb-4 rounded border border-red-400 bg-red-100 p-3 text-sm text-red-700";

  const buttonBaseShared =
    "font-medium rounded disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-opacity-50 transition-colors duration-150";
  const buttonBaseTable = `${buttonBaseShared} px-2 py-1 text-xs`;
  const buttonStylePresentTable = `${buttonBaseTable} bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500`;
  const buttonStyleAbsentTable = `${buttonBaseTable} bg-red-100 text-red-700 hover:bg-red-200 ml-2 focus:ring-red-500`;

  const buttonBaseMobile = `${buttonBaseShared} px-3 py-1.5 text-sm flex-grow text-center`;
  const buttonStylePresentMobile = `${buttonBaseMobile} bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500`;
  const buttonStyleAbsentMobile = `${buttonBaseMobile} bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500`;

  const statusBadgeBase =
    "px-2.5 py-0.5 rounded-full text-xs font-medium inline-block";
  const statusBadgePresent = `${statusBadgeBase} bg-green-100 text-green-800`;
  const statusBadgeAbsent = `${statusBadgeBase} bg-red-100 text-red-800`;
  const statusBadgeNotMarked = `${statusBadgeBase} bg-gray-100 text-gray-800`;
  const processingButtonStyle = "opacity-70 cursor-wait";

  return (
    <div className="bg-customOffWhite p-2 sm:p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold text-customBlack">
          Daily Attendance ({todayString})
        </h2>
        <div className="w-full sm:w-auto">
          <label
            htmlFor="branchFilterAttendance"
            className="mb-1 block text-xs font-medium text-customBlack sm:mb-0 sm:mr-2 sm:inline"
          >
            Filter by Branch:
          </label>
          <select
            id="branchFilterAttendance"
            name="branchFilterAttendance"
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="w-full rounded border border-customGray p-2 text-sm shadow-sm focus:border-customDarkPink focus:ring-1 focus:ring-customDarkPink sm:w-auto"
            disabled={isLoading || isPending}
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
      {error && <p className={errorStyle}>{error}</p>}
      {isLoading ? (
        <div className="py-10 text-center text-customBlack/70">
          Loading employees...
        </div>
      ) : filteredEmployees.length === 0 ? (
        <div className="py-10 text-center text-customBlack/60">
          No employees found{selectedBranchId ? " for this branch" : ""}.
        </div>
      ) : (
        <>
          <div className="hidden max-h-[300px] overflow-x-auto overflow-y-auto rounded border border-customGray/50 bg-opacity-60 shadow-md sm:block">
            <table className="min-w-full divide-y divide-customGray/30">
              <thead className="sticky top-0 z-10 bg-customGray/10 backdrop-blur-sm">
                <tr>
                  <th className={thStyle}>Employee Name</th>
                  <th className={thStyle}>Branch</th>
                  <th className={thStyle}>Status Today</th>
                  <th className={`${thStyle} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-customGray/30">
                {filteredEmployees.map((employee) => {
                  const attendance = employee.todaysAttendance;
                  const isPresent = attendance?.isPresent;
                  const isMarked = attendance !== null;
                  const isCurrentlyProcessing = processingEmployeeIds.has(
                    employee.id,
                  );

                  const isTodayInLastPayslip =
                    employee.lastPayslipEndDate !== null &&
                    startOfTodayTargetZoneUtc.getTime() <=
                      new Date(employee.lastPayslipEndDate).getTime();

                  const isAbsentDisabled =
                    isCurrentlyProcessing ||
                    isPresent === false ||
                    isTodayInLastPayslip;
                  const isPresentDisabled =
                    isCurrentlyProcessing || isPresent === true;

                  return (
                    <tr
                      key={employee.id}
                      className="hover:bg-customLightBlue/20"
                    >
                      <td className={tdFirstChildStyle}>{employee.name}</td>
                      <td className={tdStyle}>
                        {employee.branchTitle ?? (
                          <span className="italic text-gray-400">N/A</span>
                        )}
                      </td>
                      <td className={tdStyle}>
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
                      <td className={`${tdStyle} text-center`}>
                        <button
                          onClick={() =>
                            handleMarkAttendance(employee.id, true)
                          }
                          disabled={isPresentDisabled}
                          className={`${buttonStylePresentTable} ${isPresentDisabled ? "cursor-not-allowed !bg-green-50 !text-green-400" : ""} ${isCurrentlyProcessing ? processingButtonStyle : ""}`}
                          title={
                            isCurrentlyProcessing
                              ? "Processing..."
                              : isPresent === true
                                ? "Already marked present"
                                : "Mark as Present"
                          }
                        >
                          {isCurrentlyProcessing && !isPresentDisabled
                            ? "..."
                            : "Present"}
                        </button>
                        <button
                          onClick={() =>
                            handleMarkAttendance(employee.id, false)
                          }
                          disabled={isAbsentDisabled}
                          className={`${buttonStyleAbsentTable} ${isAbsentDisabled ? "cursor-not-allowed !bg-red-50 !text-red-400" : ""} ${isCurrentlyProcessing ? processingButtonStyle : ""}`}
                          title={
                            isCurrentlyProcessing
                              ? "Processing..."
                              : isPresent === false
                                ? "Already marked absent"
                                : isTodayInLastPayslip
                                  ? "Cannot mark absent - day included in last payslip"
                                  : "Mark as Absent"
                          }
                        >
                          {isCurrentlyProcessing && !isAbsentDisabled
                            ? "..."
                            : "Absent"}
                          {isTodayInLastPayslip &&
                            !isCurrentlyProcessing &&
                            !isPresent &&
                            " 🔒"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="block max-h-[calc(100vh-400px)] space-y-3 overflow-y-auto pr-1 sm:hidden">
            {filteredEmployees.map((employee) => {
              const attendance = employee.todaysAttendance;
              const isPresent = attendance?.isPresent;
              const isMarked = attendance !== null;
              const isCurrentlyProcessing = processingEmployeeIds.has(
                employee.id,
              );

              const isTodayInLastPayslip =
                employee.lastPayslipEndDate !== null &&
                startOfTodayTargetZoneUtc.getTime() <=
                  new Date(employee.lastPayslipEndDate).getTime();

              const isAbsentDisabled =
                isCurrentlyProcessing ||
                isPresent === false ||
                isTodayInLastPayslip;
              const isPresentDisabled =
                isCurrentlyProcessing || isPresent === true;

              return (
                <div
                  key={employee.id}
                  className="rounded border border-customGray/40 bg-white bg-opacity-70 p-3.5 shadow-sm"
                >
                  <div className="mb-2.5 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-md font-semibold text-customBlack">
                        {employee.name}
                      </p>
                      <span
                        className={`whitespace-nowrap ${
                          isMarked
                            ? isPresent
                              ? statusBadgePresent
                              : statusBadgeAbsent
                            : statusBadgeNotMarked
                        }`}
                      >
                        {isMarked
                          ? isPresent
                            ? "Present"
                            : "Absent"
                          : "Not Marked"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Branch:{" "}
                      {employee.branchTitle ?? (
                        <span className="italic">N/A</span>
                      )}
                    </p>
                  </div>
                  <div className="flex space-x-2 border-t border-customGray/20 pt-2.5">
                    <button
                      onClick={() => handleMarkAttendance(employee.id, true)}
                      disabled={isPresentDisabled}
                      className={`${buttonStylePresentMobile} ${isPresentDisabled ? "cursor-not-allowed !bg-green-50 !text-green-400" : ""} ${isCurrentlyProcessing ? processingButtonStyle : ""}`}
                      title={
                        isCurrentlyProcessing
                          ? "Processing..."
                          : isPresent === true
                            ? "Already marked present"
                            : "Mark as Present"
                      }
                    >
                      {isCurrentlyProcessing && !isPresentDisabled
                        ? "..."
                        : "Present"}
                    </button>
                    <button
                      onClick={() => handleMarkAttendance(employee.id, false)}
                      disabled={isAbsentDisabled}
                      className={`${buttonStyleAbsentMobile} ${isAbsentDisabled ? "cursor-not-allowed !bg-red-50 !text-red-400" : ""} ${isCurrentlyProcessing ? processingButtonStyle : ""}`}
                      title={
                        isCurrentlyProcessing
                          ? "Processing..."
                          : isPresent === false
                            ? "Already marked absent"
                            : isTodayInLastPayslip
                              ? "Cannot mark absent - day included in last payslip"
                              : "Mark as Absent"
                      }
                    >
                      {isCurrentlyProcessing && !isAbsentDisabled
                        ? "..."
                        : "Absent"}
                      {isTodayInLastPayslip &&
                        !isCurrentlyProcessing &&
                        !isPresent &&
                        " 🔒"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
