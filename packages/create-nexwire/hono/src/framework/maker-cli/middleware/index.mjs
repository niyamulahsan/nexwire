import { makeMiddleware } from "./core.mjs";

/** Register middleware:* subcommands on the CLI program. */
export function registerMiddlewareCommands(program, rawArgs) {
  program
    .command("middleware:make <name>")
    .description("Generate a middleware file in src/middlewares")
    .option("--force", "Overwrite existing middleware file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (name) => makeMiddleware(name, rawArgs.filter((arg) => arg.startsWith("--"))));
}