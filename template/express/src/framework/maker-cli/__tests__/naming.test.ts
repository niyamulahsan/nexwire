import { describe, expect, it } from "vitest";
import { assertName, camelCase, normalizeName, pascal, plural, snakeCase } from "../utils/naming.mjs";

/**
 * The naming contract every generator depends on.
 *
 * One canonical form (kebab) and four derived forms. A developer may type any
 * common casing; all of them must resolve to the same file, table, identifier
 * and class. Getting this wrong writes kebab-case straight into JavaScript
 * identifiers, which parses as subtraction and produces uncompilable files.
 */

/** Input styles that all contain a real word boundary, so they must converge. */
const SAME_NAME = ["game-suite", "game_suite", "game-SUITE", "GAME-SUITE", "gameSuite", "GameSuite"];

/** Input styles with no boundary written, so they stay a single word. */
const SINGLE_WORD = ["gamesuite", "GAMESUITE", "Gamesuite"];

describe("normalizeName", () => {
  it.each(SAME_NAME)("canonicalises %s to kebab", (input) => {
    expect(normalizeName(input)).toBe("game-suite");
  });

  it.each(SINGLE_WORD)("keeps %s as one word, because no boundary was written", (input) => {
    expect(normalizeName(input)).toBe("gamesuite");
  });

  it("keeps a numeric segment attached to its word", () => {
    expect(normalizeName("game-config_2")).toBe("game-config-2");
    expect(normalizeName("game_config-2")).toBe("game-config-2");
    expect(normalizeName("game-config-2")).toBe("game-config-2");
  });

  it("is idempotent, so re-running never churns an existing name", () => {
    for (const input of [...SAME_NAME, "game-config-2", "spin"]) {
      const once = normalizeName(input);
      expect(normalizeName(once)).toBe(once);
    }
  });

  it("leaves an already-canonical name untouched", () => {
    expect(normalizeName("game-config")).toBe("game-config");
    expect(normalizeName("spin")).toBe("spin");
    expect(normalizeName("audit-entry")).toBe("audit-entry");
  });

  it("reads an internal capital as a boundary even next to explicit separators", () => {
    // `gamE-SUITE-Engine` mixes both signals. The dashes give suite/engine; the
    // capital E inside the first segment gives a boundary too, so it is read as
    // gam / e / suite / engine. The capital is carried into the PascalCase form
    // because we record which letters were capitalised rather than throwing that
    // information away.
    expect(normalizeName("gamE-SUITE-Engine")).toBe("gam-e-suite-engine");
  });

  it("reaches one module name from every casing of the same words", () => {
    // Whatever form the developer types later - in a path, an import, another
    // command - it must land on the folder that was already created.
    const canonical = "gam-e-suite-engine";
    for (const input of [
      "gam-e-suite-engine",
      "GAM-E-SUITE-ENGINE",
      "gamESuiteEngine",
      "GamESuiteEngine",
      "gam_e_suite_engine",
      "gamE-SUITE-Engine"
    ]) {
      expect(normalizeName(input), `input: ${input}`).toBe(canonical);
    }
  });

  it("collapses repeated separators", () => {
    expect(normalizeName("game__config")).toBe("game-config");
    expect(normalizeName("game--config")).toBe("game-config");
    expect(normalizeName("  game-config  ")).toBe("game-config");
  });

  it("reads an all-caps run as a single word, because it carries no boundary", () => {
    // GAMECONFIG has no lowercase/uppercase transition to split on, so the
    // word boundary genuinely does not exist in the input.
    expect(normalizeName("GAMECONFIG")).toBe("gameconfig");
  });
});

describe("snakeCase", () => {
  it("produces the SQL table name once pluralised by the generator", () => {
    expect(plural(snakeCase("game-config"))).toBe("game_configs");
  });

  it.each([
    ["spin", "spin"],
    ["audit-entry", "audit_entry"],
    ["user-tenant", "user_tenant"],
    ["game-config-2", "game_config_2"]
  ])("maps %s to %s", (input, expected) => {
    expect(snakeCase(input)).toBe(expected);
  });
});

describe("plural", () => {
  // Every expectation here is an export that already exists in a real
  // project, so the generated identifier matches hand-written code.
  it.each([
    ["spin", "spins"],
    ["user", "users"],
    ["role", "roles"],
    ["notification", "notifications"],
    ["tenant", "tenants"],
    ["account", "accounts"],
    ["gameConfig", "gameConfigs"],
    ["gameSession", "gameSessions"],
    ["userTenant", "userTenants"],
    ["auditEntry", "auditEntries"],
    ["ledgerEntry", "ledgerEntries"]
  ])("pluralises %s to %s", (input, expected) => {
    expect(plural(input)).toBe(expected);
  });

  it("keeps an already-plural word unchanged", () => {
    expect(plural("users")).toBe("users");
  });
});

describe("the four derived forms", () => {
  /** Mirrors what the generators will do, so this test pins the contract. */
  function derive(input: string) {
    const base = normalizeName(input);
    return {
      file: base,
      table: plural(snakeCase(base)),
      identifier: plural(camelCase(base)),
      className: pascal(base)
    };
  }

  it.each(SAME_NAME)("resolves %s to identical output in all four forms", (input) => {
    expect(derive(input)).toEqual({
      file: "game-suite",
      table: "game_suites",
      identifier: "gameSuites",
      className: "GameSuite"
    });
  });

  it("still produces valid, consistent output for a boundary-less input", () => {
    // Nothing to split on, but the result is deterministic and usable.
    expect(derive("gamesuite")).toEqual({
      file: "gamesuite",
      table: "gamesuites",
      identifier: "gamesuites",
      className: "Gamesuite"
    });
  });

  it("never leaks a dash into the identifier or the table", () => {
    for (const input of [...SAME_NAME, "audit-entry", "user-tenant", "game-config-2"]) {
      const { table, identifier } = derive(input);
      expect(identifier).not.toContain("-");
      expect(table).not.toContain("-");
      expect(identifier).toMatch(/^[a-z][A-Za-z0-9]*$/);
      expect(table).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("assertName", () => {
  it("returns the canonical name, so file names on disk are consistent", () => {
    expect(assertName("gameConfig", "Model name")).toBe("game-config");
    expect(assertName("game_config", "Model name")).toBe("game-config");
    expect(assertName("spin", "Model name")).toBe("spin");
  });

  it("still rejects names that cannot become a safe identifier", () => {
    expect(() => assertName("2fast", "Model name")).toThrow(/must start with a lowercase letter/);
    expect(() => assertName("game config", "Model name")).toThrow();
    expect(() => assertName("", "Model name")).toThrow();
  });
});
