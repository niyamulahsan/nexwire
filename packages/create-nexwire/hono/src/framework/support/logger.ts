import fs from "node:fs";
import path from "node:path";
import { Writable } from "node:stream";
import pino from "pino";
import { appConfig, loggingConfig } from "@/config/index.js";

const logDir = path.resolve(process.cwd(), "src", "storage", "logs");
const MAX_FILE_BYTES = 10 * 1024 * 1024;

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const LEVEL_COLORS: Record<number, string> = {
  10: "\x1b[90m",
  20: "\x1b[90m",
  30: "\x1b[32m",
  40: "\x1b[33m",
  50: "\x1b[31m",
  60: "\x1b[31m"
};

const RESET = "\x1b[0m";

function formatLine(chunk: string, colorize: boolean): string {
  const line = chunk.trim();
  if (!line) return "";

  let record: Record<string, unknown>;
  try {
    record = JSON.parse(line);
  } catch {
    return colorize ? line : `${line}\n`;
  }

  const time = typeof record.time === "number" ? new Date(record.time) : new Date(String(record.time));
  const timestamp = Number.isNaN(time.getTime()) ? "" : `[${time.toLocaleTimeString("en-GB", { hour12: false })}] `;
  const levelNumber = typeof record.level === "number" ? record.level : 30;
  const label = pino.levels.labels[levelNumber] ?? "info";
  const message = typeof record.msg === "string" ? record.msg : "";

  const ignored = new Set(["time", "level", "msg", "pid", "hostname", "service"]);
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!ignored.has(key)) meta[key] = value;
  }

  const level = colorize ? `${LEVEL_COLORS[levelNumber] ?? ""}${label}${RESET}` : label;
  const metaString = Object.keys(meta).length ? `\n${JSON.stringify(meta, null, 2)}` : "";
  return `${timestamp}${level} -> ${message}${metaString}\n`;
}

function consoleWriter() {
  return new Writable({
    write(chunk, _encoding, callback) {
      const text = formatLine(chunk.toString("utf8"), true);
      if (text) process.stdout.write(text);
      callback();
    }
  });
}

function rotate(filePath: string, maxFiles: number) {
  for (let index = maxFiles - 1; index >= 1; index--) {
    const from = `${filePath}.${index}`;
    const to = `${filePath}.${index + 1}`;
    if (fs.existsSync(from)) fs.renameSync(from, to);
  }
  if (fs.existsSync(filePath)) fs.renameSync(filePath, `${filePath}.1`);
}

function fileWriter(filePath: string, maxFiles: number) {
  let bytes = 0;

  return new Writable({
    write(chunk, _encoding, callback) {
      const text = formatLine(chunk.toString("utf8"), false);
      bytes += Buffer.byteLength(text);
      if (bytes >= MAX_FILE_BYTES) {
        rotate(filePath, maxFiles);
        bytes = 0;
      }
      try {
        fs.appendFileSync(filePath, text);
      } catch {
        // best-effort file logging
      }
      callback();
    }
  });
}

const base = pino(
  {
    level: loggingConfig.level,
    base: { service: appConfig.name },
    timestamp: pino.stdTimeFunctions.isoTime
  },
  pino.multistream([
    { stream: consoleWriter(), level: loggingConfig.level },
    { stream: fileWriter(path.join(logDir, "app.log"), 5), level: "info" },
    { stream: fileWriter(path.join(logDir, "fatal.log"), 3), level: "error" }
  ])
);

type CompatLogger = {
  fatal: (message: string, meta?: Record<string, unknown>) => void;
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info: (message: string, meta?: Record<string, unknown>) => void;
  debug: (message: string, meta?: Record<string, unknown>) => void;
  trace: (message: string, meta?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => CompatLogger;
};

function compat(child: pino.Logger): CompatLogger {
  const wrap = (log: (obj: object, msg?: string, ...args: unknown[]) => void) => (message: string, meta?: Record<string, unknown>) =>
    log.call(child, meta ?? {}, message);

  return {
    fatal: wrap(child.fatal),
    error: wrap(child.error),
    warn: wrap(child.warn),
    info: wrap(child.info),
    debug: wrap(child.debug),
    trace: wrap(child.trace),
    child: (bindings) => compat(child.child(bindings))
  };
}

/**
 * Why: Shared structured logger for app/runtime/framework internals.
 * When: Any code needs operational logs or error reporting.
 * Where: Imported across framework and modules.
 * How: Emits JSON via pino to a color console sink plus rotating app/fatal
 *      files, keeping the legacy `(message, meta)` call signature.
 */
export const logger: CompatLogger = compat(base);

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error: { name: error.name, message: error.message, stack: error.stack } });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection", { error: { name: error.name, message: error.message, stack: error.stack } });
});
