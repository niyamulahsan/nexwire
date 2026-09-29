import fs from "node:fs/promises";
import path from "node:path";
import { hasFlag } from "../utils/flags.mjs";
import { assertName, pascal } from "../utils/naming.mjs";

const stubsRoot = path.resolve(import.meta.dirname, "../stubs");

/** Read a stub file and replace {{key}} placeholders, removing unfilled ones. */
async function stub(name, values = {}) {
  let content = await fs.readFile(path.join(stubsRoot, name), "utf8");
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

/** Convert a name to camelCase (e.g. "rate-limit" -> "rateLimit"). */
function camelCase(input) {
  const p = pascal(input);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

/** Generate a middleware file in src/middlewares. */
export async function makeMiddleware(rawName, flags = []) {
  const name = assertName(rawName, "Middleware name");
  const camel = camelCase(name);
  const dryRun = hasFlag(flags, "--dry-run");
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");

  const filePath = path.resolve(process.cwd(), "src/middlewares", `${name}-middleware.ts`);
  if (dryRun) return;

  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {}
  if (exists && !force) {
    throw new Error(`Middleware already exists: ${path.relative(process.cwd(), filePath)}. Re-run with --force to overwrite.`);
  }

  const content = await stub("middleware/name.ts.stub", { name, camel });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  console.log(`Middleware ready: ${path.relative(process.cwd(), filePath)}`);
  console.log(`Apply it to a route group: group(${camel}Middleware)`);
}