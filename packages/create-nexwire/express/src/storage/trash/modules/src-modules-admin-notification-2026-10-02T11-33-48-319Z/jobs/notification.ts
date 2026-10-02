import { shouldQueue } from "@/framework/queue/queue.js";
import { logger } from "@/framework/support/logger.js";
import { mail } from "@/framework/support/mail.js";

shouldQueue("admin/notification:mail", "mail", async (job) => {
  const { to, subject, html } = job.data;

  await mail.sendMail({ to, subject, html });
  logger.info("Notification mail sent", { to, subject });

  return { ok: true };
});

