import { defineConfig } from "prisma/config";

// Configures the Prisma CLI. The app connects in server/src/database/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations use the direct connection, not the pooled DATABASE_URL.
    // Read without env() so that commands needing no database, like
    // `prisma generate`, still run when it's unset.
    url: process.env.DIRECT_URL!,
  },
});
