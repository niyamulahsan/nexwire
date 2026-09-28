import { eq } from "drizzle-orm";
import { db, password } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { users } from "@/modules/auth/database/models/user.js";

export const table = users;

export default async function UserSeeder() {
  const adminRole = await db.query.roles.findFirst({ where: eq(roles.name, "admin") });
  const userRole = await db.query.roles.findFirst({ where: eq(roles.name, "user") });

  const rows = [
    {
      name: "Admin",
      email: "admin@example.com",
      password: await password.hashPassword("Password@123"),
      roleId: adminRole?.id ?? null
    },
    {
      name: "User One",
      email: "user1@example.com",
      password: await password.hashPassword("Password@123"),
      roleId: userRole?.id ?? null
    }
  ];

  for (const row of rows) {
    const existing = await db.query.users.findFirst({ where: eq(users.email, row.email) });
    if (!existing) {
      await db.insert(users).values(row);
    }
  }

  console.log("User seeder completed");
}
