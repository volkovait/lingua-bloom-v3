import { describe, expect, test } from "vitest";

import { toTeacherProfile } from "./teacher-profile";

describe("teacher profile", () => {
  test("uses trusted Supabase display metadata and creates initials", () => {
    const profile = toTeacherProfile({
      id: "teacher-1",
      email: "anna@example.com",
      user_metadata: { full_name: "Анна Волкова" }
    });

    expect(profile.displayName).toBe("Анна Волкова");
    expect(profile.initials).toBe("АВ");
    expect(profile.email).toBe("anna@example.com");
    expect(profile.avatarTone).toBeGreaterThanOrEqual(0);
    expect(profile.avatarTone).toBeLessThan(6);
  });

  test("falls back to a readable email name and stable avatar", () => {
    const user = { id: "teacher-2", email: "maria.petrovna@example.com", user_metadata: {} };

    expect(toTeacherProfile(user)).toMatchObject({
      displayName: "Maria Petrovna",
      initials: "MP"
    });
    expect(toTeacherProfile(user).avatarTone).toBe(toTeacherProfile(user).avatarTone);
  });
});
