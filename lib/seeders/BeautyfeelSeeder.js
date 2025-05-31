// prisma/seed.ts

import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting database reset and seeding process...");

  // 1. Clear data from dependent tables first, respecting foreign key constraints.
  // We will NOT delete EmailTemplates.
  // The order of deletion is crucial here.

  console.log("Deleting existing RecommendedAppointments...");
  await prisma.recommendedAppointment.deleteMany({});

  console.log("Deleting existing AvailedServices...");
  await prisma.availedService.deleteMany({});

  console.log("Deleting existing PayslipRequests...");
  await prisma.payslipRequest.deleteMany({});

  console.log("Deleting existing Attendances...");
  await prisma.attendance.deleteMany({});

  console.log("Deleting existing ManualSales...");
  await prisma.manualSale.deleteMany({});

  console.log("Deleting existing Expenses...");
  await prisma.expense.deleteMany({});

  // Tables that were referenced by the above set, or are higher in the dependency chain
  console.log("Deleting existing Transactions...");
  await prisma.transaction.deleteMany({});

  console.log("Deleting existing Payslips...");
  await prisma.payslip.deleteMany({});

  console.log("Deleting existing GiftCertificates...");
  await prisma.giftCertificate.deleteMany({});

  console.log("Deleting existing Vouchers...");
  await prisma.voucher.deleteMany({});

  console.log("Deleting existing Customers...");
  await prisma.customer.deleteMany({});

  console.log("Deleting existing DiscountRules...");
  // This also clears the implicit join table records with Service
  await prisma.discountRule.deleteMany({});

  console.log("Deleting existing ServiceSets...");
  // This also clears the implicit join table records with Service
  // and handles relations from AvailedService & GiftCertificate (already deleted)
  await prisma.serviceSet.deleteMany({});

  // 2. Clear data for tables that will be re-seeded
  // This order (Account, Service, then Branch) is okay because
  // Account and Service might reference Branch.
  console.log("Deleting existing Accounts (before re-seeding)...");
  await prisma.account.deleteMany({});

  console.log("Deleting existing Services (before re-seeding)...");
  await prisma.service.deleteMany({});

  console.log("Deleting existing Branches (before re-seeding)...");
  await prisma.branch.deleteMany({});

  console.log("Skipping deletion of EmailTemplates (data preserved).");

  // --- Seed Account ---
  console.log("Re-seeding account...");
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash("ellainepe123", saltRounds);

  const ellaineAccount = await prisma.account.create({
    data: {
      username: "ellaine",
      password: hashedPassword,
      name: "Ellaine",
      email: "canoydaniel06@gmail.com",
      role: [Role.OWNER],
      // Defaults from schema will apply for salary, dailyRate, etc.
    },
  });
  console.log(
    `Created account: ${ellaineAccount.username} (ID: ${ellaineAccount.id})`,
  );

  // --- Seed Branches ---
  console.log("Re-seeding branches...");
  const nailCareBranch = await prisma.branch.create({
    data: {
      title: "Nail Care",
      code: "NC001",
    },
  });
  console.log(
    `Created branch: ${nailCareBranch.title} (ID: ${nailCareBranch.id})`,
  );

  const skinCareBranch = await prisma.branch.create({
    data: {
      title: "Skin Care Treatment",
      code: "SCT01",
    },
  });
  console.log(
    `Created branch: ${skinCareBranch.title} (ID: ${skinCareBranch.id})`,
  );

  const massageTherapyBranch = await prisma.branch.create({
    data: {
      title: "Massage Therapy",
      code: "MT001",
    },
  });
  console.log(
    `Created branch: ${massageTherapyBranch.title} (ID: ${massageTherapyBranch.id})`,
  );

  // --- Seed Services for Nail Care ---
  console.log(`Re-seeding services for ${nailCareBranch.title}...`);
  const nailCareServices = [
    { title: "Manicure gel", price: 280, branchId: nailCareBranch.id },
    { title: "Pedicure gel", price: 300, branchId: nailCareBranch.id },
    { title: "Foot spa", price: 250, branchId: nailCareBranch.id },
    {
      title: "Foot spa with regular gel",
      price: 430,
      branchId: nailCareBranch.id,
    },
    {
      title: "Soft gel nail extensions",
      price: 699,
      branchId: nailCareBranch.id,
    },
    { title: "Regular manicure", price: 150, branchId: nailCareBranch.id },
  ];
  await prisma.service.createMany({
    data: nailCareServices,
  });
  console.log(
    `Seeded ${nailCareServices.length} services for ${nailCareBranch.title}.`,
  );

  // --- Seed Services for Skin Care Treatment ---
  console.log(`Re-seeding services for ${skinCareBranch.title}...`);
  const skinCareServices = [
    { title: "Deep cleaning facial", price: 800, branchId: skinCareBranch.id },
    { title: "Lightening facial", price: 1200, branchId: skinCareBranch.id },
    { title: "Hydradermia facial", price: 1500, branchId: skinCareBranch.id },
    {
      title: "Wart treatment",
      price: 800,
      description: "Minimum price",
      branchId: skinCareBranch.id,
    },
    { title: "Acne facial", price: 999, branchId: skinCareBranch.id },
    {
      title: "BB glow with cheek blush",
      price: 2300,
      branchId: skinCareBranch.id,
    },
    { title: "Carbon laser deluxe", price: 1900, branchId: skinCareBranch.id },
    { title: "CO2 fractional laser", price: 5000, branchId: skinCareBranch.id },
    { title: "Microneedling", price: 3500, branchId: skinCareBranch.id },
    {
      title: "IPL",
      price: 500,
      description: "Hair growth treatment",
      branchId: skinCareBranch.id,
    },
    {
      title: "Exilift",
      price: 899,
      description: "Price starts at",
      branchId: skinCareBranch.id,
    },
    {
      title: "Glutathione drip and push",
      price: 800,
      description: "Price starts at",
      branchId: skinCareBranch.id,
    },
  ];
  await prisma.service.createMany({
    data: skinCareServices,
  });
  console.log(
    `Seeded ${skinCareServices.length} services for ${skinCareBranch.title}.`,
  );

  // --- Seed Services for Massage Therapy ---
  console.log(`Re-seeding services for ${massageTherapyBranch.title}...`);
  const massageTherapyServices = [
    {
      title: "60mins Swedish massage",
      price: 500,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "60mins Combination massage",
      price: 600,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "60mins Thai massage",
      price: 700,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "60mins Siatsu massage", // Typo? "Shiatsu"? Keeping as is from original
      price: 700,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "90 mins Traditional massage",
      price: 800,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "90 mins Hot stone massage",
      price: 999,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "90mins Ventossa massage",
      price: 999,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "Prenatal massage",
      price: 500,
      description: "DOH lic. Therapist only",
      branchId: massageTherapyBranch.id,
    },
    {
      title: "Pediatric massage",
      price: 500,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "30mins back massage",
      price: 300,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "45mins back and head massage",
      price: 400,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "30mins Foot reflex and leg massage",
      price: 300,
      branchId: massageTherapyBranch.id,
    },
    {
      title: "45mins Foot reflex and leg massage",
      price: 400,
      branchId: massageTherapyBranch.id,
    },
  ];
  await prisma.service.createMany({
    data: massageTherapyServices,
  });
  console.log(
    `Seeded ${massageTherapyServices.length} services for ${massageTherapyBranch.title}.`,
  );

  console.log("Database reset and seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during database reset and seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    console.log("Disconnecting Prisma Client...");
    await prisma.$disconnect();
  });
