export type TextSectionKind = "title" | "instruction" | "exercise";

export interface TextSection {
  readonly kind: TextSectionKind;
  readonly rawText: string;
  readonly rawStart: number;
  readonly rawEnd: number;
}

export function classifyTextSections(rawText: string): TextSection[] {
  const sections: TextSection[] = [];
  let offset = 0;
  let exerciseStarted = false;
  for (const lineWithEnding of rawText.match(/.*(?:\r\n|\n|\r|$)/gu) ?? []) {
    if (!lineWithEnding) continue;
    const rawTextLine = lineWithEnding.replace(/(?:\r\n|\n|\r)$/u, "");
    const rawStart = offset;
    offset += lineWithEnding.length;
    if (!rawTextLine.trim()) continue;
    const isFirstExerciseLine = /^\s*1\.\s/u.test(rawTextLine);
    if (isFirstExerciseLine) exerciseStarted = true;
    const kind: TextSectionKind = /^\s*(?:упражнение|exercise)\b/iu.test(rawTextLine)
      ? "title"
      : exerciseStarted
        ? "exercise"
        : "instruction";
    sections.push({ kind, rawText: rawTextLine, rawStart, rawEnd: rawStart + rawTextLine.length });
  }
  return sections;
}
