import { expect, test } from "vitest";

import { buildTelegramAttemptMessage } from "./message";

test("escapes every untrusted Telegram value", () => {
  const message = buildTelegramAttemptMessage({
    lessonTitle: "<Lesson>",
    lessonVersion: 1,
    studentName: "A&B",
    correctCount: 0,
    totalCount: 1,
    rows: [{ ordinal: 1, submitted: "<script>", correct: false, acceptedValues: ["x&y"] }]
  });
  expect(message).toContain("&lt;Lesson&gt;");
  expect(message).toContain("A&amp;B");
  expect(message).not.toContain("<script>");
});
