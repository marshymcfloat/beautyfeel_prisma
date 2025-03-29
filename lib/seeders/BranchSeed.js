import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function branchSeed() {
  await prisma.branch.createMany({
    data: [
      { title: "Lashes", code: "BF00L" },
      { title: "Nails", code: "BF0MP" },
      { title: "Skin Improvement", code: "BF0SI" },
      { title: "Massage & Spa", code: "BF0MS" },
    ],
  });
  console.log("✅ Seeding completed!");
}

branchSeed()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
