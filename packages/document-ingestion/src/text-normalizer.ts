export interface NormalizationSpan {
  readonly normalizedStart: number;
  readonly normalizedEnd: number;
  readonly rawStart: number;
  readonly rawEnd: number;
}

export interface NormalizedText {
  readonly rawText: string;
  readonly normalizedText: string;
  readonly spans: readonly NormalizationSpan[];
}

export interface RawTextRange {
  readonly rawStart: number;
  readonly rawEnd: number;
}

export function normalizeTextWithSpans(rawText: string): NormalizedText {
  let normalizedText = "";
  const spans: NormalizationSpan[] = [];
  let rawIndex = 0;

  const append = (value: string, rawStart: number, rawEnd: number) => {
    if (!value) return;
    const normalizedStart = normalizedText.length;
    normalizedText += value;
    spans.push({
      normalizedStart,
      normalizedEnd: normalizedText.length,
      rawStart,
      rawEnd
    });
  };

  while (rawIndex < rawText.length) {
    const character = rawText[rawIndex] ?? "";
    const newlineLength =
      character === "\r" && rawText[rawIndex + 1] === "\n"
        ? 2
        : character === "\r" || character === "\n"
          ? 1
          : 0;

    if (
      character === "-" &&
      /\p{L}/u.test(rawText[rawIndex - 1] ?? "") &&
      (rawText[rawIndex + 1] === "\n" ||
        (rawText[rawIndex + 1] === "\r" && rawText[rawIndex + 2] === "\n")) &&
      /\p{Ll}/u.test(rawText[rawIndex + (rawText[rawIndex + 1] === "\r" ? 3 : 2)] ?? "")
    ) {
      rawIndex += rawText[rawIndex + 1] === "\r" ? 3 : 2;
      continue;
    }

    if (newlineLength > 0 || /\s/u.test(character)) {
      const whitespaceStart = rawIndex;
      rawIndex += newlineLength || 1;
      while (rawIndex < rawText.length && /\s/u.test(rawText[rawIndex] ?? "")) rawIndex += 1;
      if (normalizedText.length > 0 && rawIndex < rawText.length) {
        append(" ", whitespaceStart, rawIndex);
      }
      continue;
    }

    append(character, rawIndex, rawIndex + 1);
    rawIndex += 1;
  }

  return { rawText, normalizedText, spans };
}

export function mapNormalizedRangeToRaw(
  result: NormalizedText,
  normalizedStart: number,
  normalizedEnd: number
): RawTextRange {
  if (
    normalizedStart < 0 ||
    normalizedEnd < normalizedStart ||
    normalizedEnd > result.normalizedText.length
  ) {
    throw new RangeError("Normalized range is outside the normalized text");
  }
  if (normalizedStart === normalizedEnd) {
    const next = result.spans.find((span) => span.normalizedStart >= normalizedStart);
    const rawOffset = next?.rawStart ?? result.rawText.length;
    return { rawStart: rawOffset, rawEnd: rawOffset };
  }
  const overlapping = result.spans.filter(
    (span) => span.normalizedEnd > normalizedStart && span.normalizedStart < normalizedEnd
  );
  const first = overlapping[0];
  const last = overlapping.at(-1);
  if (!first || !last) throw new RangeError("Normalized range has no source span");
  return { rawStart: first.rawStart, rawEnd: last.rawEnd };
}
