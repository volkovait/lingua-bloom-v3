export interface TeacherProfile {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
  readonly initials: string;
  readonly avatarTone: number;
}

interface TeacherIdentity {
  readonly id: string;
  readonly email?: string;
  readonly user_metadata?: unknown;
}

export function toTeacherProfile(user: TeacherIdentity): TeacherProfile {
  const metadata = isRecord(user.user_metadata) ? user.user_metadata : {};
  const email = user.email?.trim() || "Аккаунт преподавателя";
  const displayName =
    metadataString(metadata, "full_name") ??
    metadataString(metadata, "name") ??
    metadataString(metadata, "preferred_username") ??
    nameFromEmail(email) ??
    "Преподаватель";

  return {
    id: user.id,
    displayName,
    email,
    initials: initialsFor(displayName),
    avatarTone: stableTone(user.id)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nameFromEmail(email: string): string | null {
  if (!email.includes("@")) return null;
  const localPart = email
    .slice(0, email.indexOf("@"))
    .replace(/[._-]+/g, " ")
    .trim();
  if (!localPart) return null;
  return localPart
    .split(/\s+/u)
    .map((part) => part.charAt(0).toLocaleUpperCase("ru-RU") + part.slice(1))
    .join(" ");
}

function initialsFor(name: string): string {
  const parts = name.split(/\s+/u).filter(Boolean);
  const first = parts[0] ?? "П";
  const last = parts.at(-1) ?? first;
  const selected = parts.length > 1 ? [first, last] : [first];
  return selected
    .map((part) => Array.from(part)[0] ?? "")
    .join("")
    .toLocaleUpperCase("ru-RU");
}

function stableTone(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  return hash % 6;
}
