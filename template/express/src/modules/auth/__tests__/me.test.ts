import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/framework/facade.js", () => ({
  db: { query: { users: { findFirst: vi.fn() } } }
}));

// NOTE: we do NOT mock "@/modules/auth/helpers/auth.js" — we want the
// real sanitizeUser so the "no password" test is meaningful.

vi.mock("@/modules/auth/database/models/user.js", () => ({
  users: { __table: "users", id: "users.id", email: "users.email" }
}));

import { db } from "@/framework/facade.js";
import { sanitizeUser } from "@/modules/auth/helpers/auth.js";
import { meService } from "@/modules/auth/services/me.js";

/** A user row as it comes from the DB — includes sensitive fields. */
const dbUser = {
  id: 1,
  email: "user@example.com",
  name: "Jane",
  password: "$2b$10$hashedpassword",
  emailVerifiedAt: new Date("2025-01-01"),
  roleId: 2,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  role: { id: 2, name: "user" }
};

describe("meService.me", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns not_found when the user does not exist", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(undefined);

    const result = await meService.me(999);

    expect(result).toEqual({
      kind: "not_found",
      message: "User not found"
    });
  });

  it("strips sensitive fields from the returned user", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(dbUser as any);

    const result = await meService.me(1);

    if (result.kind !== "found") throw new Error("expected found");

    // The real sanitizeUser must not leak the password hash.
    expect(result.data).not.toHaveProperty("password");
  });

  it("returns exactly what sanitizeUser produces", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(dbUser as any);

    const result = await meService.me(1);

    if (result.kind !== "found") throw new Error("expected found");

    expect(result.data).toEqual(sanitizeUser(dbUser as any));
  });

  it("keeps the fields a client actually needs", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(dbUser as any);

    const result = await meService.me(1);

    if (result.kind !== "found") throw new Error("expected found");

    expect(result.data).toMatchObject({
      id: 1,
      email: "user@example.com",
      name: "Jane"
    });
  });

  it("returns the found variant with the expected message", async () => {
    vi.mocked(db.query.users.findFirst).mockResolvedValueOnce(dbUser as any);

    const result = await meService.me(1);

    expect(result).toEqual({
      kind: "found",
      message: "Authenticated user fetched successfully",
      data: expect.objectContaining({ id: 1, email: "user@example.com" })
    });
  });
});
