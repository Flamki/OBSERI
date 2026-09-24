export const ORB_STYLES = [
  { id: "aurora", label: "Aurora" },
  { id: "ocean", label: "Ocean" },
  { id: "sunset", label: "Sunset" },
  { id: "forest", label: "Forest" },
  { id: "mono", label: "Mono" },
  { id: "accent", label: "Brand" },
] as const;

export type OrbStyle = (typeof ORB_STYLES)[number]["id"];
/** Three colours: the dominant hue, a companion hue, and a light highlight. */
export type OrbPalette = [string, string, string];

const PRESETS: Record<Exclude<OrbStyle, "accent">, OrbPalette> = {
  aurora: ["#ff6f91", "#a48cff", "#ffd3dc"],
  ocean: ["#2fb4ff", "#4bcde0", "#d7f3ff"],
  sunset: ["#ff8a62", "#ff5c7a", "#ffd8b8"],
  forest: ["#3ccf91", "#2aa6a0", "#d9f7e8"],
  mono: ["#3a3a3f", "#8a8a8f", "#f1f1ef"],
};

export function isOrbStyle(value: unknown): value is OrbStyle {
  return typeof value === "string" && ORB_STYLES.some((style) => style.id === value);
}

function parseHex(value: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return null;
  const hex =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((character) => character + character)
          .join("")
      : match[1];
  return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];
  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === red
      ? (green - blue) / delta + (green < blue ? 6 : 0)
      : max === green
        ? (blue - red) / delta + 2
        : (red - green) / delta + 4;
  return [hue * 60, saturation, lightness];
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, saturation));
  const l = Math.min(1, Math.max(0, lightness));
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - chroma / 2;
  const [r, g, b] =
    h < 60
      ? [chroma, x, 0]
      : h < 120
        ? [x, chroma, 0]
        : h < 180
          ? [0, chroma, x]
          : h < 240
            ? [0, x, chroma]
            : h < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[r, g, b]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** A pleasant three-colour orb palette derived from any brand colour. */
export function paletteFromAccent(accent: string): OrbPalette {
  const rgb = parseHex(accent);
  if (!rgb) return PRESETS.aurora;
  const [hue, saturation, lightness] = rgbToHsl(rgb);
  // Keep near-greys calm instead of inventing a hue.
  if (saturation < 0.12) return PRESETS.mono;
  const s = Math.max(0.55, Math.min(0.9, saturation));
  const l = Math.max(0.5, Math.min(0.66, lightness));
  return [hslToHex(hue, s, l), hslToHex(hue + 38, s * 0.9, l + 0.06), hslToHex(hue - 12, 0.9, 0.9)];
}

export function orbPalette(style: string | undefined, accent: string): OrbPalette {
  if (style === "accent") return paletteFromAccent(accent);
  if (style && style in PRESETS) return PRESETS[style as Exclude<OrbStyle, "accent">];
  return PRESETS.aurora;
}

/** A CSS background that approximates the live orb, for launchers and thumbnails. */
export function orbGradient([primary, secondary, highlight]: OrbPalette): string {
  return `radial-gradient(circle at 32% 28%, ${highlight} 0%, transparent 42%), radial-gradient(circle at 72% 72%, ${secondary} 0%, transparent 58%), ${primary}`;
}

/** Readable text colour (ink or white) on top of a background colour. */
export function contrastText(background: string): "#0b0b0c" | "#ffffff" {
  const rgb = parseHex(background);
  if (!rgb) return "#ffffff";
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? "#0b0b0c" : "#ffffff";
}

/**
 * Text that sounds right when spoken: no markdown symbols, bullets, emoji or raw URLs.
 */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((?:https?:\/\/)?[^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "the linked page")
    .replace(/[*_`#>~|]+/g, "")
    .replace(/^\s*[-•·]\s+/gm, "")
    .replace(/^\s*\d+[.)]\s+/gm, "")
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.\s*\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
}
