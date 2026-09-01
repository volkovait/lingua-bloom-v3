import "server-only";

export class TelegramProviderError extends Error {
  constructor(readonly category: "unauthorized" | "rate_limited" | "provider" | "network") {
    super("Telegram provider request failed");
    this.name = "TelegramProviderError";
  }
}

export async function sendTelegramMessage(input: {
  readonly token: string;
  readonly chatId: string;
  readonly text: string;
}) {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${input.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: input.chatId, text: input.text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new TelegramProviderError("network");
  }
  if (!response.ok)
    throw new TelegramProviderError(
      response.status === 401 || response.status === 404
        ? "unauthorized"
        : response.status === 429
          ? "rate_limited"
          : "provider"
    );
  const payload = (await response.json().catch(() => null)) as {
    readonly ok?: boolean;
    readonly result?: { readonly message_id?: number };
  } | null;
  if (!payload?.ok) throw new TelegramProviderError("provider");
  return String(payload.result?.message_id ?? "");
}
