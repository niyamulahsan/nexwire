import { mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:verify-email", "mail", async (job) => {
  const { email, name, verifyUrl } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Verify Your Email",
    html: `
      <p>Hello ${name},</p>
      <p>Thanks for registering. Please verify your email by clicking the link below:</p>
      <p><a href="${verifyUrl}">${verifyUrl}</a></p>
      <p>This link will expire in 24 hours.</p>
    `
  });

  return { ok: true, verifyUrl };
});
