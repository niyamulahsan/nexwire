import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import { discoverModuleFiles } from "@/framework/modules/discover.js";
import { logger } from "@/framework/support/logger.js";

/**
 * Why: Finds the app-level provider folder for the running code.
 * When: Providers are loaded at boot.
 * Where: Provider loader.
 * How: Mirrors the module discovery rule — `src/providers` in development,
 *      `dist/src/providers` when the compiled server is the entrypoint.
 */
function resolveProvidersPath() {
  const cwd = process.cwd();
  const srcProviders = path.resolve(cwd, "src/providers");
  const distProviders = path.resolve(cwd, "dist/src/providers");
  const entry = String(process.argv[1] || "");
  const runningDist = /[\\/]dist[\\/]/.test(entry);

  if (runningDist && fs.existsSync(distProviders)) return distProviders;
  return srcProviders;
}

export const providersPath = resolveProvidersPath();

let loadPromise: Promise<number> | null = null;
let loading = false;

/**
 * Why: Collects every provider file that should run at boot.
 * When: The loader runs.
 * Where: Provider loader.
 * How: Globs `src/providers/**` for app-wide providers and `src/modules/**\/providers.ts`
 *      for module-scoped ones. Tests and declaration files are ignored.
 */
async function collectProviderFiles(): Promise<string[]> {
  const files: string[] = [];

  if (fs.existsSync(providersPath)) {
    const appFiles = await glob("**/*.{ts,js,mjs}", {
      cwd: providersPath,
      absolute: true,
      nodir: true,
      ignore: ["**/__tests__/**", "**/*.d.ts", "**/*.test.*", "**/*.spec.*"],
      windowsPathsNoEscape: true
    });
    files.push(...appFiles);
  }

  try {
    const moduleFiles = await discoverModuleFiles("**/providers.{ts,js}");
    files.push(...moduleFiles);
  } catch {}

  return [...new Set(files)].sort();
}

/**
 * Why: Imports each discovered provider file so its registration runs.
 * When: The loader runs.
 * Where: Provider loader.
 * How: Imports in sorted order; a broken file is logged and skipped instead of
 *      taking the whole application down.
 */
async function loadProviderFiles(): Promise<number> {
  const files = await collectProviderFiles();

  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
    } catch (error) {
      logger.warn("Provider file failed to load", {
        file,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return files.length;
}

/**
 * Why: Runs the application's provider files exactly once.
 * When: The kernel boots, and on the first provider lookup.
 * Where: Kernel startup and the auth provider adapter.
 * How: Caches the promise so repeated lookups cost nothing. A provider file
 *      that itself asks for a provider during load gets an immediate answer
 *      instead of deadlocking on its own load.
 */
export async function loadProviders(): Promise<number> {
  if (loading) return 0;
  if (!loadPromise) {
    loading = true;
    loadPromise = loadProviderFiles().finally(() => {
      loading = false;
    });
  }
  return loadPromise;
}
