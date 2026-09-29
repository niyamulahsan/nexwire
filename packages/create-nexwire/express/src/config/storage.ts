import { env } from "@/env.js";

/**
 * Why: File storage settings for local and S3 backends.
 * When: Storage facade bootstrap and file operations.
 * Where: src/config/storage.ts.
 * How: Driver, disk, region and TTL are plain literals you can change here.
 *      Credentials (access key, secret) are confidential and stay in .env.
 */
export const storageConfig = {
  driver: "local",
  defaultDisk: "public",
  bucket: "",
  region: "us-east-1",
  endpoint: "",
  forcePathStyle: false,
  signedUrlTtlSeconds: 900,
  accessKeyId: env.STORAGE_ACCESS_KEY_ID,
  secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY
};

export type StorageConfig = typeof storageConfig;
