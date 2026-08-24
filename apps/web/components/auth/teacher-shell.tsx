import type { ReactNode } from "react";

import { TeacherProfileMenu } from "./teacher-profile-menu";
import { BrandLogo } from "@/components/brand-logo";
import type { TeacherProfile } from "@/src/auth/teacher-profile";

export function TeacherShell({
  profile,
  actions,
  children
}: {
  readonly profile: TeacherProfile;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="teacher-shell">
      <nav className="teacher-shell-nav" aria-label="Навигация преподавателя">
        <BrandLogo transparent />
        <div className="teacher-shell-actions">
          {actions}
          <TeacherProfileMenu profile={profile} />
        </div>
      </nav>
      {children}
    </div>
  );
}
