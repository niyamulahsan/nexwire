import { mail, shouldQueue } from "@/framework/facade.js";
import { logger } from "@/framework/support/logger.js";

shouldQueue("notification:mail", "mail", async (job) => {
  const { to, subject, html } = job.data;

  await mail.sendMail({ to, subject, html });
  logger.info("Notification mail sent", { to, subject });

  return { ok: true };
});
