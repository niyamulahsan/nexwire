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

/**
 * Marks a command as coming from the project's own maker/commands.mjs, so the
 * help screen can put it beside `maker:init` instead of in the fallback section.
 * Set by registerProjectCommands, read by groupCommands below.
 */
export const PROJECT_COMMAND_FLAG = "makerProjectCommand";

/** Where a command nobody classified ends up. Better labelled than missing. */
export const FALLBACK_GROUP_TITLE = "Other commands";

/**
 * Why: Groups the top-level command list so a developer can find a command by
 * the question they are asking rather than by scrolling 57 flat lines.
 * When: `maker --help`, and the help commander prints for an unknown command.
 * Where: Maker CLI help rendering, applied by configureGroupedHelp.
 * How: Explicit name lists rather than prefix patterns. A `module:make-*`
 *      pattern would also swallow `module:migrate` and `module:make-notification`
 *      into the generators section, and a command filed under the wrong heading
 *      is worse than an extra line of configuration here. The cost is that a new
 *      command must be added here too - which is the intent, because
 *      __tests__/help.test.ts fails when it is not, so nothing can be quietly
 *      dropped from the screen.
 *
 *      Names only, no argument or option markers. Commander's default listing
 *      prints `[options] <module> <name>`, which pushed the description column
 *      to 47 characters and left almost no room to say what anything did. That
 *      detail is still one command away: `maker <command> --help`.
 */
const COMMAND_GROUPS = [
  {
    title: "Getting started",
    commands: ["dev", "serve", "ui:dev", "admin:dev", "maildev:view", "redis:view", "vite:cache:clear"]
  },
  {
    title: "Generators - global",
    // Deliberately separated from the module generators. `middleware:make`
    // writes to src/middlewares and applies to the whole app;
    // `module:make-middleware` writes inside one module and applies only to it.
    // In the same section the two look interchangeable, which is exactly the
    // mistake a developer is about to make.
    commands: ["middleware:make"]
  },
  {
    title: "Generators - modules",
    commands: [
      "module:make",
      "module:make-notification",
      "module:make-model",
      "module:make-schema",
      "module:make-service",
      "module:make-controller",
      "module:make-route",
      "module:make-job",
      "module:make-console",
      "module:make-seeder",
      "module:make-test",
      "module:make-helper",
      "module:make-middleware",
      "module:make-type"
    ]
  },
  {
    title: "Modules - manage",
    commands: [
      "module:list",
      "module:seed",
      "module:migrate",
      "module:delete",
      "module:delete-notification",
      "module:trash:clean"
    ]
  },
  {
    title: "Database",
    commands: [
      "db",
      "db:schema",
      "db:generate",
      "db:migrate",
      "db:migrate:run",
      "db:migrate:reset",
      "db:fresh",
      "db:seed",
      "db:module:seed",
      "db:status",
      "db:push",
      "db:check",
      "db:studio",
      "db:reset",
      "db:wipe"
    ]
  },
  {
    title: "Queue and scheduler",
    commands: ["queue:work", "queue:clear", "schedule:work"]
  },
  {
    title: "Deploy",
    commands: [
      "deploy:init",
      "deploy:db:import",
      "deploy:db:import:remote",
      "deploy:workflow",
      "deploy:workflow:remote",
      "deploy:workflow:promote"
    ]
  },
  {
    title: "Testing",
    commands: ["test", "test:watch", "test:coverage", "test:ui"]
  },
  {
    title: "Your commands",
    commands: ["maker:init"],
    includeProjectCommands: true
  }
];

/** Widest name column before descriptions start on their own space anyway. */
const MAX_TERM_WIDTH = 30;
const MIN_DESCRIPTION_WIDTH = 28;

/**
 * Why: Sorts commands into their display sections.
 * When: Rendering `maker --help`, and asserted directly by the tests.
 * Where: Maker CLI help rendering.
 * How: Walks COMMAND_GROUPS in declared order and claims each named command.
 *      Anything left over goes to a fallback section rather than disappearing,
 *      so a newly added command is visible even in the moment before anyone
 *      decides where it belongs.
 */
export function groupCommands(commands) {
  const visible = commands.filter((command) => !command._hidden);
  const claimed = new Set();
  const groups = [];

  for (const group of COMMAND_GROUPS) {
    const members = [];

    for (const name of group.commands) {
      const command = visible.find((candidate) => candidate.name() === name && !claimed.has(name));
      if (command) {
        members.push(command);
        claimed.add(name);
      }
    }

    if (group.includeProjectCommands) {
      for (const command of visible) {
        if (command[PROJECT_COMMAND_FLAG] && !claimed.has(command.name())) {
          members.push(command);
          claimed.add(command.name());
        }
      }
    }

    if (members.length > 0) {
      groups.push({ title: group.title, commands: members });
    }
  }

  const leftovers = visible.filter((command) => !claimed.has(command.name()));
  if (leftovers.length > 0) {
    groups.push({ title: FALLBACK_GROUP_TITLE, commands: leftovers });
  }

  return groups;
}

/**
 * Why: The plain-text header, and the ASCII wordmark used when there is room.
 * When: Rendering the top of `maker --help`.
 * Where: Maker CLI help rendering.
 * How: The wordmark is a fixed literal. figlet was used to design it offline and
 *      is deliberately not a dependency: the CLI runs from source inside the
 *      user's project, so a runtime figlet would mean every scaffolded project
 *      installs it purely to print five fixed lines. Nothing is computed here.
 *
 *      Three rules keep it from getting in the developer's way, which is the
 *      only thing a banner has to be careful about:
 *
 *        1. A terminal narrower than the art gets plain text, because art that
 *           overflows wraps into an unreadable mess.
 *        2. Piped output gets plain text. Nobody asked for a wordmark at the top
 *           of their log file, and `maker > out.txt` should stay readable.
 *        3. Per-command help gets no banner at all - see configureGroupedHelp.
 */
const NEXWIRE_WORDMARK = [
  "                             _",
  "   ____  ___  _  ___      __(_)_______",
  "  / __ \\/ _ \\| |/_/ | /| / / / ___/ _ \\",
  " / / / /  __/>  < | |/ |/ / / /  /  __/",
  "/_/ /_/\\___/_/|_| |__/|__/_/_/   \\___/"
];

const PLAIN_HEADER = "nexwire maker";

/** Widest wordmark line, measured from the literal above. */
const WORDMARK_WIDTH = Math.max(...NEXWIRE_WORDMARK.map((line) => line.length));

/** Two columns of breathing room, so the art never touches the window edge. */
const MINIMUM_TERMINAL_WIDTH = WORDMARK_WIDTH + 2;

export function makerBanner(stream = process.stdout) {
  if (!stream.isTTY) return PLAIN_HEADER;
  if ((stream.columns || 80) < MINIMUM_TERMINAL_WIDTH) return PLAIN_HEADER;
  return NEXWIRE_WORDMARK.join("\n");
}

/**
 * Why: Replaces the top-level help screen with the grouped one.
 * When: Once, while building the program, before anything prints help.
 * Where: Maker CLI entry flow, alongside the other program configuration.
 * How: Overrides commander's formatHelp and rebuilds the screen from the
 *      documented Help helpers (commandUsage, visibleOptions, subcommandTerm).
 *      Deliberately not string surgery on commander's output: that would depend
 *      on the exact shape of its "Commands:" heading and break on a version bump.
 *      Per-command help is left to commander, so `maker <command> --help` is
 *      unchanged and carries no wordmark.
 */
export function configureGroupedHelp(program, { stream = process.stdout } = {}) {
  program.configureHelp({
    formatHelp(cmd, helper) {
      const width = helper.helpWidth || stream.columns || 100;
      // commandUsage returns the bare "maker [options] [command]"; the heading
      // word is styled separately by commander and is not part of that string.
      const blocks = [];

      // cmd.parent is null only for the top-level program, which is what makes
      // the wordmark an overview-only flourish rather than something on screen
      // every time someone checks a flag.
      if (!cmd.parent) blocks.push(makerBanner(stream));

      blocks.push(`Usage: ${helper.commandUsage(cmd)}`);

      const description = helper.commandDescription(cmd);
      if (description) blocks.push(description);

      const options = helper.visibleOptions(cmd);
      if (options.length > 0) {
        blocks.push(renderTable("Options", options.map((option) => [helper.optionTerm(option), helper.optionDescription(option)]), width));
      }

      const argumentsList = helper.visibleArguments(cmd);
      if (argumentsList.length > 0) {
        blocks.push(
          renderTable(
            "Arguments",
            argumentsList.map((argument) => [helper.argumentTerm(argument), helper.argumentDescription(argument)]),
            width
          )
        );
      }

      for (const group of groupCommands(cmd.commands)) {
        blocks.push(
          renderTable(
            group.title,
            group.commands.map((command) => [command.name(), helper.subcommandDescription(command)]),
            width
          )
        );
      }

      // Commander adds its own `help [command]` lazily, after this formatter has
      // already run, so the command is working but cannot be listed here. Rather
      // than drop it silently, name both spellings in the footer - and prefer
      // that to a heading containing one leftover entry, which reads as a
      // mistake. __tests__/help.test.ts asserts `maker help <command>` works.
      blocks.push("Run `maker <command> --help`, or `maker help <command>`, for the options and arguments of one command.");

      return `${blocks.join("\n\n")}\n`;
    }
  });
}

/** Renders one `Heading:` block of `name  description` rows. Exported for tests. */
export function renderTable(heading, rows, width) {
  const termWidth = Math.min(MAX_TERM_WIDTH, Math.max(0, ...rows.map(([term]) => term.length)));
  const descriptionWidth = Math.max(MIN_DESCRIPTION_WIDTH, width - termWidth - 4);

  const lines = [`${heading}:`];

  for (const [term, description] of rows) {
    const gap = Math.max(2, termWidth - term.length + 2);
    // A continuation line must start where the description started, not at the
    // left edge. That column is 2 (indent) + termWidth (widest term) + gap.
    const descriptionColumn = 2 + termWidth + gap;
    const indent = " ".repeat(descriptionColumn);

    if (!description) {
      lines.push(`  ${term}`);
      continue;
    }

    const wrapped = wrapText(description, descriptionWidth);
    lines.push(`  ${term}${" ".repeat(gap)}${wrapped[0]}`);
    for (const line of wrapped.slice(1)) lines.push(`${indent}${line}`);
  }

  return lines.join("\n");
}

/** Greedy word wrap. Keeps a long description readable instead of one huge line. */
function wrapText(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines = [];
  let line = "";

  for (const word of words) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);

  return lines;
}
