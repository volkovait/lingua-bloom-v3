export interface TelegramAttemptRow {
  readonly ordinal: number;
  readonly submitted: string;
  readonly correct: boolean;
  readonly acceptedValues: readonly string[];
}

export function buildTelegramAttemptMessage(input: {
  readonly lessonTitle: string;
  readonly lessonVersion: number;
  readonly studentName: string;
  readonly correctCount: number;
  readonly totalCount: number;
  readonly rows: readonly TelegramAttemptRow[];
}) {
  return buildTelegramAttemptMessages(input).join("\n");
}

export function buildTelegramAttemptMessages(
  input: {
    readonly lessonTitle: string;
    readonly lessonVersion: number;
    readonly studentName: string;
    readonly correctCount: number;
    readonly totalCount: number;
    readonly rows: readonly TelegramAttemptRow[];
  },
  maxLength = 3900
) {
  const header = [
    "📝 <b>Результаты теста</b>",
    `<b>${escapeTelegramHtml(input.lessonTitle)}</b> · версия ${String(input.lessonVersion)}`,
    `Ученик: ${escapeTelegramHtml(input.studentName)}`,
    `Баллы: <b>${String(input.correctCount)} из ${String(input.totalCount)}</b>`
  ].join("\n");
  const continuation = "📝 <b>Результаты теста · продолжение</b>";
  const chunks: string[] = [];
  let current = header;
  for (const row of input.rows) {
    const block = formatRow(row, maxLength - continuation.length - 2);
    if (current.length + block.length + 2 > maxLength) {
      chunks.push(current);
      current = continuation;
    }
    current += `\n\n${block}`;
  }
  chunks.push(current);
  return chunks;
}

export function escapeTelegramHtml(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}

function formatRow(row: TelegramAttemptRow, maxLength: number) {
  const prefix = `${row.correct ? "✅" : "❌"} ${String(row.ordinal)}. `;
  const acceptedPrefix = "\n   Верно: ";
  const accepted = row.correct ? "" : row.acceptedValues.join(" / ") || "—";
  const available = Math.max(
    32,
    maxLength - prefix.length - acceptedPrefix.length - accepted.length
  );
  const submitted = truncate(row.submitted || "—", available);
  const lines = [`${prefix}${escapeTelegramHtml(submitted)}`];
  if (!row.correct)
    lines.push(`   Верно: ${escapeTelegramHtml(truncate(accepted, Math.floor(maxLength / 2)))}`);
  return lines.join("\n");
}

function truncate(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, Math.max(1, maxLength - 1))}…`;
}
