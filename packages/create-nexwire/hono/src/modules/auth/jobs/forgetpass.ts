import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:forget-password", "mail", async (job) => {
  const { email, name, resetUrl } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Reset Your Password",
    html: `
      <p>Hello ${name},</p>
      <p>Click the link below to reset your password:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link will expire in 15 minutes.</p>
    `
  });

  await dispatchEvent("user.changed", { email: email }, { broadcast: { auth: true } });

  return { ok: true, resetUrl };
});
