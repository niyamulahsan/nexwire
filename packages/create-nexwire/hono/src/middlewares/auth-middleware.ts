import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { cookie, db, HttpStatusCodes, jwt } from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";

export async function authMiddleware(c, next) {
  const { resolveAuthProvider } = await import("@/framework/auth/adapter.js");
  const provider = await resolveAuthProvider();
  if (!provider) {
    console.warn("[auth-middleware] auth provider not available; skipping auth. Register a provider via registerAuthProvider() or restore @/modules/auth.");
    return await next();
  }

  const { cookie, HttpStatusCodes, jwt } = await import("@/framework/facade.js");

  const accessToken = await cookie.getAuth(c);

  if (accessToken) {
    const accessPayload: any = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await provider.getUserById((accessPayload as any)?.id);

      if (!user) {
        cookie.deleteAuth(c);
        cookie.deleteRefresh(c);
        return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
      }

      let authCtx;
      if (provider.getAuthContext) {
        authCtx = await provider.getAuthContext(user, accessPayload);
      } else {
        authCtx = {
          ...(accessPayload || {}),
          id: user.id,
          email: user.email,
          roleId: user.role?.id ?? user.roleId ?? null,
          role: user.role?.name ?? user.role ?? null
        };
      }
      c.set("auth", authCtx);
      return await next();
    }
  }

  const refreshToken = await cookie.getRefresh(c);

  if (!refreshToken) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const refreshPayload: any = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const storedToken = await provider.findRefreshToken((refreshPayload as any)?.jti);

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const expiresAt = storedToken.expiresAt;
  if (expiresAt) {
    const exp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      if (provider.deleteRefreshToken) await provider.deleteRefreshToken(storedToken.id);
      else if (provider.revokeRefreshToken) await provider.revokeRefreshToken(storedToken.id);
      cookie.deleteAuth(c);
      cookie.deleteRefresh(c);
      return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
    }
  }

  const user = await provider.getUserById((refreshPayload as any)?.id);

  if (!user) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  let baseCtx;
  if (provider.getAuthContext) {
    baseCtx = await provider.getAuthContext(user, refreshPayload);
  } else {
    baseCtx = {
      ...(refreshPayload || {}),
      id: user.id,
      email: user.email,
      roleId: user.role?.id ?? user.roleId ?? null,
      role: user.role?.name ?? user.role ?? null
    };
  }

  const newAccessToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      roleId: baseCtx?.roleId ?? user.role?.id ?? null,
      role: baseCtx?.role ?? user.role?.name ?? null
    },
    "access"
  );

  await cookie.setAuth(c, newAccessToken.token);
  c.set("auth", {
    ...(baseCtx || {}),
    id: user.id,
    email: user.email,
    roleId: baseCtx?.roleId ?? user.role?.id ?? null,
    role: baseCtx?.role ?? user.role?.name ?? null,
    type: "access"
  });
  return await next();
}

