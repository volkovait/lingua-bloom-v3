import { StudentLessonSpecSchema } from "@lingua-bloom/contracts";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { LessonRenderer } from "../../components/lesson/lesson-renderer";

describe("word-bank student rendering", () => {
  test("renders one shared bank before all referencing exercises without answer data", () => {
    const resourceId = "group:5:shared:word-bank";
    const lesson = StudentLessonSpecSchema.parse({
      schemaVersion: "1.1.0",
      publicLessonId: "A".repeat(22),
      version: 1,
      title: "Word bank",
      groups: [
        {
          id: "group:5",
          ordinal: 5,
          instruction: "Complete.",
          sharedResources: [
            {
              id: resourceId,
              ordinal: 1,
              kind: "wordBank",
              entries: [
                { id: "word:1", ordinal: 1, value: "tea" },
                { id: "word:2", ordinal: 2, value: "rice" }
              ],
              usagePolicy: "unspecified"
            }
          ],
          exercises: [1, 2].map((ordinal) => ({
            id: `exercise:${String(ordinal)}`,
            ordinal,
            interactionKind: "wordBankGap",
            prompt: "____",
            sharedResourceId: resourceId,
            options: [],
            responseFields: [{ id: `answer:${String(ordinal)}`, responseKind: "text" }]
          }))
        }
      ]
    });
    const html = renderToStaticMarkup(createElement(LessonRenderer, { lesson }));

    expect(html.match(/shared-word-bank/g)).toHaveLength(1);
    expect(html.indexOf("tea")).toBeLessThan(html.indexOf("____"));
    expect(html).not.toContain("acceptedValues");
    expect(html).not.toContain("teacherSupplied");
  });
});
