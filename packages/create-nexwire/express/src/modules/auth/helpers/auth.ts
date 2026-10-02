import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { jwtConfig } from "@/config/index.js";
import { cookie, db, jwt } from "@/framework/facade.js";
import { refreshTokens } from "@/modules/auth/database/models/user.js";
import { users } from "@/modules/auth/database/models/user.js";

export function hasRole(auth: any, rolesToMatch: string[]) {
  const role = String(auth?.role || "").toLowerCase();
  return rolesToMatch.includes(role);
}

export async function getCurrentUser(auth: any) {
  if (!auth?.id) return null;
  return db.query.users.findFirst({
    where: eq(users.id, Number(auth.id)),
    with: { role: true },
    columns: {
      password: false,
      rememberToken: false,
    }
  });
}

export function sanitizeUser(user: any) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    emailVerifiedAt: user.emailVerifiedAt ? String(user.emailVerifiedAt) : null,
    roleId: user.roleId ?? null,
    role: user.role || null,
    createdAt: user.createdAt ? String(user.createdAt) : null,
    updatedAt: user.updatedAt ? String(user.updatedAt) : null
  };
}

export function makeResetToken() {
  return randomBytes(32).toString("hex");
}

export function makeEmailVerificationToken() {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function revokeCurrentRefreshToken(req: Request, _res: Response) {
  const token = await cookie.getRefresh(req);
  if (!token) return;

  const payload = await jwt.verifyToken(token, "refresh");
  if (payload?.jti) {
    await db.delete(refreshTokens).where(eq(refreshTokens.jti, payload.jti as string));
  }
}

export async function issueTokens(_req: Request, res: Response, user: any, options?: { remember?: boolean; }) {
  const remember = !!options?.remember;
  const refreshExpiry = remember ? jwtConfig.refreshRememberExpirySeconds : jwtConfig.refreshExpirySeconds;
  const role = user.role || null;
  const accessToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      roleId: role?.id ?? null,
      role: role?.name ?? null,
      remember
    },
    "access"
  );
  const refreshToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      roleId: role?.id ?? null,
      role: role?.name ?? null,
      remember
    },
    "refresh",
    refreshExpiry
  );

  if (refreshToken.jti) {
    await db.insert(refreshTokens).values({
      userId: user.id,
      jti: refreshToken.jti,
      revoked: 0,
      expiresAt: new Date(refreshToken.exp * 1000)
    });
  }

  await cookie.setAuth(res, accessToken.token);
  await cookie.setRefresh(res, refreshToken.token, refreshExpiry);

  return { accessToken: accessToken.token, refreshToken: refreshToken.token };
}
