// config/security.ts
import { env } from "@/env.js";

const isProd = env.APP_ENV === "production";

/**
 * Dev CSP is intentionally lax so HMR / inline bootstrap scripts work.
 * Prod CSP is strict and blocks unsafe-inline.
 *
 * NOTE: if you serve a bundled SPA (Vite/Next) in prod, you MUST add
 * either a nonce, a hash, or 'unsafe-inline' to script-src — otherwise
 * the inline bootstrap script will be blocked, exactly as you saw.
 */
const csp = isProd
  ? [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net",         // Scalar UI loads its bundle from jsdelivr CDN
      "style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.scalar.com",
      "connect-src 'self' https://cdn.jsdelivr.net https://api.scalar.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'"
    ].join("; ")
  : [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "img-src 'self' data: blob: https://cdn.jsdelivr.net",
      "font-src 'self' data: https://cdn.jsdelivr.net https://fonts.scalar.com",
      "connect-src 'self' ws: wss: https://cdn.jsdelivr.net https://api.scalar.com",   // HMR websocket + Scalar
      "frame-ancestors 'none'"
    ].join("; ");

export const securityConfig = {
  enabled: env.SECURITY_HEADERS,
  csp,
  hsts: env.APP_ENV === "production",
  hstsMaxAge: "max-age=31536000; includeSubDomains",
  xFrame: "DENY"
};

export type SecurityConfig = typeof securityConfig;
