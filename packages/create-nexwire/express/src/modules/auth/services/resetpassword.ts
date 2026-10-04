import { and, eq, gt } from "drizzle-orm";
import { db, password } from "@/framework/facade.js";
import { passwordResetTokens, refreshTokens, users } from "@/modules/auth/database/models/user.js";
import { hashResetToken } from "@/modules/auth/helpers/auth.js";
import type { ResetPasswordInput } from "@/modules/auth/types/auth.js";

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

    const hashedPassword = await password.hashPassword(body.password);
    const hashedToken = hashResetToken(body.token);
    const now = new Date();

    try {
      const consumed = await db.transaction(async (tx) => {
        // Consume the token atomically inside the transaction.
        // If anything below fails, the delete rolls back and the
        // user can retry with the same token.
        const [row] = await tx
          .delete(passwordResetTokens)
          .where(
            and(
              eq(passwordResetTokens.email, body.email),
              eq(passwordResetTokens.token, hashedToken),
              gt(passwordResetTokens.expiresAt, now)
            )
          )
          .returning();

        if (!row) return false;

        await tx.update(users).set({ password: hashedPassword, updatedAt: now }).where(eq(users.id, user.id));

        await tx.update(refreshTokens).set({ revoked: 1 }).where(eq(refreshTokens.userId, user.id));

        return true;
      });

      if (!consumed) {
        return {
          kind: "invalid_token",
          message: "Invalid or expired reset token"
        };
      }

      return { kind: "reset", message: "Password reset successfully" };
    } catch (err) {
      // Token was NOT consumed — the transaction rolled back, so the
      // user can retry with the same token. Log so failures aren't silent.
      // logger.error({ err, email: body.email }, "password reset failed");
      return {
        kind: "invalid_token",
        message: "Invalid or expired reset token"
      };
    }
  }
};
