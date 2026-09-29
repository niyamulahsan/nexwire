import type { NextFunction, Request, Response } from "express";
import { HttpStatusCodes } from "@/framework/facade.js";

type AuthPayload = {
  role?: string | null;
};

export function requireRole(...allowedRoles: string[]) {
  const roles = allowedRoles.map((role) => role.toLowerCase());

  return async (_req: Request, res: Response, next: NextFunction) => {
    const auth = res.locals.auth as AuthPayload | undefined;

    if (!auth) {
      return res.status(HttpStatusCodes.UNAUTHORIZED).json({ message: "Unauthorized" });
    }

    const userRole = String(auth.role ?? "").toLowerCase();
    if (!roles.includes(userRole)) {
      return res.status(HttpStatusCodes.FORBIDDEN).json({ message: "Forbidden: Insufficient permissions" });
    }

    return next();
  };
}
