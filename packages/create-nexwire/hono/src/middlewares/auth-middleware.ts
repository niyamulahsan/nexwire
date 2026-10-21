import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";
import { cookie, db, HttpStatusCodes, jwt } from "@/framework/facade.js";

let refreshTokens: any = null;
let users: any = null;
let modelsLoaded = false;
let modelsLoadAttempted = false;

async function loadAuthModels() {
  if (modelsLoaded) return true;
  if (modelsLoadAttempted) return false;
  modelsLoadAttempted = true;
  try {
    const userMod = await import("@/modules/auth/database/models/user.js").catch(() => null);
    if (userMod?.users) users = userMod.users;
    if (userMod?.refreshTokens) refreshTokens = userMod.refreshTokens;
    modelsLoaded = !!(users && refreshTokens);
    return modelsLoaded;
  } catch {
    return false;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const ok = await loadAuthModels();
  if (!ok || !users || !refreshTokens) {
    console.warn("[auth-middleware] auth models not available; skipping auth (no /@/modules/auth/database/models/user.js). Replace with your own auth middleware if needed.");
    return await next();
  }
  const accessToken = await cookie.getAuth(c);

  if (accessToken) {
    const accessPayload = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, accessPayload.id as number),
        with: { role: true }
      });

      if (!user) {
        cookie.deleteAuth(c);
        cookie.deleteRefresh(c);
        return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
      }

      c.set("auth", {
        ...accessPayload,
        id: user.id,
        email: user.email,
        roleId: user.role?.id ?? null,
        role: user.role?.name ?? null
      });
      return await next();
    }
  }

  const refreshToken = await cookie.getRefresh(c);

  if (!refreshToken) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const refreshPayload = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.jti, refreshPayload.jti as string)
  });

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  if (storedToken.expiresAt.getTime() < Date.now()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Invalid token" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, refreshPayload.id as number),
    with: { role: true }
  });

  if (!user) {
    cookie.deleteAuth(c);
    cookie.deleteRefresh(c);
    return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
  }

  const newAccessToken = await jwt.generateToken(
    {
      id: user.id,
      email: user.email,
      roleId: user.role?.id ?? null,
      role: user.role?.name ?? null
    },
    "access"
  );

  await cookie.setAuth(c, newAccessToken.token);
  c.set("auth", {
    id: user.id,
    email: user.email,
    roleId: user.role?.id ?? null,
    role: user.role?.name ?? null,
    type: "access"
  });
  return await next();
}
