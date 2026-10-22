import type { Context, Next } from "hono";
import { cookie, HttpStatusCodes, jwt } from "@/framework/facade.js";
import { resolveAuthProvider } from "@/framework/providers/adapter.js";

export async function authMiddleware(c: Context, next: Next) {
  const provider = await resolveAuthProvider();
  if (!provider) {
    console.warn(
      "[auth-middleware] auth provider not available; skipping auth. Register one in src/providers/ or restore src/modules/auth."
    );
    return await next();
  }

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

  if (!storedToken || (storedToken as any).revoked) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const expiresAt = (storedToken as any).expiresAt;
  if (expiresAt) {
    const exp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      if (provider.deleteRefreshToken) await provider.deleteRefreshToken((storedToken as any).id);
      else if (provider.revokeRefreshToken) await provider.revokeRefreshToken((storedToken as any).id);
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

  await cookie.setAuth(c, newAccessToken.token);
  c.set("auth", {
    ...(baseCtx || {}),
    id: (user as any).id,
    email: (user as any).email,
    roleId: baseCtx?.roleId ?? (user as any).role?.id ?? (user as any).roleId ?? null,
    role: baseCtx?.role ?? (user as any).role?.name ?? (user as any).role ?? null,
    type: "access",
    ...(user as any)
  });
  return await next();
}
