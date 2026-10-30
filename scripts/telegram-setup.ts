// Point the Telegram bot at the site and set its profile: description, short
// description and command menu, in English and Hindi. Run once after creating the
// bot with @BotFather, and again if the site address or the bot's wording changes.
//
// .env.local needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL.
// npm run telegram:setup
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  // Imported after dotenv so the module sees the token.
  const { setProfile, setWebhook, telegram } = await import("../src/lib/telegram");
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!telegram.token || !telegram.secret || !base) {
    throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL in .env.local first.");
  }
  const url = `${base}/api/telegram`;
  await setWebhook(url, telegram.secret);
  await setProfile();
  console.log(`Webhook set to ${url}; description, menu and commands set.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
