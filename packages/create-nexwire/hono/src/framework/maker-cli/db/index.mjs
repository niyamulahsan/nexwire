import { generateSchema } from "../module/core.mjs";
import { showHelp } from "../utils/help.mjs";
import { assertName as assertNameLeaf } from "../utils/naming.mjs";
import { packageScript, runCommand, runNodeScript } from "../utils/process.mjs";
import {
  drizzleGenerateArgs,
  ensureDatabaseDirectory,
  ensureDatabaseExists,
  ensureMigrationMeta,
  hasExistingAppTables,
  migrationFiles,
  resetDatabase,
  runSeed,
  syncMigrationDialect
} from "./core.mjs";

async function runMigrationHooks() {
  const args = ["src/framework/database/migrate-hooks.ts"];
  if (process.versions?.bun) {
    await runCommand("bun", args);
    return;
  }
  await runNodeScript(packageScript("tsx", "dist/cli.mjs"), args);
}

let args = [];
let command = "",
  firstArg = "",
  secondArg = "";
let dbProgram = null;

/** Wrapper around assertName that exits with help on failure. */
function assertName(value, label) {
  try {
    return assertNameLeaf(value, label);
  } catch {
    console.error(`${label} is required.`);
    showHelp(dbProgram);
    process.exit(1);
  }
}

function unsupported() {
  console.error(
    'Drizzle Kit does not support Laravel-style rollback/refresh migrations. Use "bun maker db fresh --seed" for a SQLite development reset, or manage rollback SQL manually for production databases.'
  );
  process.exit(1);
}

async function handleFresh() {
  await ensureDatabaseExists();
  await resetDatabase();
  await generateSchema();
  await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), await drizzleGenerateArgs());
  await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["migrate"]);
  await runMigrationHooks();
  if (args.includes("--seed")) await runSeed();
}

async function handleReset() {
  await ensureDatabaseExists();
  await resetDatabase();
}

async function handleStatus() {
  await generateSchema();
  const files = await migrationFiles();
  if (!files.length) {
    console.log("No generated migration files found.");
    return;
  }
  console.log("Generated migrations:");
  for (const file of files) console.log(`  - ${file}`);
}

const handlers = {
  schema: () => generateSchema(),

  generate: async () => {
    await syncMigrationDialect();
    await ensureMigrationMeta();
    await generateSchema();
    await ensureDatabaseDirectory();
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), await drizzleGenerateArgs());
  },

  migrate: async () => {
    await syncMigrationDialect();
    await ensureMigrationMeta();
    const hadMigrationsBeforeGenerate = (await migrationFiles()).length > 0;
    await ensureDatabaseExists();
    const hadExistingTablesBeforeGenerate = await hasExistingAppTables();
    await generateSchema();
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), await drizzleGenerateArgs());
    if (!hadMigrationsBeforeGenerate && hadExistingTablesBeforeGenerate) {
      throw new Error(
        "Initial migration was generated, but the database already contains tables. " +
          "This usually means migration files were deleted while DB data still exists. " +
          "Use 'bun maker db fresh --seed' to rebuild locally, or restore migration files before running db:migrate."
      );
    }
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["migrate"]);
    await runMigrationHooks();
    if (args.includes("--seed")) await runSeed();
  },

  "migrate:run": async () => {
    await generateSchema();
    await ensureDatabaseExists();
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["migrate"]);
    await runMigrationHooks();
  },

  fresh: handleFresh,
  "migrate:fresh": handleFresh,

  reset: handleReset,
  wipe: handleReset,
  "migrate:reset": handleReset,

  status: handleStatus,
  "migrate:status": handleStatus,

  push: async () => {
    await generateSchema();
    await ensureDatabaseExists();
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["push"]);
  },

  check: async () => {
    await generateSchema();
    await ensureDatabaseExists();
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["check"]);
  },

  studio: async () => {
    const quiet = args.includes("--quiet");
    await generateSchema({ silent: quiet });
    await ensureDatabaseExists();
    try {
      await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["studio"], { silent: quiet });
    } catch (error) {
      if (quiet) throw new Error("db:studio unavailable");
      throw error;
    }
  },

  seed: async () => {
    const possibleModule = command?.startsWith("db:") ? firstArg : secondArg;
    const moduleName = possibleModule && !possibleModule.startsWith("--") ? possibleModule : null;
    await runSeed(moduleName || "");
  },

  "module:seed": async () => {
    const moduleName = assertName(secondArg || firstArg, "Module name");
    await runSeed(moduleName);
  },

  rollback: unsupported,
  "migrate:rollback": unsupported,
  refresh: unsupported,
  "migrate:refresh": unsupported
};

/** Register db:* subcommands on the CLI program. */
export function registerDbCommands(program, rawArgs) {
  dbProgram = program;
  args = rawArgs;
  command = rawArgs[0] || "";
  firstArg = rawArgs[1] || "";
  secondArg = rawArgs[2] || "";
  program
    .command("db [subcommand]")
    .description("Run database operations (schema, generate, migrate, fresh, seed, etc.)")
    .allowUnknownOption(true)
    .action(async (subcommand) => {
      const handler = handlers[subcommand];
      if (handler) return await handler();
      console.error(`Unknown db command: ${subcommand || ""}`);
      showHelp(dbProgram);
      process.exit(1);
    });

  const cmd = (name, desc, opts = []) => {
    const c = program.command(`db:${name}`).description(desc).allowUnknownOption(true);
    for (const o of opts) c.option(o.flag, o.description);
    c.action(handlers[name]);
  };

  cmd("schema", "Generate src/database/schema.ts from module models");
  cmd("generate", "Generate Drizzle migrations after schema discovery");
  cmd("migrate", "Generate then run Drizzle migrations", [{ flag: "--seed", description: "Run seeders after migration" }]);
  cmd("migrate:run", "Run existing Drizzle migrations only");
  cmd("fresh", "Reset database then generate, migrate, optionally seed", [{ flag: "--seed", description: "Run seeders after fresh" }]);
  cmd("seed", "Run all seeders or one module seeder set", [{ flag: "--module", description: "Optional module name" }]);
  cmd("status", "Show generated migration files");
  cmd("push", "Run drizzle-kit push after schema discovery");
  cmd("check", "Run drizzle-kit check after schema discovery");
  cmd("studio", "Open Drizzle Studio after schema discovery", [{ flag: "--quiet", description: "Suppress output" }]);
  cmd("module:seed", "Run seeders for a specific module");
  cmd("reset", "Drop all tables (wipe database)");
  cmd("wipe", "Drop all tables (wipe database)");
  cmd("migrate:reset", "Drop all tables (wipe database)");
}
