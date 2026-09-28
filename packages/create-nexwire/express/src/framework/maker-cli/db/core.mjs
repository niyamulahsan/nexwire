import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { databaseNameFromUrl, databaseUrl, detectDialect, parsedDatabaseUrl, sqlitePathFromUrl } from "../utils/env-db.mjs";
import { packageScript, runCommand, runNodeScript } from "../utils/process.mjs";

/** Detect SQL dialect from raw SQL content by matching against known syntax hints. */
function detectMigrationDialectFromSql(sql = "") {
  const source = sql.toLowerCase();
  if (!source.trim()) return "unknown";

  const postgresHints = ["generated always as identity", "bigserial", "serial", "timestamp with time zone", "public."];
  const mysqlHints = ["auto_increment", "engine=", "`"];
  const sqliteHints = ["autoincrement", "pragma"];

  if (postgresHints.some((hint) => source.includes(hint))) return "postgresql";
  if (mysqlHints.some((hint) => source.includes(hint))) return "mysql";
  if (sqliteHints.some((hint) => source.includes(hint))) return "sqlite";
  return "unknown";
}

/** List existing migration .sql files for the current dialect, sorted. */
export async function migrationFiles() {
  const files = await glob(`src/database/migrations/${detectDialect()}/*.sql`, {
    cwd: process.cwd(),
    nodir: true,
    windowsPathsNoEscape: true
  });
  return files.sort();
}

/** Generate drizzle-kit CLI args for migration generation. Uses --name init for the first migration. */
export async function drizzleGenerateArgs() {
  const files = await migrationFiles();
  if (!files.length) return ["generate", "--name", "init"];
  return ["generate"];
}

/** Create MySQL database if it does not exist. Uses DATABASE_URL credentials. */
async function ensureMysqlDatabaseExists() {
  const targetUrl = parsedDatabaseUrl();
  const database = databaseNameFromUrl(targetUrl);
  if (!targetUrl || !database) return;
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: targetUrl.hostname,
    port: targetUrl.port ? Number(targetUrl.port) : 3306,
    user: decodeURIComponent(targetUrl.username || "root"),
    password: decodeURIComponent(targetUrl.password || ""),
    database: "mysql",
    ssl: targetUrl.searchParams.get("ssl") === "true" ? {} : undefined
  });
  try {
    const [rows] = await connection.query("SELECT SCHEMA_NAME as name FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [database]);
    const exists = Array.isArray(rows) && rows.length > 0;
    if (!exists) {
      const safe = database.replace(/`/g, "``");
      await connection.query(`CREATE DATABASE \`${safe}\``);
      console.log(`Created MySQL database: ${database}`);
    }
  } finally {
    await connection.end();
  }
}

/** Create Postgres database if it does not exist. Uses DATABASE_URL credentials. */
async function ensurePostgresDatabaseExists() {
  const targetUrl = parsedDatabaseUrl();
  const database = databaseNameFromUrl(targetUrl);
  if (!targetUrl || !database) return;
  const postgres = (await import("postgres")).default;
  const admin = postgres({
    host: targetUrl.hostname,
    port: targetUrl.port ? Number(targetUrl.port) : 5432,
    user: decodeURIComponent(targetUrl.username || "postgres"),
    password: decodeURIComponent(targetUrl.password || ""),
    database: "postgres",
    ssl: targetUrl.searchParams.get("ssl") === "true" ? "require" : false
  });
  try {
    const rows = await admin.unsafe("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (!rows.length) {
      const safe = database.replace(/"/g, '""');
      await admin.unsafe(`CREATE DATABASE "${safe}"`);
      console.log(`Created Postgres database: ${database}`);
    }
  } finally {
    await admin.end();
  }
}

/** Ensure the database exists for the current DATABASE_URL dialect. Creates it if missing (MySQL/Postgres). */
export async function ensureDatabaseExists() {
  const dialect = detectDialect();
  if (dialect === "sqlite") {
    await ensureDatabaseDirectory();
    return;
  }
  if (dialect === "mysql") {
    await ensureMysqlDatabaseExists();
    return;
  }
  if (dialect === "postgresql") {
    await ensurePostgresDatabaseExists();
  }
}

/** Resolve the filesystem path for the SQLite database file. */
function sqliteDatabasePath() {
  return path.resolve(process.cwd(), sqlitePathFromUrl(databaseUrl()));
}

/** Delete and recreate the SQLite database file. */
async function resetSqliteDatabase() {
  const file = sqliteDatabasePath();
  await fs.rm(file, { force: true });
  await fs.mkdir(path.dirname(file), { recursive: true });
}

/** Drop and recreate the MySQL database. */
async function resetMysqlDatabase() {
  const targetUrl = parsedDatabaseUrl();
  const database = databaseNameFromUrl(targetUrl);
  if (!targetUrl || !database) return;
  const mysql = await import("mysql2/promise");
  const connection = await mysql.createConnection({
    host: targetUrl.hostname,
    port: targetUrl.port ? Number(targetUrl.port) : 3306,
    user: decodeURIComponent(targetUrl.username || "root"),
    password: decodeURIComponent(targetUrl.password || ""),
    database: "mysql",
    ssl: targetUrl.searchParams.get("ssl") === "true" ? {} : undefined
  });
  try {
    const safe = database.replace(/`/g, "``");
    await connection.query(`DROP DATABASE IF EXISTS \`${safe}\``);
    await connection.query(`CREATE DATABASE \`${safe}\``);
  } finally {
    await connection.end();
  }
}

/** Drop and recreate the Postgres database. Terminates active connections first. */
async function resetPostgresDatabase() {
  const targetUrl = parsedDatabaseUrl();
  const database = databaseNameFromUrl(targetUrl);
  if (!targetUrl || !database) return;
  const postgres = (await import("postgres")).default;
  const admin = postgres({
    host: targetUrl.hostname,
    port: targetUrl.port ? Number(targetUrl.port) : 5432,
    user: decodeURIComponent(targetUrl.username || "postgres"),
    password: decodeURIComponent(targetUrl.password || ""),
    database: "postgres",
    ssl: targetUrl.searchParams.get("ssl") === "true" ? "require" : false
  });
  try {
    const safe = database.replace(/"/g, '""');
    await admin.unsafe("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()", [database]);
    await admin.unsafe(`DROP DATABASE IF EXISTS "${safe}"`);
    await admin.unsafe(`CREATE DATABASE "${safe}"`);
  } finally {
    await admin.end();
  }
}

/** Drop and recreate the database for the current dialect. */
export async function resetDatabase() {
  const dialect = detectDialect();
  if (dialect === "sqlite") return await resetSqliteDatabase();
  if (dialect === "mysql") return await resetMysqlDatabase();
  if (dialect === "postgresql") return await resetPostgresDatabase();
}

/** Check if the database has existing app tables (excluding drizzle meta tables). */
export async function hasExistingAppTables() {
  const dialect = detectDialect();
  if (dialect === "sqlite") {
    const libsql = await import("@libsql/client");
    const file = sqliteDatabasePath();
    const client = libsql.createClient({ url: `file:${file.replace(/\\/g, "/")}` });
    try {
      const result = await client.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations'"
      );
      return result.rows.length > 0;
    } finally {
      client.close();
    }
  }

  if (dialect === "mysql") {
    const mysql = await import("mysql2/promise");
    const connection = await mysql.createConnection(databaseUrl());
    try {
      const [rows] = await connection.query(
        "SELECT table_name as name FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name != '__drizzle_migrations'"
      );
      return Array.isArray(rows) && rows.length > 0;
    } finally {
      await connection.end();
    }
  }

  const postgres = (await import("postgres")).default;
  const client = postgres(databaseUrl());
  try {
    const rows = await client.unsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '__drizzle_migrations'");
    return rows.length > 0;
  } finally {
    await client.end();
  }
}

/** Run the application seed script via tsx or Bun. */
export async function runSeed(moduleName = "") {
  const seedArgs = ["src/framework/database/seed.ts"];
  if (moduleName) seedArgs.push(`--module=${moduleName}`);
  if (process.versions?.bun) {
    await runCommand("bun", seedArgs);
    return;
  }
  await runNodeScript(packageScript("tsx", "dist/cli.mjs"), seedArgs);
}

/** Ensure the SQLite database directory exists. No-op for MySQL/Postgres. */
export async function ensureDatabaseDirectory() {
  if (detectDialect() !== "sqlite") return;
  const file = path.resolve(process.cwd(), sqlitePathFromUrl(databaseUrl()));
  await fs.mkdir(path.dirname(file), { recursive: true });
}

/** Ensure the drizzle migration meta directory and _journal.json exist. */
export async function ensureMigrationMeta() {
  const migrationRoot = path.resolve(process.cwd(), "src/database/migrations", detectDialect());
  const metaRoot = path.join(migrationRoot, "meta");
  const journalPath = path.join(metaRoot, "_journal.json");
  await fs.mkdir(metaRoot, { recursive: true });
  try {
    await fs.access(journalPath);
  } catch {
    const dialect = detectDialect();
    const journalDialect = dialect === "postgresql" ? "postgresql" : dialect;
    await fs.writeFile(
      journalPath,
      `{
  "version": "7",
  "dialect": "${journalDialect}",
  "entries": []
}
`
    );
  }
}

/** Sync the migration dialect to match the current DATABASE_URL. Resets migrations if dialect changed. */
export async function syncMigrationDialect() {
  async function existingMigrationDialect() {
    const files = await migrationFiles();
    if (!files.length) return null;
    const first = await fs.readFile(path.resolve(process.cwd(), files[0]), "utf8");
    return detectMigrationDialectFromSql(first);
  }

  async function resetMigrationFiles() {
    const migrationRoot = path.resolve(process.cwd(), "src/database/migrations", detectDialect());
    const dialect = detectDialect();
    const journalDialect = dialect === "postgresql" ? "postgresql" : dialect;
    await fs.rm(migrationRoot, { recursive: true, force: true });
    await fs.mkdir(path.join(migrationRoot, "meta"), { recursive: true });
    await fs.writeFile(
      path.join(migrationRoot, "meta", "_journal.json"),
      `{
  "version": "7",
  "dialect": "${journalDialect}",
  "entries": []
}
`
    );
    console.log("Reset existing migration files due to dialect change.");
  }

  const target = detectDialect();
  const current = await existingMigrationDialect();
  if (!current || current === "unknown" || current === target) return;
  console.log(`Migration dialect changed (${current} -> ${target}). Regenerating migration files for current DATABASE_URL.`);
  await resetMigrationFiles();
}
