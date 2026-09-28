import { createRoute, createRouter, HttpStatusCodes, jsonContent, z } from "@/framework/facade.js";
import { authMiddleware } from "@/middlewares/auth-middleware.js";
import { requireRole } from "@/middlewares/role-middleware.js";
import { IdParamsSchema, RoleSchema } from "@/modules/auth/controllers/auth.schema.js";
import { index, show } from "@/modules/auth/controllers/role.controller.js";

const indexRoute = createRoute({
  path: "/role",
  method: "get",
  tags: ["Role"],
  description: "List all roles",
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: z.array(RoleSchema) }), "Role list")
  }
});

const showRoute = createRoute({
  path: "/role/{id}",
  method: "get",
  tags: ["Role"],
  description: "Show one role",
  request: {
    params: IdParamsSchema
  },
  responses: {
    [HttpStatusCodes.OK]: jsonContent(z.object({ message: z.string(), data: RoleSchema.nullable() }), "Role item")
  }
});

export default createRouter()
  .group(authMiddleware)
  .api(indexRoute, [requireRole("admin")], index)
  .api(showRoute, [requireRole("admin")], show);
