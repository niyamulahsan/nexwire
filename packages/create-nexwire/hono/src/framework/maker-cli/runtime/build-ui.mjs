import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const isFalse = (v) => v === "false" || v === "0";

const envFile = resolve(process.cwd(), ".env");
const fileDisabled = existsSync(envFile) && /^UI=(?:false|0)\s*$/m.test(readFileSync(envFile, "utf-8"));

if (isFalse(process.env.UI) || fileDisabled) {
  console.log("UI build skipped (UI=false)");
  mkdirSync("public", { recursive: true });
  process.exit(0);
}

execSync("vite build --config src/resources/vite.config.ts", { stdio: "inherit" });

