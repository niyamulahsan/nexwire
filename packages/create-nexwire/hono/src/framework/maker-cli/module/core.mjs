import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { drizzleGenerateArgs, ensureDatabaseDirectory, ensureMigrationMeta, syncMigrationDialect } from "../db/core.mjs";
import { detectDialect, openApiEnabled } from "../utils/env-db.mjs";
import { writeFiles } from "../utils/file-ops.mjs";
import { hasFlag } from "../utils/flags.mjs";
import { assertName, pascal } from "../utils/naming.mjs";
import { packageScript, runNodeScript } from "../utils/process.mjs";

const stubsRoot = path.resolve(import.meta.dirname, "../stubs");

/** Template stubs used for module file generation. */
const STUBS = {
  controller: {
    openapi: "controller/openapi.ts.stub",
    openapiWithModel: "controller/openapi.with-model.ts.stub",
    plain: "controller/plain.ts.stub",
    schema: {
      openapi: "controller/schema.ts.stub",
      plain: "controller/schema.plain.ts.stub"
    }
  },
  route: {
    api: "route/api.ts.stub",
    plain: "route/plain.ts.stub"
  },
  model: {
    named: {
      mysql: "model/name.mysql.ts.stub",
      postgresql: "model/name.postgresql.ts.stub",
      sqlite: "model/name.sqlite.ts.stub"
    }
  },
  seeder: {
    named: "seeder/name.ts.stub"
  },
  example: {
    schema: {
      openapi: "example/schema.ts.stub",
      plain: "example/schema.plain.ts.stub"
    },
    controller: "example/controller.ts.stub",
    routeApi: "example/route.api.ts.stub",
    routePlain: "example/route.plain.ts.stub",
    job: "example/job.ts.stub",
    console: "example/console.ts.stub"
  },
  job: {
    named: "job/name.ts.stub"
  },
  schedule: {
    named: "schedule/name.ts.stub"
  },
  notification: {
    controller: "notification/controller.ts.stub",
    schema: {
      openapi: "notification/schema.ts.stub",
      plain: "notification/schema.plain.ts.stub"
    },
    routeApi: "notification/route.api.ts.stub",
    routePlain: "notification/route.plain.ts.stub",
    job: "notification/job.ts.stub"
  },
  test: {
    unit: "test/unit.ts.stub"
  }
};

/** Module scaffolding handlers shared by maker module commands. */

/** Read a stub file from the stubs directory. */
async function readStubRaw(name) {
  const file = path.join(stubsRoot, name);
  return fs.readFile(file, "utf8");
}

/** Read a stub file and replace {{key}} placeholders, removing unfilled ones. */
async function stub(name, values = {}) {
  let content = await readStubRaw(name);
  for (const [key, value] of Object.entries(values)) {
    content = content.replaceAll(`{{${key}}}`, String(value));
  }
  return content.replace(/\{\{[A-Z0-9_]+\}\}/g, "");
}

/** Resolve the canonical module root path inside src/modules. */
function moduleRoot(moduleName) {
  return path.resolve(process.cwd(), "src/modules", moduleName);
}

/** Ensure a module directory exists, throwing a helpful error if not. */
async function assertModuleExists(moduleName) {
  const root = moduleRoot(moduleName);
  let stats;
  try {
    stats = await fs.stat(root);
  } catch {
    throw new Error(`Module does not exist: ${moduleName}. Create it first with: bun maker module:make ${moduleName}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Module path is not a directory: src/modules/${moduleName}`);
  }
  return root;
}

/** Generate controller and schema file content for a module. */
async function controllerFiles(moduleName, controllerName = moduleName, options = {}) {
  const { includeModelImport = false } = options;
  const controller = controllerName.trim().toLowerCase();
  const openApi = openApiEnabled();
  const controllerStub = openApi
    ? includeModelImport
      ? STUBS.controller.openapiWithModel
      : STUBS.controller.openapi
    : STUBS.controller.plain;
  const schemaStub = openApi ? STUBS.controller.schema.openapi : STUBS.controller.schema.plain;
  return {
    [`controllers/${controller}.schema.ts`]: await stub(schemaStub, {
      module: moduleName,
      controller,
      ClassName: pascal(controller),
      name: moduleName
    }),
    [`controllers/${controller}.controller.ts`]: await stub(controllerStub, {
      module: moduleName,
      controller,
      ClassName: pascal(controller),
      name: moduleName,
      tableVariable: `${controller}s`
    })
  };
}

/** Generate a route file for a module. */
async function routeTemplate(moduleName, controllerName = moduleName) {
  const controller = controllerName.trim().toLowerCase();
  const routeStub = openApiEnabled() ? STUBS.route.api : STUBS.route.plain;
  return await stub(routeStub, {
    module: moduleName,
    controller,
    ClassName: pascal(controller),
    ModuleClass: pascal(moduleName)
  });
}

/** Generate a named model file for a module. */
async function namedModelTemplate(moduleName, name, dialect) {
  return await stub(STUBS.model.named[dialect], {
    module: moduleName,
    name,
    controller: name,
    ClassName: pascal(name),
    tableName: `${name}s`,
    tableVariable: `${name}s`
  });
}

/** Generate a seeder file for a module model. */
async function namedSeederTemplate(moduleName, modelName, className) {
  return await stub(STUBS.seeder.named, {
    module: moduleName,
    name: modelName,
    controller: className,
    ClassName: pascal(className),
    tableName: `${modelName}s`,
    tableVariable: `${modelName}s`
  });
}

/** Comment out every line of content (used for seeders generated without --force). */
function asCommentedSeeder(content) {
  return content
    .split("\n")
    .map((line) => (line ? `// ${line}` : "//"))
    .join("\n");
}

/** Check if a file path exists on disk. */
async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Resolve the best controller name for a route. Prefers explicit name, falls back to most recently modified controller. */
async function resolveRouteControllerName(moduleRootPath, moduleName, preferredName = "") {
  const preferred = preferredName ? preferredName.trim().toLowerCase() : "";
  if (preferred) {
    const preferredController = path.join(moduleRootPath, "controllers", `${preferred}.controller.ts`);
    const preferredSchema = path.join(moduleRootPath, "controllers", `${preferred}.schema.ts`);
    if ((await pathExists(preferredController)) && (await pathExists(preferredSchema))) return preferred;
  }

  const controllerDir = path.join(moduleRootPath, "controllers");
  let entries = [];
  try {
    entries = await fs.readdir(controllerDir, { withFileTypes: true });
  } catch {
    return moduleName;
  }

  let latest = "";
  let latestMtime = -1;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".controller.ts")) continue;
    const baseName = entry.name.replace(/\.controller\.ts$/, "");
    const schemaPath = path.join(controllerDir, `${baseName}.schema.ts`);
    if (!(await pathExists(schemaPath))) continue;
    const fullPath = path.join(controllerDir, entry.name);
    const stats = await fs.stat(fullPath);
    const mtime = stats.mtimeMs || 0;
    if (mtime > latestMtime) {
      latest = baseName;
      latestMtime = mtime;
    }
  }

  return latest || moduleName;
}

/** Write a file with safety checks (dry-run support, force overwrite protection). */
async function writeFileSafe(filePath, content, flags = [], label = "File") {
  const dryRun = hasFlag(flags, "--dry-run");
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");
  if (dryRun) return;
  const exists = await pathExists(filePath);
  if (exists && !force) {
    throw new Error(`${label} already exists: ${path.relative(process.cwd(), filePath)}. Re-run with --force to overwrite.`);
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
}

/** Generate a complete module scaffold (controller, route, models, seeders). */
export async function makeModule(rawName) {
  const name = assertName(rawName, "Module name");
  const root = path.resolve(process.cwd(), "src/modules", name);
  const controller = await controllerFiles(name, name, { includeModelImport: true });
  const route = await routeTemplate(name);
  const dialect = detectDialect();
  const model = await namedModelTemplate(name, name, dialect);
  const seeder = await namedSeederTemplate(name, name, name);
  await writeFiles(root, { ...controller, "routes/api.ts": route });
  await fs.mkdir(path.join(root, "database", "models"), { recursive: true });
  await fs.mkdir(path.join(root, "database", "seeders"), { recursive: true });
  await fs.writeFile(path.join(root, "database", "models", `${name}.ts`), model);
  await fs.writeFile(path.join(root, "database", "seeders", `${name}.ts`), asCommentedSeeder(seeder));
  console.log(`Module ready: ${name}`);
  console.log("Database files: models/{module}.ts, seeders/{module}.ts (commented)");
  console.log(`Route style: ${openApiEnabled() ? "openapi" : "plain"}`);
}

/** Generate a one-shot example module with queue/broadcast/scheduler cases. */
export async function makeExampleModule(rawName = "example") {
  const moduleName = assertName(rawName || "example", "Module name");
  const root = path.resolve(process.cwd(), "src/modules", moduleName);
  const openApi = openApiEnabled();
  await writeFiles(root, {
    [`controllers/${moduleName}.schema.ts`]: await stub(openApi ? STUBS.example.schema.openapi : STUBS.example.schema.plain, {
      module: moduleName
    }),
    [`controllers/${moduleName}.controller.ts`]: await stub(STUBS.example.controller, {
      module: moduleName
    }),
    "routes/api.ts": await stub(openApi ? STUBS.example.routeApi : STUBS.example.routePlain, { module: moduleName }),
    [`jobs/${moduleName}.ts`]: await stub(STUBS.example.job, { module: moduleName }),
    [`console/${moduleName}.ts`]: await stub(STUBS.example.console, { module: moduleName })
  });
  await fs.mkdir(path.join(root, "database", "models"), { recursive: true });
  await fs.mkdir(path.join(root, "database", "seeders"), { recursive: true });
  console.log(`Example module ready: ${moduleName}`);
  console.log(`Route style: ${openApi ? "openapi" : "plain"}`);
}

/** Generate a route file for an existing module. */
export async function makeRoute(rawModule, rawControllerOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const root = await assertModuleExists(moduleName);
  const flags = [];
  let routeName = moduleName;
  let controllerExplicit = false;
  if (rawControllerOrFlag) {
    if (rawControllerOrFlag.startsWith("--")) flags.push(rawControllerOrFlag);
    else {
      routeName = assertName(rawControllerOrFlag, "Route name");
      controllerExplicit = true;
    }
  }
  flags.push(...extraFlags);
  const controllerName = await resolveRouteControllerName(root, moduleName, routeName);
  const route = await routeTemplate(moduleName, controllerName);
  const routeFile = controllerExplicit ? `${routeName}.ts` : "api.ts";
  const routePath = path.join(root, `routes/${routeFile}`);
  const dryRun = hasFlag(flags, "--dry-run");
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");
  if (dryRun) return;
  let exists = false;
  try {
    await fs.access(routePath);
    exists = true;
  } catch {}
  if (exists && !force)
    throw new Error(`Route file already exists: ${path.relative(process.cwd(), routePath)}. Re-run with --force to overwrite.`);
  await fs.mkdir(path.dirname(routePath), { recursive: true });
  await fs.writeFile(routePath, route);
  console.log(`Route ready: ${path.relative(process.cwd(), routePath)}`);
}

/** Generate a notification module with controller, routes, and job. */
export async function makeNotificationModule(rawName = "notification") {
  const moduleName = assertName(rawName, "Module name");
  const root = path.resolve(process.cwd(), "src/modules", moduleName);
  const openApi = openApiEnabled();

  await writeFiles(root, {
    [`controllers/${moduleName}.controller.ts`]: await stub(STUBS.notification.controller, {
      module: moduleName
    }),
    [`controllers/${moduleName}.schema.ts`]: await stub(openApi ? STUBS.notification.schema.openapi : STUBS.notification.schema.plain, {
      module: moduleName
    }),
    "routes/api.ts": await stub(openApi ? STUBS.notification.routeApi : STUBS.notification.routePlain, { module: moduleName }),
    [`jobs/${moduleName}.ts`]: await stub(STUBS.notification.job, { module: moduleName })
  });

  console.log(`Notification module ready: ${moduleName}`);
  console.log(`Route style: ${openApi ? "openapi" : "plain"}`);
  console.log("See docs (packages/docs/guide/notification.md) for Vue UI integration.");
}

/** Soft-delete a module by moving it to storage trash. */
export async function deleteModule(rawName, flags = []) {
  const name = assertName(rawName, "Module name");
  if (name === "notification") {
    console.log("Use `bun maker module:delete-notification` to remove the notification module (removes UI files too).");
    return;
  }
  const modulesRoot = path.resolve(process.cwd(), "src/modules");
  const modulePath = path.resolve(modulesRoot, name);
  const relative = path.relative(modulesRoot, modulePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Unsafe module path.");
  let stats;
  try {
    stats = await fs.stat(modulePath);
  } catch {
    throw new Error(`Module not found: ${name}`);
  }
  if (!stats.isDirectory()) throw new Error(`Module path is not a directory: src/modules/${name}`);
  const trashRoot = path.resolve(process.cwd(), "src/storage/trash/modules");
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  const trashPath = path.join(trashRoot, `${name}-${stamp}`);
  const dryRun = hasFlag(flags, "--dry-run");
  const confirmed = hasFlag(flags, "--yes") || hasFlag(flags, "--force");
  if (dryRun) return;
  if (!confirmed) throw new Error(`Refusing to delete module without confirmation. Re-run with: bun maker module:delete ${name} --yes`);
  await fs.mkdir(trashRoot, { recursive: true });
  try {
    await fs.rename(modulePath, trashPath);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EXDEV") {
      await fs.cp(modulePath, trashPath, { recursive: true });
      await fs.rm(modulePath, { recursive: true, force: true });
    } else {
      throw error;
    }
  }
  console.log(`Moved module to trash: ${path.relative(process.cwd(), trashPath)}`);
}

/** Remove a notification module (backend only — moves to trash). */
export async function deleteNotificationModule(rawName = "notification", flags = []) {
  const moduleName = assertName(rawName, "Module name");
  const dryRun = hasFlag(flags, "--dry-run");
  const confirmed = hasFlag(flags, "--yes") || hasFlag(flags, "--force");

  const modulePath = path.resolve(process.cwd(), "src/modules", moduleName);

  if (dryRun) {
    const exists = await fs
      .stat(modulePath)
      .then(() => true)
      .catch(() => false);
    if (exists) console.log(`Would delete: ${path.relative(process.cwd(), modulePath)}`);
    return;
  }

  if (!confirmed) {
    throw new Error(
      `Refusing to delete notification module without confirmation. Re-run with: bun maker module:delete-notification ${moduleName} --yes`
    );
  }

  const exists = await fs
    .stat(modulePath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    console.log("Notification module not found — nothing to delete.");
    return;
  }

  const trashRoot = path.resolve(process.cwd(), "src/storage/trash/modules");
  const stamp = new Date().toISOString().replace(/[.:]/g, "-");
  await fs.mkdir(trashRoot, { recursive: true });

  const relPath = path.relative(process.cwd(), modulePath);
  const trashPath = path.join(trashRoot, `${relPath.replace(/[/\\]/g, "-")}-${stamp}`);

  try {
    await fs.rename(modulePath, trashPath);
  } catch (error) {
    if (error?.code === "EPERM" || error?.code === "EXDEV") {
      await fs.cp(modulePath, trashPath, { recursive: true });
      await fs.rm(modulePath, { recursive: true, force: true });
    } else {
      throw error;
    }
  }
  console.log(`Moved to trash: ${relPath}`);
  console.log("Notification module deleted.");
}

/** Permanently remove entries from module trash storage. */
export async function cleanModuleTrash(rawName, flags = []) {
  const trashRoot = path.resolve(process.cwd(), "src/storage/trash/modules");
  const dryRun = hasFlag(flags, "--dry-run");
  const confirmed = hasFlag(flags, "--yes") || hasFlag(flags, "--force");
  let entries = [];
  try {
    entries = await fs.readdir(trashRoot, { withFileTypes: true });
  } catch {
    if (dryRun) return;
    console.log("No trash entries found");
    return;
  }
  const targetName = rawName && !rawName.startsWith("--") ? assertName(rawName, "Module name") : "";
  const matches = entries.map((e) => e.name).filter((name) => !targetName || name === targetName || name.startsWith(`${targetName}-`));
  if (!matches.length) {
    console.log(targetName ? `No trash entries found for module '${targetName}'` : "No trash entries found");
    return;
  }
  if (dryRun) return;
  if (!confirmed)
    throw new Error(
      targetName
        ? `Refusing to clean trash for '${targetName}' without confirmation. Re-run with: bun maker module:trash:clean ${targetName} --yes`
        : "Refusing to clean all trash without confirmation. Re-run with: bun maker module:trash:clean --yes"
    );
  for (const name of matches) await fs.rm(path.join(trashRoot, name), { recursive: true, force: true });
}

/** Generate a controller for an existing module. */
export async function makeController(rawModule, rawControllerOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let controllerName = moduleName;
  if (rawControllerOrFlag) {
    if (rawControllerOrFlag.startsWith("--")) flags.push(rawControllerOrFlag);
    else controllerName = assertName(rawControllerOrFlag, "Controller name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);
  const files = await controllerFiles(moduleName, controllerName);
  for (const [relativePath, content] of Object.entries(files)) {
    await writeFileSafe(path.join(root, relativePath), content, flags, "Controller file");
  }
}

/** Generate a model file for an existing module. */
export async function makeModel(rawModule, rawNameOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let name = moduleName;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Model name");
  }
  flags.push(...extraFlags);
  const dialect = detectDialect();
  const root = await assertModuleExists(moduleName);
  const modelPath = path.join(root, `database/models/${name}.ts`);
  await writeFileSafe(modelPath, await namedModelTemplate(moduleName, name, dialect), flags, "Model file");
}

/** Generate a seeder file for an existing module model. */
export async function makeSeeder(rawModule, rawNameOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let name = moduleName;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Seeder name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);
  let modelName = name;
  let modelPath = path.join(root, "database", "models", `${modelName}.ts`);

  try {
    await fs.access(modelPath);
  } catch {
    modelName = moduleName;
    modelPath = path.join(root, "database", "models", `${modelName}.ts`);

    try {
      await fs.access(modelPath);
      console.log(`Model '${name}' not found, using module model '${modelName}' for seeder '${name}'.`);
    } catch {
      throw new Error(
        `Model not found for seeder: src/modules/${moduleName}/database/models/${name}.ts. Create it first with: bun maker module:make-model ${moduleName} ${name}`
      );
    }
  }

  await writeFileSafe(
    path.join(root, `database/seeders/${name}.ts`),
    await namedSeederTemplate(moduleName, modelName, name),
    flags,
    "Seeder file"
  );

  console.log(`Seeder ready: ${moduleName}/${name}`);
}

/** Generate a job file for an existing module. */
export async function makeJob(rawModule, rawNameOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let name = moduleName;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Job name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);
  await writeFileSafe(path.join(root, `jobs/${name}.ts`), await stub(STUBS.job.named, { module: moduleName, name }), flags, "Job file");
}

/** Generate a schedule/console file for an existing module. */
export async function makeSchedule(rawModule, rawNameOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let name = moduleName;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Schedule name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);
  await writeFileSafe(
    path.join(root, `console/${name}.ts`),
    await stub(STUBS.schedule.named, { module: moduleName, name }),
    flags,
    "Schedule file"
  );
}

/** List all discovered modules. */
export async function listModules() {
  const modulesRoot = path.resolve(process.cwd(), "src/modules");
  try {
    const entries = await fs.readdir(modulesRoot, { withFileTypes: true });
    const modules = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    if (!modules.length) {
      console.log("No modules found.");
      return;
    }
    console.log("Modules:");
    for (const module of modules) console.log(`  - ${module}`);
  } catch {
    console.log("No modules found.");
  }
}

/** Check that a module has at least one seeder file. */
export async function assertModuleHasSeeders(moduleName) {
  await assertModuleExists(moduleName);
  const files = await glob(`${moduleName}/database/seeders/*.{ts,js}`, {
    cwd: path.resolve(process.cwd(), "src/modules"),
    nodir: true,
    windowsPathsNoEscape: true
  });
  if (!files.length) throw new Error(`No seeders found for module '${moduleName}'.`);
}

/** Generate src/database/schema.ts by aggregating all module model exports. */
export async function generateSchema(options = {}) {
  const backendSrc = path.resolve(process.cwd(), "src");
  const files = await glob("modules/**/database/models/*.{ts,js}", {
    cwd: backendSrc,
    nodir: true,
    windowsPathsNoEscape: true
  });
  const exports = [];
  for (const file of files.sort()) {
    const absoluteFile = path.join(backendSrc, file);
    const outputDir = path.join(backendSrc, "database");
    const relativePath = path
      .relative(outputDir, absoluteFile)
      .replace(/\\/g, "/")
      .replace(/\.(ts|js)$/, ".js");
    const importPath = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
    exports.push(`export * from "${importPath}";`);
  }
  const output = path.join(backendSrc, "database/schema.ts");
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, `${exports.join("\n")}\n`);
  if (!options.silent) console.log(`Generated database schema with ${files.length} model file(s)`);
}

/** Generate a temporary schema file for a single module (used for module:generate/migrate). */
async function generateModuleSchemaTemp(moduleName) {
  await assertModuleExists(moduleName);
  const backendSrc = path.resolve(process.cwd(), "src");
  const files = await glob(`modules/${moduleName}/database/models/*.{ts,js}`, {
    cwd: backendSrc,
    nodir: true,
    windowsPathsNoEscape: true
  });
  if (!files.length) throw new Error(`No model files found for module '${moduleName}'.`);
  const exports = [];
  const tempDir = path.resolve(process.cwd(), "src/storage/tmp");
  await fs.mkdir(tempDir, { recursive: true });
  const tempSchemaPath = path.join(tempDir, `schema.${moduleName}.${Date.now()}.ts`);
  const tempSchemaDir = path.dirname(tempSchemaPath);
  for (const file of files.sort()) {
    const absoluteFile = path.join(backendSrc, file);
    const relativePath = path
      .relative(tempSchemaDir, absoluteFile)
      .replace(/\\/g, "/")
      .replace(/\.(ts|js)$/, ".ts");
    const importPath = relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
    exports.push(`export * from "${importPath}";`);
  }
  await fs.writeFile(tempSchemaPath, `${exports.join("\n")}\n`);
  return { tempSchemaPath, modelCount: files.length };
}

/** Generate and run migrations for a single module using a temporary schema. */
export async function runModuleMigrate(rawModuleName, rawArgs = []) {
  const moduleName = assertName(rawModuleName, "Module name");
  await syncMigrationDialect();
  await ensureMigrationMeta();
  await ensureDatabaseDirectory();
  const keepTemp = rawArgs.includes("--keep-temp");
  const { tempSchemaPath, modelCount } = await generateModuleSchemaTemp(moduleName);
  const drizzleSchemaPath = `./${path.relative(process.cwd(), tempSchemaPath).replace(/\\/g, "/")}`;
  const previousSchema = process.env.DRIZZLE_SCHEMA;
  try {
    process.env.DRIZZLE_SCHEMA = drizzleSchemaPath;
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), await drizzleGenerateArgs());
    await runNodeScript(packageScript("drizzle-kit", "bin.cjs"), ["migrate"]);
    console.log(`Module migration complete: ${moduleName} (${modelCount} model file(s))`);
  } finally {
    if (previousSchema == null) delete process.env.DRIZZLE_SCHEMA;
    else process.env.DRIZZLE_SCHEMA = previousSchema;
    if (!keepTemp) await fs.rm(tempSchemaPath, { force: true }).catch(() => {});
  }
}

/** Generate a unit test file for a module. */
export async function makeTest(rawModule, rawNameOrFlag, extraFlags = []) {
  const moduleName = assertName(rawModule, "Module name");
  const flags = [];
  let name = moduleName;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Test name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);
  const testDir = path.join(root, "__tests__");
  await fs.mkdir(testDir, { recursive: true });
  const testPath = path.join(testDir, `${name}.test.ts`);
  await writeFileSafe(testPath, await stub(STUBS.test.unit, { module: moduleName, name }), flags, "Test file");
  console.log(`Test ready: ${path.relative(process.cwd(), testPath)}`);
}
