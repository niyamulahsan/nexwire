import fs from "node:fs/promises";
import path from "node:path";

/** Write a file only if it does not already exist. Returns true if created. */
export async function writeFileIfMissing(filePath, content) {
  try {
    await fs.access(filePath);
    console.log(`Skipped existing: ${path.relative(process.cwd(), filePath)}`);
    return false;
  } catch {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    console.log(`Created: ${path.relative(process.cwd(), filePath)}`);
    return true;
  }
}

/** Write a file, overwriting if it exists. */
export async function writeFileAlways(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  console.log(`Updated: ${path.relative(process.cwd(), filePath)}`);
}

/** Write multiple files under a root directory using writeFileAlways. */
export async function writeFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFileAlways(path.join(root, relativePath), content);
  }
}
