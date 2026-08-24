import type { SourceRef } from "@lingua-bloom/contracts";

export interface ReviewIssue {
  readonly id: string;
  readonly code: string;
  readonly severity: "info" | "warning" | "blocking";
  readonly resolution: "open" | "resolved" | "acceptedRisk";
  readonly message: string;
  readonly entityIds: readonly string[];
  readonly evidence: readonly SourceRef[];
}

export function ValidationIssues({
  issues,
  selectedId,
  onSelect
}: {
  readonly issues: readonly ReviewIssue[];
  readonly selectedId: string | null;
  readonly onSelect: (issue: ReviewIssue) => void;
}) {
  const openCount = issues.filter((issue) => issue.resolution === "open").length;
  return (
    <section className="review-panel issues-panel" aria-labelledby="issues-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Контроль качества</p>
          <h2 id="issues-title">Проблемы и предупреждения</h2>
        </div>
        <span className={openCount ? "issue-count has-open" : "issue-count"}>
          {openCount} открыто
        </span>
      </div>
      <div className="issue-list">
        {issues.length === 0 ? <p className="empty-state">Проблем не обнаружено.</p> : null}
        {issues.map((issue) => (
          <button
            className={`issue-card severity-${issue.severity}${selectedId === issue.id ? " is-selected" : ""}`}
            key={issue.id}
            type="button"
            onClick={() => {
              onSelect(issue);
            }}
          >
            <span>{issue.code}</span>
            <strong>{issue.message}</strong>
            <small>{issue.resolution === "open" ? "Требует решения" : "Решено"}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
