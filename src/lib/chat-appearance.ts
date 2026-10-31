import type { CSSProperties } from "react";
import type { Soul } from "./soul";

/** Shared by chat and nested follow-up forms; never trust a saved color as CSS. */
export function chatAppearance(appearance: Soul["appearance"]): CSSProperties {
  const accent = /^#[0-9a-f]{6}$/i.test(appearance.accent) ? appearance.accent : "#ff5c7a";
  const channels = [1, 3, 5].map((offset) => {
    const value = parseInt(accent.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  const dark = appearance.theme === "dark";
  return {
    "--chat-accent": accent,
    "--chat-on-accent": luminance > 0.179 ? "#000000" : "#ffffff",
    "--chat-surface": dark ? "#131211" : "#ffffff",
    "--chat-text": dark ? "#f7f7f6" : "#212120",
    "--chat-muted": dark ? "#b5b4b2" : "#77717e",
    "--chat-border": dark ? "#444341" : "#ded9e4",
    colorScheme: dark ? "dark" : "light",
  } as CSSProperties;
}
