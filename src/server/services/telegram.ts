/** Minimal Telegram Bot API sender. No dependencies; the HTTP client is injectable for tests. */

export interface TelegramConfig {
  token: string;
  chatId: string;
}

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_ADMIN_CHAT_ID;
  return token && chatId ? { token, chatId } : null;
}

/** Returns true when Telegram accepted the message. Never throws. */
export async function sendTelegram(
  cfg: TelegramConfig,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Plain text (no parse_mode), so nothing in a business name can break the message.
      body: JSON.stringify({ chat_id: cfg.chatId, text: text.slice(0, 4000), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) console.error("[admin-alert] Telegram rejected the message, status", res.status);
    return res.ok;
  } catch (err) {
    // Log the failure kind only: the URL contains the bot token.
    console.error("[admin-alert] Telegram request failed:", err instanceof Error ? err.name : "unknown");
    return false;
  }
}