import { DateTime as Datetime } from "luxon";
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, password, userId } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Account Creation",
    html: `
      <p>Hello ${name},</p>
      <p>Your account was created successfully.</p>
      <p>Email: ${email}</p>
      <p>Password: ${password}</p>
    `
  });

  await dispatchEvent("admin.user.registered", { userId, name, email, createdAt: Datetime.now() }, { broadcast: { roles: ["admin"] } });

  await dispatchEvent("user.registered", { message: "Welcome! Your account has been created." }, { broadcast: { users: [userId] } });

  return { ok: true, userId };
});
