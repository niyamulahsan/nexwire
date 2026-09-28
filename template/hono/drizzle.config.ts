import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env" });

function sqlitePathFromUrl(url: string) {
  if (url.startsWith("sqlite:///")) return url.replace("sqlite:///", "");
  if (url.startsWith("sqlite://")) return url.replace("sqlite://", "");
  if (url.startsWith("sqlite:")) return url.replace("sqlite:", "");
  return url;
}

const databaseUrl = process.env.DATABASE_URL || "sqlite:./src/storage/database/nexwire.sqlite";
const dialect = databaseUrl.startsWith("mysql") ? "mysql" : databaseUrl.startsWith("postgres") ? "postgresql" : "sqlite";

export default defineConfig({
  schema: process.env.DRIZZLE_SCHEMA || "./src/database/schema.ts",
  out: `./src/database/migrations/${dialect}`,
  dialect,
  dbCredentials: databaseUrl.startsWith("mysql")
    ? { url: databaseUrl }
    : databaseUrl.startsWith("postgres")
      ? { url: databaseUrl }
      : { url: `file:${sqlitePathFromUrl(databaseUrl)}` }
});
