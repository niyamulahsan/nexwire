// ./src/middlewares/auth-middleware.ts

import type { FastifyReply, FastifyRequest } from "fastify";
import { cookie, HttpStatusCodes, jwt, resolveAuthProvider } from "@/framework/facade.js";

function unauthorized(reply: FastifyReply, message = "Unauthorized") {
  return reply.code(HttpStatusCodes.UNAUTHORIZED).send({ message });
}

/**
 * Why: Resolves the access token into a request auth context.
 * When: Protected route groups run this as a scoped `preHandler` hook.
 * Where: `modules/<name>/routes/*.ts` via `addHook("preHandler", authMiddleware)`.
 * How: Verifies the access token, falls back to a rotating refresh token when
 *      needed, and exposes the resolved context as `request.auth`.
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const provider = await resolveAuthProvider();
  if (!provider) {
    console.warn(
      "[auth-middleware] auth provider not available; skipping auth. Register one in src/providers/ or restore src/modules/auth."
    );
    return;
  }

  // Bearer token first (non-browser clients: desktop apps, scripts, mobile).
  // The cookie stays the fallback for the browser SPA.
  const header = request.headers.authorization ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const accessToken = bearer || (await cookie.getAuth(request));

  if (accessToken) {
    const accessPayload: any = await jwt.verifyToken(accessToken, "access");

    if (accessPayload) {
      const user = await provider.getUserById((accessPayload as any)?.id);

      if (!user) {
        cookie.deleteAuth(reply);
        cookie.deleteRefresh(reply);
        return unauthorized(reply);
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
      request.auth = authCtx;
      return;
    }
  }

  const refreshToken = await cookie.getRefresh(request);

  if (!refreshToken) {
    cookie.deleteAuth(reply);
    cookie.deleteRefresh(reply);
    return unauthorized(reply);
  }

  const refreshPayload: any = await jwt.verifyToken(refreshToken, "refresh");

  if (!refreshPayload?.jti) {
    cookie.deleteAuth(reply);
    cookie.deleteRefresh(reply);
    return unauthorized(reply, "Invalid token");
  }

  const storedToken = await provider.findRefreshToken((refreshPayload as any)?.jti);

  if (!storedToken || (storedToken as any).revoked) {
    cookie.deleteAuth(reply);
    cookie.deleteRefresh(reply);
    return unauthorized(reply, "Invalid token");
  }

  const expiresAt = (storedToken as any).expiresAt;
  if (expiresAt) {
    const exp = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
    if (!Number.isNaN(exp) && exp < Date.now()) {
      if (provider.deleteRefreshToken) await provider.deleteRefreshToken((storedToken as any).id);
      else if (provider.revokeRefreshToken) await provider.revokeRefreshToken((storedToken as any).id);
      cookie.deleteAuth(reply);
      cookie.deleteRefresh(reply);
      return unauthorized(reply, "Invalid token");
    }
  }

  const user = await provider.getUserById((refreshPayload as any)?.id);

  if (!user) {
    cookie.deleteAuth(reply);
    cookie.deleteRefresh(reply);
    return unauthorized(reply);
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

  await cookie.setAuth(reply, newAccessToken.token);
  request.auth = {
    ...(baseCtx || {}),
    id: (user as any).id,
    email: (user as any).email,
    roleId: baseCtx?.roleId ?? (user as any).role?.id ?? (user as any).roleId ?? null,
    role: baseCtx?.role ?? (user as any).role?.name ?? (user as any).role ?? null,
    type: "access",
    ...(user as any)
  };
}
