const shutdownSignals = ["SIGINT", "SIGTERM"] as const;
export type ShutdownSignal = (typeof shutdownSignals)[number];

type ShutdownHandler = (signal: ShutdownSignal) => Promise<void>;

/**
 * Why: Avoid duplicated graceful-shutdown wiring across runtime entrypoints.
 * When: Server/worker/scheduler need signal handling.
 * Where: Runtime bootstrap files.
 * How: Registers SIGINT/SIGTERM handlers and forwards signal to async callback.
 */
export function registerShutdownSignals(handler: ShutdownHandler) {
  for (const signal of shutdownSignals) {
    process.on(signal, () => {
      void handler(signal);
    });
  }
}

/**
 * Why: Keep comma-separated CLI/env parsing consistent.
 * When: Runtime options are provided as a single CSV string.
 * Where: Worker and other entrypoints.
 * How: Trims tokens, removes blanks, and falls back when empty.
 */
export function parseCsvOrFallback(value: string | undefined, fallback: string[]) {
  if (!value) return fallback;

  const parsed = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return parsed.length ? parsed : fallback;
}
