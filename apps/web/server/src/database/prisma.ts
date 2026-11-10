import { PrismaClient } from "%/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

interface CustomNodeJsGlobal {
  __prisma: PrismaClient;
}

declare const global: CustomNodeJsGlobal;

function createPrisma() {
  return new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // as Prisma 5 did; pg on its own waits forever for a connection
      connectionTimeoutMillis: 5_000,
    }),
  });
}

export function getPrisma() {
  if (global.__prisma) {
    return global.__prisma;
  }

  global.__prisma = createPrisma();
  return global.__prisma;
}
