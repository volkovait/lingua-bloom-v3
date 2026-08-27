export interface TruncationResult {
  readonly truncated: boolean;
  readonly reason?: "missingTerminalBoundary" | "unclosedDelimiter";
}

export function detectTextTruncation(text: string): TruncationResult {
  const trimmed = text.trim();
  if (!trimmed) return { truncated: false };
  if (hasUnclosedDelimiter(trimmed, "(", ")") || hasUnclosedDelimiter(trimmed, "[", "]")) {
    return { truncated: true, reason: "unclosedDelimiter" };
  }
  return /[.!?…]["'»)]?$/u.test(trimmed)
    ? { truncated: false }
    : { truncated: true, reason: "missingTerminalBoundary" };
}

function hasUnclosedDelimiter(text: string, open: string, close: string): boolean {
  let balance = 0;
  for (const character of text) {
    if (character === open) balance += 1;
    else if (character === close) balance -= 1;
  }
  return balance !== 0;
}
