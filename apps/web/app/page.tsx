import Link from "next/link";

import { BrandLogo } from "@/components/brand-logo";
import { TeacherProfileMenu } from "@/components/auth/teacher-profile-menu";
import { getOptionalTeacher } from "@/src/auth/require-teacher";
import { toTeacherProfile } from "@/src/auth/teacher-profile";

export default async function HomePage() {
  const context = await getOptionalTeacher();
  const profile = context ? toTeacherProfile(context.teacher) : null;
  return (
    <main className="home-page">
      <nav className="home-nav">
        <BrandLogo priority size="home" transparent />
        <div className="home-nav-actions">
          {profile ? (
            <>
              <Link className="text-link" href="/lessons">
                Мои уроки
              </Link>
              <TeacherProfileMenu profile={profile} />
            </>
          ) : (
            <Link className="secondary-link" href="/auth/login?next=%2Fimports%2Fnew">
              Войти
            </Link>
          )}
        </div>
      </nav>
      <section className="hero-card">
        <p className="eyebrow">Конструктор уроков для преподавателей</p>
        <h1>Превращайте материалы в интерактивные уроки</h1>
        <p className="lede">
          Lingua Bloom переносит готовые упражнения из PDF и текста, сохраняя связь каждого элемента
          с источником и оставляя спорные ответы на проверку преподавателю.
        </p>
        <div className="hero-actions">
          <Link className="primary-link" href="/imports/new">
            Создать урок
          </Link>
          {!profile ? (
            <Link className="text-link" href="/auth/sign-up?next=%2Fimports%2Fnew">
              Создать аккаунт
            </Link>
          ) : null}
        </div>
      </section>
    </main>
  );
}
