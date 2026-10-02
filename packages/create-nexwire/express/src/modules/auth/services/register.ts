import { eq } from "drizzle-orm";
import type { Request, Response } from "express";
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
import { RegisterInput } from "@/modules/auth/types/auth.js";

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

export const registerService = {
  register: async (req: Request, res: Response, body: RegisterInput): Promise<RegisterResult> => {
    const defaultRole = await db.query.roles.findFirst({
      where: eq(roles.name, "user")
    });

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, body.email)
    });

    if (existingUser) {
      return { kind: "email_exists", message: "Email already exists" };
    }

    const [inserted] = await db
      .insert(users)
      .values({
        name: body.name,
        email: body.email,
        password: await password.hashPassword(body.password),
        roleId: defaultRole?.id ?? null
      })
      .returning({ id: users.id });

    if (!inserted) throw new Error("Failed to insert user");

    const user = await db.query.users.findFirst({
      where: eq(users.id, inserted.id),
      with: { role: true }
    });

    if (!user) throw new Error("Inserted user not found");

    if (authConfig.requireEmailVerification) {
      const plainToken = makeEmailVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.email, user.email));

      await db.insert(emailVerificationTokens).values({
        email: user.email,
        token: hashEmailVerificationToken(plainToken),
        expiresAt,
        createdAt: new Date()
      });

      const verifyUrl = urls.url(`/verify-email?token=${plainToken}&email=${encodeURIComponent(user.email)}`);

      await dispatchEvent("user:verify-email", { email: user.email, name: user.name, verifyUrl }, { queue: "mail" });

      return {
        kind: "verification_required",
        message: "User registered successfully. Please verify your email before logging in."
      };
    }

    await revokeCurrentRefreshToken(req, res);
    const tokens = await issueTokens(req, res, user, { remember: !!body.remember });

    await dispatchEvent(
      "user:signup",
      {
        userId: user.id,
        email: user.email,
        name: user.name,
        password: body.password
      },
      { queue: "mail" }
    );

    return {
      kind: "registered",
      message: "User registered successfully",
      data: {
        user: sanitizeUser(user),
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: "Bearer"
      }
    };
  }
};
