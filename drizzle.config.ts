import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/schema-finance.ts", "./src/db/schema-community.ts", "./src/db/schema-content.ts", "./src/db/schema-league.ts", "./src/db/schema-matchmaking.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
