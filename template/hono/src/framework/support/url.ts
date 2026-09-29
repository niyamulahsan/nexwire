import { appConfig } from "@/config/index.js";
import { hasUiBuild } from "@/framework/http/static.js";

export const urls = {
  /**
   * Why: Returns normalized app base URL without trailing slash.
   * When: Building absolute links.
   * Where: Mail/reset URL generation.
   * How: Trims trailing slash from the configured app URL.
   */
  appUrl() {
    return appConfig.url.replace(/\/$/, "");
  },

  /**
   * Why: Builds absolute URL pointing at the SPA page that handles the path.
   * When: Creating links for emails / external callbacks (reset, verify).
   * Where: Auth/password reset and integrations.
   * How: Three independent knobs decide the origin —
   *      appConfig.frontendUrl: the SPA is a separate build/origin (dev Vite
   *          dev server, or a separately deployed SPA). Link there.
   *      appConfig.uiEnabled + hasUiBuild(): the framework serves the built
   *          SPA itself, so the page resolves to the app origin.
   *      appConfig.uiEnabled + no UI build: the Vite dev server is still
   *          running (UI not built yet) — use the origin the maker-cli
   *          injected (NEXWIRE_FRONTEND_URL, dev Vite dev server).
   *      When BOTH origin knobs are unset (API-only mode) there is no SPA to
   *          point at — fall back to the app URL so the link is valid.
   */
  url(path = "") {
    const base =
      appConfig.frontendUrl ||                                // explicit SPA origin — wins
      (appConfig.uiEnabled
        ? hasUiBuild()
          ? urls.appUrl()                                     // built SPA, framework serves it — same origin
          : process.env.NEXWIRE_FRONTEND_URL || urls.appUrl()  // dev Vite dev server — injected by maker-cli
        : appConfig.url);                                     // API-only
    if (!path) return base;
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  }
};
