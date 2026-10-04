import { and, eq, lt } from "drizzle-orm";
import { db, dispatchEvent, urls } from "@/framework/facade.js";
import { passwordResetTokens, users } from "@/modules/auth/database/models/user.js";
import { hashResetToken, makeResetToken } from "@/modules/auth/helpers/auth.js";
import type { ForgotPasswordInput } from "@/modules/auth/types/auth.js";

export type ForgotPasswordResult = {
  kind: "sent";
  message: string;
};

const TOKEN_TTL_MS = 15 * 60 * 1000;

export const forgotPasswordService = {
  forgotPassword: async (body: ForgotPasswordInput): Promise<ForgotPasswordResult> => {
    const now = new Date();

    // Cleanup + replace happen atomically so a crash mid-flow can't leave
    // the user without a valid token.
    const issued = await db.transaction(async (tx) => {
      // 1. Drop this email's expired tokens (housekeeping, not critical)
      await tx.delete(passwordResetTokens).where(and(eq(passwordResetTokens.email, body.email), lt(passwordResetTokens.expiresAt, now)));

      const user = await tx.query.users.findFirst({
        where: eq(users.email, body.email)
      });

      if (!user) return null;

      // 2. Revoke any existing unexpired token for this email
      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.email, body.email));

      // 3. Issue a fresh one
      const plainToken = makeResetToken();
      const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

      await tx.insert(passwordResetTokens).values({
        email: user.email,
        token: hashResetToken(plainToken),
        expiresAt,
        createdAt: now
      });

      return { user, plainToken };
    });

    // Same response whether or not the user exists (no enumeration).
    if (!issued) {
      return { kind: "sent", message: "Reset link has been sent" };
    }

    const resetUrl = urls.url(`/reset-password?token=${issued.plainToken}&email=${encodeURIComponent(issued.user.email)}`);

    await dispatchEvent("user:forget-password", { email: issued.user.email, name: issued.user.name, resetUrl }, { queue: "mail" });

    return { kind: "sent", message: "Reset link has been sent" };
  }
};
