import { env } from "@/env.js";

/**
 * Why: Central, code-visible application identity and runtime settings.
 * When: Server boot, route metadata, OpenAPI titles, and URL resolution.
 * Where: src/config/app.ts.
 * How: App-related values intentionally stay in .env so each deployment can
 *      set them without touching code. Feature toggles (openApi, ui)
 *      are plain literals you can flip here.
 */
export const appConfig = {
  name: env.APP_NAME,
  environment: env.APP_ENV,
  port: env.APP_PORT,
  url: env.APP_URL,
  /**
   * frontendUrl
   * Why: Tells the API where the SPA/UI lives when it is NOT served from
   *      the API's own origin.
   * When: Only set this when the UI runs on a different domain or port
   *      than the API. Leave empty when the API serves the built SPA itself.
   * How: Socket.IO adds it to the allowed CORS origins, and auth/session
   *      cookies switch to SameSite=None + Secure when this origin differs
   *      from appConfig.url (cross-site cookie handling).
   */
  frontendUrl: env.FRONTEND_URL,
  openApiEnabled: env.OPEN_API,
  /**
   * uiEnabled
   * Why: API-only switch. When false the API never serves the UI build:
   *      the public dir is not prepared and the `/*` static + SPA-index
   *      middlewares are not mounted — use this for pure API deployments.
   * When: Set UI=false in .env for API-only mode; keep true when the API
   *      should serve the built SPA.
   * How: kernel.ts gates ensurePublicDir() and the static/SPA middlewares;
   *      server.ts logs the enabled/disabled status.
   */
  uiEnabled: env.UI
};

export type AppConfig = typeof appConfig;
