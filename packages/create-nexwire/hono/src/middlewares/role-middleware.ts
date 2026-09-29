import type { Context, Next } from "hono";
import { HttpStatusCodes } from "@/framework/facade.js";

type AuthPayload = {
  role?: string | null;
};

export function requireRole(...allowedRoles: string[]) {
  const roles = allowedRoles.map((role) => role.toLowerCase());

  return async (c: Context, next: Next) => {
    const auth = c.get("auth") as AuthPayload | undefined;

    if (!auth) {
      return c.json({ message: "Unauthorized" }, HttpStatusCodes.UNAUTHORIZED);
    }

    const userRole = String(auth.role ?? "").toLowerCase();
    if (!roles.includes(userRole)) {
      return c.json({ message: "Forbidden: Insufficient permissions" }, HttpStatusCodes.FORBIDDEN);
    }

    return await next();
  };
}
