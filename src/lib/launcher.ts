import type { AppearanceConfig } from "./soul";

export const LAUNCHER_WORD_LIMIT = 4;
export const LAUNCHER_CHARACTER_LIMIT = 24;
export type LauncherMode = "chat" | "both" | "voice";

export function launcherMode(appearance: AppearanceConfig): LauncherMode {
  return appearance.launcherMode === "chat" || appearance.launcherMode === "voice"
    ? appearance.launcherMode
    : "both";
}

/** Also applied on the server: old embeds and direct API writes get the same limits. */
export function normalizeLauncherLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  return Array.from(
    value
      // Strip control characters from labels supplied through direct API writes.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/gu, " ")
      .trim(),
  )
    .slice(0, LAUNCHER_CHARACTER_LIMIT)
    .join("")
    .split(" ")
    .slice(0, LAUNCHER_WORD_LIMIT)
    .join(" ")
    .trim();
}

export function launcherLabel(appearance: AppearanceConfig): string {
  return (
    normalizeLauncherLabel(appearance.launcherLabel) ||
    (launcherMode(appearance) === "voice" ? "Voice chat" : "Ask a question")
  );
}

export function normalizeLauncher(appearance: AppearanceConfig): AppearanceConfig {
  return {
    ...appearance,
    launcherMode: launcherMode(appearance),
    launcherLabel: normalizeLauncherLabel(appearance.launcherLabel),
  };
}

export function launcherPanel(appearance: AppearanceConfig): "voice" | "chat" {
  return launcherMode(appearance) === "voice" ? "voice" : "chat";
}
