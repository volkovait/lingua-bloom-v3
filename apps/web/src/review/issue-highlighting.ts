export interface HighlightableIssue {
  readonly id: string;
  readonly code: string;
  readonly severity: "info" | "warning" | "blocking";
  readonly resolution: "open" | "resolved" | "acceptedRisk";
  readonly message: string;
  readonly entityIds: readonly string[];
}

export interface EntityIssueState {
  readonly severity: HighlightableIssue["severity"] | null;
  readonly issues: readonly HighlightableIssue[];
}

const SEVERITY_RANK: Record<HighlightableIssue["severity"], number> = {
  info: 1,
  warning: 2,
  blocking: 3
};

export function getEntityIssueState(
  issues: readonly HighlightableIssue[],
  entityIds: readonly string[]
): EntityIssueState {
  const entityIdSet = new Set(entityIds);
  const matching = issues.filter(
    (issue) =>
      issue.resolution === "open" && issue.entityIds.some((entityId) => entityIdSet.has(entityId))
  );
  const severity = matching.reduce<HighlightableIssue["severity"] | null>(
    (current, issue) =>
      current == null || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[current]
        ? issue.severity
        : current,
    null
  );
  return { severity, issues: matching };
}

export function getVisibleReviewIssues(
  issues: readonly HighlightableIssue[],
  locallyConfirmedAnswerIds: ReadonlySet<string>
): readonly HighlightableIssue[] {
  return issues.filter(
    (issue) =>
      !(
        issue.code === "ANSWER_UNVERIFIED" &&
        issue.entityIds.some((entityId) => locallyConfirmedAnswerIds.has(entityId))
      )
  );
}

export function issueMessage(issue: HighlightableIssue): string {
  return (
    {
      SOURCE_TRUNCATED: "Исходный материал обрывается; исправьте или удалите задание.",
      ANSWER_UNVERIFIED: "Правильный ответ требует подтверждения.",
      ANSWER_AMBIGUOUS: "Правильный ответ неоднозначен и требует решения преподавателя.",
      READING_ORDER_UNCERTAIN: "Связь вопроса с исходным текстом неоднозначна.",
      CANDIDATE_UNMAPPED: "Часть источника не сопоставлена с заданием.",
      SOURCE_REF_MISSING: "Для элемента отсутствует проверяемая ссылка на источник."
    }[issue.code] ?? issue.message
  );
}
