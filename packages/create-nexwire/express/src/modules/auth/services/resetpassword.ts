import { and, eq, gt } from "drizzle-orm";
import { db, password } from "@/framework/facade.js";
import { passwordResetTokens, refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { hashResetToken } from "@/modules/auth/helpers/auth.js";
import { ResetPasswordInput } from "@/modules/auth/types/auth.js";

export type ResetPasswordResult = { kind: "invalid_token"; message: string } | { kind: "reset"; message: string };

export const resetPasswordService = {
  resetPassword: async (body: ResetPasswordInput): Promise<ResetPasswordResult> => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (!user) {
      return {
        kind: "invalid_token",
        message: "Invalid or expired reset token"
      };
    }

    // Consume the token atomically: delete-first so concurrent requests
    // can't both pass. Only one caller gets the row back.
    const [consumed] = await db
      .delete(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.email, body.email),
          eq(passwordResetTokens.token, hashResetToken(body.token)),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .returning();

    if (!consumed) {
      return {
        kind: "invalid_token",
        message: "Invalid or expired reset token"
      };
    }

    const hashedPassword = await password.hashPassword(body.password);

    await db.transaction(async (tx) => {
      await tx.update(users).set({ password: hashedPassword, updatedAt: new Date() }).where(eq(users.email, body.email));

      await tx.update(refreshTokens).set({ revoked: 1 }).where(eq(refreshTokens.userId, user.id));
    });

    return {
      kind: "reset",
      message: "Password reset successfully"
    };
  }
};
