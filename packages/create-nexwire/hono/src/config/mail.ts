import { env } from "@/env.js";

/**
 * Why: SMTP mail transport settings.
 * When: Transactional mail (signup, reset, verify) is sent.
 * Where: src/config/mail.ts.
 * How: Host, ports, encryption, from address and fail-silent are plain
 *      literals. Username/password are credentials and stay in .env.
 */
export const mailConfig = {
  host: "127.0.0.1",
  port: 1089,
  encryption: "none",
  username: env.MAIL_USERNAME,
  password: env.MAIL_PASSWORD,
  fromAddress: "no-reply@example.com",
  failSilent: true,
  maildev: {
    smtpPort: 1089,
    webPort: 1080
  }
};

export type MailConfig = typeof mailConfig;
