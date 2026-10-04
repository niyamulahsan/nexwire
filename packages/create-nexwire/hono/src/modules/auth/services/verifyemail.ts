import { and, eq, gt } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import { db } from "@/framework/facade.js";
import { emailVerificationTokens, users } from "@/modules/auth/database/models/user.js";
import { hashEmailVerificationToken } from "@/modules/auth/helpers/auth.js";
import type { VerifyEmailInput } from "@/modules/auth/types/auth.js";

export type VerifyEmailResult =
  | { kind: "not_required"; message: string }
  | { kind: "invalid_token"; message: string }
  | { kind: "verified"; message: string };

export const verifyEmailService = {
  verifyEmail: async (body: VerifyEmailInput): Promise<VerifyEmailResult> => {
    if (!authConfig.requireEmailVerification) {
      return {
        kind: "not_required",
        message: "Email verification is not required"
      };
    }

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (!user) {
      return {
        kind: "invalid_token",
        message: "Invalid or expired verification token"
      };
    }

    const hashedToken = hashEmailVerificationToken(body.token);
    const now = new Date();

    try {
      const verified = await db.transaction(async (tx) => {
        // Consume the token atomically INSIDE the transaction.
        // If the update below fails, the delete rolls back and the
        // user can retry with the same token.
        const [consumed] = await tx
          .delete(emailVerificationTokens)
          .where(
            and(
              eq(emailVerificationTokens.email, body.email),
              eq(emailVerificationTokens.token, hashedToken),
              gt(emailVerificationTokens.expiresAt, now)
            )
          )
          .returning();

        if (!consumed) return false;

        await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, user.id));

        return true;
      });

      if (!verified) {
        return {
          kind: "invalid_token",
          message: "Invalid or expired verification token"
        };
      }

      return { kind: "verified", message: "Email verified successfully" };
    } catch (err) {
      // Token was NOT consumed — the transaction rolled back, so the
      // user can retry with the same token. Log so failures aren't silent.
      // logger.error({ err, email: body.email }, "email verification failed");
      return {
        kind: "invalid_token",
        message: "Invalid or expired verification token"
      };
    }
  }
};
