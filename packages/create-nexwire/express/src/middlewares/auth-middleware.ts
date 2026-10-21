import { type NextFunction, type Request, type Response } from "express";
import { cookie, HttpStatusCodes, jwt } from "@/framework/facade.js";
import { resolveAuthProvider } from "@/framework/auth/adapter.js";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const provider = await resolveAuthProvider();
  if (!provider) {
    console.warn("[auth-middleware] auth provider not available; skipping auth. Register a provider via registerAuthProvider() or restore @/modules/auth.");
    return next();
  }

  const accessToken = await cookie.getAuth(req);

  if (accessToken) {
    const accessPayload: any = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await provider.getUserById((accessPayload as any)?.id);

      if (!user) {
        cookie.deleteAuth(res);
        cookie.deleteRefresh(res);
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
      }

      let authCtx: any;
      if (provider.getAuthContext) {
        authCtx = await provider.getAuthContext(user, accessPayload);
      } else {
        authCtx = {
          ...(accessPayload || {}),
          id: (user as any).id,
          email: (user as any).email,
          roleId: (user as any).role?.id ?? (user as any).roleId ?? null,
          role: (user as any).role?.name ?? (user as any).role ?? null,
          ...(user as any)
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

  const refreshPayload: any = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  const storedToken = await provider.findRefreshToken((refreshPayload as any)?.jti);

  if (!storedToken || (storedToken as any).revoked) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  const expiresAt = (storedToken as any).expiresAt;
  if (expiresAt) {
    const exp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      if (provider.deleteRefreshToken) await provider.deleteRefreshToken((storedToken as any).id);
      else if (provider.revokeRefreshToken) await provider.revokeRefreshToken((storedToken as any).id);
      cookie.deleteAuth(res);
      cookie.deleteRefresh(res);
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
    }
  }

  const user = await provider.getUserById((refreshPayload as any)?.id);

  if (!user) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
  }

  let baseCtx: any;
  if (provider.getAuthContext) {
    baseCtx = await provider.getAuthContext(user, refreshPayload);
  } else {
    baseCtx = {
      ...(refreshPayload || {}),
      id: (user as any).id,
      email: (user as any).email,
      roleId: (user as any).role?.id ?? (user as any).roleId ?? null,
      role: (user as any).role?.name ?? (user as any).role ?? null,
      ...(user as any)
    };
  }

  const newAccessToken = await jwt.generateToken(
    {
      id: (user as any).id,
      email: (user as any).email,
      roleId: baseCtx?.roleId ?? (user as any).role?.id ?? (user as any).roleId ?? null,
      role: baseCtx?.role ?? (user as any).role?.name ?? (user as any).role ?? null
    },
    "access"
  );

  await cookie.setAuth(res, newAccessToken.token);
  res.locals.auth = {
    ...(baseCtx || {}),
    id: (user as any).id,
    email: (user as any).email,
    roleId: baseCtx?.roleId ?? (user as any).role?.id ?? (user as any).roleId ?? null,
    role: baseCtx?.role ?? (user as any).role?.name ?? (user as any).role ?? null,
    type: "access",
    ...(user as any)
  };
  return next();
}
