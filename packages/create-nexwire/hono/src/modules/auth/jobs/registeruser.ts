import { DateTime as Datetime } from "luxon";
import { dispatchEvent, mail, shouldQueue } from "@/framework/facade.js";

shouldQueue("user:signup", "mail", async (job) => {
  const { email, name, userId } = job.data;

  await mail.sendMail({
    to: email,
    subject: "Welcome to <AppName>",
    html: `
      <p>Hello ${name},</p>
      <p>Your account was created successfully.</p>
      <p>You can log in any time with the email address and password you chose during signup.</p>
      <p><a href="https://app.example.com/login">Log in to your account</a></p>
    `
  });

  await dispatchEvent("admin.user.registered", { userId, name, email, createdAt: Datetime.now() }, { broadcast: { roles: ["admin"] } });

  await dispatchEvent("user.registered", { message: "Welcome! Your account has been created." }, { broadcast: { users: [userId] } });

  return { ok: true, userId };
});
