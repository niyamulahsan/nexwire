const DEFAULT_DATABASE_URL = "sqlite:./src/storage/database/nexwire.sqlite";

/** Detect current DB dialect from DATABASE_URL (sqlite/mysql/postgresql). Falls back to sqlite. */
export function detectDialect() {
  const url = String(process.env.DATABASE_URL || DEFAULT_DATABASE_URL).toLowerCase();
  if (url.startsWith("mysql") || url.startsWith("mariadb")) return "mysql";
  if (url.startsWith("postgres") || url.startsWith("postgresql")) return "postgresql";
  return "sqlite";
}

/** Return the raw DATABASE_URL string or the default sqlite fallback. */
export function databaseUrl() {
  return String(process.env.DATABASE_URL || DEFAULT_DATABASE_URL);
}

/** Parse DATABASE_URL into a URL object. Returns null if invalid. */
export function parsedDatabaseUrl() {
  try {
    return new URL(databaseUrl());
  } catch {
    return null;
  }
}

/** Extract the database name from the pathname of a parsed DATABASE_URL. */
export function databaseNameFromUrl(url) {
  const pathname = String(url?.pathname || "").replace(/^\/+/, "");
  return pathname ? decodeURIComponent(pathname) : "";
}

/** Check if OPEN_API env is enabled (defaults to true). */
export function openApiEnabled() {
  const value = String(process.env.OPEN_API ?? "true")
    .trim()
    .toLowerCase();
  return value !== "false" && value !== "0" && value !== "no";
}

/** Check if REDIS env is enabled (defaults to false). Matches Zod transform in env.ts. */
export function redisEnabled() {
  const value = String(process.env.REDIS ?? "false")
    .trim()
    .toLowerCase();
  return value !== "false" && value !== "0";
}

/** Detect DB dialect for deploy context (uses raw DATABASE_URL or explicit URL). */
export function detectDeployDatabase(urlOverride) {
  const url = String(urlOverride || process.env.DATABASE_URL || "").toLowerCase();
  if (url.startsWith("mysql") || url.startsWith("mariadb")) return "mysql";
  if (url.startsWith("postgres") || url.startsWith("postgresql")) return "postgres";
  return "sqlite";
}

/** Convert a sqlite:// URL to a filesystem path. */
export function sqlitePathFromUrl(url) {
  if (url.startsWith("sqlite:///")) return url.replace("sqlite:///", "/");
  if (url.startsWith("sqlite://")) return url.replace("sqlite://", "");
  if (url.startsWith("sqlite:")) return url.replace("sqlite:", "");
  return url;
}
