import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { writeFileAlways, writeFileIfMissing } from "./file-ops.mjs";
import { PROJECT_COMMAND_FLAG } from "./help.mjs";

/**
 * Where a project keeps its own maker commands.
 *
 * Deliberately outside `src/`. Anything under `src/framework/` is copied into
 * the published package by `scripts/sync-template.mjs`, so a developer edit
 * there would be overwritten on the next framework update - and `src/modules/`
 * is swept by the route, job and seeder globs. The project root is the one
 * place nothing else owns.
 *
 * Two names are read: commands.mjs (plain JavaScript, loaded by plain node)
 * and commands.ts (TypeScript, loaded through tsx). The .mjs is the incumbent
 * and wins if a project keeps both.
 */
export const PROJECT_COMMANDS_PATH = "maker/commands.mjs";
export const PROJECT_COMMANDS_TS_PATH = "maker/commands.ts";

/** Process-global so a re-evaluated module cannot register tsx twice. */
const TSX_REGISTERED = "__nexwireMakerTsxRegistered";

const PROJECT_COMMANDS_TEMPLATE = `/**
 * Your project's maker commands.
 *
 * This file is yours. Nothing in nexwire writes to it, and no framework update
 * will touch it. Whatever you export here is registered on the maker CLI
 * alongside the built-in commands:
 *
 *   maker example:hello          run your command
 *   maker --help                 every command, yours included
 *
 * \`program\` is the same commander object the built-in commands are built with,
 * so \`.command()\`, \`.description()\`, \`.option()\` and \`.action()\` behave exactly
 * as they do in nexwire's own commands.
 *
 * Three things worth knowing:
 *
 *   - A name that collides with a framework command is ignored, and you are told
 *     which one. Rename yours; the built-in stays.
 *   - An error in this file is reported, never swallowed. If your commands stop
 *     appearing, the fault is here rather than in your command code.
 *   - This file runs as plain JavaScript under plain Node, so it cannot import
 *     your TypeScript source or use your tsconfig path alias. If a command
 *     needs either, name this file maker/commands.ts instead and delete this
 *     one - nexwire loads that file through tsx, with your tsconfig applied.
 *     For editor type support, create maker/tsconfig.json as shown in the docs.
 *
 * Replace or delete the example below once you have a command of your own.
 */

export default function register(program) {
  program
    .command("example:hello <name>")
    .description("Example command - replace or delete this")
    .option("--loud", "Shout the greeting")
    .action((name, options) => {
      const greeting = \`Hello, \${name}!\`;
      console.log(options.loud ? greeting.toUpperCase() : greeting);
    });
}
`;

/**
 * Why: Plain node cannot import TypeScript, so maker/commands.ts needs tsx
 *      registered before it is imported. Registered at most once per process
 *      and never unregistered: two overlapping registrations corrupt the
 *      loader, and commands routinely import more TypeScript at action time,
 *      long after this function returns. The flag lives on globalThis because
 *      this module can be evaluated more than once in one process (vitest's
 *      per-file isolation) while the loader hooks are process-wide.
 * When: Only when the project's file is TypeScript - maker/commands.mjs never
 *      pays for tsx being installed.
 * Where: utils/project-commands.mjs.
 */
async function registerTsLoader(rel) {
  if (globalThis[TSX_REGISTERED]) return;

  try {
    const { register } = await import("tsx/esm/api");
    register();
  } catch (error) {
    throw new Error(
      `${rel} needs tsx to load TypeScript, but it could not be registered: ${error?.message || error}. tsx ships as a devDependency of every nexwire project - run npm install, or rename the file to ${PROJECT_COMMANDS_PATH}.`,
      { cause: error }
    );
  }

  globalThis[TSX_REGISTERED] = true;
}

/**
 * Why: Registers the commands a project defined for itself.
 * When: Every maker invocation, right after the framework's own registrars.
 * Where: Maker CLI entry flow, from utils/project-commands.mjs.
 * How: Imports maker/commands.mjs - or maker/commands.ts, loaded through tsx,
 *      which resolves the project's tsconfig path aliases - resolved from
 *      process.cwd(), not from import.meta.dirname, which points inside
 *      node_modules and would find the framework's own directory instead of the
 *      project. If a project keeps both files the .mjs wins and the .ts file is
 *      skipped with a warning naming it, so neither file is ever silently dead:
 *      a project that already runs must not be re-registered by a file that
 *      appeared later, and a file that is skipped must say so. Absent is silent
 *      and free; broken is loud, because a developer's commands silently not
 *      existing is a far worse experience than an error message. A name that
 *      collides with a framework command is refused by commander itself, which
 *      is the right outcome: the built-in wins and the project cannot shadow a
 *      command it did not write. That refusal is re-thrown here with the file
 *      name attached, because commander's own message does not say which file
 *      asked for the name.
 */
export async function registerProjectCommands(program, rawArgs, cwd = process.cwd()) {
  const mjsFile = path.resolve(cwd, PROJECT_COMMANDS_PATH);
  const tsFile = path.resolve(cwd, PROJECT_COMMANDS_TS_PATH);
  const hasMjs = fs.existsSync(mjsFile);
  const hasTs = fs.existsSync(tsFile);

  if (!hasMjs && !hasTs) {
    return { loaded: false, file: mjsFile, added: [] };
  }

  const isTs = !hasMjs && hasTs;
  const file = isTs ? tsFile : mjsFile;
  const rel = isTs ? PROJECT_COMMANDS_TS_PATH : PROJECT_COMMANDS_PATH;

  if (hasMjs && hasTs) {
    console.warn(
      `${PROJECT_COMMANDS_TS_PATH} is ignored because ${PROJECT_COMMANDS_PATH} exists. Keep one - delete the file you are not using.`
    );
  }

  // Not wrapped in a bare try/catch on purpose. A file that exists but fails to
  // load has to say so, or the developer goes looking for a bug in their own
  // command that is actually in this loader. The catches below only attach the
  // file name, because an error from inside the project file otherwise reads as
  // if it came from the framework.
  if (isTs) {
    await registerTsLoader(rel);
  }

  let module;
  try {
    module = await import(pathToFileURL(file).href);
  } catch (error) {
    throw new Error(`Could not load ${rel}: ${error?.message || error}`, { cause: error });
  }

  const register = module.default ?? module.register;

  if (typeof register !== "function") {
    throw new TypeError(
      `${rel} must export a default function (program, args) => void. Found: ${typeof register}.`
    );
  }

  const before = new Set(program.commands);

  try {
    await register(program, rawArgs);
  } catch (error) {
    throw new Error(`Could not register commands from ${rel}: ${error?.message || error}`, {
      cause: error
    });
  }

  const added = [];

  for (const command of program.commands) {
    if (before.has(command)) continue;
    // Tagged so `maker --help` files these under "Your commands" beside
    // `maker:init`, rather than in the section for unclassified commands.
    command[PROJECT_COMMAND_FLAG] = true;
    added.push(command.name());
  }

  return { loaded: true, file, added };
}

/**
 * Why: Creates maker/commands.mjs so a project can add its own commands.
 * When: A developer runs `maker maker:init`.
 * Where: utils/project-commands.mjs.
 * How: Writes the template with the same no-clobber default as every other
 *      generator, so an existing file is left alone unless --force is given.
 */
export async function initProjectCommands(cwd = process.cwd(), { force = false } = {}) {
  const file = path.resolve(cwd, PROJECT_COMMANDS_PATH);

  if (force) {
    await writeFileAlways(file, PROJECT_COMMANDS_TEMPLATE);
    return { file, created: false, overwritten: true };
  }

  await fsPromises.mkdir(path.dirname(file), { recursive: true });
  const created = await writeFileIfMissing(file, PROJECT_COMMANDS_TEMPLATE);
  return { file, created, overwritten: false };
}
