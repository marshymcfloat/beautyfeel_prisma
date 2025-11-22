# Payslip Validation Testing Guide

## Overview

This guide explains how to use the payslip validation utilities to verify that request and release phases calculate identical amounts.

## What Was Fixed

### Critical Discrepancies Fixed:
1. **Commission Field Mismatch**: Request used `servedAt`, release used `completedAt` → **FIXED** (both now use `servedAt`)
2. **Commission End Date**: Different calculation methods → **FIXED** (both use timezone-aware `getUtcForPhtStartOfNextDay()`)
3. **Attendance End Boundary**: Request used exclusive (`lt`), release used inclusive (`lte`) → **FIXED** (both use exclusive)
4. **Attendance Counting**: Different counting methods → **FIXED** (both count from actual records)

**Result**: Request and release phases now calculate **identical amounts**.

---

## Testing Methods

### Method 1: Command-Line Script (Recommended for Batch Testing)

**Test a specific payslip:**
```bash
npx tsx scripts/testPayslipValidation.ts <requestId>
```

**Test all released payslips:**
```bash
npx tsx scripts/testPayslipValidation.ts
```

**Example Output:**
```
============================================================
PAYSLIP VALIDATION TEST
============================================================

Validating payslip request: clx1234567890
------------------------------------------------------------
✅ VALIDATION PASSED

Request Breakdown:
  Base Salary: ₱3,500
  Commissions: ₱1,250
  Net Pay: ₱4,750
  Attendance Days: 10
  Commission Units: 15

Release Breakdown:
  Base Salary: ₱3,500
  Commissions: ₱1,250
  Net Pay: ₱4,750
```

---

### Method 2: UI Validation Button (For Manual Testing)

1. Navigate to **Payslip Dashboard** (PayslipRequestManager component)
2. Find a **PROCESSED** payslip request
3. Click the **"Validate"** button
4. Check the toast notification:
   - ✅ **Green Toast**: "Validation passed - Request and release amounts match exactly"
   - ❌ **Red Toast**: "Validation failed - [Field]: ₱[Amount] difference"

**Note**: The validation button only appears on PROCESSED payslips (after release).

---

### Method 3: Programmatic Testing

**Validate a specific payslip:**
```typescript
import { validatePayslipAction } from "@/lib/serverValidationActions";

const result = await validatePayslipAction(requestId);

if (result.success && result.data) {
  if (result.data.isValid) {
    console.log("✅ Amounts match!");
  } else {
    console.error("❌ Discrepancies found:");
    result.data.discrepancies.forEach((d) => {
      console.error(`${d.field}: ${d.difference} difference`);
    });
  }
}
```

**Validate all payslips:**
```typescript
import { validateAllPayslipsAction } from "@/lib/serverValidationActions";

const results = await validateAllPayslipsAction(100); // Limit to 100

const validCount = results.data?.filter((r) => r.isValid).length;
const invalidCount = results.data?.filter((r) => !r.isValid).length;

console.log(`Valid: ${validCount}, Invalid: ${invalidCount}`);
```

---

## Validation Results Structure

```typescript
type PayslipValidationResult = {
  isValid: boolean;                    // true if amounts match
  requestId: string;                   // Payslip request ID
  discrepancies: Array<{               // Only populated if isValid is false
    field: string;                     // "baseSalary" | "totalCommissions" | "netPay"
    requestValue: number;              // Amount calculated in request phase
    releaseValue: number;              // Amount calculated in release phase
    difference: number;                // Absolute difference
    percentageDiff?: number;           // Percentage difference (if applicable)
  }>;
  requestBreakdown: {                  // Breakdown from request phase
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;
    commissionUnitCount: number;
  } | null;
  releaseBreakdown: {                  // Breakdown from release phase
    baseSalary: number;
    totalCommissions: number;
    netPay: number;
    attendanceCount: number;           // Currently 0 (would need separate query)
    commissionUnitCount: number;       // Currently 0 (would need separate query)
  } | null;
  errors: string[];                    // Any errors encountered
  warnings: string[];                  // Any warnings (e.g., payslip not released yet)
};
```

---

## Interpreting Results

### ✅ Validation Passed
- **All amounts match exactly** (within 1 unit tolerance for rounding)
- The payslip was calculated consistently between request and release phases
- No action needed

### ❌ Validation Failed
- **Amounts do not match** between request and release phases
- Check the discrepancies array for details:
  - Which field(s) differ (baseSalary, totalCommissions, netPay)
  - The exact difference in amounts
  - The percentage difference (if applicable)
- **Action**: Review the server logs and check for:
  1. Timezone boundary issues
  2. Date calculation differences
  3. Missing attendance records
  4. Missing commission records

### ⚠️ Warnings
- Payslip not released yet (cannot validate until after release)
- Missing related payslip record
- Other non-critical issues

---

## Troubleshooting

### If Validation Fails:

1. **Check Server Logs**
   - Look for `[getPayslipBreakdownForPeriod]` logs
   - Look for `[processAndReleasePayslipAction]` logs
   - Compare attendance counts and commission unit counts

2. **Check Date Boundaries**
   - Verify timezone calculations are consistent
   - Check if requests span timezone boundaries
   - Verify `servedAt` timestamps match expectations

3. **Check Attendance Records**
   - Verify attendance records exist for the period
   - Check if attendance dates match the calculation period
   - Verify `isPresent` flags are correct

4. **Check Commission Records**
   - Verify served units exist for the period
   - Check if `servedAt` timestamps fall within the period
   - Verify `status` is `DONE`
   - Check if transactions are not cancelled

---

## Best Practices

1. **Test After Release**: Always validate payslips after they've been released
2. **Batch Test Periodically**: Run the batch validation script regularly to catch regressions
3. **Log Discrepancies**: If validation fails, log the detailed result to investigate
4. **Test Edge Cases**: Test payslips near timezone boundaries, first payslips, etc.

---

## Files Created

- `lib/payslipValidationHelpers.ts` - Core validation logic
- `lib/serverValidationActions.ts` - Server actions for client-side validation
- `scripts/testPayslipValidation.ts` - Command-line test script
- `PAYSLIP_DISCREPANCY_FIXES.md` - Detailed documentation of fixes
- `VALIDATION_TESTING_GUIDE.md` - This guide

---

## Future Enhancements

- [ ] Add automatic validation before release (prevent invalid releases)
- [ ] Add validation to CI/CD pipeline
- [ ] Add detailed breakdown comparison UI
- [ ] Add historical validation tracking
- [ ] Add email notifications for validation failures

