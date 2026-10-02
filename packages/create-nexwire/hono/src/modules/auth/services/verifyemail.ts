import { and, eq, gt } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import { db } from "@/framework/facade.js";
import { emailVerificationTokens, users } from "@/modules/auth/database/models/user.js";
import { hashEmailVerificationToken } from "@/modules/auth/helpers/auth.js";
import { VerifyEmailInput } from "@/modules/auth/types/auth.js";

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

    // Consume the token atomically: delete-first so concurrent requests
    // can't both pass. Only one caller gets the row back.
    const [consumed] = await db
      .delete(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.email, body.email),
          eq(emailVerificationTokens.token, hashEmailVerificationToken(body.token)),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .returning();

    if (!consumed) {
      return {
        kind: "invalid_token",
        message: "Invalid or expired verification token"
      };
    }

    await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.email, body.email));

    return {
      kind: "verified",
      message: "Email verified successfully"
    };
  }
};
