export const ARTIFACT_VERSIONS = {
  documentIrSchema: "1.0.0",
  lessonSpecSchema: "1.1.0",
  studentLessonSpecSchema: "1.1.0",
  pipeline: "1.0.0",
  pdfParser: "1.1.0",
  textParser: "1.0.0"
} as const;

export type ArtifactVersionName = keyof typeof ARTIFACT_VERSIONS;
