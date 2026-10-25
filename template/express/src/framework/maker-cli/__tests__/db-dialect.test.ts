import { describe, expect, it } from "vitest";
import { detectMigrationDialectFromSql } from "../db/core.mjs";

/**
 * `syncMigrationDialect()` reads the first migration file to decide whether the
 * generated history still matches DATABASE_URL, and wipes the history when it
 * does not. A misread is therefore destructive, not cosmetic.
 *
 * Drizzle quotes SQLite identifiers with backticks, so the old hint order
 * classified every SQLite migration as MySQL and reset the history on the next
 * `db:generate` / `module:migrate`. These tests pin the distinctive hints
 * before the quoting character.
 */
describe("detectMigrationDialectFromSql", () => {
  it("reads drizzle sqlite output as sqlite despite the backticks", () => {
    const sql = [
      "CREATE TABLE `users` (",
      "\t`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,",
      "\t`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL",
      ");"
    ].join("\n");

    expect(detectMigrationDialectFromSql(sql)).toBe("sqlite");
  });

  it("still reads mysql output as mysql", () => {
    const sql = "CREATE TABLE `users` (`id` int AUTO_INCREMENT PRIMARY KEY) ENGINE=InnoDB;";

    expect(detectMigrationDialectFromSql(sql)).toBe("mysql");
  });

  it("reads postgres output as postgresql", () => {
    const sql = 'CREATE TABLE "users" ("id" bigserial PRIMARY KEY);';

    expect(detectMigrationDialectFromSql(sql)).toBe("postgresql");
  });

  it("returns unknown for an empty file", () => {
    expect(detectMigrationDialectFromSql("")).toBe("unknown");
  });
});
