import { env } from "@/env.js";

/**
 * Why: Auth/session cookie naming and signing.
 * When: Setting, reading, and clearing signed auth cookies.
 * Where: src/config/cookie.ts.
 * How: `name` is a plain literal you can change here. `secret` is
 *      confidential and stays in .env (`COOKIE_SECRET`).
 */
export const cookieConfig = {
  name: "nexwire",
  secret: env.COOKIE_SECRET
};

export type CookieConfig = typeof cookieConfig;
