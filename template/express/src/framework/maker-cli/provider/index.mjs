import { makeProvider } from "./core.mjs";

/** Register provider:* subcommands on the CLI program. */
export function registerProviderCommands(program, rawArgs) {
  program
    .command("provider:make <name>")
    .description("Generate a provider file in src/providers")
    .option("--force", "Overwrite existing provider file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (name) => makeProvider(name, rawArgs.filter((arg) => arg.startsWith("--"))));
}
