import bcrypt from "bcryptjs";

export const password = {
  /**
   * Why: Hashes plaintext password before persistence.
   * When: Registration and password reset flows.
   * Where: Auth controllers/seeders.
   * How: Uses bcrypt with cost factor 10.
   */
  async hashPassword(inputPassword: string) {
    return await bcrypt.hash(inputPassword, 10);
  },

  /**
   * Why: Compares plaintext password to stored hash.
   * When: Login/authentication checks.
   * Where: Auth controllers/middleware.
   * How: Uses bcrypt secure compare.
   */
  async verifyPassword(inputPassword: string, hashedPassword: string) {
    return await bcrypt.compare(inputPassword, hashedPassword);
  }
};
