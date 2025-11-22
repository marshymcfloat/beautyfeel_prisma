/**
 * PAYSLIP VALIDATION TEST UTILITY
 * 
 * This script can be run to validate payslip amounts and verify
 * that request and release phases calculate the same amounts.
 * 
 * Usage:
 *   npx tsx scripts/testPayslipValidation.ts [requestId]
 * 
 * If no requestId is provided, it will validate all released payslips.
 */

import { validatePayslipAmounts, validateAllReleasedPayslips } from "../lib/payslipValidationHelpers";

async function main() {
  const requestId = process.argv[2];

  console.log("=".repeat(60));
  console.log("PAYSLIP VALIDATION TEST");
  console.log("=".repeat(60));
  console.log();

  if (requestId) {
    // Validate specific payslip request
    console.log(`Validating payslip request: ${requestId}`);
    console.log("-".repeat(60));
    
    const result = await validatePayslipAmounts(requestId);
    
    if (result.isValid) {
      console.log("✅ VALIDATION PASSED");
      console.log();
      if (result.requestBreakdown && result.releaseBreakdown) {
        console.log("Request Breakdown:");
        console.log(`  Base Salary: ₱${result.requestBreakdown.baseSalary.toLocaleString()}`);
        console.log(`  Commissions: ₱${result.requestBreakdown.totalCommissions.toLocaleString()}`);
        console.log(`  Net Pay: ₱${result.requestBreakdown.netPay.toLocaleString()}`);
        console.log(`  Attendance Days: ${result.requestBreakdown.attendanceCount}`);
        console.log(`  Commission Units: ${result.requestBreakdown.commissionUnitCount}`);
        console.log();
        console.log("Release Breakdown:");
        console.log(`  Base Salary: ₱${result.releaseBreakdown.baseSalary.toLocaleString()}`);
        console.log(`  Commissions: ₱${result.releaseBreakdown.totalCommissions.toLocaleString()}`);
        console.log(`  Net Pay: ₱${result.releaseBreakdown.netPay.toLocaleString()}`);
      }
    } else {
      console.log("❌ VALIDATION FAILED");
      console.log();
      if (result.discrepancies.length > 0) {
        console.log("Discrepancies found:");
        result.discrepancies.forEach((d) => {
          console.log(`  ${d.field}:`);
          console.log(`    Request: ₱${d.requestValue.toLocaleString()}`);
          console.log(`    Release: ₱${d.releaseValue.toLocaleString()}`);
          console.log(`    Difference: ₱${d.difference.toLocaleString()}`);
          if (d.percentageDiff) {
            console.log(`    Percentage Diff: ${d.percentageDiff.toFixed(2)}%`);
          }
          console.log();
        });
      }
      if (result.errors.length > 0) {
        console.log("Errors:");
        result.errors.forEach((e) => console.log(`  - ${e}`));
        console.log();
      }
    }
    
    if (result.warnings.length > 0) {
      console.log("Warnings:");
      result.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
      console.log();
    }
  } else {
    // Validate all released payslips
    console.log("Validating all released payslips...");
    console.log("-".repeat(60));
    console.log();
    
    const results = await validateAllReleasedPayslips(100);
    
    const validCount = results.filter((r) => r.isValid).length;
    const invalidCount = results.filter((r) => !r.isValid).length;
    const warningCount = results.filter((r) => r.warnings.length > 0).length;
    
    console.log("VALIDATION SUMMARY");
    console.log("=".repeat(60));
    console.log(`Total Payslips Validated: ${results.length}`);
    console.log(`✅ Valid: ${validCount}`);
    console.log(`❌ Invalid: ${invalidCount}`);
    console.log(`⚠️  Warnings: ${warningCount}`);
    console.log();
    
    if (invalidCount > 0) {
      console.log("INVALID PAYSLIPS:");
      console.log("-".repeat(60));
      results
        .filter((r) => !r.isValid)
        .forEach((r) => {
          console.log(`\nRequest ID: ${r.requestId}`);
          r.discrepancies.forEach((d) => {
            console.log(`  ${d.field}:`);
            console.log(`    Request: ₱${d.requestValue.toLocaleString()}`);
            console.log(`    Release: ₱${d.releaseValue.toLocaleString()}`);
            console.log(`    Difference: ₱${d.difference.toLocaleString()}`);
            if (d.percentageDiff) {
              console.log(`    Percentage Diff: ${d.percentageDiff.toFixed(2)}%`);
            }
          });
          if (r.errors.length > 0) {
            console.log("  Errors:");
            r.errors.forEach((e) => console.log(`    - ${e}`));
          }
        });
      console.log();
    }
    
    if (warningCount > 0) {
      console.log("PAYSLIPS WITH WARNINGS:");
      console.log("-".repeat(60));
      results
        .filter((r) => r.warnings.length > 0)
        .forEach((r) => {
          console.log(`\nRequest ID: ${r.requestId}`);
          r.warnings.forEach((w) => console.log(`  ⚠️  ${w}`));
        });
      console.log();
    }
  }

  console.log("=".repeat(60));
  console.log("VALIDATION COMPLETE");
  console.log("=".repeat(60));
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error running validation:", error);
    process.exit(1);
  });

