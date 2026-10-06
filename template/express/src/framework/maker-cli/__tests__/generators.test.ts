import { mkdir, mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  makeController,
  makeHelper,
  makeJob,
  makeModel,
  makeModule,
  makeRoute,
  makeSchedule,
  makeSchema,
  makeSeeder,
  makeService,
  makeType
} from "../module/core.mjs";

/**
 * Every generator writes a developer-supplied name into generated TypeScript.
 * A name containing a dash must reach an identifier as camelCase and a
 * database table as snake_case; leaking the dash produces `game-configService`,
 * which JavaScript parses as subtraction and which produces a file that cannot
 * compile.
 *
 * These tests generate real files and parse them with the TypeScript compiler,
 * so a regression shows up as a syntax error rather than a string mismatch.
 */

/** Input styles a developer may realistically type. All must behave identically. */
const NAME_VARIANTS = ["game-config", "game_config", "gameConfig", "GameConfig"];

const EXPECTED_FILE = "game-config.ts";
const EXPECTED_IDENTIFIER = "gameConfigs";
const EXPECTED_TABLE = "game_configs";

let workdir = "";
let originalCwd = "";
let originalDatabaseUrl: string | undefined;
let originalOpenApi: string | undefined;

/**
 * The generators resolve their output paths from `process.cwd()`, so driving
 * them means changing directory. Vitest's default pool is `forks`, where that
 * works; if a project switches to `threads`, `process.chdir` does not exist in
 * a worker and these tests cannot run. Skip rather than fail with a confusing
 * error about a function the reader has never heard of.
 */
const canChdir = typeof process.chdir === "function";

/** Walk a directory and return every generated .ts file. */
async function collectTypeScript(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectTypeScript(full)));
    } else if (entry.name.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

/** Always compare paths with forward slashes so assertions pass on Windows too. */
function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

/** Syntax errors the TypeScript parser reports for one file. */
function syntaxErrors(file: string, source: string): string[] {
  const parsed = ts.createSourceFile(file, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  // `parseDiagnostics` is how the parser reports a file it could not read as
  // TypeScript, but it is not part of TypeScript's published types.
  const { parseDiagnostics } = parsed as unknown as { parseDiagnostics: readonly ts.Diagnostic[] };
  return parseDiagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, " "));
}

/** The module specifier of every import statement in the file. */
function importSpecifiers(source: string): string[] {
  const parsed = ts.createSourceFile("f.ts", source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);
  return parsed.statements
    .filter((s): s is ts.ImportDeclaration => ts.isImportDeclaration(s))
    .map((s) => (s.moduleSpecifier as ts.StringLiteral).text);
}

/**
 * A dash immediately followed by a lowercase letter or digit is a kebab leak:
 * `game-configService`, `game_configs` in an import, `db.insert(game-configs)`.
 * Dashes inside string literals (import paths, event names) and inside comments
 * are fine, so both are removed before judging the line.
 */
function kebabLeaks(source: string): string[] {
  const withoutBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "));
  return withoutBlockComments
    .split("\n")
    .map((text, i) => ({ line: i + 1, text }))
    .map(({ line, text }) => ({
      line,
      text,
      code: text.replace(/"[^"]*"|'[^']*'|`[^`]*`|\/\/.*$/g, "")
    }))
    .filter(({ code }) => /[a-z0-9]-[a-z0-9]/.test(code))
    .map(({ line, text }) => `line ${line}: ${text.trim()}`);
}

beforeEach(async () => {
  originalCwd = process.cwd();
  originalDatabaseUrl = process.env.DATABASE_URL;
  originalOpenApi = process.env.OPEN_API;
  // Pin the two env-driven generator decisions so the test is deterministic.
  process.env.DATABASE_URL = "file:./nexwire.sqlite";
  process.env.OPEN_API = "true";
  if (!canChdir) return;

  workdir = await mkdtemp(path.join(tmpdir(), "nexwire-gen-"));
  await mkdir(path.join(workdir, "src", "modules", "blog-post"), { recursive: true });
  process.chdir(workdir);
});

afterEach(() => {
  if (canChdir) process.chdir(originalCwd);
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalOpenApi === undefined) delete process.env.OPEN_API;
  else process.env.OPEN_API = originalOpenApi;
});

/** Run every module generator for one name variant. */
async function generateAll(variant: string): Promise<string[]> {
  const mod = "blog-post";
  // Order matters: makeController only imports the service when a service file
  // already exists, so the service must come first. Otherwise the standalone
  // controller variant is emitted and the wired variant - the one that actually
  // references the generated identifier - is never exercised.
  await makeModel(mod, variant);
  await makeSeeder(mod, variant);
  await makeService(mod, variant);
  await makeController(mod, variant);
  await makeSchema(mod, variant);
  await makeRoute(mod, variant);
  await makeJob(mod, variant);
  await makeSchedule(mod, variant);
  await makeType(mod, variant);
  await makeHelper(mod, variant);
  return collectTypeScript(path.join(workdir, "src", "modules", mod));
}

describe.skipIf(!canChdir).each(NAME_VARIANTS)("generators given %s", (variant) => {
  it("writes every generated file as syntactically valid TypeScript", async () => {
    const files = await generateAll(variant);
    expect(files.length).toBeGreaterThan(5);

    const failures: string[] = [];
    for (const file of files) {
      const errors = syntaxErrors(file, await readFile(file, "utf8"));
      if (errors.length > 0) {
        failures.push(`${path.relative(workdir, file)}: ${errors.join("; ")}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("never leaks a kebab name into code", async () => {
    const files = await generateAll(variant);
    const leaks: string[] = [];
    for (const file of files) {
      for (const leak of kebabLeaks(await readFile(file, "utf8"))) {
        leaks.push(`${path.relative(workdir, file)} ${leak}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("exports the table as camelCase and names the SQL table snake_case", async () => {
    const files = await generateAll(variant);
    const model = files.find((f) => toPosix(f).endsWith(`models/${EXPECTED_FILE}`));
    expect(model, `model file ${EXPECTED_FILE} was not generated`).toBeTruthy();

    const source = await readFile(model!, "utf8");
    expect(source).toContain(`export const ${EXPECTED_IDENTIFIER} =`);
    expect(source).toContain(`"${EXPECTED_TABLE}"`);
  });

  it("imports the model by its camelCase export in the seeder and service", async () => {
    const files = await generateAll(variant);
    const consumers = files.filter((f) => toPosix(f).includes("/seeders/") || toPosix(f).includes("/services/"));
    expect(consumers.length).toBeGreaterThan(0);

    for (const file of consumers) {
      const source = await readFile(file, "utf8");
      expect(source, `${path.relative(workdir, file)} should import ${EXPECTED_IDENTIFIER}`).toContain(`import { ${EXPECTED_IDENTIFIER} }`);
    }
  });
});

describe.skipIf(!canChdir)("a name that mixes separators and casing", () => {
  // `gamE-SUITE-Engine` combines both word-boundary signals: dashes between
  // SUITE and Engine, and an internal capital inside the first segment. It is
  // the awkward case a developer is most likely to actually type.
  const MIXED = "gamE-SUITE-Engine";

  it("creates a module whose every generated file parses", async () => {
    const created = await makeModule(MIXED);
    expect(created.moduleName).toBe("gam-e-suite-engine");

    const files = await collectTypeScript(path.join(workdir, "src", "modules", created.moduleName));
    expect(files.length).toBeGreaterThan(5);

    const failures: string[] = [];
    for (const file of files) {
      for (const error of syntaxErrors(file, await readFile(file, "utf8"))) {
        failures.push(`${toPosix(file)}: ${error}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it("leaks no kebab into code, only into paths and strings", async () => {
    const created = await makeModule(MIXED);
    const files = await collectTypeScript(path.join(workdir, "src", "modules", created.moduleName));
    const leaks: string[] = [];
    for (const file of files) {
      for (const leak of kebabLeaks(await readFile(file, "utf8"))) {
        leaks.push(`${toPosix(file)} ${leak}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("is reachable again by any other casing of the same words", async () => {
    await makeModule(MIXED);
    // The point of normalising: a later command typed in a different style must
    // resolve to the folder that already exists. Each generator resolves the
    // module before writing, so a successful --dry-run proves it was found;
    // --dry-run keeps the check from creating files.
    for (const alias of ["gam-e-suite-engine", "GAM-E-SUITE-ENGINE", "gamESuiteEngine", "gam_e_suite_engine"]) {
      await expect(makeSchema(alias, "probe-check", ["--dry-run"]), `alias: ${alias}`).resolves.not.toThrow();
    }
  });

  it("still refuses a name that cannot become a safe identifier", async () => {
    await makeModule(MIXED);
    await expect(makeSchema("gamE SUITE", "probe-check")).rejects.toThrow(/Invalid/);
    await expect(makeSchema("2nd-engine", "probe-check")).rejects.toThrow(/must start with a lowercase letter/);
  });
});

describe.skipIf(!canChdir)("name normalisation across generators", () => {
  it("writes the same file name for every input style", async () => {
    const produced: string[] = [];
    // Each variant gets its own module. The module is named by index, not by
    // variant, because the variant is itself normalised - which is the point.
    for (const [index, variant] of NAME_VARIANTS.entries()) {
      const mod = `mod-${index}`;
      await mkdir(path.join(workdir, "src", "modules", mod), { recursive: true });
      await makeModel(mod, variant);
      produced.push(...(await collectTypeScript(path.join(workdir, "src", "modules", mod))).map((f) => path.basename(f)));
    }
    // Every variant must land on one identical file name, not four near-misses.
    expect(new Set(produced)).toEqual(new Set([EXPECTED_FILE]));
  });
});

/**
 * A seeder used to be welded to a model: if `database/models/<name>.ts` was
 * missing, `module:make-seeder` threw and produced nothing. That made three
 * reasonable requests impossible - seeding a table owned by another module,
 * seeding rows assembled from several models, and seeding a table that does
 * not exist yet. A seeder has no reason to require a model: it is a function
 * that inserts rows, and what it inserts is the developer's choice.
 *
 * So a missing model now yields a standalone seeder that imports no model,
 * which is the same trade every other dependent generator already makes:
 * controller falls back to `standalone` with no service, service falls back to
 * `plain` with no model. Seeder was the only one that refused.
 */
describe.skipIf(!canChdir)("module:make-seeder model binding", () => {
  const mod = "blog-post";

  async function seederSource(name: string): Promise<string> {
    const file = path.join(workdir, "src", "modules", mod, "database", "seeders", `${name}.ts`);
    return await readFile(file, "utf8");
  }

  it("still binds to the model when one exists", async () => {
    await makeModel(mod, "game-config");
    await makeSeeder(mod, "game-config");
    const source = await seederSource("game-config");
    expect(source).toContain("@/modules/blog-post/database/models/game-config.js");
    expect(source).toContain("gameConfigs");
    expect(syntaxErrors("seeder.ts", source)).toEqual([]);
  });

  it("writes a standalone seeder when the model does not exist", async () => {
    // No makeModel call: this is the case that used to throw.
    await makeSeeder(mod, "post-comments");
    const source = await seederSource("post-comments");
    expect(syntaxErrors("seeder.ts", source)).toEqual([]);
    // The whole point: no import of a file that may not exist. Checked on the
    // parsed import statements, not the raw text, because a comment is allowed
    // to mention the path it is telling you to write.
    expect(importSpecifiers(source).filter((s) => s.includes("/database/models/"))).toEqual([]);
  });

  it("produces a standalone seeder for a model owned by another module", async () => {
    // The reported case: module blog-post wants to seed the posts table, which
    // lives in a different module. blog-post has no models of its own here.
    const other = path.join(workdir, "src", "modules", "other-module");
    await mkdir(path.join(other, "database", "models"), { recursive: true });
    await makeModel("other-module", "posts");
    await makeSeeder(mod, "posts");
    const source = await seederSource("posts");
    expect(syntaxErrors("seeder.ts", source)).toEqual([]);
    expect(importSpecifiers(source).filter((s) => s.includes("/database/models/"))).toEqual([]);
  });

  it("writes a standalone seeder when the module has no models folder at all", async () => {
    // Nothing has been generated in this module, so database/ does not exist.
    const empty = "empty-module";
    await mkdir(path.join(workdir, "src", "modules", empty), { recursive: true });
    await makeSeeder(empty, "anything");
    const source = await readFile(path.join(workdir, "src", "modules", empty, "database", "seeders", "anything.ts"), "utf8");
    expect(syntaxErrors("seeder.ts", source)).toEqual([]);
    expect(importSpecifiers(source).filter((s) => s.includes("/database/models/"))).toEqual([]);
  });

  it("names the function after the seeder, not the model", async () => {
    await makeSeeder(mod, "post-comments");
    expect(await seederSource("post-comments")).toContain("PostCommentsSeeder");
  });

  it("leaves no kebab-case name in code position", async () => {
    await makeSeeder(mod, "post-comments");
    expect(kebabLeaks(await seederSource("post-comments"))).toEqual([]);
  });

  it("substitutes every placeholder, including the ones only used as reference", async () => {
    // The standalone stub teaches with `db.insert(tableVariable)`, so it uses a
    // placeholder the bound stub path never touches. A missing variable would
    // leave `{{tableVariable}}` sitting in a generated file as if it were code.
    await makeSeeder(mod, "post-comments");
    const source = await seederSource("post-comments");
    expect(source).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });

  it("shows the developer the insert pattern to uncomment", async () => {
    // A developer who does not know how a seeder works needs the whole shape in
    // the file, not just an empty array. Pin the three teaching points.
    await makeSeeder(mod, "post-comments");
    const source = await seederSource("post-comments");
    expect(source).toContain("db.insert(postComments).values(row)");
    expect(source).toContain('import { db } from "@/framework/facade.js";');
    // The conventional table name and how to get a finished example.
    expect(source).toContain("@/modules/blog-post/database/models/post-comments.js");
    expect(source).toContain("export const table = postComments;");
    expect(source).toContain("module:seed blog-post");
  });
});
