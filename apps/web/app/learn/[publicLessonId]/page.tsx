import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { LessonRenderer } from "@/components/lesson/lesson-renderer";
import { findPublicStudentLesson } from "@/src/lessons/student-lesson";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StudentLessonPage({
  params
}: {
  readonly params: Promise<{ publicLessonId: string }>;
}) {
  const { publicLessonId } = await params;
  const lesson = await findPublicStudentLesson(publicLessonId);
  if (!lesson) notFound();
  return <LessonRenderer lesson={lesson} />;
}
