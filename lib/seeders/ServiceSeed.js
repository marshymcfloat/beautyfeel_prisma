/* import { PrismaClient } from "@prisma/client";

const services = [
  // ✅ Skin Improvement Services
  {
    title: "Acne Treatment",
    description: "Reduces acne and prevents breakouts",
    price: 1500,
    branchId: "0731d46d-58bd-483c-b47c-c70c9ee6d7e6",
  },
  {
    title: "Facial Rejuvenation",
    description: "Rejuvenates and hydrates the skin",
    price: 2000,
    branchId: "0731d46d-58bd-483c-b47c-c70c9ee6d7e6",
  },
  {
    title: "Skin Whitening",
    description: "Lightens skin tone and removes dark spots",
    price: 1800,
    branchId: "0731d46d-58bd-483c-b47c-c70c9ee6d7e6",
  },
  {
    title: "Microdermabrasion",
    description: "Exfoliates dead skin cells",
    price: 2200,
    branchId: "0731d46d-58bd-483c-b47c-c70c9ee6d7e6",
  },
  {
    title: "Chemical Peel",
    description: "Removes damaged outer skin layers",
    price: 2500,
    branchId: "0731d46d-58bd-483c-b47c-c70c9ee6d7e6",
  },

  // ✅ Massage and Spa Services
  {
    title: "Swedish Massage",
    description: "Relaxing full-body massage",
    price: 1200,
    branchId: "6ebe05ad-5b79-414a-bf1e-b30114af7be4",
  },
  {
    title: "Deep Tissue Massage",
    description: "Targets deeper muscle layers",
    price: 1500,
    branchId: "6ebe05ad-5b79-414a-bf1e-b30114af7be4",
  },
  {
    title: "Hot Stone Massage",
    description: "Relieves tension using heated stones",
    price: 1700,
    branchId: "6ebe05ad-5b79-414a-bf1e-b30114af7be4",
  },
  {
    title: "Aromatherapy Massage",
    description: "Essential oils for relaxation",
    price: 1400,
    branchId: "6ebe05ad-5b79-414a-bf1e-b30114af7be4",
  },
  {
    title: "Foot Reflexology",
    description: "Pressure point foot massage",
    price: 1100,
    branchId: "6ebe05ad-5b79-414a-bf1e-b30114af7be4",
  },

  // ✅ Nail Services
  {
    title: "Manicure",
    description: "Basic nail care and polish",
    price: 500,
    branchId: "84baef14-2371-4c26-845b-278dda9c49d5",
  },
  {
    title: "Pedicure",
    description: "Foot care and polish",
    price: 700,
    branchId: "84baef14-2371-4c26-845b-278dda9c49d5",
  },
  {
    title: "Gel Polish",
    description: "Long-lasting gel nail polish",
    price: 900,
    branchId: "84baef14-2371-4c26-845b-278dda9c49d5",
  },
  {
    title: "Acrylic Nails",
    description: "Artificial nail extensions",
    price: 1500,
    branchId: "84baef14-2371-4c26-845b-278dda9c49d5",
  },
  {
    title: "Nail Art",
    description: "Custom designs on nails",
    price: 1200,
    branchId: "84baef14-2371-4c26-845b-278dda9c49d5",
  },

  // ✅ Lashes Services
  {
    title: "Classic Eyelash Extensions",
    description: "Natural-looking lash extensions",
    price: 2500,
    branchId: "68a06821-83e3-4db0-afa1-a0415d33f837",
  },
  {
    title: "Volume Eyelash Extensions",
    description: "Fuller, dramatic lash effect",
    price: 3000,
    branchId: "68a06821-83e3-4db0-afa1-a0415d33f837",
  },
  {
    title: "Lash Lift",
    description: "Lifts and curls natural lashes",
    price: 1800,
    branchId: "68a06821-83e3-4db0-afa1-a0415d33f837",
  },
  {
    title: "Lash Tinting",
    description: "Darkens natural lashes",
    price: 1000,
    branchId: "68a06821-83e3-4db0-afa1-a0415d33f837",
  },
  {
    title: "Eyelash Removal",
    description: "Safely removes lash extensions",
    price: 800,
    branchId: "68a06821-83e3-4db0-afa1-a0415d33f837",
  },
];

const prisma = new PrismaClient();

async function serviceSeed() {
  await prisma.service.createMany({
    data: services,
  });

  console.log("✅ Seeding completed!");
}

serviceSeed()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// --- 1. Define Branch Data ---
// Explicit IDs for predictable linking
const branchesData = [
  {
    id: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a", // Nails Branch ID
    title: "Nails",
    code: "NAILS1", // Unique 6-char code
  },
  {
    id: "a1b2c3d4-e5f6-7890-1234-567890abcdef", // Lashes Branch ID
    title: "Lashes",
    code: "LASHES",
  },
  {
    id: "b2c3d4e5-f6a7-8901-2345-67890abcdef01", // Skin Improvement Branch ID
    title: "Skin Improvement",
    code: "SKIN01",
  },
  {
    id: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123", // Massage & Spa Branch ID
    title: "Massage & Spa",
    code: "SPA001",
  },
];

// --- 2. Define Service Data (5 per branch) ---
// Make sure service titles are globally unique as per your schema
const servicesData = [
  // --- Nails Services (Branch ID: f4d9a3f1-...) ---
  {
    title: "Classic Manicure",
    description: "Shape, cuticle care, buff, and regular polish.",
    price: 600,
    branchId: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a",
  },
  {
    title: "Gel Pedicure",
    description: "Foot soak, scrub, shape, cuticle care, and gel polish.",
    price: 1200,
    branchId: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a",
  },
  {
    title: "Acrylic Full Set",
    description: "Artificial nail extensions using acrylic.",
    price: 1800,
    branchId: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a",
  },
  {
    title: "Nail Art (Per Nail)",
    description: "Custom design on a single nail.",
    price: 150,
    branchId: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a",
  },
  {
    title: "Paraffin Wax Dip (Hands)",
    description: "Deep moisturizing treatment for hands.",
    price: 500,
    branchId: "f4d9a3f1-3a3b-4e5c-8a9d-0b1c2d3e4f5a",
  },

  // --- Lashes Services (Branch ID: a1b2c3d4-...) ---
  {
    title: "Classic Eyelash Extension Full Set",
    description: "One extension applied to each natural lash.",
    price: 2800,
    branchId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  },
  {
    title: "Volume Eyelash Extension Full Set",
    description:
      "Multiple lightweight extensions applied to each natural lash.",
    price: 3500,
    branchId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  },
  {
    title: "Hybrid Lash Extension Full Set",
    description: "A mix of classic and volume extensions.",
    price: 3200,
    branchId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  },
  {
    title: "Lash Lift and Tint",
    description: "Curls and darkens your natural lashes.",
    price: 2000,
    branchId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  },
  {
    title: "Eyelash Extension Removal",
    description: "Safe removal of existing lash extensions.",
    price: 800,
    branchId: "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  },

  // --- Skin Improvement Services (Branch ID: b2c3d4e5-...) ---
  {
    title: "Signature Deep Cleansing Facial",
    description: "Thorough cleansing, exfoliation, extraction, and mask.",
    price: 2200,
    branchId: "b2c3d4e5-f6a7-8901-2345-67890abcdef01",
  },
  {
    title: "Microdermabrasion Session",
    description: "Mechanical exfoliation to improve skin texture.",
    price: 2500,
    branchId: "b2c3d4e5-f6a7-8901-2345-67890abcdef01",
  },
  {
    title: "Glycolic Acid Peel (Light)",
    description: "Chemical peel using glycolic acid for mild exfoliation.",
    price: 2800,
    branchId: "b2c3d4e5-f6a7-8901-2345-67890abcdef01",
  },
  {
    title: "Anti-Aging Collagen Facial",
    description: "Facial focused on boosting collagen and reducing fine lines.",
    price: 3000,
    branchId: "b2c3d4e5-f6a7-8901-2345-67890abcdef01",
  },
  {
    title: "Acne Control Treatment",
    description: "Targeted treatment to reduce inflammation and breakouts.",
    price: 2400,
    branchId: "b2c3d4e5-f6a7-8901-2345-67890abcdef01",
  },

  // --- Massage & Spa Services (Branch ID: c3d4e5f6-...) ---
  {
    title: "Swedish Relaxation Massage (60 min)",
    description: "Classic massage technique for relaxation and stress relief.",
    price: 1500,
    branchId: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123",
  },
  {
    title: "Deep Tissue Massage (60 min)",
    description: "Targets deeper layers of muscle and connective tissue.",
    price: 1800,
    branchId: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123",
  },
  {
    title: "Hot Stone Massage (75 min)",
    description: "Uses heated stones to soothe muscles and enhance relaxation.",
    price: 2100,
    branchId: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123",
  },
  {
    title: "Invigorating Body Scrub",
    description: "Full body exfoliation using salt or sugar scrub.",
    price: 1600,
    branchId: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123",
  },
  {
    title: "Foot Reflexology (30 min)",
    description: "Pressure point massage on the feet to promote well-being.",
    price: 900,
    branchId: "c3d4e5f6-a7b8-9012-3456-7890abcdef0123",
  },
];

// --- Main Seeding Function ---
async function main() {
  console.log("🌱 Starting seeding process...");

  // --- Seed Branches ---
  console.log(`Seeding ${branchesData.length} branches...`);
  // Using createMany with explicit IDs and skipDuplicates
  // NOTE: If a branch with the SAME ID but DIFFERENT unique fields (title, code) exists,
  // this will still throw an error. Ensure your DB is clean or IDs are truly unique.
  // For a truly idempotent seed based on title/code, you'd use upsert in a loop.
  await prisma.branch.createMany({
    data: branchesData,
    skipDuplicates: true, // Skips if a branch with the same ID already exists
  });
  console.log("Branches seeded successfully (or skipped if existing).");

  // --- Seed Services ---
  console.log(`Seeding ${servicesData.length} services...`);
  await prisma.service.createMany({
    data: servicesData,
    skipDuplicates: true, // Skips if a service with the same unique title exists
  });
  console.log("Services seeded successfully (or skipped if existing).");

  console.log("✅ Seeding completed!");
}

// --- Execute Seeding ---
main()
  .catch((e) => {
    console.error("❌ Error during seeding:");
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    console.log("Disconnecting Prisma Client...");
    await prisma.$disconnect();
  });
