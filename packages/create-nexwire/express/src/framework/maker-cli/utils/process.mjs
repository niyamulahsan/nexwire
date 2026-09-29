import { spawn } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";

/** Run a Node.js script as a child process using the current Node executable. */
export async function runNodeScript(script, args = [], options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: options.silent ? "ignore" : "inherit"
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${script} ${args.join(" ")} failed with code ${code}`))));
    child.on("error", reject);
  });
}

/** Resolve the path to a script inside a package in node_modules. */
export function packageScript(packageName, scriptPath) {
  return path.resolve(process.cwd(), "node_modules", packageName, scriptPath);
}

/** Find a local .bin executable (handles OS extensions like .cmd on Windows). */
export function localBin(name) {
  const extensions = process.platform === "win32" ? [".cmd", ".exe", ".ps1", ""] : [""];

  for (const extension of extensions) {
    const candidate = path.resolve(process.cwd(), "node_modules", ".bin", `${name}${extension}`);
    if (fsSync.existsSync(candidate)) return candidate;
  }

  throw new Error(`Missing local binary: ${name}. Install project dependencies first.`);
}

/** Run an arbitrary command as a child process. Uses shell mode for Windows scripts. */
export async function runCommand(commandName, commandArgs = [], options = {}) {
  await new Promise((resolve, reject) => {
    const isWindowsScript = process.platform === "win32" && /\.(cmd|ps1)$/i.test(commandName);
    const child = isWindowsScript
      ? spawn([commandName, ...commandArgs].map((part) => (/\s/.test(part) ? `"${part.replace(/"/g, '\\"')}"` : part)).join(" "), {
          shell: true,
          stdio: options.silent ? "ignore" : "inherit"
        })
      : spawn(commandName, commandArgs, {
          shell: false,
          stdio: options.silent ? "ignore" : "inherit"
        });

    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${commandName} ${commandArgs.join(" ")} failed with code ${code}`))
    );
    child.on("error", reject);
  });
}
