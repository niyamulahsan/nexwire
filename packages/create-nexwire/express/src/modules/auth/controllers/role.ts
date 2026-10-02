import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";

/**
 * Why: Returns role records for role-aware UI and authorization setup.
 * When: Used by admin/management screens that need available roles.
 * Where: Mounted under auth role routes.
 */
export const index = async (_req: Request, res: Response, _next: NextFunction) => {
  const result = await db.query.roles.findMany();
  return res.status(HttpStatusCodes.OK).json({ message: "Success", data: result });
};

/**
 * Why: Fetches a single role to inspect role metadata by id.
 * When: Used for detail views or role validation checks.
 * Where: Mounted on auth role detail route with path param id.
 */
export const show = async (req: Request, res: Response, _next: NextFunction) => {
  const { id } = req.params;
  const result = await db.query.roles.findFirst({ where: eq(roles.id, Number(id)) });
  return res.status(HttpStatusCodes.OK).json({ message: "Success", data: result });
};
