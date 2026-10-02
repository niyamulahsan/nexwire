import { runSeed } from "../db/core.mjs";
import { assertName } from "../utils/naming.mjs";
import {
  assertModuleHasSeeders,
  cleanModuleTrash,
  deleteModule,
  deleteNotificationModule,
  listModules,
  makeController,
  makeHelper,
  makeJob,
  makeLocalMiddleware,
  makeModel,
  makeModule,
  makeModules,
  makeNotificationModule,
  makeRoute,
  makeSchema,
  makeSchedule,
  makeSeeder,
  makeService,
  makeTest,
  makeType,
  runModuleMigrate
} from "./core.mjs";

/** Register module:* subcommands on the CLI program. */
export function registerModuleCommands(program, rawArgs) {
  program
    .command("module:make <names...>")
    .description("Create one or more modules with facade, schema, service, controller, route, model, and seeder folders")
    .option("--path <panel>", "Nest the module(s) under a panel folder (e.g. --path=admin)")
    .option("--force", "Overwrite the files of modules that already exist")
    .allowUnknownOption(true)
    .action(async (names) => {
      const result = await makeModules(names, rawArgs.slice(1 + names.length));
      if (result.failed.length) process.exitCode = 1;
    });
  program
    .command("module:make-notification [name]")
    .description("Generate notification backend module (controller, routes, job)")
    .option("--path <panel>", "Nest the module under a panel folder (e.g. --path=admin)")
    .option("--force", "Overwrite the files of a module that already exists")
    .allowUnknownOption(true)
    .action(async (name) => {
      const maybeModule = name && !name.startsWith("--") ? name : "";
      const flagStart = maybeModule ? 2 : 1;
      await makeNotificationModule(maybeModule || "notification", rawArgs.slice(flagStart));
    });
  program
    .command("module:delete-notification [name]")
    .description("Remove notification module (moves to trash)")
    .option("--yes", "Confirm deletion without prompt")
    .option("--dry-run", "Print what would be deleted without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (name) => {
      const maybeModule = name && !name.startsWith("--") ? name : "";
      const flagStart = maybeModule ? 2 : 1;
      await deleteNotificationModule(maybeModule || "notification", rawArgs.slice(flagStart));
    });
  program
    .command("module:delete <name>")
    .description("Move a module directory to storage trash (soft delete)")
    .option("--yes", "Confirm deletion without prompt")
    .option("--dry-run", "Print what would be deleted without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (name) => deleteModule(name, rawArgs.slice(2)));
  program
    .command("module:trash:clean [name]")
    .description("Permanently remove entries from module trash storage")
    .option("--yes", "Confirm cleanup without prompt")
    .option("--dry-run", "Print what would be cleaned without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (name) => {
      const maybeModule = name && !name.startsWith("--") ? name : "";
      const flagStart = maybeModule ? 2 : 1;
      await cleanModuleTrash(maybeModule, rawArgs.slice(flagStart));
    });
  program
    .command("module:make-route <module> [controller]")
    .description("Generate a route file for an existing module")
    .option("--force", "Overwrite existing route file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, controller) => makeRoute(moduleName, controller, rawArgs.slice(controller ? 3 : 2)));
  program
    .command("module:make-controller <module> [name]")
    .description("Generate a controller for an existing module")
    .option("--force", "Overwrite existing controller file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeController(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-schema <module> [name]")
    .description("Generate a schema file for an existing module")
    .option("--force", "Overwrite existing schema file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeSchema(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-service <module> [name]")
    .description("Generate a service file for an existing module")
    .option("--with-model", "Query database/models/<name>.ts instead of returning empty defaults")
    .option("--force", "Overwrite existing service file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeService(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-helper <module> [name]")
    .description("Generate a helper file in the module's helpers folder")
    .option("--force", "Overwrite existing helper file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeHelper(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-middleware <module> [name]")
    .description("Generate a module-local middleware file for an existing module")
    .option("--force", "Overwrite existing middleware file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeLocalMiddleware(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-type <module> [name]")
    .description("Generate a types file for an existing module")
    .option("--force", "Overwrite existing types file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeType(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-model <module> [name]")
    .description("Generate a model file for an existing module")
    .option("--force", "Overwrite existing model file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeModel(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-seeder <module> [name]")
    .description("Generate a seeder file for an existing module model")
    .option("--force", "Overwrite existing seeder file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeSeeder(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-job <module> [name]")
    .description("Generate a job file for an existing module")
    .option("--force", "Overwrite existing job file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeJob(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-console <module> [name]")
    .description("Generate a scheduler/console file for an existing module")
    .option("--force", "Overwrite existing console file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeSchedule(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:list")
    .description("List all discovered modules")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async () => listModules());
  program
    .command("module:seed <module>")
    .description("Run seeders for one module")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName) => {
      const normalized = assertName(moduleName, "Module name");
      await assertModuleHasSeeders(normalized);
      await runSeed(normalized);
    });
  program
    .command("module:migrate <module>")
    .description("Generate module-only schema, generate migration, then run migrate")
    .option("--keep-temp", "Keep temporary schema file after migration")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName) => runModuleMigrate(moduleName, rawArgs));
  program
    .command("module:make-test <module> [name]")
    .description("Generate a unit test file for a module")
    .option("--force", "Overwrite existing test file")
    .option("--dry-run", "Print what would be created without executing")
    .option("--path <panel>", "Address a module inside a panel folder (e.g. --path=admin)")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeTest(moduleName, name, rawArgs.slice(name ? 3 : 2)));
}
