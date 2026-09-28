import { spawnSync } from "node:child_process";

/** Read CLI-relevant values from the TS config via a one-shot tsx eval.
 *  Keeps the dev runner's defaults (queues, maildev ports, redis-view port)
 *  driven by src/config instead of hardcoded/duplicated values. Falls back to
 *  the previous defaults when the config cannot be loaded. */
export function readCliConfig() {
  const script = [
    "import { queueConfig, mailConfig, redisConfig } from './src/config/index.ts';",
    "process.stdout.write(JSON.stringify({",
    "  queues: queueConfig.queues,",
    "  maildev: mailConfig.maildev,",
    "  commanderPort: redisConfig.commanderPort,",
    "  redisEnabled: redisConfig.enabled",
    "}));"
  ].join("");
  const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30000,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0 || !result.stdout) {
    return {
      queues: ["default", "mail", "maintenance"],
      maildev: { smtpPort: 1089, webPort: 1080 },
      commanderPort: 1369,
      redisEnabled: true
    };
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return {
      queues: ["default", "mail", "maintenance"],
      maildev: { smtpPort: 1089, webPort: 1080 },
      commanderPort: 1369,
      redisEnabled: true
    };
  }
}
