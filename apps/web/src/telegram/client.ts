import "server-only";

export class TelegramProviderError extends Error {
  constructor(readonly category: "unauthorized" | "rate_limited" | "provider" | "ambiguous") {
    super("Telegram provider request failed");
    this.name = "TelegramProviderError";
  }
}

export async function sendTelegramMessage(input: {
  readonly token: string;
  readonly chatId: string;
  readonly text: string;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: input.chatId, text: input.text, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new TelegramProviderError("ambiguous");
    }
    if (response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        readonly ok?: boolean;
        readonly result?: { readonly message_id?: number };
      } | null;
      if (!payload?.ok) throw new TelegramProviderError("provider");
      return String(payload.result?.message_id ?? "");
    }
    if (response.status === 401 || response.status === 404)
      throw new TelegramProviderError("unauthorized");
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === 2)
      throw new TelegramProviderError(response.status === 429 ? "rate_limited" : "provider");
    await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1_000));
  }
  throw new TelegramProviderError("provider");
}
