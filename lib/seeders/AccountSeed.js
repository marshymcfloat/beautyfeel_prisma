import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function accountSeed() {
  const hashedPassword = await bcrypt.hash("admin123", 10);

  await prisma.account.create({
    data: {
      username: "admin",
      password: hashedPassword,
      name: "daniel",
      email: "canoydaniel06@gmail.com",
    },
  });

  console.log("✅ Seeding completed!");
}

accountSeed()
  .catch((e) => console.error("❌ Error:", e))
  .finally(() => prisma.$disconnect());
