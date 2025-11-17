import {
  PrismaClient,
  Role,
  Status,
  PayslipRequestStatus,
  RecommendedAppointmentStatus,
  DiscountType,
  FollowUpPolicy,
  PayslipStatus,
  PaymentMethod,
  ExpenseCategory,
} from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const saltRounds = 10; // Ensure this matches your bcrypt salt rounds

async function main() {
  console.log("Starting seed script...");

  // --- Step 1: Clean up data (delete models as requested) ---
  // IMPORTANT: Delete in order based on dependencies (from leaves inwards)
  // Models to REMOVE data from:
  // PayslipRequest, Payslip, RecommendedAppointment, Attendance, Account (only default), AvailedServiceUnit, AvailedService, Voucher, Transaction, Customer, GiftCertificate, ManualSale, Expense, DiscountRule

  // Models to KEEP data for:
  // Branch, Service, EmailTemplate, ServiceSet

  console.log("Deleting AvailedServiceUnit data...");
  await prisma.availedServiceUnit.deleteMany();
  console.log("AvailedServiceUnit data deleted.");

  console.log("Deleting RecommendedAppointment data...");
  await prisma.recommendedAppointment.deleteMany();
  console.log("RecommendedAppointment data deleted.");

  console.log("Deleting GiftCertificate data...");
  await prisma.giftCertificate.deleteMany();
  console.log("GiftCertificate data deleted.");

  console.log("Deleting AvailedService data...");
  await prisma.availedService.deleteMany();
  console.log("AvailedService data deleted.");

  console.log("Deleting Voucher data...");
  await prisma.voucher.deleteMany();
  console.log("Voucher data deleted.");

  console.log("Deleting Transaction data...");
  await prisma.transaction.deleteMany();
  console.log("Transaction data deleted.");

  console.log("Deleting PayslipRequest data...");
  await prisma.payslipRequest.deleteMany();
  console.log("PayslipRequest data deleted.");

  console.log("Deleting Payslip data...");
  await prisma.payslip.deleteMany();
  console.log("Payslip data deleted.");

  console.log("Deleting Attendance data...");
  await prisma.attendance.deleteMany();
  console.log("Attendance data deleted.");

  console.log("Deleting ManualSale data...");
  await prisma.manualSale.deleteMany();
  console.log("ManualSale data deleted.");

  console.log("Deleting Expense data...");
  await prisma.expense.deleteMany();
  console.log("Expense data deleted.");

  console.log("Deleting DiscountRule data...");
  await prisma.discountRule.deleteMany();
  console.log("DiscountRule data deleted.");

  // Now delete Customer and Account, as their dependencies should be gone or pointing to protected models.
  // Keep Branch and EmailTemplate untouched.
  // Keep Service and ServiceSet untouched.

  // Note: Deleting Account data might delete associated records if using CASCADE.
  // However, based on the provided schema:
  // - PayslipRequest -> Cascade
  // - Payslip -> No Cascade (likely needs Payslip deleted first)
  // - Attendance -> Cascade (Employee), Cascade (Checker)
  // - ManualSale -> Cascade (RecordedByAccount)
  // - Expense -> Cascade (RecordedByAccount)
  // This script deletes dependents *before* Accounts/Customers where applicable, so this should be safe.
  console.log("Deleting Customer data...");
  await prisma.customer.deleteMany();
  console.log("Customer data deleted.");

  // Only delete Accounts if you are sure you want to clear *all* existing accounts
  // before adding the specific 'ellaine' account. If you intend to *only*
  // add the 'ellaine' account while possibly keeping others (which wasn't explicit in your prompt
  // but is a common use case), you might skip the deleteMany() or filter it.
  // Assuming you want a clean slate except for the specified models, clearing all Accounts is necessary.
  console.log("Deleting all Account data...");
  await prisma.account.deleteMany();
  console.log("All Account data deleted.");

  console.log("Finished cleaning up data.");

  // --- Step 2: Create the requested account ---
  console.log("Creating default OWNER account: ellaine...");
  const hashedPassword = await bcrypt.hash("ellainepe123", saltRounds);

  const ellaineAccount = await prisma.account.create({
    data: {
      username: "ellaine",
      password: hashedPassword,
      name: "Ellaine",
      email: "canoydaniel06@gmail.com",
      role: [Role.OWNER], // Make sure Role.OWNER is a valid enum value
      canRequestPayslip: true,
      // salary, dailyRate, branchId will use defaults or null based on schema
    },
  });
  console.log(`Created account with ID: ${ellaineAccount.id}`);

  console.log("Seed script finished successfully.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Add missing imports based on schema usage for type hints, although
// they aren't strictly necessary for the generated JS code but good for TS.
// Remove or add based on which models are actually instantiated or used
// in create/update operations later if you expand the seeder.
// Currently, only `Role` is directly used from `@prisma/client`.
