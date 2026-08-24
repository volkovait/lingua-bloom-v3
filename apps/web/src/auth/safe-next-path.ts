export function safeNextPath(value: string | null | undefined, fallback = "/imports/new") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("://")) {
    return fallback;
  }
  return value;
}
