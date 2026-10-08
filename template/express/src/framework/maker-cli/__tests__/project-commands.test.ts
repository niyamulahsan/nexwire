import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  initProjectCommands,
  PROJECT_COMMANDS_PATH,
  PROJECT_COMMANDS_TS_PATH,
  registerProjectCommands
} from "../utils/project-commands.mjs";

/**
 * A project can add its own maker commands from a file it owns. Two properties
 * matter more than the feature itself, and both are easy to get wrong:
 *
 * 1. Absent must be silent. Almost every project will not have the file, so the
 *    common path has to cost nothing and say nothing.
 * 2. Broken must be loud. If the file exists but throws, or exports the wrong
 *    shape, the developer's commands silently not existing is far worse than an
 *    error - they will debug their own code looking for a bug that is in the
 *    loader. So nothing here is swallowed.
 *
 * The framework's own command names stay authoritative. A project that happens
 * to register `module:make` gets told why its command did not appear, rather
 * than shadowing a built-in at random.
 */

let workdir: string;
let output: string[];

beforeEach(async () => {
  workdir = await mkdtemp(path.join(tmpdir(), "maker-commands-"));
  output = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  });
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    output.push(args.map(String).join(" "));
  });
});

afterEach(async () => {
  await rm(workdir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** A program carrying one stand-in framework command. */
function programWith(frameworkCommand = "module:make") {
  const program = new Command();
  program.exitOverride();
  program
    .command(frameworkCommand)
    .description("a framework command")
    .action(() => {});
  return program;
}

async function writeProjectFile(source: string) {
  const file = path.join(workdir, PROJECT_COMMANDS_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
  return file;
}

async function writeTsProjectFile(source: string) {
  const file = path.join(workdir, PROJECT_COMMANDS_TS_PATH);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, source, "utf8");
  return file;
}

const validProject = `export default function register(program) {
  program.command("invoice:make <customer>").action((customer) => {
    console.log("made invoice for " + customer);
  });
}`;

describe("maker: absent project command file", () => {
  it("does nothing and says nothing when the project has not opted in", async () => {
    const program = programWith();
    const result = await registerProjectCommands(program, [], workdir);

    expect(result.loaded).toBe(false);
    expect(program.commands.map((c) => c.name())).toEqual(["module:make"]);
    // Silence is the requirement: almost every project has no such file.
    expect(output).toEqual([]);
  });

  it("reports the path it looked at, so a missing file is diagnosable", async () => {
    const result = await registerProjectCommands(programWith(), [], workdir);
    expect(result.file.replace(/\\/g, "/")).toContain(PROJECT_COMMANDS_PATH);
  });
});

describe("maker: a valid project command file", () => {
  it("registers the project's commands alongside the framework's", async () => {
    await writeProjectFile(validProject);
    const program = programWith();

    const result = await registerProjectCommands(program, [], workdir);

    expect(result.loaded).toBe(true);
    expect(result.added).toEqual(["invoice:make"]);
    expect(program.commands.map((c) => c.name())).toEqual(["module:make", "invoice:make"]);
  });

  it("produces a command that actually runs", async () => {
    await writeProjectFile(validProject);
    const program = programWith();
    await registerProjectCommands(program, [], workdir);

    // Dispatch for real. A command that is registered but not wired is worse
    // than one that is missing, because the developer gets a usage error naming
    // a command they can see in help.
    await program.parseAsync(["invoice:make", "acme"], { from: "user" });

    expect(output.join("\n")).toContain("made invoice for acme");
  });

  it("accepts a named register export as well as a default one", async () => {
    await writeProjectFile(`export function register(program) {
      program.command("report:daily").action(() => {});
    }`);
    const result = await registerProjectCommands(programWith(), [], workdir);
    expect(result.added).toEqual(["report:daily"]);
  });
});

/**
 * maker/commands.ts - the TypeScript twin of maker/commands.mjs. Plain node
 * cannot load it, so the loader registers tsx first; every rule from the
 * .mjs describes above applies unchanged: absent silent, broken loud with the
 * file named, framework names authoritative. The only new question is what
 * happens when a project keeps both files, and the answer follows the
 * collision rule: the incumbent (.mjs) keeps running and the developer is
 * told the other file was skipped - never a silent second registration.
 */
describe("maker: a TypeScript project command file", () => {
  it("loads maker/commands.ts, strips its types and registers the commands", async () => {
    await writeTsProjectFile(`const spoken: string = "ts says hi";
export default function register(program: any): void {
  program.command("ts:hello <name>").action((name: string) => {
    console.log(spoken + " " + name);
  });
}`);

    const program = programWith();
    const result = await registerProjectCommands(program, [], workdir);

    expect(result.loaded).toBe(true);
    expect(result.file.replace(/\\/g, "/")).toContain(PROJECT_COMMANDS_TS_PATH);
    expect(result.added).toEqual(["ts:hello"]);

    // A registration that cannot dispatch is worse than none: prove the
    // command runs end to end, types and all.
    await program.parseAsync(["ts:hello", "ada"], { from: "user" });
    expect(output.join("\n")).toContain("ts says hi ada");
  });

  it("resolves the project's @/ alias inside the TypeScript file", async () => {
    // The whole reason a project reaches for commands.ts: importing its own
    // source through the tsconfig alias, which plain node cannot do. The
    // value must travel all the way to the registered command.
    await writeTsProjectFile(`import { PROJECT_COMMANDS_PATH } from "@/framework/maker-cli/utils/project-commands.mjs";

export default function register(program: any): void {
  program
    .command("ts:alias")
    .description("loaded via @/: " + PROJECT_COMMANDS_PATH)
    .action(() => {});
}`);

    const program = programWith();
    const result = await registerProjectCommands(program, [], workdir);

    expect(result.loaded).toBe(true);
    const alias = program.commands.find((c) => c.name() === "ts:alias");
    expect(alias?.description()).toBe("loaded via @/: maker/commands.mjs");
  });

  it("supports importing TypeScript from inside a command action", async () => {
    // The developer's real workload: simulate.ts/certify.ts live in src/ and
    // are imported when the command runs, not when it registers.
    await mkdir(path.join(workdir, "tooling"), { recursive: true });
    await writeFile(
      path.join(workdir, "tooling", "greet.ts"),
      `export function greet(name: string): string {
  return "hello " + name;
}
`,
      "utf8"
    );
    await writeTsProjectFile(`import { greet } from "../tooling/greet.ts";

export default function register(program: any): void {
  program.command("ts:greet <name>").action((name: string) => console.log(greet(name)));
}`);

    const program = programWith();
    await registerProjectCommands(program, [], workdir);
    await program.parseAsync(["ts:greet", "ada"], { from: "user" });

    expect(output.join("\n")).toContain("hello ada");
  });

  it("names maker/commands.ts when the TypeScript file throws at load", async () => {
    await writeTsProjectFile(`throw new Error("boom from the ts project file");`);

    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(
      /Could not load maker\/commands\.ts: boom from the ts project file/
    );
  });

  it("keeps maker/commands.mjs running when both files exist, and says so", async () => {
    await writeProjectFile(validProject);
    await writeTsProjectFile(`export default function register(program: any): void {
  program.command("ts:should-not-load").action(() => {});
}`);

    const program = programWith();
    const result = await registerProjectCommands(program, [], workdir);

    // The .mjs already ran in this project; a stray .ts must not silently
    // take over or double-register. The loser is named so it gets deleted.
    expect(result.added).toEqual(["invoice:make"]);
    expect(program.commands.map((c) => c.name())).not.toContain("ts:should-not-load");
    expect(output.join("\n")).toContain(PROJECT_COMMANDS_TS_PATH);
  });
});

describe("maker: a broken project command file", () => {
  it("propagates a syntax error instead of hiding it", async () => {
    // The failure this prevents: the file has a typo, the loader swallows the
    // error, every project command silently does not exist, and the developer
    // debugs their own command instead of the loader.
    await writeProjectFile("export default function register(program) { this is not javascript }");

    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow();
  });

  it("propagates an error thrown while the file is being evaluated", async () => {
    await writeProjectFile(`throw new Error("boom from the project file");`);
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(/boom from the project file/);
  });

  it("names the file when the file throws at load time", async () => {
    // Without the path attached this reads as a framework error, and the
    // developer has no way to know their own file is the source.
    await writeProjectFile(`throw new Error("boom from the project file");`);
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(
      /Could not load maker\/commands\.mjs: boom from the project file/
    );
  });

  it("names the file when the file cannot be parsed", async () => {
    await writeProjectFile("export default function register( { this is not javascript }");
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(/Could not load maker\/commands\.mjs/);
  });

  it("names the path when the file exports the wrong shape", async () => {
    await writeProjectFile("export const notAFunction = 1;");
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(
      new RegExp(`${PROJECT_COMMANDS_PATH.replace(/\//g, "\\/")}.*default function`)
    );
  });

  it("names the path when the file exports nothing at all", async () => {
    await writeProjectFile("// nothing here");
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(/maker\/commands\.mjs/);
  });
});

describe("maker: a project command that reuses a framework name", () => {
  const colliding = `export default function register(program) {
    program.command("module:make").action(() => {});
  }`;

  it("refuses the name and says which file asked for it", async () => {
    await writeProjectFile(colliding);

    // Commander refuses a duplicate name on its own, which is the outcome we
    // want: a project cannot shadow a built-in it did not write. Its message
    // does not say which file made the request, so the error is re-thrown with
    // the path attached - otherwise the developer has no idea where to look.
    await expect(registerProjectCommands(programWith(), [], workdir)).rejects.toThrow(
      /Could not register commands from maker\/commands\.mjs.*module:make/
    );
  });

  it("leaves the framework command intact", async () => {
    await writeProjectFile(colliding);
    const program = programWith();

    await expect(registerProjectCommands(program, [], workdir)).rejects.toThrow();

    const remaining = program.commands.filter((c) => c.name() === "module:make");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].description()).toBe("a framework command");
  });

  it("does not register a shadowed command under another name", async () => {
    // A near-miss is still a distinct command and must be left alone: the guard
    // is about exact names, not about being over-cautious with someone else's
    // namespace.
    await writeProjectFile(`export default function register(program) {
      program.command("module:make-report").action(() => {});
    }`);

    const result = await registerProjectCommands(programWith(), [], workdir);
    expect(result.added).toEqual(["module:make-report"]);
  });
});

describe("maker:init", () => {
  it("creates the file where the loader looks for it", async () => {
    await initProjectCommands(workdir);

    const file = path.join(workdir, PROJECT_COMMANDS_PATH);
    expect(existsSync(file)).toBe(true);
    expect(await readFile(file, "utf8")).toContain("export default");
  });

  it("produces a file the loader then accepts, with a working command", async () => {
    // The round trip is the test that matters. A template that does not load is
    // worse than no template, because it teaches the wrong shape.
    await initProjectCommands(workdir);

    const program = programWith();
    const result = await registerProjectCommands(program, [], workdir);

    expect(result.loaded).toBe(true);
    expect(result.added.length).toBeGreaterThan(0);
    await program.parseAsync([result.added[0], "acme"], { from: "user" });
    expect(output.join("\n")).not.toBe("");
  });

  it("uses no framework imports, so the example cannot rot", async () => {
    await initProjectCommands(workdir);
    const source = await readFile(path.join(workdir, PROJECT_COMMANDS_PATH), "utf8");

    // Reaching into src/framework from a project file would tie the example to
    // an internal path that is free to move. A relative import to the
    // developer's own code is the thing to demonstrate instead.
    expect(source).not.toContain("src/framework");
    expect(source).not.toContain("@/");
  });

  it("refuses to overwrite an existing file", async () => {
    const file = await writeProjectFile("// mine, do not touch");
    await initProjectCommands(workdir);

    expect(await readFile(file, "utf8")).toBe("// mine, do not touch");
  });

  it("overwrites when forced", async () => {
    const file = await writeProjectFile("// mine");
    await initProjectCommands(workdir, { force: true });

    expect(await readFile(file, "utf8")).toContain("export default");
  });
});
