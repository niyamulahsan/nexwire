import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";

function resolveModulesPath() {
  const cwd = process.cwd();
  const srcModules = path.resolve(cwd, "src/modules");
  const distModules = path.resolve(cwd, "dist/src/modules");
  const entry = String(process.argv[1] || "");
  const runningDist = /[\\/]dist[\\/]/.test(entry);

  if (runningDist && fs.existsSync(distModules)) return distModules;
  return srcModules;
}

export const modulesPath = resolveModulesPath();

/**
 * Why: Finds module files by glob from active src/dist modules path.
 * When: Framework needs module routes/jobs/seeders/schedules discovery.
 * Where: Route registrar, queue boot, scheduler boot, seeding.
 * How: Runs glob with absolute paths and stable sorting.
 */
export async function discoverModuleFiles(pattern: string) {
  const files = await glob(pattern, {
    cwd: modulesPath,
    absolute: true,
    nodir: true,
    windowsPathsNoEscape: true
  });

  return files.sort();
}

/**
 * Why: Derives module folder name from absolute discovered file path.
 * When: Mounting route prefixes and grouping module assets.
 * Where: Route registration logic.
 * How: Computes relative path and returns first segment.
 */
export function moduleNameFromPath(filePath: string) {
  return path.relative(modulesPath, filePath).split(path.sep)[0];
}

/**
 * Why: Dynamically imports a discovered module file.
 * When: Bootstrapping pluggable module artifacts.
 * Where: Discovery consumers across framework.
 * How: Converts file path to file URL and imports it.
 */
export async function importFile(filePath: string) {
  return await import(pathToFileURL(filePath).href);
}
