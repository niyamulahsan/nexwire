import type { Context } from "hono";
import { deleteCookie, getSignedCookie, setSignedCookie } from "hono/cookie";
import { appConfig, cookieConfig, jwtConfig } from "@/config/index.js";

function originOf(url?: string) {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function needsCrossSiteCookie() {
  const appOrigin = originOf(appConfig.url);
  const frontendOrigin = originOf(appConfig.frontendUrl);
  return Boolean(appOrigin && frontendOrigin && appOrigin !== frontendOrigin);
}

function baseOptions() {
  const crossSiteCookie = needsCrossSiteCookie();
  const sameSite: "None" | "Lax" = crossSiteCookie ? "None" : "Lax";
  return {
    httpOnly: true,
    secure: crossSiteCookie,
    sameSite,
    path: "/"
  };
}

export const cookie = {
  /**
   * Why: Stores short-lived access token cookie for authenticated requests.
   * When: Login/register/refresh responses.
   * Where: Auth controllers/helpers.
   * How: Sets httpOnly cookie with configured access expiry.
   */
  async setAuth(c: Context, token: string) {
    await setSignedCookie(c, `${cookieConfig.name}_access`, token, cookieConfig.secret, {
      ...baseOptions(),
      maxAge: jwtConfig.accessExpirySeconds
    });
  },

  /**
   * Why: Stores refresh token cookie for token rotation.
   * When: Login/register/refresh responses.
   * Where: Auth controllers/helpers.
   * How: Sets httpOnly cookie with explicit or default refresh maxAge.
   */
  async setRefresh(c: Context, token: string, maxAge?: number) {
    await setSignedCookie(c, `${cookieConfig.name}_refresh`, token, cookieConfig.secret, {
      ...baseOptions(),
      maxAge: typeof maxAge === "number" ? maxAge : jwtConfig.refreshExpirySeconds
    });
  },

  /**
   * Why: Reads access token cookie from request context.
   * When: Auth middleware validates request identity.
   * Where: Middleware and auth helpers.
   * How: Resolves cookie by configured access cookie name.
   */
  async getAuth(c: Context) {
    const token = await getSignedCookie(c, cookieConfig.secret, `${cookieConfig.name}_access`);
    return token || undefined;
  },

  /**
   * Why: Reads refresh token cookie from request context.
   * When: Refresh and logout flows.
   * Where: Auth middleware/controllers.
   * How: Resolves cookie by configured refresh cookie name.
   */
  async getRefresh(c: Context) {
    const token = await getSignedCookie(c, cookieConfig.secret, `${cookieConfig.name}_refresh`);
    return token || undefined;
  },

  /**
   * Why: Clears access token cookie.
   * When: Logout or invalid token handling.
   * Where: Auth middleware/controllers.
   * How: Deletes cookie path-scoped to root.
   */
  deleteAuth(c: Context) {
    deleteCookie(c, `${cookieConfig.name}_access`, { path: "/" });
  },

  /**
   * Why: Clears refresh token cookie.
   * When: Logout or invalid token handling.
   * Where: Auth middleware/controllers.
   * How: Deletes cookie path-scoped to root.
   */
  deleteRefresh(c: Context) {
    deleteCookie(c, `${cookieConfig.name}_refresh`, { path: "/" });
  }
};
