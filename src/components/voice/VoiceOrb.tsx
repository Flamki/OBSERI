import { useEffect, useRef } from "react";
import type { OrbPalette } from "@/lib/voice-appearance";

export type OrbState = "idle" | "connecting" | "listening" | "thinking" | "speaking";

function hexToRgba(hex: string, alpha: number) {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((character) => character + character)
          .join("")
      : value;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * A living, audio-reactive orb drawn on canvas. `getLevel` is read every frame (0–1) so the
 * orb can follow the microphone while listening and the agent's voice while speaking,
 * without re-rendering React.
 */
export default function VoiceOrb({
  palette,
  state,
  getLevel,
  size = 200,
  className = "",
}: {
  palette: OrbPalette;
  state: OrbState;
  getLevel?: () => number;
  size?: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const levelRef = useRef(getLevel);
  const paletteRef = useRef(palette);
  stateRef.current = state;
  levelRef.current = getLevel;
  paletteRef.current = palette;

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

    let frame = 0;
    let last = performance.now();
    let phase = 0;
    let level = 0;
    let visible = true;
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(([entry]) => {
            visible = entry?.isIntersecting ?? true;
          });
    observer?.observe(canvas);

    const draw = (now: number) => {
      frame = window.requestAnimationFrame(draw);
      if (!visible || document.hidden) {
        last = now;
        return;
      }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const current = stateRef.current;
      const raw = Math.min(1, Math.max(0, levelRef.current?.() ?? 0));
      const time = now / 1000;
      const target =
        current === "listening"
          ? Math.max(0.06, raw * 1.1)
          : current === "speaking"
            ? Math.max(
                0.1,
                raw > 0.01 ? raw : 0.22 + 0.16 * Math.sin(time * 9) * Math.sin(time * 3.1),
              )
            : current === "thinking"
              ? 0.12 + 0.05 * Math.sin(time * 4)
              : current === "connecting"
                ? 0.1 + 0.08 * Math.sin(time * 7)
                : 0.05 + 0.025 * Math.sin(time * 1.4);
      const rise = target > level ? 18 : 7;
      level += (target - level) * (1 - Math.exp(-dt * rise));
      const speed =
        (current === "thinking"
          ? 2.6
          : current === "speaking"
            ? 1.5
            : current === "listening"
              ? 1.1
              : 0.55) * (reduceMotion ? 0.25 : 1);
      phase += dt * speed;

      const [primary, secondary, highlight] = paletteRef.current;
      const center = size / 2;
      const base = size * 0.33 * (1 + level * (reduceMotion ? 0.05 : 0.2));
      context.clearRect(0, 0, size, size);

      // Soft outer glow.
      const glow = context.createRadialGradient(
        center,
        center,
        base * 0.6,
        center,
        center,
        size / 2,
      );
      glow.addColorStop(0, hexToRgba(primary, 0.28 + level * 0.25));
      glow.addColorStop(1, hexToRgba(primary, 0));
      context.fillStyle = glow;
      context.fillRect(0, 0, size, size);

      // Ripple ring while the conversation is live.
      if (current === "listening" || current === "speaking") {
        context.beginPath();
        context.arc(center, center, base * (1.16 + level * 0.3), 0, Math.PI * 2);
        context.strokeStyle = hexToRgba(
          current === "listening" ? secondary : primary,
          0.12 + level * 0.3,
        );
        context.lineWidth = 1.5;
        context.stroke();
      }

      const layers: Array<[string, number, number]> = [
        [primary, 1, 0],
        [secondary, 0.82, 2.1],
        [highlight, 0.58, 4.2],
      ];
      layers.forEach(([color, scale, offset], index) => {
        const radius = base * scale;
        const orbit = base * (0.08 + level * 0.12) * (index === 0 ? 0.3 : 1);
        const cx = center + Math.cos(phase * 0.9 + offset) * orbit;
        const cy = center + Math.sin(phase * 1.1 + offset) * orbit;
        const amplitude = 0.03 + level * (reduceMotion ? 0.03 : 0.14);
        context.beginPath();
        const points = 72;
        for (let step = 0; step <= points; step += 1) {
          const angle = (step / points) * Math.PI * 2;
          const wobble =
            Math.sin(angle * 3 + phase * 1.3 + offset) * 0.5 +
            Math.sin(angle * 5 - phase * 0.9 + offset * 2) * 0.3 +
            Math.sin(angle * 2 + phase * 0.5) * 0.2;
          const r = radius * (1 + amplitude * wobble);
          const x = cx + Math.cos(angle) * r;
          const y = cy + Math.sin(angle) * r;
          if (step === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
        const fill = context.createRadialGradient(
          cx - radius * 0.35,
          cy - radius * 0.4,
          radius * 0.05,
          cx,
          cy,
          radius * 1.1,
        );
        fill.addColorStop(0, hexToRgba(highlight, index === 2 ? 0.95 : 0.85));
        fill.addColorStop(0.45, hexToRgba(color, index === 0 ? 1 : 0.75));
        fill.addColorStop(1, hexToRgba(color, index === 0 ? 0.95 : 0));
        context.globalCompositeOperation = index === 0 ? "source-over" : "screen";
        context.fillStyle = fill;
        context.fill();
      });
      context.globalCompositeOperation = "source-over";

      // Glossy highlight.
      const gloss = context.createRadialGradient(
        center - base * 0.35,
        center - base * 0.45,
        0,
        center - base * 0.35,
        center - base * 0.45,
        base * 0.7,
      );
      gloss.addColorStop(0, "rgba(255,255,255,0.55)");
      gloss.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gloss;
      context.beginPath();
      context.arc(center, center, base, 0, Math.PI * 2);
      context.fill();

      // Orbiting dots while thinking.
      if (current === "thinking" || current === "connecting") {
        for (let dot = 0; dot < 3; dot += 1) {
          const angle = phase * 2.2 + (dot * Math.PI * 2) / 3;
          const distance = base * 1.28;
          context.beginPath();
          context.arc(
            center + Math.cos(angle) * distance,
            center + Math.sin(angle) * distance,
            2.4,
            0,
            Math.PI * 2,
          );
          context.fillStyle = hexToRgba(primary, 0.55);
          context.fill();
        }
      }
    };
    frame = window.requestAnimationFrame(draw);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  );
}
