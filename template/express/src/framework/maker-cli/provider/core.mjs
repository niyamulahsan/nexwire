import fs from "node:fs/promises";
import path from "node:path";
import { hasFlag } from "../utils/flags.mjs";
import { assertName, camelCase } from "../utils/naming.mjs";

const stubsRoot = path.resolve(import.meta.dirname, "../stubs");

/** Read a stub file and replace {{key}} placeholders, removing unfilled ones. */
async function stub(name, values = {}) {
  let content = await fs.readFile(path.join(stubsRoot, name), "utf8");
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

/**
 * Why: Generates the app-wide provider file.
 * When: A developer wants to plug an implementation into the whole app.
 * Where: src/providers/<name>.ts - imported automatically at boot.
 * How: Writes the stub and prints how to reach the provider from anywhere.
 */
export async function makeProvider(rawName, flags = []) {
  const name = assertName(rawName, "Provider name");
  const camel = camelCase(name);
  const dryRun = hasFlag(flags, "--dry-run");
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");

  const filePath = path.resolve(process.cwd(), "src/providers", `${name}.ts`);
  if (dryRun) {
    console.log(`Would create provider file: ${path.relative(process.cwd(), filePath)}`);
    return;
  }

  let exists = false;
  try {
    await fs.access(filePath);
    exists = true;
  } catch {}
  if (exists && !force) {
    throw new Error(`Provider already exists: ${path.relative(process.cwd(), filePath)}. Re-run with --force to overwrite.`);
  }

  const content = await stub("provider/name.ts.stub", { name, camel });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  console.log(`Provider ready: ${path.relative(process.cwd(), filePath)}`);
  console.log(`It is imported at boot. Reach it with: getProvider("${name}")`);
}
