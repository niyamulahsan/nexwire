import fs from "node:fs/promises";
import path from "node:path";
import { databaseConfig } from "@/config/index.js";
import * as schema from "@/database/schema.js";

export type Dialect = "sqlite" | "mysql" | "postgresql";

let databaseInstance: any;
let pool: any;
let dialect: Dialect;

async function optionalImport<T = any>(name: string): Promise<T> {
  return import(name) as Promise<T>;
}

/**
 * Why: Resolves the active DB driver from DATABASE_URL.
 * When: Called during bootstrap and dialect-specific branching.
 * Where: Used by init/close and schema generation helpers.
 * How: Checks DATABASE_URL prefix and maps to sqlite/mysql/postgresql.
 */
export function detectDialect(): Dialect {
  const url = databaseConfig.url.toLowerCase();
  if (url.startsWith("mysql")) return "mysql";
  if (url.startsWith("postgres")) return "postgresql";
  return "sqlite";
}

/**
 * Why: Creates a singleton Drizzle connection for the current dialect.
 * When: Called once at app/worker/scheduler startup.
 * Where: Framework bootstrap entry points.
 * How: Builds dialect-specific pool/client and stores it in module state.
 */
export async function initDatabase() {
  if (databaseInstance) return databaseInstance;

  dialect = detectDialect();

  if (dialect === "sqlite") {
    let drizzleSqlite: any;
    let createClient: any;
    try {
      [{ drizzle: drizzleSqlite }, { createClient }] = await Promise.all([
        optionalImport("drizzle-orm/libsql"),
        optionalImport("@libsql/client")
      ]);
    } catch {
      throw new Error("Missing sqlite dependencies. Install with: bun add drizzle-orm @libsql/client");
    }

    const file = path.resolve(process.cwd(), databaseConfig.url.replace(/^sqlite:/, ""));
    await fs.mkdir(path.dirname(file), { recursive: true });
    pool = createClient({ url: `file:${file.replace(/\\/g, "/")}` });
    databaseInstance = drizzleSqlite(pool, { schema });
    return databaseInstance;
  }

  if (dialect === "mysql") {
    let drizzleMysql: any;
    let mysql: any;
    try {
      [{ drizzle: drizzleMysql }, mysql] = await Promise.all([optionalImport("drizzle-orm/mysql2"), optionalImport("mysql2/promise")]);
    } catch {
      throw new Error("Missing mysql dependencies. Install with: bun add drizzle-orm mysql2");
    }

    pool = mysql.createPool({ uri: databaseConfig.url, connectionLimit: 10, enableKeepAlive: true });
    databaseInstance = drizzleMysql(pool, { schema, mode: "default" });
    return databaseInstance;
  }

  let drizzlePg: any;
  let postgres: any;
  try {
    [{ drizzle: drizzlePg }, { default: postgres }] = await Promise.all([
      optionalImport("drizzle-orm/postgres-js"),
      optionalImport("postgres")
    ]);
  } catch {
    throw new Error("Missing postgres dependencies. Install with: bun add drizzle-orm postgres");
  }

  pool = postgres(databaseConfig.url);
  databaseInstance = drizzlePg(pool, { schema });
  return databaseInstance;
}

/**
 * Why: Returns initialized Drizzle instance for queries.
 * When: Used by app code after bootstrap.
 * Where: Facade `db` proxy and direct internal consumers.
 * How: Throws if initDatabase has not completed.
 */
export function database() {
  if (!databaseInstance) throw new Error("Database is not initialized");
  return databaseInstance;
}

/**
 * Why: Exposes low-level pool/client for advanced operations.
 * When: Needed by internals that require native pool behavior.
 * Where: Scheduler lock and infrastructure helpers.
 * How: Returns shared pool and guards against uninitialized access.
 */
export function databasePool() {
  if (!pool) throw new Error("Database pool is not initialized");
  return pool;
}

/**
 * Why: Gracefully closes DB resources during shutdown/reset flows.
 * When: Server stop, worker stop, migration/reset commands.
 * Where: Runtime lifecycle scripts.
 * How: Detects dialect, closes pool, and clears singleton state.
 */
export async function closeDatabase() {
  if (!pool) return;

  const activeDialect = databaseDialect();

  if (activeDialect === "sqlite") {
    pool.close?.();
    pool = undefined;
    databaseInstance = undefined;
    return;
  }

  if (activeDialect === "mysql") {
    await pool.end();
    pool = undefined;
    databaseInstance = undefined;
    return;
  }

  await pool.end();
  pool = undefined;
  databaseInstance = undefined;
}

/**
 * Why: Returns active dialect for conditional SQL/runtime behavior.
 * When: Dialect-specific features are required.
 * Where: Locking, schema, and shutdown helpers.
 * How: Uses initialized dialect or falls back to detection.
 */
export function databaseDialect() {
  return dialect || detectDialect();
}

/**
 * Why: Normalizes raw query results into a consistent { rows } shape.
 * When: Drivers differ in what db.execute() returns:
 *   - postgres-js / libsql return a plain array of rows
 *   - mysql2 returns a [rows, fields] tuple
 *   - pg node clients already wrap rows in { rows }
 * Consumers across modules read `result.rows`.
 * Where: Applied to every db.execute() call.
 * How: Wraps arrays of row objects (and the mysql2 tuple) into { rows },
 * leaves object shapes untouched.
 */
function normalizeExecuteResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    if (result.length === 2 && Array.isArray(result[1])) {
      return { rows: result[0], fields: result[1] };
    }
    const isRowList = result.length === 0 || result.every((row) => row != null && typeof row === "object" && !Array.isArray(row));
    if (isRowList) {
      return { rows: result };
    }
  }
  return result;
}

/**
 * Why: Provides ergonomic global query surface without calling database().
 * When: Used by modules, seeders, and facade consumers.
 * Where: Exposed via framework facade as `db`.
 * How: Proxy forwards property access to the initialized Drizzle instance.
 */
export const db = new Proxy(
  {},
  {
    get(_target, property) {
      const instance = database();
      if (property === "execute") {
        return async (query: unknown, params?: unknown) => {
          const raw = instance.execute ? await instance.execute(query, params) : await instance.all(query);
          return normalizeExecuteResult(raw);
        };
      }
      const value = instance[property as keyof typeof instance];
      return typeof value === "function" ? value.bind(instance) : value;
    }
  }
) as any;
