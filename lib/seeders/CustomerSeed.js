import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const customer = [
  { name: "Daniel Canoy", email: "canoydaniel06@gmail.com" },
  { name: "Ellaine Pe", email: "ellanecanoype@gmail.com" },
];

async function customerSeeder() {
  await prisma.customer.createMany({ data: customer });

  console.log("Customer seed success");
}

customerSeeder()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
