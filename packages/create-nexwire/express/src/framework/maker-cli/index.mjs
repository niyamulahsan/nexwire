#!/usr/bin/env node

import { Command } from "commander";
import { config } from "dotenv";
import { registerDbCommands } from "./db/index.mjs";
import { registerMiddlewareCommands } from "./middleware/index.mjs";
import { registerModuleCommands } from "./module/index.mjs";
import { registerRuntimeCommands } from "./runtime/index.mjs";
import { makerCommandPrefix, showHelp } from "./utils/help.mjs";
import { registerProjectCommands } from "./utils/project-commands.mjs";

const args = process.argv.slice(2);
const [command] = args;

let deployCommands = new Set();
let registerDeployCommands = () => {};

try {
  const deploy = await import("./deploy/index.mjs");
  deployCommands = deploy.deployCommands;
  registerDeployCommands = deploy.registerDeployCommands;
} catch {
  /* deploy module not available until user runs deploy:init */
}

if (!deployCommands.has(command || "")) {
  config({ path: ".env", quiet: true });
}

try {
  const program = new Command();
  const namePrefix = makerCommandPrefix();
  program
    .name(namePrefix ? `${namePrefix} maker` : "maker")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption("-h, --help")
    .addHelpText("beforeAll", "nexwire maker\n");

  registerMiddlewareCommands(program, args);
  registerModuleCommands(program, args);
  registerDeployCommands(program, args);
  registerDbCommands(program, args);
  registerRuntimeCommands(program, args);

  // The project's own commands come last, so a built-in always wins a name
  // clash. Absent file is silent and free; a file that is present but broken
  // throws, and the catch below reports it and exits rather than leaving the
  // developer with commands that silently do not exist.
  await registerProjectCommands(program, args);

  if (!command) {
    showHelp(program);
  } else {
    await program.parseAsync(args, { from: "user" });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
