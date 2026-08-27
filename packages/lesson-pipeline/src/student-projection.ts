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
    schemaVersion: "1.1.0",
    publicLessonId,
    version: source.version,
    title: source.title,
    groups: source.groups.map((group) => ({
      id: group.id,
      ordinal: group.ordinal,
      ...(group.sourceOrder != null ? { sourceOrder: group.sourceOrder } : {}),
      ...(group.completeness ? { completeness: group.completeness } : {}),
      ...(group.missingBoundary ? { missingBoundary: group.missingBoundary } : {}),
      instruction: group.instruction,
      sharedResources: (group.sharedResources ?? []).map((resource) => ({
        id: resource.id,
        ordinal: resource.ordinal,
        kind: resource.kind,
        ...(resource.label ? { label: resource.label } : {}),
        entries: resource.entries.map(({ id, ordinal, value }) => ({ id, ordinal, value })),
        usagePolicy: resource.usagePolicy
      })),
      exercises: group.exercises.map((exercise) => ({
        id: exercise.id,
        ordinal: exercise.ordinal,
        interactionKind: exercise.interactionKind,
        prompt: exercise.prompt,
        ...(exercise.sharedResourceId ? { sharedResourceId: exercise.sharedResourceId } : {}),
        options: exercise.options.map(({ id, ordinal, value }) => ({ id, ordinal, value })),
        responseFields: exercise.answerFields.map((answer) => ({
          id: answer.id,
          responseKind: responseKind(exercise.interactionKind)
        }))
      }))
    })),
    referenceBlocks: source.referenceBlocks?.map((block) => ({
      id: block.id,
      ordinal: block.ordinal,
      sourceOrder: block.sourceOrder,
      lines: block.lines.map(({ id, ordinal, rawText }) => ({ id, ordinal, rawText }))
    }))
  });
}

function responseKind(kind: LessonSpec["groups"][number]["exercises"][number]["interactionKind"]) {
  if (kind === "wordOrder") return "orderedTokens" as const;
  if (kind === "singleChoice" || kind === "oddOneOut") return "choice" as const;
  return "text" as const;
}
