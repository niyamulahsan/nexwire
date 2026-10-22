import { discoverModuleFiles, importFile } from "@/framework/modules/discover.js";

/**
 * Why: Builds the Drizzle schema from the modules that actually exist.
 * When: The database connection is initialised.
 * Where: Framework database connection.
 * How: Discovers `src/modules/**\/database/models/*` and merges their exports.
 *      The generated barrel at `src/database/schema.ts` is only used by
 *      drizzle-kit, so deleting or replacing a module never leaves the
 *      framework importing a file that is no longer there.
 */
let cachedSchema: Record<string, unknown> | null = null;

export async function loadAppSchema(): Promise<Record<string, unknown>> {
  if (cachedSchema) return cachedSchema;

  const schema: Record<string, unknown> = {};
  const files = await discoverModuleFiles("**/database/models/*.{ts,js}");

  for (const file of files) {
    try {
      const models = await importFile(file);
      Object.assign(schema, models);
    } catch {
      // A model file that fails to load is skipped: the rest of the schema
      // still works, and the framework keeps booting.
    }
  }

  cachedSchema = schema;
  return schema;
}

/** Clears the cached schema. Mainly useful in tests. */
export function clearAppSchema(): void {
  cachedSchema = null;
}
