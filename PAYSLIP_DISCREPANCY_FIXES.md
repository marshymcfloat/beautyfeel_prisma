# Payslip Discrepancy Fixes

## Issues Found and Fixed

### 1. ❌ CRITICAL: Commission Field Mismatch
**Problem:**
- `getPayslipBreakdownForPeriod` (request phase) was using `servedAt` for commission filtering
- `processAndReleasePayslipAction` (release phase) was using `completedAt` for commission filtering
- These are different fields with potentially different timestamps, causing different commission amounts

**Fix:**
- Changed `processAndReleasePayslipAction` to use `servedAt` instead of `completedAt`
- `servedAt` is the correct field as it represents when the service was actually served (when commission is earned)
- Added validation: `not: null` to ensure `servedAt` is set

**Impact:** This was the **primary cause** of amount discrepancies between request and release.

---

### 2. ❌ CRITICAL: Commission End Date Calculation Mismatch
**Problem:**
- `getPayslipBreakdownForPeriod` used timezone-aware calculation: `getUtcForPhtStartOfNextDay(periodEndDate)`
- `processAndReleasePayslipAction` used simple calculation: `addDays(periodEndDate, 1)`
- These can produce different results depending on timezone boundaries

**Fix:**
- Changed `processAndReleasePayslipAction` to use the same timezone-aware calculation
- Uses `getUtcForPhtStartOfDay(periodEndDate)` then `getUtcForPhtStartOfNextDay()` for exclusive boundary
- Ensures consistent end date calculation between request and release phases

**Impact:** Prevents timezone-related discrepancies in commission period boundaries.

---

### 3. ❌ CRITICAL: Attendance End Boundary Mismatch
**Problem:**
- `getPayslipBreakdownForPeriod` used exclusive boundary (`lt`) for attendance queries
- `processAndReleasePayslipAction` used inclusive boundary (`lte`) for attendance queries
- This could cause different attendance counts

**Fix:**
- Changed `processAndReleasePayslipAction` to use exclusive boundary (`lt`)
- Calculates `attendanceEndDateOnlyExclusive` using timezone-aware helper
- Uses same boundary logic as request phase

**Impact:** Ensures consistent attendance counting between request and release.

---

### 4. ❌ CRITICAL: Attendance Count Calculation Mismatch
**Problem:**
- `getPayslipBreakdownForPeriod` counted attendance directly: `relevantAttendanceRecords.length`
- `processAndReleasePayslipAction` counted from display records: `fullAttendanceRecords.filter((a) => a.isPresent).length`
- Date formatting/matching differences could cause discrepancies

**Fix:**
- Changed `processAndReleasePayslipAction` to count directly from `attendanceInPeriod.length`
- Removed dependency on display record filtering
- Ensures both phases count the same way

**Impact:** Eliminates potential date matching discrepancies in attendance counting.

---

### 5. ✅ Commission Start Condition Consistency
**Fix:**
- Standardized commission start condition logic between both functions
- Both now use the same logic: `gt` if previous payslip exists, `gte` otherwise
- Added comprehensive logging for debugging

---

## Summary of Changes

### Files Modified:
- `lib/SalaryActions.ts` - `processAndReleasePayslipAction` function

### Key Changes:
1. ✅ Changed commission filtering from `completedAt` to `servedAt`
2. ✅ Standardized commission end date calculation using timezone-aware helpers
3. ✅ Changed attendance end boundary from `lte` to `lt` (exclusive)
4. ✅ Simplified attendance counting to match request phase logic
5. ✅ Added filter conditions for commission calculation (cancelled transactions, etc.)
6. ✅ Added comprehensive logging for debugging

### Result:
Both `getPayslipBreakdownForPeriod` (request/review) and `processAndReleasePayslipAction` (release) now use:
- ✅ Same field (`servedAt`) for commission filtering
- ✅ Same timezone-aware date boundary calculations
- ✅ Same exclusive boundaries for attendance queries
- ✅ Same attendance counting method
- ✅ Same commission calculation helper function
- ✅ Same filter conditions (cancelled transactions, commission value > 0, etc.)

**The payslip amounts should now match exactly between request and release phases.**

---

## Testing Recommendations

1. **Test Commission Matching:**
   - Create a payslip request and note the commission amount
   - Release the payslip and verify the commission matches exactly

2. **Test Attendance Matching:**
   - Request payslip with specific attendance records
   - Verify attendance count and base salary match between request and release

3. **Test Edge Cases:**
   - First payslip for an employee (no previous payslip)
   - Payslips near timezone boundaries
   - Units served at different times than completed

4. **Test Timezone Boundaries:**
   - Requests/releases near midnight PHT
   - Requests/releases spanning day boundaries

---

## Next Steps

1. ✅ Test the fixes with real data
2. ⏳ Review other server actions for similar discrepancies
3. ⏳ Add integration tests to prevent regressions
4. ⏳ Document the commission calculation logic

