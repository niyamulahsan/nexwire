import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";

export const table = roles;

export default async function RoleSeeder() {
  const rows = [{ name: "admin" }, { name: "user" }];

  for (const row of rows) {
    const existing = await db.query.roles.findFirst({ where: eq(roles.name, row.name) });
    if (!existing) {
      await db.insert(roles).values({ name: row.name });
    }
  }

  console.log("Role seeder completed");
}
