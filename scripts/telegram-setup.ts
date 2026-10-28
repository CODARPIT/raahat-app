// Point the Telegram bot at the site and register its commands. Run once after
// creating the bot with @BotFather, and again if the site address changes.
//
// .env.local needs TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL.
// npm run telegram:setup
import { config } from "dotenv";

config({ path: ".env.local" });

async function main() {
  // Imported after dotenv so the module sees the token.
  const { setCommands, setWebhook, telegram } = await import("../src/lib/telegram");
  const base = (process.env.PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
  if (!telegram.token || !telegram.secret || !base) {
    throw new Error("Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and PUBLIC_BASE_URL in .env.local first.");
  }
  const url = `${base}/api/telegram`;
  await setWebhook(url, telegram.secret);
  await setCommands();
  console.log(`Webhook set to ${url}; commands registered.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
