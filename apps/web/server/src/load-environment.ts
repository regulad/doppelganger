import { config } from "dotenv";
import { existsSync } from "node:fs";

export function loadEnvironment(): void {
  const envPath = "./.env.local";
  if (existsSync(envPath)) {
    console.log("loading environment variables from", envPath);
    config({
      path: envPath,
      // dotenv 17 and later announce each load; the line above does already
      quiet: true,
    });
  }
}
