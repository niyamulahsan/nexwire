#!/usr/bin/env node

import { readFileSync, existsSync, cpSync, mkdirSync, writeFileSync, renameSync, readdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { gunzipSync } from "node:zlib";
import https from "node:https";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_PATH = join(__dirname, "..", "package.json");

const pkg = JSON.parse(readFileSync(PKG_PATH, "utf-8"));
const version = pkg.version;

function ask(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(query, (a) => { rl.close(); resolve(a.trim()); }));
}

function detectPackageManager() {
  if (typeof process !== "undefined" && process.isBun) return "bun";
  const ua = process.env.npm_config_user_agent || "";
  if (ua.includes("bun")) return "bun";
  if (ua.includes("pnpm")) return "pnpm";
  if (ua.includes("yarn")) return "yarn";
  return "npm";
}

function isValidProjectName(name) {
  return /^[a-z0-9@][a-z0-9._-]*$/i.test(name);
}

function resolveTargetDir(name) {
  const cwd = process.cwd();
  if (name === ".") {
    const entries = readdirSync(cwd);
    if (entries.length > 0) {
      console.error(`Error: Current directory "${basename(cwd)}" is not empty.`);
      console.error("  Scaffolding into '.' requires an empty directory so existing files are not overwritten.");
      process.exit(1);
    }
    return cwd;
  }
  const dir = join(cwd, name);
  if (existsSync(dir)) {
    console.error(`Error: Directory "${name}" already exists.`);
    process.exit(1);
  }
  return dir;
}

function octalToInt(str) {
  return parseInt(str.replace(/\0.*$/, "").trim(), 8) || 0;
}

const ENGINE_PREFIXES = {
  hono: "package/hono/",
  express: "package/express/"
};

function extractTarGz(tgzBuffer, destDir, engine) {
  const buf = gunzipSync(tgzBuffer);
  const prefix = ENGINE_PREFIXES[engine] || ENGINE_PREFIXES.hono;
  let offset = 0;

  while (offset < buf.length - 512) {
    const header = buf.slice(offset, offset + 512);
    if (header.every((b) => b === 0)) break;

    const name = header.slice(0, 100).toString("utf-8").replace(/\0.*$/, "");
    const size = octalToInt(header.slice(124, 136).toString("utf-8"));
    const type = header[156];

    offset += 512;

    if (name && name.startsWith(prefix)) {
      const relativePath = name.slice(prefix.length);
      if (relativePath) {
        const fullPath = join(destDir, relativePath);
        if (type === 48 || type === 0) {
          const dir = dirname(fullPath);
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
          writeFileSync(fullPath, buf.slice(offset, offset + size));
        } else if (type === 53) {
          if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true });
        }
      }
    }

    offset += Math.ceil(size / 512) * 512;
  }
}

function fetchTarball(pkgName, pkgVersion) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${pkgName}/-/${pkgName}-${pkgVersion}.tgz`;
    https.get(url, { headers: { Accept: "application/octet-stream" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          const chunks = [];
          res2.on("data", (c) => chunks.push(c));
          res2.on("end", () => resolve(Buffer.concat(chunks)));
          res2.on("error", reject);
        }).on("error", reject);
        return;
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

async function main() {
  const args = process.argv.slice(2);
  let projectName = args.find((a) => !a.startsWith("--"));

  const engineArg = args.find((a) => a.startsWith("--engine="));
  let engine = engineArg ? engineArg.split("=")[1] : "hono";

  if (!ENGINE_PREFIXES[engine]) {
    console.error(`Error: Unknown engine "${engine}". Supported engines: hono, express.`);
    process.exit(1);
  }

  if (args.includes("--help") || args.includes("-h")) {
    console.log(`create-nexwire v${version}`);
    console.log();
    console.log("Usage:");
    console.log("  npm create nexwire@latest <project-name> [--engine=<hono|express>]");
    console.log("  pnpm create nexwire@latest <project-name> [--engine=<hono|express>]");
    console.log("  bun create nexwire@latest <project-name> [--engine=<hono|express>]");
    console.log("  npx create-nexwire@latest <project-name> [--engine=<hono|express>]");
    console.log();
    console.log("Engines:");
    console.log("  hono     (default) Hono-based HTTP layer and OpenAPI");
    console.log("  express  Express-based HTTP layer and OpenAPI");
    process.exit(0);
  }

  if (!projectName) {
    projectName = await ask("Project name: ");
  }

  if (!projectName || (projectName !== "." && !isValidProjectName(projectName))) {
    console.error("Error: Invalid project name. Use alphanumeric, dashes, or underscores, or '.' for the current directory.");
    process.exit(1);
  }

  const targetDir = resolveTargetDir(projectName);
  const isCurrentDir = targetDir === process.cwd();

  console.log(`\nCreating project "${projectName}" (engine: ${engine})...\n`);

  mkdirSync(targetDir, { recursive: true });

  try {
    console.log("  Downloading template from npm...");
    const tgz = await fetchTarball("create-nexwire", version);
    extractTarGz(tgz, targetDir, engine);
  } catch (err) {
    console.error("Error: Failed to download template from npm registry.");
    console.error("  " + err.message);
    if (isCurrentDir) {
      console.error("  Leaving the current directory in place; nothing was removed.");
    } else {
      rmSync(targetDir, { recursive: true, force: true });
    }
    process.exit(1);
  }

  const gitignoreStub = join(targetDir, "gitignore-stub");
  if (existsSync(gitignoreStub)) {
    renameSync(gitignoreStub, join(targetDir, ".gitignore"));
  }

  const targetPkgPath = join(targetDir, "package.json");
  if (existsSync(targetPkgPath)) {
    const targetPkg = JSON.parse(readFileSync(targetPkgPath, "utf-8"));
    targetPkg.name = projectName === "." ? basename(targetDir) : projectName;
    writeFileSync(targetPkgPath, JSON.stringify(targetPkg, null, 2) + "\n");
  }

  const pm = detectPackageManager();

  const cdName = projectName === "." ? basename(targetDir) : projectName;
  console.log(`Done! Created "${cdName}" (engine: ${engine}) at ${targetDir}`);
  console.log();
  if (projectName !== ".") {
    console.log("  cd " + cdName);
  }
  console.log("  " + pm + " install");
  console.log("  " + (existsSync(join(targetDir, ".env")) ? ".env ready - no copy needed" : process.platform === "win32" ? "copy .env.example .env" : "cp .env.example .env"));
  console.log();
  console.log("Enjoy building with nexwire!");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
