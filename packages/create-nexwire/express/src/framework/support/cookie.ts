import type { Request, Response } from "express";
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
  const sameSite: "none" | "lax" = crossSiteCookie ? "none" : "lax";
  return {
    httpOnly: true,
    secure: crossSiteCookie,
    sameSite,
    path: "/"
  };
}

export const cookie = {
  async setAuth(res: Response, token: string) {
    res.cookie(`${cookieConfig.name}_access`, token, {
      ...baseOptions(),
      maxAge: jwtConfig.accessExpirySeconds * 1000,
      signed: true
    });
  },

  async setRefresh(res: Response, token: string, maxAge?: number) {
    res.cookie(`${cookieConfig.name}_refresh`, token, {
      ...baseOptions(),
      maxAge: (typeof maxAge === "number" ? maxAge : jwtConfig.refreshExpirySeconds) * 1000,
      signed: true
    });
  },

  async getAuth(req: Request) {
    return req.signedCookies?.[`${cookieConfig.name}_access`];
  },

  async getRefresh(req: Request) {
    return req.signedCookies?.[`${cookieConfig.name}_refresh`];
  },

  deleteAuth(res: Response) {
    res.clearCookie(`${cookieConfig.name}_access`, { path: "/" });
  },

  deleteRefresh(res: Response) {
    res.clearCookie(`${cookieConfig.name}_refresh`, { path: "/" });
  }
};
