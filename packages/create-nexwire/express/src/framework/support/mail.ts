import nodemailer from "nodemailer";
import { mailConfig } from "@/config/index.js";
import { logger } from "@/framework/support/logger.js";
import { CircuitBreaker } from "@/framework/circuit-breaker/cb.js";

type MailPayload = {
  to: string;
  subject: string;
  html?: string;
  text?: string;
};

const transport = nodemailer.createTransport({
  host: mailConfig.host,
  port: mailConfig.port,
  secure: mailConfig.encryption === "ssl",
  auth: mailConfig.username ? { user: mailConfig.username, pass: mailConfig.password } : undefined
});

const mailBreaker = new CircuitBreaker();

export const mail = {
  /**
   * Why: Sends transactional email through configured SMTP transport.
   * When: Features need notifications/password reset/signup email.
   * Where: Jobs and event handlers.
   * How: Uses nodemailer transport and respects the fail-silent setting.
   */
  async sendMail(payload: MailPayload) {
    try {
      return await mailBreaker.exec(() =>
        transport.sendMail({
          from: mailConfig.fromAddress,
          ...payload
        })
      );
    } catch (error) {
      logger.error("Mail send failed", {
        to: payload.to,
        subject: payload.subject,
        error: error instanceof Error ? error.message : error
      });

      if (!mailConfig.failSilent) throw error;
      return null;
    }
  }
};
