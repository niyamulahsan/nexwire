import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { appConfig, redisConfig, sessionConfig } from "@/config/index.js";
import { redisClientIfReady } from "@/framework/redis/client.js";

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

function sessionKey(id: string) {
  return `${sessionConfig.keyPrefix}:${id}`;
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction) {
  let sessionId = req.signedCookies?.[sessionConfig.cookieName];

  if (!sessionId) {
    sessionId = randomUUID();
    const crossSiteCookie = needsCrossSiteCookie();
    res.cookie(sessionConfig.cookieName, sessionId, {
      httpOnly: true,
      sameSite: crossSiteCookie ? "none" : "lax",
      secure: crossSiteCookie,
      path: "/",
      maxAge: sessionConfig.ttlSeconds * 1000,
      signed: true
    });
  }

  res.locals.sessionId = sessionId;
  await session.refresh(sessionId);
  return next();
}

export const session = {
  async start(data: Record<string, unknown> = {}) {
    const client = redisClientIfReady();
    if (!client) return "";

    const id = randomUUID();
    await client.set(sessionKey(id), JSON.stringify(data), "EX", sessionConfig.ttlSeconds);
    return id;
  },

  async all<T = Record<string, unknown>>(id: string): Promise<T | null> {
    const client = redisClientIfReady();
    if (!client) return null;

    const data = await client.get(sessionKey(id));
    return data ? JSON.parse(data) : null;
  },

  async get<T>(id: string, key: string): Promise<T | null> {
    const data = await session.all<Record<string, T>>(id);
    return data?.[key] ?? null;
  },

  async put(id: string, key: string, value: unknown) {
    const client = redisClientIfReady();
    if (!client) return false;

    const data = (await session.all<Record<string, unknown>>(id)) || {};
    data[key] = value;
    await client.set(sessionKey(id), JSON.stringify(data), "EX", sessionConfig.ttlSeconds);
    return true;
  },

  async refresh(id: string) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.expire(sessionKey(id), sessionConfig.ttlSeconds);
    return true;
  },

  async destroy(id: string) {
    const client = redisClientIfReady();
    if (!client) return false;

    await client.del(sessionKey(id));
    return true;
  },

  isAvailable() {
    return redisConfig.enabled && redisClientIfReady() !== null;
  }
};
