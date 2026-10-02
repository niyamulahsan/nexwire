import { and, eq, lt } from "drizzle-orm";
import { db, dispatchEvent, urls } from "@/framework/facade.js";
import { passwordResetTokens, users } from "@/modules/auth/database/models/user.js";
import { hashResetToken, makeResetToken } from "@/modules/auth/helpers/auth.js";
import { ForgotPasswordInput } from "@/modules/auth/types/auth.js";

export const forgotPasswordService = {
  forgotPassword: async (body: ForgotPasswordInput) => {
    // clean up expired tokens for this email
    await db
      .delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.email, body.email), lt(passwordResetTokens.expiresAt, new Date())));

    const user = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    // Do not reveal whether the email exists. Same response either way.
    if (!user) {
      return { kind: "sent" as const, message: "Reset link has been sent" };
    }

    const plainToken = makeResetToken();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.email, user.email));
    await db.insert(passwordResetTokens).values({
      email: user.email,
      token: hashResetToken(plainToken),
      expiresAt,
      createdAt: new Date()
    });

    const resetUrl = urls.url(`/reset-password?token=${plainToken}&email=${encodeURIComponent(user.email)}`);

    await dispatchEvent("user:forget-password", { email: user.email, name: user.name, resetUrl }, { queue: "mail" });

    return { kind: "sent" as const, message: "Reset link has been sent" };
  }
};
