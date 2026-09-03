import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

const root = resolve(__dirname, "../..");
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(resolve(root, file));
  } catch {
    // Arquivo opcional: .env.local pode nao existir.
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run drizzle-kit");
}

export default defineConfig({
  schema: "./src/database/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
