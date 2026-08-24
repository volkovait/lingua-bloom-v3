import type { DocumentIR, SourceBlock, SourceRef, ValidationIssue } from "@lingua-bloom/contracts";

export interface AnswerKeyEntry {
  readonly groupOrdinal: number;
  readonly itemOrdinal: number;
  readonly optionId: string;
  readonly sourceRefs: readonly SourceRef[];
}

export interface AnswerKeyTarget {
  readonly id: string;
  readonly groupOrdinal: number;
  readonly itemOrdinal: number;
  readonly options: readonly {
    readonly id: string;
    readonly key?: string;
    readonly value: string;
  }[];
}

export interface ReconciledAnswer {
  readonly exerciseId: string;
  readonly acceptedValues: readonly string[];
  readonly provenance: "sourceKey";
  readonly reviewStatus: "verified";
  readonly sourceRefs: readonly SourceRef[];
}

export function extractAnswerKeyEntries(
  document: DocumentIR,
  documentIrId: string
): AnswerKeyEntry[] {
  const entries: AnswerKeyEntry[] = [];
  let inAnswerKey = false;
  let groupOrdinal = 1;
  for (const block of [...document.blocks].sort((left, right) => left.order - right.order)) {
    const text = block.rawText.trim();
    if (/^answer\s*key\b/i.test(text)) {
      inAnswerKey = true;
      continue;
    }
    if (!inAnswerKey) continue;
    const groupMatch = text.match(/^exercise\s+([1-9]\d*)$/i);
    if (groupMatch?.[1]) {
      groupOrdinal = Number(groupMatch[1]);
      continue;
    }
    for (const match of text.matchAll(/([1-9]\d*)\s*[:.)-]?\s*([a-z])\b/giu)) {
      if (!match[1] || !match[2]) continue;
      entries.push({
        groupOrdinal,
        itemOrdinal: Number(match[1]),
        optionId: match[2].toLowerCase(),
        sourceRefs: [sourceRef(document, documentIrId, block, match[0])]
      });
    }
  }
  return entries;
}

export function reconcileAnswerKey(
  targets: readonly AnswerKeyTarget[],
  entries: readonly AnswerKeyEntry[]
): { readonly answers: readonly ReconciledAnswer[]; readonly issues: readonly ValidationIssue[] } {
  const answers: ReconciledAnswer[] = [];
  const issues: ValidationIssue[] = [];
  for (const target of targets) {
    const matches = entries.filter(
      (entry) =>
        entry.groupOrdinal === target.groupOrdinal && entry.itemOrdinal === target.itemOrdinal
    );
    const distinct = new Set(matches.map((entry) => entry.optionId));
    if (distinct.size > 1) {
      issues.push({
        id: `issue:${target.id}:answer-key-conflict`,
        code: "ANSWER_KEY_CONFLICT",
        severity: "blocking",
        entityIds: [target.id],
        evidence: matches.flatMap((entry) => entry.sourceRefs),
        message: "The source answer key contains conflicting answers for this item",
        resolution: "open"
      });
      continue;
    }
    const match = matches[0];
    if (!match) continue;
    const option = target.options.find(
      (candidate) =>
        (candidate.key ?? candidate.id.split(":").at(-1)?.toLowerCase()) === match.optionId
    );
    if (!option) continue;
    answers.push({
      exerciseId: target.id,
      acceptedValues: [option.value],
      provenance: "sourceKey",
      reviewStatus: "verified",
      sourceRefs: match.sourceRefs
    });
  }
  return { answers, issues };
}

function sourceRef(
  document: DocumentIR,
  documentIrId: string,
  block: SourceBlock,
  fragment: string
): SourceRef {
  const charStart = Math.max(0, block.rawText.indexOf(fragment));
  return {
    sourceDocumentId: document.sourceDocumentId,
    documentIrId,
    blockId: block.id,
    charStart,
    charEnd: charStart + fragment.length,
    pageIndex: block.pageIndex ?? null,
    bbox: block.bbox ?? null
  };
}
