import { databaseConfig } from "./database.js";
import { mailConfig } from "./mail.js";
import { redisConfig } from "./redis.js";
import { storageConfig } from "./storage.js";

/**
 * Why: Validates that resolved configs are internally consistent at startup.
 * When: Called before any framework subsystem initializes.
 * Where: kernel.ts, before storage.init() and initRedis().
 * How: Checks cross-config dependencies and throws clear errors for inconsistencies.
 */
export function validateConfig(): void {
  if (!databaseConfig.url) {
    throw new Error("DATABASE_URL is required but is empty");
  }

  if (storageConfig.driver === "s3") {
    if (!storageConfig.bucket) {
      throw new Error("STORAGE_BUCKET is required when storage driver is s3");
    }
    if (!storageConfig.accessKeyId || !storageConfig.secretAccessKey) {
      throw new Error("STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY are required when storage driver is s3");
    }
  }

  if (redisConfig.enabled) {
    try {
      const url = new URL(redisConfig.url);
      if (!url.hostname || url.port === "") {
        throw new Error(`REDIS_URL is invalid: "${redisConfig.url}" — must include host and port`);
      }
    } catch (error) {
      throw new Error(`REDIS_URL is invalid: "${redisConfig.url}" — ${error instanceof Error ? error.message : error}`);
    }
  }

  if (!mailConfig.failSilent && !mailConfig.username) {
    throw new Error("MAIL_USERNAME is required when MAIL_FAIL_SILENT is false");
  }
}
