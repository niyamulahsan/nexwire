import { config } from "dotenv";
import { expand } from "dotenv-expand";
import { z } from "zod";

expand(config({ override: true }));

const envSchema = z
  .object({
    APP_NAME: z.string().default("nexwire"),
    APP_ENV: z.enum(["development", "production", "test"]).default("development"),
    APP_PORT: z.coerce.number().default(3000),
    APP_URL: z.string().trim().min(1, "APP_URL is required in .env"),
    UI: z
      .string()
      .default("true")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    FRONTEND_URL: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    DATABASE_URL: z.string().default("sqlite:./src/storage/database/nexwire.sqlite"),
    REDIS: z
      .string()
      .default("false")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    REDIS_URL: z.string().default("redis://127.0.0.1:6379"),
    REDIS_PREFIX: z
      .string()
      .default("nexwire")
      .transform((value) => value.trim()),
    JWT_ACCESS_SECRET: z.string(),
    JWT_REFRESH_SECRET: z.string(),
    COOKIE_SECRET: z.string(),
    STORAGE_ACCESS_KEY_ID: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    STORAGE_SECRET_ACCESS_KEY: z
      .string()
      .optional()
      .transform((value) => value?.trim() || undefined),
    MAIL_USERNAME: z.string().default(""),
    MAIL_PASSWORD: z.string().default(""),
    OPEN_API: z
      .string()
      .default("true")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    SOCKET: z
      .string()
      .default("false")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0"),
    SECURITY_HEADERS: z
      .string()
      .default("true")
      .transform((value) => value.trim().toLowerCase() !== "false" && value.trim() !== "0")
  })
  .superRefine((data, ctx) => {
    for (const key of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "COOKIE_SECRET"] as const) {
      if (!data[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required`
        });
      }
    }
  });

const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  FRONTEND_URL: parsedEnv.FRONTEND_URL
};

export type Env = typeof env;
