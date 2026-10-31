// Telegram bot webhook. Answers Telegram at once, then does the slow work (download,
// upload, AI triage) in after() and replies through the Bot API. The conversation
// itself is in lib/telegram-flow.ts.

import { after, NextResponse } from "next/server";
import { msg, parseUpdate, sendMessage, telegram, telegramReady, validSecret, type TgUpdate } from "@/lib/telegram";
import { handle } from "@/lib/telegram-flow";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // triage, the reply, then the delayed image check (10 s wait + up to 20 s)

export async function POST(req: Request) {
  if (!telegramReady()) {
    return NextResponse.json({ error: "Telegram intake is not configured." }, { status: 503 });
  }
  if (!validSecret(telegram.secret, req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Invalid secret token." }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const m = update ? parseUpdate(update) : null;
  if (!update || !m) return NextResponse.json({ ok: true }); // ignored update; 200 so Telegram doesn't retry

  after(async () => {
    try {
      await handle(update, m);
    } catch (err) {
      console.error("[raahat] Telegram report failed:", (err as Error).message);
      await sendMessage(m.chatId, msg(m.lang, "failed"), m.lang, "main");
    }
  });
  return NextResponse.json({ ok: true });
}
