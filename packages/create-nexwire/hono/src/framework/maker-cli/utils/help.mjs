/**
 * Why: Detects the package manager used to run the CLI, for help usage text.
 * When: Building the program name shown in the "Usage:" line.
 * Where: Maker CLI entry flow.
 * How: Reads npm config user-agent and maps to the corresponding prefix string.
 */
export function makerCommandPrefix() {
  const ua = String(process.env.npm_config_user_agent || "").toLowerCase();
  if (ua.startsWith("pnpm/")) return "pnpm";
  if (ua.startsWith("yarn/")) return "yarn";
  if (ua.startsWith("bun/")) return "bun";
  if (ua.startsWith("npm/")) return "npm run";
  return "";
}

/**
 * Why: Overrides Commander's help so the subcommand listing shows the actual
 * long flags (e.g. `--app-only|--server-only|--dev`) instead of a generic
 * `[options]` marker.
 * When: Building the CLI program before commands are registered.
 * Where: Maker CLI entry flow.
 * How: Injects a custom `subcommandTerm` via `configureHelp`.
 */
export function configureDeployHelp(program) {
  program.configureHelp({
    subcommandTerm(cmd) {
      const flags = cmd.options
        .map((option) => option.flags.split(" ")[0])
        .filter((flag) => flag.startsWith("--"))
        .join("|");
      const args = cmd.registeredArguments.map((arg) => humanReadableArgName(arg)).join(" ");
      return cmd.name() + (flags ? ` [${flags}]` : "") + (args ? ` ${args}` : "");
    }
  });
}

function humanReadableArgName(arg) {
  const nameOutput = arg.name() + (arg.variadic === true ? "..." : "");
  return arg.required ? `<${nameOutput}>` : `[${nameOutput}]`;
}

/**
 * Why: Shows commander-generated help for the maker CLI program.
 * When: CLI runs without a valid command.
 * Where: Maker CLI entry flow and error handlers.
 * How: Delegates to commander's outputHelp for consistent automatically-synced output.
 */
export function showHelp(program) {
  program.outputHelp();
}
