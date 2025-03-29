import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function voucherSeeder() {
  await prisma.voucher.createMany({
    data: [
      { code: "ABCDEF", value: 50 },
      { code: "A1B2C3", value: 25 },
      { code: "XYZ123", value: 100 },
    ],
  });

  console.log("done");
}

voucherSeeder()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
