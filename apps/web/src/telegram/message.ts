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
  const lines = [
    "📝 <b>Результаты теста</b>",
    `<b>${escapeTelegramHtml(input.lessonTitle)}</b> · версия ${String(input.lessonVersion)}`,
    `Ученик: ${escapeTelegramHtml(input.studentName)}`,
    `Баллы: <b>${String(input.correctCount)} из ${String(input.totalCount)}</b>`,
    ""
  ];
  for (const row of input.rows) {
    lines.push(
      `${row.correct ? "✅" : "❌"} ${String(row.ordinal)}. ${escapeTelegramHtml(row.submitted || "—")}`
    );
    if (!row.correct)
      lines.push(`   Верно: ${escapeTelegramHtml(row.acceptedValues.join(" / ") || "—")}`);
  }
  return lines.join("\n");
}

export function escapeTelegramHtml(value: string) {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");
}
