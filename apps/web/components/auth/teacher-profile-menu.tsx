import Link from "next/link";

import type { TeacherProfile } from "@/src/auth/teacher-profile";

export function TeacherProfileMenu({ profile }: { readonly profile: TeacherProfile }) {
  return (
    <details className="teacher-profile-menu">
      <summary aria-label={`Открыть профиль: ${profile.displayName}`}>
        <Avatar profile={profile} />
        <span className="teacher-profile-summary-copy">
          <strong>{profile.displayName}</strong>
          <small>Преподаватель</small>
        </span>
        <span className="profile-chevron" aria-hidden="true">
          ▾
        </span>
      </summary>
      <div className="teacher-profile-dropdown">
        <div className="teacher-profile-identity">
          <Avatar profile={profile} large />
          <div>
            <strong>{profile.displayName}</strong>
            <small>{profile.email}</small>
          </div>
        </div>
        <nav aria-label="Меню профиля">
          <Link href="/lessons">Мои уроки</Link>
          <Link href="/attempts">Попытки</Link>
          <Link href="/imports/new">Создать урок</Link>
          <Link href="/settings/telegram">Настройки Telegram</Link>
        </nav>
        <form action="/auth/signout" method="post">
          <button type="submit">Выйти</button>
        </form>
      </div>
    </details>
  );
}

function Avatar({
  profile,
  large = false
}: {
  readonly profile: TeacherProfile;
  readonly large?: boolean;
}) {
  return (
    <span
      className={`teacher-avatar avatar-tone-${String(profile.avatarTone)}${large ? " is-large" : ""}`}
      aria-hidden="true"
    >
      {profile.initials}
    </span>
  );
}
