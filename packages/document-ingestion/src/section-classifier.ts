import type { DocumentIR, SourceBlock } from "@lingua-bloom/contracts";

export type SectionKind =
  "instruction" | "example" | "exercise" | "answerKey" | "explanation" | "unknown";

export interface ClassifiedSection {
  readonly id: string;
  readonly kind: SectionKind;
  readonly blockIds: readonly string[];
  readonly confidence: number;
}

export interface SectionClassifier {
  classify(document: DocumentIR): Promise<readonly ClassifiedSection[]>;
}

export function hasLikelyAnswerKeyMarker(block: SourceBlock): boolean {
  return /^(answers?|answer key|ключи?\s+ответов?)\b/i.test(block.normalizedText ?? block.rawText);
}
