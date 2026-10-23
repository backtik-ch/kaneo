export function getUserInitials(name?: string | null): string {
  const parts = name?.trim().split(/\s+/);

  if (!parts?.[0]) return "?";

  const initials =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;

  return initials.toUpperCase();
}
