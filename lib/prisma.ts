import { PrismaClient } from "@prisma/client";
import { withAccelerate } from "@prisma/extension-accelerate";

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  // Add the transactionOptions object here
  return new PrismaClient({
    // Configure interactive transaction timeout
    transactionOptions: {
      timeout: 10000,
    },
    // Optional: Add logging if you want more visibility
    // log: ['query', 'info', 'warn', 'error'],
  }).$extends(withAccelerate());
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
