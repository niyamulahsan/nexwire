import { clearViteCache, runRuntime, runTest, runTestCoverage, runTestUI, runTestWatch, runUi, runVite } from "./core.mjs";
import { initProjectCommands, PROJECT_COMMANDS_PATH } from "../utils/project-commands.mjs";

/** Register runtime commands (dev, serve, queue, schedule, UI tools) on the CLI program. */
export function registerRuntimeCommands(program, rawArgs) {
  program
    .command("dev")
    .description("Start API + Vue 3 UI plus optional workers/tools")
    .option("--view <tools>", "Comma-separated UI tools to launch (redis,maildev,studio)")
    .option("--viewer <tools>", "Alias for --view (npm expands --view to --viewer)")
    .option("--with <tools>", "Alias for --view")
    .option("--with-redis-view", "Launch Redis Commander")
    .option("--with-maildev", "Launch MailDev")
    .option("--with-db-studio", "Launch Drizzle Studio")
    .allowUnknownOption(true)
    .action(async () => runRuntime("dev", rawArgs));
  program
    .command("serve")
    .description("Start HTTP server (dist first if built, else src)")
    .option("--prod", "Run production build")
    .option("--runtime <name>", "Runtime: node or bun", "node")
    .option("--watch", "Watch for file changes (src mode)")
    .option("--src", "Force source mode even if dist exists")
    .allowUnknownOption(true)
    .action(async () => runRuntime("serve", rawArgs));
  program
    .command("queue:work")
    .description("Start queue worker (dist first if built, else src)")
    .option("--queue <name>", "Queue name", "default")
    .option("--prod", "Run production build")
    .option("--runtime <name>", "Runtime: node or bun", "node")
    .option("--src", "Force source mode even if dist exists")
    .allowUnknownOption(true)
    .action(async () => runRuntime("queue:work", rawArgs));
  program
    .command("queue:clear")
    .description("Clear all queue keys")
    .allowUnknownOption(true)
    .action(async () => runRuntime("queue:clear", rawArgs));
  program
    .command("schedule:work")
    .description("Start scheduler worker (dist first if built, else src)")
    .option("--prod", "Run production build")
    .option("--runtime <name>", "Runtime: node or bun", "node")
    .option("--src", "Force source mode even if dist exists")
    .allowUnknownOption(true)
    .action(async () => runRuntime("schedule:work", rawArgs));
  program
    .command("maildev:view")
    .description("Start MailDev SMTP and web UI")
    .allowUnknownOption(true)
    .action(async () => runUi("maildev:view"));
  program
    .command("redis:view")
    .description("Start Redis Commander UI")
    .allowUnknownOption(true)
    .action(async () => runUi("redis:view"));
  program
    .command("ui:dev")
    .description("Start Vue 3 UI from src/resources")
    .allowUnknownOption(true)
    .action(async () => runVite("src/resources/vite.config.ts"));
  program
    .command("admin:dev")
    .description("Start admin UI dev server")
    .allowUnknownOption(true)
    .action(async () => runVite("src/resources/vite.config.ts"));
  program
    .command("vite:cache:clear")
    .description("Clear Vite cache folders (cross-platform)")
    .allowUnknownOption(true)
    .action(async () => clearViteCache());
  program
    .command("maker:init")
    .description(`Create ${PROJECT_COMMANDS_PATH} for your own commands`)
    .option("--force", "Overwrite an existing file")
    .allowUnknownOption(true)
    .action(async (options) => {
      const { created, overwritten } = await initProjectCommands(process.cwd(), { force: Boolean(options?.force) });
      // created = written into a new file; overwritten = replaced under --force.
      // Neither means the file was already there and was left alone.
      console.log(
        created || overwritten
          ? `Add your commands to ${PROJECT_COMMANDS_PATH}, then run: maker --help`
          : `${PROJECT_COMMANDS_PATH} already exists and was left alone. Edit it to add commands, or re-run with --force to replace it.`
      );
    });
  program
    .command("test")
    .description("Run Vitest backend tests")
    .allowUnknownOption(true)
    .action(async () => {
      const args = process.argv.slice(3);
      await runTest(args);
    });
  program
    .command("test:watch")
    .description("Run Vitest backend tests in watch mode")
    .allowUnknownOption(true)
    .action(async () => {
      const args = process.argv.slice(3);
      await runTestWatch(args);
    });
  program
    .command("test:coverage")
    .description("Run Vitest backend tests with code coverage")
    .allowUnknownOption(true)
    .action(async () => {
      const args = process.argv.slice(3);
      await runTestCoverage(args);
    });
  program
    .command("test:ui")
    .description("Run Vitest backend tests in UI mode")
    .allowUnknownOption(true)
    .action(async () => {
      const args = process.argv.slice(3);
      await runTestUI(args);
    });
}
