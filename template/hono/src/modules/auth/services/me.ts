import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { sanitizeUser } from "@/modules/auth/helpers/auth.js";

export const meService = {
  me: async (userId: number) => {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId), with: { role: true } });

    if (!user) {
      return { kind: "not_found" as const, message: "User not found" };
    }

    return {
      kind: "found" as const,
      message: "Authenticated user fetched successfully",
      data: sanitizeUser(user)
    };
  }
};
