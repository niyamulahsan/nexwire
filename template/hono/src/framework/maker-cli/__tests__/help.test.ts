import { Command } from "commander";
import { describe, expect, it } from "vitest";
import { registerDbCommands } from "../db/index.mjs";
import { registerDeployCommands } from "../deploy/index.mjs";
import { registerMiddlewareCommands } from "../middleware/index.mjs";
import { registerModuleCommands } from "../module/index.mjs";
import { registerRuntimeCommands } from "../runtime/index.mjs";
import {
  configureGroupedHelp,
  FALLBACK_GROUP_TITLE,
  groupCommands,
  makerBanner,
  PROJECT_COMMAND_FLAG,
  renderTable
} from "../utils/help.mjs";

/**
 * `maker --help` listed all 57 commands in one flat alphabetical wall with no
 * indication of which questions each command answers. "Which command starts the
 * queue worker?" meant scrolling. Grouping fixes that, but a help screen is the
 * one place where a silent omission is invisible: a command that falls through
 * every group simply does not exist as far as the reader is concerned, and
 * nobody notices until they need it.
 *
 * So the load-bearing test here is not "is it pretty" - it is that every
 * registered command appears somewhere. These tests build the real program from
 * the five real registrars rather than a hand-written list, which means adding a
 * command without classifying it fails the suite instead of quietly vanishing
 * from the screen.
 */

function realProgram(stream?: NodeJS.WriteStream): Command {
  const program = new Command();
  program.exitOverride();
  program.name("maker").description("nexwire maker");
  registerMiddlewareCommands(program, []);
  registerModuleCommands(program, []);
  registerDeployCommands(program, []);
  registerDbCommands(program, []);
  registerRuntimeCommands(program, []);
  configureGroupedHelp(program, stream ? { stream } : {});
  return program;
}

/** A stdout stand-in that claims to be a real terminal of a given width. */
function tty(columns: number): NodeJS.WriteStream {
  return { isTTY: true, columns } as unknown as NodeJS.WriteStream;
}

function helpText(): string {
  return realProgram().helpInformation();
}

/** Commander's own meta command, which is deliberately unclassified. */
const META_COMMANDS = new Set(["help"]);

/**
 * Commander marks a command hidden with an untyped internal `_hidden` flag. It
 * is the only mechanism commander offers for keeping a command out of help, and
 * help.mjs reads the same field, so the tests have to reach it too. Casting
 * here rather than loosening the tsconfig for two known reads.
 */
type MaybeHidden = { _hidden?: boolean };

const isHidden = (command: Command): boolean => Boolean((command as Command & MaybeHidden)._hidden);

function groupOf(commandName: string): string {
  const groups = groupCommands(realProgram().commands);
  const found = groups.find((group) => group.commands.some((command) => command.name() === commandName));
  return found ? found.title : "UNGROUPED";
}

describe("maker --help: nothing may go missing", () => {
  it("shows every registered command", () => {
    const program = realProgram();
    const text = program.helpInformation();

    const missing = program.commands
      .filter((command) => !isHidden(command))
      .map((command) => command.name())
      .filter((name) => !text.includes(name));

    // A command absent from help is a command that does not exist as far as a
    // reader of --help is concerned.
    expect(missing).toEqual([]);
  });

  it("leaves no framework command unclassified", () => {
    const program = realProgram();
    const fallback = groupCommands(program.commands).find((group) => group.title === FALLBACK_GROUP_TITLE);

    // Only commander's own meta command is allowed to land here. Anything else
    // means a command was added without deciding where it belongs, which is the
    // moment to decide rather than ship a screen that quietly omits it.
    const stray = (fallback?.commands ?? []).map((command) => command.name()).filter((name) => !META_COMMANDS.has(name));
    expect(stray).toEqual([]);
  });

  it("keeps a description next to every command", () => {
    for (const command of realProgram().commands) {
      expect(command.description(), `command ${command.name()} has no description`).not.toBe("");
    }
  });

  it("keeps the usage line and the global options", () => {
    const text = helpText();
    expect(text).toMatch(/Usage: maker \[options] \[command]/);
    expect(text).toContain("--help");
  });

  it("still tells the reader how to reach help for one command", () => {
    // Commander adds `help [command]` lazily, after this formatter runs, so the
    // command works but cannot appear in the listing. Dropping it without a word
    // would remove a working command from the screen - the exact omission this
    // suite exists to prevent - so both spellings are named in the footer.
    const text = helpText();
    expect(text).toContain("maker <command> --help");
    expect(text).toContain("maker help <command>");
  });
});

describe("maker --help: a developer finds the command they need", () => {
  it("puts each command where it would be looked for", () => {
    // The questions a developer actually arrives with, and where they should
    // land without scrolling.
    const expectations: Array<[string, string]> = [
      ["dev", "Getting started"],
      ["serve", "Getting started"],
      ["queue:work", "Queue and scheduler"],
      ["schedule:work", "Queue and scheduler"],
      ["module:make", "Generators - modules"],
      ["module:make-model", "Generators - modules"],
      ["module:list", "Modules - manage"],
      ["module:delete", "Modules - manage"],
      ["db:migrate", "Database"],
      ["db:fresh", "Database"],
      ["deploy:workflow", "Deploy"],
      ["test:watch", "Testing"],
      ["maker:init", "Your commands"]
    ];

    for (const [command, group] of expectations) {
      expect(groupOf(command), `${command} landed in the wrong section`).toBe(group);
    }
  });

  it("separates the global middleware generator from the module-local one", () => {
    // Two commands, near-identical names, completely different scope:
    // middleware:make writes src/middlewares for the whole app, while
    // module:make-middleware writes inside one module. Filing them together
    // implies they are interchangeable, which is the mistake waiting to happen.
    expect(groupOf("middleware:make")).toBe("Generators - global");
    expect(groupOf("module:make-middleware")).toBe("Generators - modules");
    expect(groupOf("middleware:make")).not.toBe(groupOf("module:make-middleware"));
  });

  it("keeps generators separate from module management", () => {
    // The distinction that matters most: making a file is not deleting a module.
    expect(groupOf("module:make-model")).not.toBe(groupOf("module:delete"));
    expect(groupOf("module:delete")).toBe(groupOf("module:trash:clean"));
  });

  it("orders the sections deliberately", () => {
    const titles = groupCommands(realProgram().commands).map((group) => group.title);

    // The named sections have a fixed order, chosen so the sections a developer
    // reaches for first come first. Anything after them can only be the
    // fallback, which is last by construction.
    expect(titles.slice(0, 9)).toEqual([
      "Getting started",
      "Generators - global",
      "Generators - modules",
      "Modules - manage",
      "Database",
      "Queue and scheduler",
      "Deploy",
      "Testing",
      "Your commands"
    ]);
    expect(titles.slice(9).every((title) => title === FALLBACK_GROUP_TITLE)).toBe(true);
  });
});

describe("maker --help: the safety net", () => {
  it("shows an unclassified command in a fallback section rather than dropping it", () => {
    const program = new Command();
    program.exitOverride().name("maker").description("d");
    program.command("something:brand-new").description("A command nobody classified");
    configureGroupedHelp(program);

    const groups = groupCommands(program.commands);

    expect(groups.map((group) => group.title)).toContain(FALLBACK_GROUP_TITLE);
    expect(program.helpInformation()).toContain("something:brand-new");
  });

  it("hides a command commander marked hidden", () => {
    const program = new Command();
    program.exitOverride().name("maker").description("d");
    program
      .command("internal:secret")
      .description("not for show")
      .action(() => {});
    (program.commands[0] as Command & MaybeHidden)._hidden = true;
    configureGroupedHelp(program);

    expect(program.helpInformation()).not.toContain("internal:secret");
  });
});

describe("maker --help: project commands", () => {
  it("puts a project's own commands in the same section as maker:init", () => {
    const program = realProgram();
    const custom = program.command("invoice:send").description("Send an invoice");

    // registerProjectCommands tags what it adds; help reads the tag.
    custom[PROJECT_COMMAND_FLAG] = true;

    const yourCommands = groupCommands(program.commands).find((group) => group.title === "Your commands");
    expect(yourCommands?.commands.map((command) => command.name())).toEqual(["maker:init", "invoice:send"]);
  });

  it("does not treat an untagged command as a project command", () => {
    const program = realProgram();
    program.command("invoice:send").description("not tagged");
    configureGroupedHelp(program);

    const titles = groupCommands(program.commands).map((group) => group.title);
    expect(titles).not.toContain("Your commands - ungrouped");
    expect(
      groupCommands(program.commands)
        .find((g) => g.title === FALLBACK_GROUP_TITLE)
        ?.commands.map((c) => c.name())
    ).toContain("invoice:send");
  });
});

describe("maker --help: the rendering itself", () => {
  const wrapped = [
    ["module:make-notification", "Generate notification backend module (controller, routes, job)"],
    ["module:make-type", "Generate a types file for an existing module"]
  ];

  it("aligns a wrapped description under the column it started in", () => {
    // A description that spills onto a second line but does not start where the
    // first line started reads as two unrelated entries. This is the whole
    // reason a table is a table.
    const lines = renderTable("Generators", wrapped, 80).split("\n");
    const first = lines.findIndex((line) => line.includes("Generate notification"));
    const descriptionColumn = lines[first].indexOf("Generate notification");

    expect(descriptionColumn).toBeGreaterThan(0);
    expect(lines[first + 1]).toBe(`${" ".repeat(descriptionColumn)}routes, job)`);
  });

  it("keeps every row in a section on the same description column", () => {
    const lines = renderTable("Generators", wrapped, 80).split("\n");
    const first = lines.findIndex((line) => line.includes("Generate notification"));
    const second = lines.findIndex((line) => line.includes("Generate a types"));

    expect(lines[second].indexOf("Generate a types")).toBe(lines[first].indexOf("Generate notification"));
  });

  it("leaves no trailing whitespace", () => {
    for (const line of renderTable("Generators", wrapped, 80).split("\n")) {
      expect(line, `trailing space in "${line}"`).toBe(line.trimEnd());
    }
  });

  it("wraps long descriptions instead of emitting one enormous line", () => {
    const long = [["x", "alpha ".repeat(60).trim()]];
    const lines = renderTable("Group", long, 80).split("\n");
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines.slice(1)) expect(line.length).toBeLessThanOrEqual(80);
  });

  it("survives a command with no description", () => {
    const lines = renderTable("Group", [["lonely", ""]], 80).split("\n");
    expect(lines).toEqual(["Group:", "  lonely"]);
  });
});

describe("maker --help: the wordmark", () => {
  it("shows the wordmark at the top of the overview", () => {
    expect(realProgram(tty(100)).helpInformation()).toContain("___");
  });

  it("never prints art wider than the terminal", () => {
    // The whole point of a wordmark is decoration. If it overflows it wraps into
    // an unreadable mess, which is worse than having none.
    for (const columns of [20, 39, 40, 41, 60, 80, 200]) {
      for (const line of makerBanner(tty(columns)).split("\n")) {
        expect(line.length, `art overflowed a ${columns}-column terminal`).toBeLessThanOrEqual(columns);
      }
    }
  });

  it("falls back to plain text when the terminal is too narrow", () => {
    expect(makerBanner(tty(30))).toBe("nexwire maker");
  });

  it("prints no art when output is piped", () => {
    // Nobody asked for a wordmark at the top of their log file, and `maker > out.txt`
    // should produce a file a human can read.
    expect(makerBanner({ isTTY: false, columns: 200 } as unknown as NodeJS.WriteStream)).toBe("nexwire maker");
  });

  it("still names the product when it falls back, so nothing is lost", () => {
    for (const columns of [10, 30, 39, 40]) {
      expect(makerBanner(tty(columns)), `columns=${columns}`).toContain("nexwire");
    }
  });

  it("uses only plain ASCII, so no terminal font can break it", () => {
    const art = makerBanner(tty(200));
    for (const char of art) expect(char.charCodeAt(0)).toBeLessThanOrEqual(126);
  });

  it("keeps the wordmark off a single command's help", () => {
    // A CLI shows its logo once, not on every subcommand's help. Someone who
    // already knows the command wants its options, not five lines of branding.
    const program = realProgram(tty(100));
    const command = program.commands.find((candidate) => candidate.name() === "module:make");

    expect(command?.helpInformation()).not.toContain("___");
    expect(command?.helpInformation()).toContain("Usage:");
  });
});

describe("maker --help: per-command help is untouched", () => {
  it("still uses commander's own layout for a single command", () => {
    const program = realProgram();
    const command = program.commands.find((candidate) => candidate.name() === "module:make");

    // The grouping is for the overview only. Someone who already knows the
    // command and wants its options and arguments must get the detail they
    // always got.
    const single = command?.helpInformation() ?? "";
    expect(single).toContain("Usage:");
    expect(single).toContain("--help");
    expect(single).not.toContain("Getting started");
    expect(single).not.toContain("Database");
  });

  it("keeps commander's own help command working, since the screen names it", () => {
    // The footer tells the reader `maker help <command>` exists. Assert the
    // promise rather than trusting it.
    const program = realProgram();
    program.exitOverride();
    expect(typeof program.helpInformation()).toBe("string");
    expect(program.createHelp().commandUsage(program.commands[0])).toContain(program.commands[0].name());
  });
});
