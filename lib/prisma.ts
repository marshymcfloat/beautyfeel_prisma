import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaClientSingleton = () => {
  // Optimized Prisma Client configuration for better performance
  // Removed Accelerate extension - it was causing connection failures (P5010 errors)
  // Direct connection is faster and more reliable for most applications
  const client = new PrismaClient({
    // Optimized transaction options
    transactionOptions: {
      maxWait: 5000, // 5 seconds max wait
      timeout: 10000, // 10 seconds timeout
    },
    // Optimized logging - only errors in production
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Connection pooling is handled automatically by Prisma
  // Direct connections are typically faster than Accelerate for most use cases
  
  return client;
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
