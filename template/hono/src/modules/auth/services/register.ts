import { eq } from "drizzle-orm";
import { authConfig } from "@/config/index.js";
import { db, dispatchEvent, password, urls } from "@/framework/facade.js";
import { roles } from "@/modules/auth/database/models/role.js";
import { emailVerificationTokens, users } from "@/modules/auth/database/models/user.js";
import {
  hashEmailVerificationToken,
  issueTokens,
  makeEmailVerificationToken,
  revokeCurrentRefreshToken,
  sanitizeUser
} from "@/modules/auth/helpers/auth.js";
import type { RegisterInput } from "@/modules/auth/types/auth.js";

export type RegisterResult =
  | { kind: "email_exists"; message: string }
  | { kind: "verification_required"; message: string }
  | {
      kind: "registered";
      message: string;
      data: {
        user: ReturnType<typeof sanitizeUser>;
        access_token: string;
        refresh_token: string;
        token_type: "Bearer";
      };
    };

const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export const registerService = {
  register: async (c: any, body: RegisterInput): Promise<RegisterResult> => {
    const defaultRole = await db.query.roles.findFirst({
      where: eq(roles.name, "user")
    });

    if (!defaultRole) {
      throw new Error('Default role "user" not found — check your seeds');
    }

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (existingUser) {
      return { kind: "email_exists", message: "Email already exists" };
    }

    const hashedPassword = await password.hashPassword(body.password);
    const now = new Date();

    const created = await db.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(users)
        .values({
          name: body.name,
          email: body.email,
          password: hashedPassword,
          roleId: defaultRole.id
        })
        .returning({ id: users.id });

      if (!inserted) throw new Error("Failed to insert user");

      const user = await tx.query.users.findFirst({
        where: eq(users.id, inserted.id),
        with: { role: true }
      });

      if (!user) throw new Error("Inserted user not found");

      let plainVerifyToken: string | null = null;

      if (authConfig.requireEmailVerification) {
        plainVerifyToken = makeEmailVerificationToken();
        const expiresAt = new Date(now.getTime() + VERIFY_TOKEN_TTL_MS);

        // One active verification token per email
        await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, user.email));

        await tx.insert(emailVerificationTokens).values({
          email: user.email,
          token: hashEmailVerificationToken(plainVerifyToken),
          expiresAt,
          createdAt: now
        });
      }

      return { user, plainVerifyToken };
    });

    // ---- Side effects AFTER commit ----

    if (created.plainVerifyToken) {
      const verifyUrl = urls.url(`/verify-email?token=${created.plainVerifyToken}&email=${encodeURIComponent(created.user.email)}`);

      await dispatchEvent("user:verify-email", { email: created.user.email, name: created.user.name, verifyUrl }, { queue: "mail" });

      return {
        kind: "verification_required",
        message: "User registered successfully. Please verify your email before logging in."
      };
    }

    await revokeCurrentRefreshToken(c);
    const tokens = await issueTokens(c, created.user, {
      remember: !!body.remember
    });

    await dispatchEvent(
      "user:signup",
      {
        userId: created.user.id,
        email: created.user.email,
        name: created.user.name
        // NO password — see explanation above
      },
      { queue: "mail" }
    );

    return {
      kind: "registered",
      message: "User registered successfully",
      data: {
        user: sanitizeUser(created.user),
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer"
      }
    };
  }
};
