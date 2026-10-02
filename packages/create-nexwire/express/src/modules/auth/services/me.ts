import { eq } from "drizzle-orm";
import { db } from "@/framework/facade.js";
import { users } from "@/modules/auth/database/models/user.js";
import { sanitizeUser } from "@/modules/auth/helpers/auth.js";

export type MeResult =
  | { kind: "not_found"; message: string }
  | {
      kind: "found";
      message: string;
      data: ReturnType<typeof sanitizeUser>;
    };

export const meService = {
  me: async (userId: number): Promise<MeResult> => {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { role: true }
    });

    if (!user) {
      return { kind: "not_found", message: "User not found" };
    }

    return {
      kind: "found",
      message: "Authenticated user fetched successfully",
      data: sanitizeUser(user)
    };
  }
};
