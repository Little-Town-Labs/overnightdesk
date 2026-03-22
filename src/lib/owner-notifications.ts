export async function sendOwnerAlert(message: string): Promise<boolean> {
  const botToken = process.env.OWNER_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.OWNER_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    console.warn(
      "Owner notification skipped: OWNER_TELEGRAM_BOT_TOKEN or OWNER_TELEGRAM_CHAT_ID not configured"
    );
    return false;
  }

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
        }),
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Telegram API error:", response.status, errorText);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send owner notification:", error);
    return false;
  }
}
