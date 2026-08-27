import fixture from "../../contracts/src/fixtures/lesson-spec.v1.json";
import { LessonSpecSchema } from "@lingua-bloom/contracts";
import { describe, expect, test } from "vitest";

import { projectStudentLesson } from "./student-projection";

describe("reference block student projection", () => {
  test("preserves exact raw lines and order while removing provenance", () => {
    const lesson = LessonSpecSchema.parse({
      ...fixture,
      schemaVersion: "1.1.0",
      groups: fixture.groups.map((group) => ({ ...group, sharedResources: [] })),
      referenceBlocks: [
        {
          id: "reference:1",
          ordinal: 1,
          sourceOrder: 3,
          lines: [
            {
              id: "reference:1:line:1",
              ordinal: 1,
              rawText: "Keep\tthis  spacing unchanged.",
              provenance: fixture.groups[0]?.provenance
            }
          ]
        }
      ]
    });
    const student = projectStudentLesson(lesson, "abcdefghijklmnopqrstuv");
    expect(student.referenceBlocks?.[0]?.lines[0]?.rawText).toBe("Keep\tthis  spacing unchanged.");
    expect(JSON.stringify(student.referenceBlocks)).not.toContain("provenance");
    expect(JSON.stringify(student.referenceBlocks)).not.toContain("sourceRefs");
  });
});
