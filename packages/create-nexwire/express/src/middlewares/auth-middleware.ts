import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";
import { cookie, db, HttpStatusCodes, jwt } from "@/framework/facade.js";
import { refreshTokens, users } from "@/modules/auth/database/models/user.js";

export async function authMiddleware(req, res, next) {
  const { resolveAuthProvider } = await import("@/framework/auth/adapter.js");
  const provider = await resolveAuthProvider();
  if (!provider) {
    console.warn("[auth-middleware] auth provider not available; skipping auth. Register a provider via registerAuthProvider() or restore @/modules/auth.");
    return next();
  }

  const { cookie, HttpStatusCodes, jwt } = await import("@/framework/facade.js");

  const accessToken = await cookie.getAuth(req);

  if (accessToken) {
    const accessPayload = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await provider.getUserById(accessPayload.id);

      if (!user) {
        cookie.deleteAuth(res);
        cookie.deleteRefresh(res);
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
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
      res.locals.auth = authCtx;
      return next();
    }
  }

  const refreshToken = await cookie.getRefresh(req);

  if (!refreshToken) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
  }

  const refreshPayload = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  const storedToken = await provider.findRefreshToken(refreshPayload.jti);

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  const expiresAt = storedToken.expiresAt;
  if (expiresAt) {
    const exp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      if (provider.deleteRefreshToken) await provider.deleteRefreshToken(storedToken.id);
      else if (provider.revokeRefreshToken) await provider.revokeRefreshToken(storedToken.id);
      cookie.deleteAuth(res);
      cookie.deleteRefresh(res);
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
    }
  }

  const user = await provider.getUserById(refreshPayload.id);

  if (!user) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
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

  await cookie.setAuth(res, newAccessToken.token);
  res.locals.auth = {
    ...(baseCtx || {}),
    id: user.id,
    email: user.email,
    roleId: baseCtx?.roleId ?? user.role?.id ?? null,
    role: baseCtx?.role ?? user.role?.name ?? null,
    type: "access"
  };
  return next();
}

