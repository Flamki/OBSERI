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

/** Frosted neutral glass, with a bright inner edge and a soft grey tint. */
export const glassSurface: CSSProperties = {
  backgroundColor: "rgba(210, 212, 216, 0.68)",
  backgroundImage:
    "linear-gradient(145deg, rgba(255,255,255,.3), rgba(255,255,255,.04) 48%, rgba(140,145,155,.08))",
  backdropFilter: "blur(28px) saturate(160%)",
  WebkitBackdropFilter: "blur(28px) saturate(160%)",
  borderColor: "rgba(255,255,255,.55)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,.65), inset 0 0 0 1px rgba(255,255,255,.12), 0 18px 50px rgba(30,35,45,.18)",
};
