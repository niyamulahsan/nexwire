import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { db, HttpStatusCodes } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";

export const index = async (_req: Request, res: Response, _next: NextFunction) => {
  const result = await db.query.roles.findMany();
  return res.status(HttpStatusCodes.OK).json({ message: "Success", data: result });
};

export const show = async (req: Request, res: Response, _next: NextFunction) => {
  const { id } = req.params;
  const result = await db.query.roles.findFirst({ where: eq(roles.id, Number(id)) });
  return res.status(HttpStatusCodes.OK).json({ message: "Success", data: result });
};
