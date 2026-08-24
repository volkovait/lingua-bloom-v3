import {
  LessonSpecSchema,
  StudentLessonSpecSchema,
  type LessonSpec,
  type StudentLessonSpec
} from "@lingua-bloom/contracts";

export function projectStudentLesson(
  lesson: LessonSpec,
  publicLessonId: string
): StudentLessonSpec {
  const source = LessonSpecSchema.parse(lesson);
  return StudentLessonSpecSchema.parse({
    schemaVersion: "1.0.0",
    publicLessonId,
    version: source.version,
    title: source.title,
    groups: source.groups.map((group) => ({
      id: group.id,
      ordinal: group.ordinal,
      instruction: group.instruction,
      exercises: group.exercises.map((exercise) => ({
        id: exercise.id,
        ordinal: exercise.ordinal,
        interactionKind: exercise.interactionKind,
        prompt: exercise.prompt,
        options: exercise.options.map(({ id, ordinal, value }) => ({ id, ordinal, value })),
        responseFields: exercise.answerFields.map((answer) => ({
          id: answer.id,
          responseKind: responseKind(exercise.interactionKind)
        }))
      }))
    }))
  });
}

function responseKind(kind: LessonSpec["groups"][number]["exercises"][number]["interactionKind"]) {
  if (kind === "wordOrder") return "orderedTokens" as const;
  if (kind === "singleChoice" || kind === "oddOneOut") return "choice" as const;
  return "text" as const;
}
