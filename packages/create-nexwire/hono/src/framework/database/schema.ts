import { detectDialect } from "@/framework/database/connection.js";

/**
 * Why: Picks dialect-specific model exports from composite schema modules.
 * When: Building generated schema for active DB dialect.
 * Where: Maker/database schema generation pipeline.
 * How: Filters objects containing sqlite/mysql/postgresql keys and selects current dialect.
 */
export function normalizeSchemaExports(source: Record<string, any>) {
  const dialect = detectDialect();
  const out: Record<string, any> = {};

  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === "object" && "sqlite" in value && "mysql" in value && "postgresql" in value) {
      out[key] = value[dialect];
    }
  }

  return out;
}
