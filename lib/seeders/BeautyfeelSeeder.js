// prisma/seed.ts (or your seeder file)

import { PrismaClient, Role } from "@prisma/client"; // Assuming Role enum might be needed
import bcrypt from "bcryptjs"; // Import bcryptjs

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seeding process...");

  // 1. Clear existing data
  // Important: If Account is linked to other tables that need clearing first, adjust order.
  // For now, we'll assume Account can be cleared before Service/Branch,
  // or that dependencies are handled by Prisma's onDelete cascades if set up.
  // If you get FK errors, you might need to delete related records first (e.g., from Attendances, Payslips if they exist and are linked)
  console.log("Deleting existing accounts...");
  await prisma.account.deleteMany({}); // Add this if you want to clear accounts on re-seed

  console.log("Deleting existing services...");
  await prisma.service.deleteMany({});

  console.log("Deleting existing branches...");
  await prisma.branch.deleteMany({});

  // --- Seed Account ---
  console.log("Seeding account...");
  const saltRounds = 10; // Standard number of salt rounds for bcrypt
  const hashedPassword = await bcrypt.hash("ellainepe123", saltRounds);

  const ellaineAccount = await prisma.account.create({
    data: {
      username: "ellaine",
      password: hashedPassword,
      name: "Ellaine",
      email: "canoydaniel06@gmail.com",
      role: [Role.OWNER], // Example: Set default role to OWNER. Adjust as needed (e.g., WORKER, CASHIER)
      // salary: 0, // Default is 0 as per your schema
      // dailyRate: 350, // Default is 350
      // branchId: null, // Or assign to a specific branch if needed.
      // mustChangePassword: false, // Default is false
    },
  });
  console.log(
    `Created account: ${ellaineAccount.username} (ID: ${ellaineAccount.id})`,
  );

  // --- Seed Branches (as before) ---
  console.log("Seeding branches...");
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

  // --- Seed Services for Nail Care (as before) ---
  console.log(`Seeding services for ${nailCareBranch.title}...`);
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

  // --- Seed Services for Skin Care Treatment (as before) ---
  console.log(`Seeding services for ${skinCareBranch.title}...`);
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

  // --- Seed Services for Massage Therapy (as before) ---
  console.log(`Seeding services for ${massageTherapyBranch.title}...`);
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
      title: "60mins Siatsu massage",
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

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error("Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    console.log("Disconnecting Prisma Client...");
    await prisma.$disconnect();
  });
