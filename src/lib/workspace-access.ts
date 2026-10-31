/** Shared policy vocabulary. The server is authoritative; UI uses it for navigation. */
export const ACCESS_SECTIONS = {
  dashboard: "Dashboard",
  knowledge: "Knowledge",
  personality: "Personality",
  voice: "Voice",
  appearance: "Appearance & preview",
  conversations: "Conversations & leads",
  analytics: "Analytics",
  deploy: "Publishing & integrations",
  settings: "Website settings",
} as const;
export type AccessSection = keyof typeof ACCESS_SECTIONS;
export type AccessLevel = "none" | "read" | "write";
export type WorkspacePermissions = Record<AccessSection, AccessLevel>;
export function permissionPreset(level: AccessLevel): WorkspacePermissions {
  return Object.fromEntries(
    Object.keys(ACCESS_SECTIONS).map((key) => [
      key,
      key === "dashboard" && level === "write" ? "read" : level,
    ]),
  ) as WorkspacePermissions;
}
export function normalizePermissions(value: unknown): WorkspacePermissions {
  // Null is the legacy editor policy. Malformed explicit policies fail closed.
  if (value == null) return permissionPreset("write");
  // Early collaboration writes accidentally encoded JSON objects as JSON strings.
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return permissionPreset("none");
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return permissionPreset("none");
  const input = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(ACCESS_SECTIONS).map((key) => [
      key,
      input[key] === "write" || input[key] === "read"
        ? key === "dashboard"
          ? "read"
          : input[key]
        : "none",
    ]),
  ) as WorkspacePermissions;
}
export function canAccess(
  permissions: WorkspacePermissions | undefined,
  section: AccessSection,
  write = false,
) {
  const level = normalizePermissions(permissions)[section];
  return write ? level === "write" : level !== "none";
}
export function accessRole(permissions: WorkspacePermissions) {
  const levels = Object.entries(permissions)
    .filter(([key]) => key !== "dashboard")
    .map(([, level]) => level);
  return permissions.dashboard === "read" && levels.every((level) => level === "write")
    ? "editor"
    : permissions.dashboard === "read" && levels.every((level) => level === "read")
      ? "viewer"
      : "custom";
}
export const VIEW_SECTION: Record<string, AccessSection> = {
  overview: "dashboard",
  knowledge: "knowledge",
  personality: "personality",
  voice: "voice",
  playground: "appearance",
  conversations: "conversations",
  analytics: "analytics",
  deploy: "deploy",
  settings: "settings",
};
