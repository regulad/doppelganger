import { PrismaClient } from "@prisma/client";

interface CustomNodeJsGlobal {
  __prisma: PrismaClient;
}

declare const global: CustomNodeJsGlobal;

function createPrisma() {
  return new PrismaClient();
}

export function getPrisma() {
  if (global.__prisma) {
    return global.__prisma;
  }

  global.__prisma = createPrisma();
  return global.__prisma;
}
