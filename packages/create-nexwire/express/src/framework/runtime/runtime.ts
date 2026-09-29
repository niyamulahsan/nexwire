export type Runtime = "node" | "bun" | "unknown";

const runtimeGlobals = globalThis as Record<string, unknown>;

/**
 * Why: Select the correct driver/flavor when a runtime has specialized packages.
 * When: Loading DB clients, web servers, and queues that vary per runtime.
 * Where: Framework bootstrap and driver resolution layers.
 * How: Inspects global runtime markers (Bun) and falls back to Node/unknown.
 */
export function runtime(): Runtime {
  if (runtimeGlobals.Bun !== undefined) return "bun";
  if (typeof process !== "undefined" && process.versions?.node) return "node";
  return "unknown";
}

export function isBun(): boolean {
  return runtime() === "bun";
}

export function isNode(): boolean {
  return runtime() === "node";
}
