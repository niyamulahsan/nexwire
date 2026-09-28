#!/usr/bin/env node

import { cpSync, rmSync, renameSync, existsSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PKG = join(ROOT, "packages", "create-nexwire");

const ENGINES = {
  hono: { src: join(ROOT, "template", "hono"), dest: join(PKG, "hono") },
  express: { src: join(ROOT, "template", "express"), dest: join(PKG, "express") },
};

function syncEngine(name, { src, dest }) {
  if (!existsSync(src)) {
    console.error(`Error: ${name} template not found at`, src);
    process.exit(1);
  }

  if (existsSync(dest)) {
    rmSync(dest, { recursive: true });
  }

  const rootName = basename(src);
  const skipDirs = new Set(["node_modules", "dist"]);
  const skipRootDirs = new Set(["deploy"]);
  const skipFiles = new Set(["bun.lock", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

  cpSync(src, dest, {
    recursive: true,
    filter: (s) => {
      const parts = s.split(/[\\/]/);
      const basename_ = parts.pop();
      const rootIdx = parts.indexOf(rootName);
      const depth = rootIdx >= 0 ? parts.length - rootIdx : 0;
      return !parts.some((p) => skipDirs.has(p))
        && !skipDirs.has(basename_)
        && !(depth === 1 && skipRootDirs.has(basename_))
        && !skipFiles.has(basename_);
    },
  });

  // Rename .gitignore to gitignore-stub so npm doesn't use its patterns for exclusion
  const gitignorePath = join(dest, ".gitignore");
  if (existsSync(gitignorePath)) {
    renameSync(gitignorePath, join(dest, "gitignore-stub"));
    console.log(`  [${name}] renamed .gitignore → gitignore-stub (avoids npm .gitignore fallback)`);
  }
}

const requested = process.argv[2]?.toLowerCase();
if (requested && !ENGINES[requested]) {
  console.error(`Error: Unknown engine "${requested}". Supported engines: hono, express.`);
  process.exit(1);
}

for (const [name, cfg] of Object.entries(ENGINES)) {
  if (requested && name !== requested) continue;
  syncEngine(name, cfg);
}

console.log(requested ? `${requested} template synced to packages/create-nexwire/` : "Templates synced to packages/create-nexwire/");