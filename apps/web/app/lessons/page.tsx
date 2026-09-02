import Link from "next/link";
import { redirect } from "next/navigation";

import { TeacherProfileMenu } from "@/components/auth/teacher-profile-menu";
import { BrandLogo } from "@/components/brand-logo";
import { LessonLibraryResults } from "@/components/lesson/lesson-library-results";
import { requireTeacher, UnauthenticatedError } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";
import { normalizeLessonLibraryStatus } from "@/src/lessons/library-filter";
import { loadLessonLibraryPage } from "@/src/lessons/library-repository";

export default async function LessonsPage({
  searchParams
}: {
  readonly searchParams: Promise<{
    readonly q?: string | string[];
    readonly status?: string | string[];
  }>;
}) {
  let context;
  try {
    context = await requireTeacher();
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/auth/login?next=%2Flessons");
    throw error;
  }

  const profile = toTeacherProfile(context.teacher);
  const rawSearchParams = await searchParams;
  const query = firstParam(rawSearchParams.q)?.trim() ?? "";
  const status = normalizeLessonLibraryStatus(firstParam(rawSearchParams.status));
  const initialPage = await loadLessonLibraryPage(context.supabase, context.teacher.id, {
    query,
    status
  });
  const filtersActive = Boolean(query) || status !== "all";

  return (
    <main className="lessons-page">
      <nav className="lessons-nav">
        <BrandLogo transparent />
        <div className="teacher-shell-actions">
          <Link className="primary-link" href="/imports/new">
            Создать урок
          </Link>
          <TeacherProfileMenu profile={profile} />
        </div>
      </nav>

      <header className="lessons-header">
        <div>
          <p className="eyebrow">Библиотека преподавателя</p>
          <h1>Мои уроки</h1>
          <p>Черновики, готовые к публикации материалы и опубликованные версии.</p>
        </div>
        <p className="lesson-found-count" role="status">
          Найдено <strong>{initialPage.totalMatched}</strong>
        </p>
      </header>

      <form className="lesson-filters" method="get" role="search">
        <label>
          <span>Поиск по названию</span>
          <input
            defaultValue={query}
            maxLength={160}
            name="q"
            placeholder="Например, Present Simple"
            type="search"
          />
        </label>
        <label>
          <span>Статус</span>
          <select defaultValue={status} name="status">
            <option value="all">Все статусы</option>
            <option value="published">Опубликован</option>
            <option value="ready_to_publish">Готов к публикации</option>
            <option value="awaiting_review">Нужна проверка</option>
            <option value="processing">Обрабатывается</option>
            <option value="accepted">Принят</option>
            <option value="failed">Ошибка обработки</option>
          </select>
        </label>
        <div className="lesson-filter-actions">
          <button className="primary-link" type="submit">
            Найти
          </button>
          {filtersActive ? (
            <Link className="text-link" href="/lessons">
              Сбросить
            </Link>
          ) : null}
        </div>
      </form>

      <LessonLibraryResults
        initialPage={initialPage}
        key={`${query}:${status}`}
        query={query}
        status={status}
      />
    </main>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
