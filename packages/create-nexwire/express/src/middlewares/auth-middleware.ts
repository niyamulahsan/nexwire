import { eq } from "drizzle-orm";
import { type NextFunction, type Request, type Response } from "express";
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

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const ok = await loadAuthModels();
  if (!ok || !users || !refreshTokens) {
    console.warn("[auth-middleware] auth models not available; skipping auth (no /@/modules/auth/database/models/user.js). Replace with your own auth middleware if needed.");
    return next();
  }
  const accessToken = await cookie.getAuth(req);

  if (accessToken) {
    const accessPayload = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, accessPayload.id as number),
        with: { role: true }
      });

      if (!user) {
        cookie.deleteAuth(res);
        cookie.deleteRefresh(res);
        return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
      }

      res.locals.auth = {
        ...accessPayload,
        id: user.id,
        email: user.email,
        roleId: user.role?.id ?? null,
        role: user.role?.name ?? null
      };
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

  const storedToken = await db.query.refreshTokens.findFirst({
    where: eq(refreshTokens.jti, refreshPayload.jti as string)
  });

  if (!storedToken || storedToken.revoked) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  if (storedToken.expiresAt.getTime() < Date.now()) {
    await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id));
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Invalid token" });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, refreshPayload.id as number),
    with: { role: true }
  });

  if (!user) {
    cookie.deleteAuth(res);
    cookie.deleteRefresh(res);
    return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
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

  await cookie.setAuth(res, newAccessToken.token);
  res.locals.auth = {
    id: user.id,
    email: user.email,
    roleId: user.role?.id ?? null,
    role: user.role?.name ?? null,
    type: "access"
  };
  return next();
}
