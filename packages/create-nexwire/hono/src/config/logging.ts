/**
 * Why: Logging behavior shared by the framework logger and HTTP request log.
 * When: Logger bootstrap and global HTTP middleware.
 * Where: src/config/logging.ts.
 * How: Plain literals — edit directly. `httpRequests` mirrors the old
 *      `LOG_HTTP` switch: set `false` to quiet per-request console logs.
 */
export const loggingConfig = {
  level: "info",
  httpRequests: true
};

export type LoggingConfig = typeof loggingConfig;
