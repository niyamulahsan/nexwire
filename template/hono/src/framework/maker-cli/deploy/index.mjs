import {
  createDeploy,
  importDumpLocal,
  importDumpRemote,
  initDeployWorkflow,
  initRemoteDeployWorkflow,
  runDeployWorkflow,
  runPromoteWorkflow,
  runRemoteWorkflow
} from "./core.mjs";

export const deployCommands = new Set([
  "deploy:init",
  "deploy:workflow",
  "deploy:workflow:remote",
  "deploy:workflow:promote",
  "deploy:db:import",
  "deploy:db:import:remote"
]);

/** Register deploy:* subcommands on the CLI program. */
export function registerDeployCommands(program, rawArgs) {
  const flags = rawArgs.slice(1);
  program
    .command("deploy:init")
    .description("Generate deploy scaffolding (app + server) and workflow configs")
    .option("--app-only", "Generate app deploy files only")
    .option("--server-only", "Generate server infra files only")
    .option("--dev", "Server infra in dev mode (exposed Redis port)")
    .option("--force", "Overwrite existing deploy folder")
    .option("--runtime <name>", "Runtime: node or bun", "node")
    .option("--pm <name>", "Package manager for node runtime: npm, pnpm, yarn", "npm")
    .allowUnknownOption(true)
    .action(async () => {
      await createDeploy(flags);
      await initDeployWorkflow();
      await initRemoteDeployWorkflow();
    });
  program
    .command("deploy:db:import")
    .description("Import SQL dump into local Docker container (auto-detects MySQL or PostgreSQL)")
    .option("--file <path>", "SQL dump file path", "deploy/nexwire.sql")
    .option("--database <name>", "Target database name", "nexwire")
    .option("--container <name>", "DB container name (mysql-global or postgres-global)")
    .option("--user <name>", "DB user (defaults to server .env or DATABASE_URL)")
    .option("--password <password>", "DB password (falls back to deploy/server/.env, then deploy/.env)")
    .option("--no-drop", "PostgreSQL: keep existing database instead of dropping it for a clean restore")
    .allowUnknownOption(true)
    .action(async () => importDumpLocal(flags));
  program
    .command("deploy:db:import:remote")
    .description("Import SQL dump into remote Docker container via SSH (auto-detects MySQL or PostgreSQL)")
    .option("--config <path>", "Remote workflow config path", "deploy/workflow.remote.json")
    .option("--file <path>", "SQL dump file path", "deploy/nexwire.sql")
    .option("--database <name>", "Target database name", "nexwire")
    .option("--container <name>", "DB container name (mysql-global or postgres-global)")
    .option("--user <name>", "DB user (defaults to server .env or config)")
    .option("--password <password>", "DB password (falls back to remote deploy/server/.env)")
    .option("--dry-run", "Print commands without executing")
    .allowUnknownOption(true)
    .action(async () => importDumpRemote(flags));
  program
    .command("deploy:workflow")
    .description("Run local CI/CD workflow (Docker Desktop) from config file or flags")
    .option("--config <path>", "Workflow config path")
    .option("--server-only", "Run server infra step only")
    .option("--app-only", "Run app deploy step only")
    .option("--refresh", "Regenerate deploy files before running")
    .option("--dry-run", "Print steps without executing")
    .allowUnknownOption(true)
    .action(async () => runDeployWorkflow(flags));
  program
    .command("deploy:workflow:remote")
    .description("Upload full repo and deploy on remote Docker host")
    .option("--config <path>", "Remote workflow config path", "deploy/workflow.remote.json")
    .option("--server-only", "Run server infra step only")
    .option("--app-only", "Run app deploy step only")
    .option("--dry-run", "Print commands without executing")
    .allowUnknownOption(true)
    .action(async () => runRemoteWorkflow(flags));
  program
    .command("deploy:workflow:promote")
    .description("Run local workflow then remote workflow")
    .option("--config <path>", "Workflow config path")
    .option("--server-only", "Run server infra step only")
    .option("--app-only", "Run app deploy step only")
    .option("--refresh", "Regenerate deploy files before running")
    .option("--dry-run", "Print steps without executing")
    .allowUnknownOption(true)
    .action(async () => runPromoteWorkflow(flags));
}
