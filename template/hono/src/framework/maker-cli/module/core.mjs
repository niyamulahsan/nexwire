import fs from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import { drizzleGenerateArgs, ensureDatabaseDirectory, ensureMigrationMeta, syncMigrationDialect } from "../db/core.mjs";
import { detectDialect, openApiEnabled } from "../utils/env-db.mjs";
import { writeFiles } from "../utils/file-ops.mjs";
import { hasFlag } from "../utils/flags.mjs";
import { assertName, camelCase, normalizeName, pascal, plural, snakeCase } from "../utils/naming.mjs";
import { packageScript, runNodeScript } from "../utils/process.mjs";

const stubsRoot = path.resolve(import.meta.dirname, "../stubs");

/** Template stubs used for module file generation. */
const STUBS = {
  schema: {
    openapi: "schema/name.ts.stub",
    plain: "schema/name.plain.ts.stub"
  },
  controller: {
    openapi: "controller/openapi.ts.stub",
    plain: "controller/plain.ts.stub",
    standalone: "controller/standalone.ts.stub"
  },
  route: {
    api: "route/api.ts.stub",
    plain: "route/plain.ts.stub",
    standaloneApi: "route/standalone.api.ts.stub",
    standalonePlain: "route/standalone.plain.ts.stub"
  },
  model: {
    named: {
      mysql: "model/name.mysql.ts.stub",
      postgresql: "model/name.postgresql.ts.stub",
      sqlite: "model/name.sqlite.ts.stub"
    }
  },
  seeder: {
    named: "seeder/name.ts.stub",
    standalone: "seeder/standalone.ts.stub"
  },
  service: {
    named: "service/name.ts.stub",
    plain: "service/name.plain.ts.stub"
  },
  facade: {
    named: "facade/name.ts.stub"
  },
  helper: {
    named: "helper/name.ts.stub"
  },
  middleware: {
    local: "middleware/name.local.ts.stub"
  },
  type: {
    named: "type/name.ts.stub"
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
  const base = path.resolve(process.cwd(), "src/modules");
  const root = path.resolve(base, moduleName);
  if (root !== base && !root.startsWith(base + path.sep)) {
    throw new Error(`Module path escapes src/modules: ${moduleName}`);
  }
  return root;
}

/**
 * Leaf folder name of a module. `admin/post` -> `post`, `post` -> `post`.
 * File names and class names always come from the leaf; imports come from the
 * full path.
 */
function leafName(moduleName) {
  const segments = String(moduleName).split("/").filter(Boolean);
  return segments[segments.length - 1] || String(moduleName);
}

/**
 * Panel prefix of a module, everything before the leaf. `admin/post` -> `admin`,
 * `admin/reporting/deep` -> `admin/reporting`, `post` -> "".
 */
function panelOf(moduleName) {
  const segments = String(moduleName).split("/").filter(Boolean);
  return segments.slice(0, -1).join("/");
}

/**
 * Scalar tag for a module. Panels become a nested tag group so Scalar renders
 * `Admin / Post` instead of flattening everything under one panel.
 */
function moduleLabel(moduleName) {
  return String(moduleName)
    .split("/")
    .filter(Boolean)
    .map((segment) => pascal(segment))
    .join(" / ");
}

/**
 * Parse `--path=<panel>` into a normalized module prefix.
 * A panel is only a folder separator, so nested values are allowed:
 * `--path=admin` and `--path=admin/reporting` both validate.
 */
function parsePanelPath(flags) {
  const matches = flags.filter((flag) => flag.startsWith("--path"));
  if (matches.length === 0) return "";
  if (matches.length > 1) throw new Error("--path can only be given once.");
  const raw = matches[0].slice("--path".length).replace(/^=/, "").trim();
  if (!raw) throw new Error("--path needs a value, e.g. --path=admin");
  const segments = raw
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  if (segments.length === 0) throw new Error(`Invalid --path value: ${raw}`);
  for (const segment of segments) {
    if (!/^[a-z0-9][a-z0-9-_]*$/.test(segment)) {
      throw new Error(`Invalid --path segment "${segment}". Use lowercase letters, numbers and dashes.`);
    }
  }
  return segments.join("/");
}

/** True when the path is a directory holding at least one entry. */
async function dirHasFiles(target) {
  try {
    const entries = await fs.readdir(target);
    return entries.length > 0;
  } catch {
    return false;
  }
}

/**
 * Resolve the module a subcommand targets.
 *
 * `rawModule` is always the leaf name the developer typed. Subcommands accept the
 * same `--path=<panel>` flag as `module:make`, so `panelme --path=admin` addresses
 * src/modules/admin/panelme instead of failing with "module does not exist".
 * Flags may arrive either in the positional slot or in extraFlags depending on
 * whether a name was given, so every candidate string is scanned.
 */
function resolveModuleRef(rawModule, ...flagGroups) {
  const raw = assertName(rawModule, "Module name");
  const panel = parsePanelPath(flagGroups.flat().filter((value) => typeof value === "string"));
  const moduleName = panel ? `${panel}/${raw}` : raw;
  // Derive the leaf from the resolved path so `admin/post` passed directly as the
  // module argument still yields `post` for filenames and default names.
  return { moduleName, leaf: leafName(moduleName) };
}

/**
 * Find an existing module directory whose folder name spells the requested
 * module differently, only in the separators used (`my_module` vs `my-module`).
 *
 * Names are canonicalised to kebab-case, so a module scaffolded before this
 * happened can live in a folder the canonical name no longer resolves to.
 * Without this lookup, normalising the name would lock a developer out of their
 * own module. Matching is segment by segment so a panel path such as
 * `admin/reporting` keeps working, and each candidate is a real directory
 * inside src/modules, so the result cannot escape it.
 */
async function resolveExistingModuleDir(moduleName) {
  let current = path.resolve(process.cwd(), "src/modules");
  for (const segment of moduleName.split("/").filter(Boolean)) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return "";
    }
    const directories = entries.filter((entry) => entry.isDirectory());
    const exact = directories.find((entry) => entry.name === segment);
    const loose = exact ?? directories.find((entry) => normalizeName(entry.name) === normalizeName(segment));
    if (!loose) return "";
    current = path.join(current, loose.name);
  }
  return current;
}

/** Ensure a module directory exists, throwing a helpful error if not. */
async function assertModuleExists(moduleName) {
  const root = moduleRoot(moduleName);
  let stats;
  try {
    stats = await fs.stat(root);
  } catch {
    const legacy = await resolveExistingModuleDir(moduleName);
    if (legacy) return legacy;
    throw new Error(`Module does not exist: ${moduleName}. Create it first with: bun maker module:make ${moduleName}`);
  }
  if (!stats.isDirectory()) {
    throw new Error(`Module path is not a directory: src/modules/${moduleName}`);
  }
  return root;
}

/**
 * Build the placeholder substitution map shared by module file generators.
 *
 * The same developer-supplied name reaches four different places in a stub, and
 * each needs a different shape: import paths use the kebab file name, the
 * service identifier is camelCase, the table identifier is camelCase plural and
 * the SQL table name is snake_case plural. Deriving all of them from one
 * canonical name is what keeps a multi-word name from landing in an identifier
 * position as `game-configService`, which parses as subtraction.
 */
function moduleFileVars(moduleName, controller) {
  const base = normalizeName(controller);
  return {
    module: moduleName,
    // File name on disk and therefore every import path that points at it.
    controller: base,
    // Identifier the stubs export and call.
    ServiceName: `${camelCase(base)}Service`,
    ClassName: pascal(base),
    name: leafName(moduleName),
    tableName: plural(snakeCase(base)),
    tableVariable: plural(camelCase(base))
  };
}

/**
 * Generate a controller file for a module.
 * When a matching service exists the controller delegates to it; otherwise it
 * falls back to the standalone shape so the file never imports a missing module.
 */
async function controllerFile(moduleName, controllerName, openApi, withService) {
  const controller = controllerName.trim().toLowerCase();
  const controllerStub = withService
    ? openApi
      ? STUBS.controller.openapi
      : STUBS.controller.plain
    : STUBS.controller.standalone;
  return await stub(controllerStub, moduleFileVars(moduleName, controller));
}

/** Generate a schema file for a module. */
async function schemaFile(moduleName, controllerName, openApi) {
  const controller = controllerName.trim().toLowerCase();
  const schemaStub = openApi ? STUBS.schema.openapi : STUBS.schema.plain;
  return await stub(schemaStub, moduleFileVars(moduleName, controller));
}

/** Generate a service file for a module. withModel picks the Drizzle-backed variant. */
async function serviceFile(moduleName, controllerName, withModel) {
  const controller = controllerName.trim().toLowerCase();
  const serviceStub = withModel ? STUBS.service.named : STUBS.service.plain;
  return await stub(serviceStub, moduleFileVars(moduleName, controller));
}

/** Build the full default scaffold for module:make. */
async function moduleFiles(moduleName, openApi) {
  const name = leafName(moduleName);
  const vars = moduleFileVars(moduleName, name);
  const controllerStub = openApi ? STUBS.controller.openapi : STUBS.controller.plain;
  return {
    "facade.ts": await stub(STUBS.facade.named, vars),
    [`controllers/${name}.ts`]: await stub(controllerStub, vars),
    [`schemas/${name}.ts`]: await schemaFile(moduleName, name, openApi),
    // module:make also writes database/models/<name>.ts, so the service can query it.
    [`services/${name}.ts`]: await serviceFile(moduleName, name, true)
  };
}

/**
 * Generate a wired route file. Only module:make uses this: it owns the whole
 * module, so the controller and schema it just created are known to exist.
 */
async function routeTemplate(moduleName, controllerName = moduleName) {
  const controller = leafName(controllerName);
  const routeStub = openApiEnabled() ? STUBS.route.api : STUBS.route.plain;
  return await stub(routeStub, {
    module: moduleName,
    controller,
    ClassName: pascal(controller),
    ModuleClass: moduleLabel(moduleName)
  });
}

/**
 * Generate a barebone route file that wires to nothing. module:make-route uses
 * this so the developer decides which controller and schema to attach.
 */
async function standaloneRouteTemplate(moduleName, routeName) {
  const routeStub = openApiEnabled() ? STUBS.route.standaloneApi : STUBS.route.standalonePlain;
  return await stub(routeStub, {
    module: moduleName,
    controller: routeName,
    ClassName: pascal(routeName),
    ModuleClass: moduleLabel(moduleName)
  });
}

/** Generate a named model file for a module. */
async function namedModelTemplate(moduleName, name, dialect) {
  const base = normalizeName(name);
  return await stub(STUBS.model.named[dialect], {
    module: moduleName,
    name: base,
    controller: base,
    ClassName: pascal(base),
    tableName: plural(snakeCase(base)),
    tableVariable: plural(camelCase(base))
  });
}

/** Generate a seeder file for a module model. */
async function namedSeederTemplate(moduleName, modelName, className) {
  const base = normalizeName(modelName);
  return await stub(STUBS.seeder.named, {
    module: moduleName,
    // Import path: the model file is named after the model, in kebab-case.
    name: base,
    controller: className,
    ClassName: pascal(className),
    tableName: plural(snakeCase(base)),
    tableVariable: plural(camelCase(base))
  });
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

/**
 * Modules scaffolded before 4.1.0 kept schemas and services inside controllers/
 * and used suffixed filenames. Returns the first legacy path that still exists
 * so lookups resolve for existing projects.
 */
function legacyPath(moduleRootPath, folder, baseName) {
  if (folder === "schemas") {
    return path.join(moduleRootPath, "controllers", `${baseName}.schema.ts`);
  }
  if (folder === "helpers") {
    return path.join(moduleRootPath, "controllers", `${baseName}.helpers.ts`);
  }
  if (folder === "services") {
    return path.join(moduleRootPath, "controllers", `${baseName}.service.ts`);
  }
  return path.join(moduleRootPath, "controllers", `${baseName}.controller.ts`);
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

/**
 * Generate a complete module scaffold (facade, schema, service, controller, route, model, seeder).
 * Pass `--path=<panel>` to nest the module under a panel folder, e.g.
 * `module:make post --path=admin` writes to src/modules/admin/post/.
 */
export async function makeModule(rawName, flags = []) {
  const result = await createModule(rawName, flags);
  reportModule(result);
  return result;
}

/**
 * Create several modules in one run: `module:make post tag testme`.
 *
 * A name that cannot be created is reported and the batch continues, so one bad
 * argument never costs you the modules that were fine. The caller decides the
 * exit code from `failed`.
 */
export async function makeModules(rawNames, flags = []) {
  const created = [];
  const failed = [];
  for (const rawName of rawNames) {
    try {
      created.push(await createModule(rawName, flags));
    } catch (error) {
      failed.push({ name: rawName, reason: error.message });
    }
  }

  if (created.length) {
    console.log(`Module${created.length > 1 ? "s" : ""} ready: ${created.map((item) => item.moduleName).join(", ")}`);
    const panel = created[0].panel;
    if (panel) {
      console.log(`  panel ${panel}  ->  ${created.map((item) => `/api/${item.moduleName}`).join(", ")}`);
    }
  }
  for (const item of failed) {
    console.log(`  skipped ${item.name}: ${item.reason}`);
  }

  return { created, failed };
}

/** Print the per-module summary for a single-module run. */
function reportModule({ moduleName, panel, leaf }) {
  console.log(`Module ready: ${moduleName}`);
  if (panel) console.log(`Panel: ${panel}  ->  /api/${moduleName}`);
  console.log(`Database files: models/${leaf}.ts, seeders/${leaf}.ts`);
  console.log(`Route style: ${openApiEnabled() ? "openapi" : "plain"}`);
  if (panel) {
    console.log(`Fix unresolved imports with: bun maker alias`);
  }
}

/**
 * Scaffold one module.
 *
 * Refuses to touch a module folder that already has content. Without this guard
 * writeFiles overwrites unconditionally, so re-running module:make on an
 * existing module silently destroys the developer's edits to the controller,
 * service, schema and route.
 */
async function createModule(rawName, flags = []) {
  const leaf = assertName(rawName, "Module name");
  const panel = parsePanelPath(flags);
  const moduleName = panel ? `${panel}/${leaf}` : leaf;
  const root = moduleRoot(moduleName);
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");
  if (!force && (await dirHasFiles(root))) {
    throw new Error(`Module already exists: src/modules/${moduleName}. Re-run with --force to overwrite its files.`);
  }
  const openApi = openApiEnabled();
  const files = await moduleFiles(moduleName, openApi);
  const route = await routeTemplate(moduleName);
  const dialect = detectDialect();
  const model = await namedModelTemplate(moduleName, leaf, dialect);
  const seeder = await namedSeederTemplate(moduleName, leaf, leaf);
  await writeFiles(root, { ...files, "routes/index.ts": route });
  await fs.mkdir(path.join(root, "database", "models"), { recursive: true });
  await fs.mkdir(path.join(root, "database", "seeders"), { recursive: true });
  await fs.writeFile(path.join(root, "database", "models", `${leaf}.ts`), model);
  await fs.writeFile(path.join(root, "database", "seeders", `${leaf}.ts`), seeder);
  return { moduleName, panel, leaf };
}

/** Generate a route file for an existing module. */
export async function makeRoute(rawModule, rawControllerOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawControllerOrFlag, extraFlags);
  const root = await assertModuleExists(moduleName);
  const flags = [];
  let routeName = leaf;
  let controllerExplicit = false;
  if (rawControllerOrFlag) {
    if (rawControllerOrFlag.startsWith("--")) flags.push(rawControllerOrFlag);
    else {
      routeName = assertName(rawControllerOrFlag, "Route name");
      controllerExplicit = true;
    }
  }
  flags.push(...extraFlags);
  const route = await standaloneRouteTemplate(moduleName, routeName);
  const routeFile = controllerExplicit ? `${routeName}.ts` : "index.ts";
  const routePath = path.join(root, `routes/${routeFile}`);
  const dryRun = hasFlag(flags, "--dry-run");
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");
  if (dryRun) return;
  let exists = false;
  try {
    await fs.access(routePath);
    exists = true;
  } catch { }
  if (exists && !force)
    throw new Error(`Route file already exists: ${path.relative(process.cwd(), routePath)}. Re-run with --force to overwrite.`);
  await fs.mkdir(path.dirname(routePath), { recursive: true });
  await fs.writeFile(routePath, route);
  console.log(`Route ready: ${path.relative(process.cwd(), routePath)}`);
}

/** Generate a notification module with controller, routes, and job. */
export async function makeNotificationModule(rawName = "notification", flags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawName, flags);
  const root = moduleRoot(moduleName);
  const force = hasFlag(flags, "--force") || hasFlag(flags, "--yes");
  if (!force && (await dirHasFiles(root))) {
    throw new Error(`Module already exists: src/modules/${moduleName}. Re-run with --force to overwrite its files.`);
  }
  const openApi = openApiEnabled();

  await writeFiles(root, {
    [`controllers/${leaf}.ts`]: await stub(STUBS.notification.controller, {
      module: moduleName
    }),
    [`schemas/${leaf}.ts`]: await stub(openApi ? STUBS.notification.schema.openapi : STUBS.notification.schema.plain, {
      module: moduleName
    }),
    "routes/index.ts": await stub(openApi ? STUBS.notification.routeApi : STUBS.notification.routePlain, { module: moduleName }),
    [`jobs/${leaf}.ts`]: await stub(STUBS.notification.job, { module: moduleName })
  });

  console.log(`Notification module ready: ${moduleName}`);
  if (panelOf(moduleName)) console.log(`Panel: ${panelOf(moduleName)}  ->  /api/${moduleName}`);
  console.log(`Route style: ${openApi ? "openapi" : "plain"}`);
  console.log("See docs (packages/docs/guide/notification.md) for Vue UI integration.");
}

/** Soft-delete a module by moving it to storage trash. */
export async function deleteModule(rawName, flags = []) {
  const { moduleName: name, leaf } = resolveModuleRef(rawName, flags);
  if (leaf === "notification") {
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
  // Trash keeps the panel path so admin/post stays distinguishable from admin/user.
  const trashPath = path.join(trashRoot, `${name.replaceAll("/", "-")}-${stamp}`);
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
  const { moduleName, leaf } = resolveModuleRef(rawName, flags);
  const dryRun = hasFlag(flags, "--dry-run");
  const confirmed = hasFlag(flags, "--yes") || hasFlag(flags, "--force");

  const modulePath = moduleRoot(moduleName);

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
      `Refusing to delete notification module without confirmation. Re-run with: bun maker module:delete-notification ${leaf} --yes${panelOf(moduleName) ? ` --path=${panelOf(moduleName)}` : ""}`
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

/**
 * Split "<module> <nameOrFlag> [extraFlags]" into a validated name plus flags.
 * Shared by the per-file commands so they all accept --force/--dry-run the same way.
 */
function parseNameArg(rawNameOrFlag, extraFlags, kindLabel, fallback) {
  const flags = [];
  let name = fallback;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, kindLabel);
  }
  flags.push(...extraFlags);
  return { name, flags };
}

/** Generate a controller for an existing module. */
export async function makeController(rawModule, rawControllerOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawControllerOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawControllerOrFlag, extraFlags, "Controller name", leaf);
  const root = await assertModuleExists(moduleName);
  const lower = name.toLowerCase();
  const hasService = (await pathExists(path.join(root, "services", `${lower}.ts`))) || (await pathExists(legacyPath(root, "services", lower)));
  const content = await controllerFile(moduleName, name, openApiEnabled(), hasService);
  await writeFileSafe(path.join(root, `controllers/${lower}.ts`), content, flags, "Controller file");
}

/** Generate a schema file for an existing module. */
export async function makeSchema(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawNameOrFlag, extraFlags, "Schema name", leaf);
  const root = await assertModuleExists(moduleName);
  const content = await schemaFile(moduleName, name, openApiEnabled());
  await writeFileSafe(path.join(root, `schemas/${name.toLowerCase()}.ts`), content, flags, "Schema file");
}

/**
 * Generate a service file for an existing module.
 * Pass --with-model when the module has database/models/<name>.ts so the
 * service queries the table instead of returning the empty defaults.
 */
export async function makeService(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawNameOrFlag, extraFlags, "Service name", leaf);
  const root = await assertModuleExists(moduleName);
  const lower = name.toLowerCase();
  const withModel = hasFlag(flags, "--with-model") || (await pathExists(path.join(root, "database", "models", `${lower}.ts`)));
  const content = await serviceFile(moduleName, name, withModel);
  await writeFileSafe(path.join(root, `services/${lower}.ts`), content, flags, "Service file");
}

/** Generate a helper file for an existing module. */
export async function makeHelper(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawNameOrFlag, extraFlags, "Helper name", leaf);
  const root = await assertModuleExists(moduleName);
  const content = await stub(STUBS.helper.named, { module: moduleName, name, Name: pascal(name) });
  await writeFileSafe(path.join(root, `helpers/${name}.ts`), content, flags, "Helper file");
}

/** Generate a module-local middleware file for an existing module. */
export async function makeLocalMiddleware(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawNameOrFlag, extraFlags, "Middleware name", leaf);
  const root = await assertModuleExists(moduleName);
  const content = await stub(STUBS.middleware.local, {
    module: moduleName,
    name,
    camel: camelCase(name),
    Name: pascal(name)
  });
  await writeFileSafe(path.join(root, `middlewares/${name}.ts`), content, flags, "Middleware file");
}

/** Generate a types file for an existing module. */
export async function makeType(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const { name, flags } = parseNameArg(rawNameOrFlag, extraFlags, "Type name", leaf);
  const root = await assertModuleExists(moduleName);
  const content = await stub(STUBS.type.named, { module: moduleName, name, Name: pascal(name) });
  await writeFileSafe(path.join(root, `types/${name}.ts`), content, flags, "Type file");
}

/** Generate a model file for an existing module. */
export async function makeModel(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const flags = [];
  let name = leaf;
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

/**
 * Generate a seeder file.
 *
 * A seeder does not have to own the table it writes to, and does not have to
 * write to only one table, so a missing model is not fatal. When the model is
 * there we import it and pre-wire the insert; when it is not we emit the
 * standalone shape and let the developer choose what to write. That is the
 * same trade the controller makes when there is no service, and the service
 * makes when there is no model. Seeder was the only generator that refused.
 */
export async function makeSeeder(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const flags = [];
  let name = leaf;
  if (rawNameOrFlag) {
    if (rawNameOrFlag.startsWith("--")) flags.push(rawNameOrFlag);
    else name = assertName(rawNameOrFlag, "Seeder name");
  }
  flags.push(...extraFlags);
  const root = await assertModuleExists(moduleName);

  // The fallback probes the leaf, not moduleName: for a panel module moduleName
  // is "admin/testme", so using it would look for database/models/admin/testme.ts
  // and never match.
  const modelName = await existingModelName(root, name, leaf);
  let seeder;
  if (modelName) {
    seeder = await namedSeederTemplate(moduleName, modelName, name);
    if (modelName !== name) {
      console.log(`Model '${name}' not found, using module model '${modelName}' for seeder '${name}'.`);
    }
  } else {
    seeder = await stub(STUBS.seeder.standalone, {
      module: moduleName,
      name,
      ClassName: pascal(name),
      // The stub shows this as the conventional table name, so derive it the
      // same way the bound stub does - it is what a model of this name exports.
      tableVariable: plural(camelCase(name))
    });
    const available = await listModels(root);
    console.log(`No model '${name}' in module ${moduleName}, so this is a standalone seeder: it imports no model and writes nothing until you fill it in.`);
    console.log(
      available.length
        ? `  Models in this module: ${available.join(", ")}. Run module:make-seeder ${moduleName} <one of these> for a seeder with the model already imported.`
        : `  This module has no models yet. Create one with: bun maker module:make-model ${moduleName} ${name}`
    );
  }

  await writeFileSafe(path.join(root, `database/seeders/${name}.ts`), seeder, flags, "Seeder file");

  console.log(`Seeder ready: ${moduleName}/${name}`);
}

/** The model a seeder binds to: the requested one, else the module's own. Null when neither exists. */
async function existingModelName(root, name, leaf) {
  for (const candidate of [name, leaf]) {
    if (await pathExists(path.join(root, "database", "models", `${candidate}.ts`))) return candidate;
  }
  return null;
}

/** Model file names in a module, without the extension. Empty when there are none. */
async function listModels(root) {
  try {
    const entries = await fs.readdir(path.join(root, "database", "models"));
    return entries.filter((f) => f.endsWith(".ts")).map((f) => f.slice(0, -3));
  } catch {
    return [];
  }
}

/** Generate a job file for an existing module. */
export async function makeJob(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const flags = [];
  let name = leaf;
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
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const flags = [];
  let name = leaf;
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
export async function assertModuleHasSeeders(rawModule, flags = []) {
  const { moduleName } = resolveModuleRef(rawModule, flags);
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
  // Flatten the panel path: "admin/testme" must not become a nested
  // storage/tmp/schema.admin/testme.<ts>.ts path.
  const slug = moduleName.replaceAll("/", "-");
  const tempSchemaPath = path.join(tempDir, `schema.${slug}.${Date.now()}.ts`);
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
  const { moduleName } = resolveModuleRef(rawModuleName, rawArgs);
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
    if (!keepTemp) await fs.rm(tempSchemaPath, { force: true }).catch(() => { });
  }
}

/** Generate a unit test file for a module. */
export async function makeTest(rawModule, rawNameOrFlag, extraFlags = []) {
  const { moduleName, leaf } = resolveModuleRef(rawModule, rawNameOrFlag, extraFlags);
  const flags = [];
  let name = leaf;
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
