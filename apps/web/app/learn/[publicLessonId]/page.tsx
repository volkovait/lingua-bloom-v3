import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandLogo } from "@/components/brand-logo";
import { LessonRenderer } from "@/components/lesson/lesson-renderer";
import { getOptionalTeacher } from "@/src/auth/require-teacher";
import { findPublicStudentLesson } from "@/src/lessons/student-lesson";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function StudentLessonPage({
  params
}: {
  readonly params: Promise<{ publicLessonId: string }>;
}) {
  const { publicLessonId } = await params;
  const [lesson, teacherContext] = await Promise.all([
    findPublicStudentLesson(publicLessonId),
    getOptionalTeacher()
  ]);
  if (!lesson) notFound();
  return (
    <>
      {teacherContext ? (
        <nav className="student-preview-nav" aria-label="Навигация преподавателя">
          <BrandLogo transparent />
          <Link className="secondary-link" href="/lessons">
            К списку уроков
          </Link>
        </nav>
      ) : null}
      <LessonRenderer lesson={lesson} />
    </>
  );
}
