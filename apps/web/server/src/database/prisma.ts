import { PrismaClient } from "%/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaExtensionRedis } from "prisma-extension-redis";
import { getRedis } from "./redis.ts";

interface CustomNodeJsGlobal {
  __prisma: PrismaClient;
}

declare const global: CustomNodeJsGlobal;

function createPrisma(): PrismaClient {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      // as Prisma 5 did; pg on its own waits forever for a connection
      connectionTimeoutMillis: 5_000,
    }),
  });

  if (process.env.NODE_ENV !== "production") {
    return prisma;
  }

  // to save on reads, query results are cached in Redis for a minute, and a
  // write to a model clears that model's cached results
  // https://www.npmjs.com/package/prisma-extension-redis
  const cachedPrisma = prisma.$extends(
    PrismaExtensionRedis({
      // always there in production
      client: getRedis()!,
      config: {
        type: "STRING",
        ttl: 60,
        stale: 0,
        auto: {
          excludedOperations: ["findMany"],
          invalidateOnWrite: true,
        },
      },
    }),
  );

  // the extension only adds optional arguments, and query results keep their
  // types, so callers can treat it as the plain client
  return cachedPrisma as unknown as PrismaClient;
}

export function getPrisma() {
  if (global.__prisma) {
    return global.__prisma;
  }

  global.__prisma = createPrisma();
  return global.__prisma;
}
