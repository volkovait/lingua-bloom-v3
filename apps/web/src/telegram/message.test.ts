import { expect, test } from "vitest";

import { buildTelegramAttemptMessage, buildTelegramAttemptMessages } from "./message";

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

test("splits long results without splitting a field block", () => {
  const messages = buildTelegramAttemptMessages(
    {
      lessonTitle: "Long lesson",
      lessonVersion: 1,
      studentName: "Student",
      correctCount: 0,
      totalCount: 8,
      rows: Array.from({ length: 8 }, (_, index) => ({
        ordinal: index + 1,
        submitted: "answer ".repeat(12),
        correct: false,
        acceptedValues: ["expected"]
      }))
    },
    240
  );
  expect(messages.length).toBeGreaterThan(1);
  expect(messages.every((message) => message.length <= 240)).toBe(true);
  for (let ordinal = 1; ordinal <= 8; ordinal += 1)
    expect(messages.filter((message) => message.includes(`❌ ${String(ordinal)}.`))).toHaveLength(
      1
    );
});
