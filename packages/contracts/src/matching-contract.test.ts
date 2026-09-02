import { describe, expect, test } from "vitest";

import { LessonSpecSchema } from "./lesson-spec";

const sourceRef = { sourceDocumentId: "source", documentIrId: "ir", blockId: "block" };
const evidence = { sourceRefs: [sourceRef] };

function matchingLesson() {
  return {
    schemaVersion: "1.2.0" as const,
    lessonId: "lesson",
    version: 1,
    title: "Matching",
    sourceDocumentId: "source",
    documentIrId: "ir",
    groups: [
      {
        id: "group",
        ordinal: 1,
        instruction: "Match",
        provenance: evidence,
        sharedResources: [
          {
            id: "bank",
            ordinal: 1,
            kind: "matchingBank" as const,
            entries: [
              { id: "entry-a", ordinal: 1, sourceLabel: "A", value: "one", provenance: evidence },
              { id: "entry-b", ordinal: 2, sourceLabel: "B", value: "two", provenance: evidence }
            ],
            usagePolicy: "useOnce" as const,
            provenance: evidence
          }
        ],
        exercises: [
          {
            id: "exercise",
            ordinal: 1,
            interactionKind: "matching" as const,
            prompt: "1",
            sharedResourceId: "bank",
            provenance: evidence,
            options: [],
            answerFields: [
              {
                id: "answer",
                acceptedValues: ["entry-a"],
                provenance: "sourceKey" as const,
                reviewStatus: "verified" as const,
                evidence
              }
            ]
          }
        ]
      }
    ],
    validation: {
      status: "passed" as const,
      blockingIssueCount: 0 as const,
      unsupportedAdditionCount: 0 as const,
      unresolvedAnswerCount: 0 as const
    }
  };
}

describe("LessonSpec 1.2 matching", () => {
  test("accepts one shared use-once bank and stable entry-id answer", () => {
    expect(LessonSpecSchema.parse(matchingLesson()).schemaVersion).toBe("1.2.0");
  });

  test("rejects local copies and a non-matching shared resource", () => {
    const lesson = matchingLesson();
    const group = lesson.groups[0];
    const exercise = group?.exercises[0];
    const resource = group?.sharedResources[0];
    if (!exercise || !resource) throw new Error("Invalid matching fixture");
    Object.assign(exercise, { options: [...resource.entries] });
    expect(LessonSpecSchema.safeParse(lesson).success).toBe(false);

    const wrongBank = matchingLesson();
    const wrongResource = wrongBank.groups[0]?.sharedResources[0];
    if (!wrongResource) throw new Error("Invalid matching fixture");
    Object.assign(wrongResource, {
      kind: "wordBank",
      usagePolicy: "useOnce"
    });
    expect(LessonSpecSchema.safeParse(wrongBank).success).toBe(false);
  });
});
