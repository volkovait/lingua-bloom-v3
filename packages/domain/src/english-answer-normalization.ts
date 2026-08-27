export const ENGLISH_ANSWER_NORMALIZATION_POLICY =
  "english/NFKC+apostrophe+case+contractions+terminal-punctuation+whitespace/1.0.0";

const CONTRACTIONS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcan't\b/gu, "cannot"],
  [/\bwon't\b/gu, "will not"],
  [/\bdon't\b/gu, "do not"],
  [/\bdoesn't\b/gu, "does not"],
  [/\bdidn't\b/gu, "did not"],
  [/\bisn't\b/gu, "is not"],
  [/\baren't\b/gu, "are not"],
  [/\bwasn't\b/gu, "was not"],
  [/\bweren't\b/gu, "were not"]
];

/** Normalizes mechanically equivalent English text-entry answers. */
export function normalizeEnglishAnswer(value: string): string {
  let normalized = value
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u02bc]/gu, "'")
    .toLocaleLowerCase("en")
    .trim()
    .replace(/[?!.]+$/gu, "")
    .trim()
    .replace(/\s+/gu, " ");

  for (const [pattern, expanded] of CONTRACTIONS) {
    normalized = normalized.replace(pattern, expanded);
  }

  return normalized.replace(/\s+/gu, " ").trim();
}

export function matchesEnglishAnswer(
  submittedValue: string,
  acceptedValues: readonly string[]
): boolean {
  const normalizedSubmission = normalizeEnglishAnswer(submittedValue);
  return acceptedValues.some(
    (acceptedValue) => normalizeEnglishAnswer(acceptedValue) === normalizedSubmission
  );
}
