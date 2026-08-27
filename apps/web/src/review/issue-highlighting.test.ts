import { describe, expect, test } from "vitest";

import { getEntityIssueState, getVisibleReviewIssues, issueMessage } from "./issue-highlighting";

describe("review issue highlighting", () => {
  test("uses the highest open severity for an affected entity", () => {
    const state = getEntityIssueState(
      [
        issue("warning", "exercise:1", "OCR_REQUIRED"),
        issue("blocking", "answer:1", "ANSWER_UNVERIFIED"),
        { ...issue("blocking", "exercise:1", "SOURCE_TRUNCATED"), resolution: "resolved" }
      ],
      ["exercise:1", "answer:1"]
    );
    expect(state.severity).toBe("blocking");
    expect(state.issues).toHaveLength(2);
  });

  test("provides a teacher-facing explanation for truncated source", () => {
    expect(issueMessage(issue("blocking", "exercise:18", "SOURCE_TRUNCATED"))).toContain(
      "обрывается"
    );
  });

  test("does not highlight an entity after its issue is resolved and reloaded", () => {
    const resolved = {
      ...issue("blocking", "exercise:18", "SOURCE_TRUNCATED"),
      resolution: "resolved" as const
    };
    expect(getEntityIssueState([resolved], ["exercise:18"])).toEqual({
      severity: null,
      issues: []
    });
  });

  test("hides only the unverified-answer issue immediately after local confirmation", () => {
    const unverified = issue("blocking", "answer:1", "ANSWER_UNVERIFIED");
    const ambiguous = issue("blocking", "answer:1", "ANSWER_AMBIGUOUS");

    expect(getVisibleReviewIssues([unverified, ambiguous], new Set(["answer:1"]))).toEqual([
      ambiguous
    ]);
    expect(getVisibleReviewIssues([unverified], new Set())).toEqual([unverified]);
  });
});

function issue(severity: "info" | "warning" | "blocking", entityId: string, code: string) {
  return {
    id: `issue:${entityId}:${code}`,
    code,
    severity,
    resolution: "open" as const,
    message: code,
    entityIds: [entityId]
  };
}
