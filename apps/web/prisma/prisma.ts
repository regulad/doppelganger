import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../server/src/generated/prisma/client";

// ⚠️ DO NOT IMPORT THIS FROM RUNTIME CODE ⚠️
// ⚠️       THIS IS ONLY FOR SEEDING       ⚠️
// ⚠️        SEE server/prisma.ts          ⚠️
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

export default prisma;
