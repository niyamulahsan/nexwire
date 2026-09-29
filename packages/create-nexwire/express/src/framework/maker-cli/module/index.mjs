import { runSeed } from "../db/core.mjs";
import { assertName } from "../utils/naming.mjs";
import {
  assertModuleHasSeeders,
  cleanModuleTrash,
  deleteModule,
  deleteNotificationModule,
  listModules,
  makeController,
  makeExampleModule,
  makeJob,
  makeModel,
  makeModule,
  makeNotificationModule,
  makeRoute,
  makeSchedule,
  makeSeeder,
  makeTest,
  runModuleMigrate
} from "./core.mjs";

/** Register module:* subcommands on the CLI program. */
export function registerModuleCommands(program, rawArgs) {
  program
    .command("module:make <name>")
    .description("Create a module with controller, route, model, and seeder folders")
    .allowUnknownOption(true)
    .action(async (name) => makeModule(name));
  program
    .command("module:make-notification [name]")
    .description("Generate notification backend module (controller, routes, job)")
    .allowUnknownOption(true)
    .action(async (name) => {
      const maybeModule = name && !name.startsWith("--") ? name : "";
      await makeNotificationModule(maybeModule || "notification");
    });
  program
    .command("module:example [name]")
    .description("Generate one-shot example module with queue/broadcast/scheduler cases")
    .allowUnknownOption(true)
    .action(async (name) => makeExampleModule(name || "example"));
  program
    .command("module:delete-notification [name]")
    .description("Remove notification module (moves to trash)")
    .option("--yes", "Confirm deletion without prompt")
    .option("--dry-run", "Print what would be deleted without executing")
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
    .allowUnknownOption(true)
    .action(async (name) => deleteModule(name, rawArgs.slice(2)));
  program
    .command("module:trash:clean [name]")
    .description("Permanently remove entries from module trash storage")
    .option("--yes", "Confirm cleanup without prompt")
    .option("--dry-run", "Print what would be cleaned without executing")
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
    .allowUnknownOption(true)
    .action(async (moduleName, controller) => makeRoute(moduleName, controller, rawArgs.slice(controller ? 3 : 2)));
  program
    .command("module:make-controller <module> [name]")
    .description("Generate a controller for an existing module")
    .option("--force", "Overwrite existing controller files")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeController(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-model <module> [name]")
    .description("Generate a model file for an existing module")
    .option("--force", "Overwrite existing model file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeModel(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-seeder <module> [name]")
    .description("Generate a seeder file for an existing module model")
    .option("--force", "Overwrite existing seeder file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeSeeder(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-job <module> [name]")
    .description("Generate a job file for an existing module")
    .option("--force", "Overwrite existing job file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeJob(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:make-console <module> [name]")
    .description("Generate a scheduler/console file for an existing module")
    .option("--force", "Overwrite existing console file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeSchedule(moduleName, name, rawArgs.slice(name ? 3 : 2)));
  program
    .command("module:list")
    .description("List all discovered modules")
    .allowUnknownOption(true)
    .action(async () => listModules());
  program
    .command("module:seed <module>")
    .description("Run seeders for one module")
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
    .allowUnknownOption(true)
    .action(async (moduleName) => runModuleMigrate(moduleName, rawArgs));
  program
    .command("module:make-test <module> [name]")
    .description("Generate a unit test file for a module")
    .option("--force", "Overwrite existing test file")
    .option("--dry-run", "Print what would be created without executing")
    .allowUnknownOption(true)
    .action(async (moduleName, name) => makeTest(moduleName, name, rawArgs.slice(name ? 3 : 2)));
}
