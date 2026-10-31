import type { AppearanceConfig } from "@/lib/soul";
import {
  LAUNCHER_CHARACTER_LIMIT,
  LAUNCHER_WORD_LIMIT,
  launcherLabel,
  launcherMode,
  normalizeLauncherLabel,
  type LauncherMode,
} from "@/lib/launcher";

export default function LauncherSettings({
  appearance,
  onChange,
}: {
  appearance: AppearanceConfig;
  onChange: (patch: Partial<AppearanceConfig>) => void;
}) {
  const label = appearance.launcherLabel || "";
  const words = label.trim().split(/\s+/u).filter(Boolean).length;
  return (
    <div className="space-y-4">
      <label className="block space-y-2 text-sm font-medium">
        <span>Launcher</span>
        <select
          aria-label="Launcher mode"
          className="clean-input"
          value={launcherMode(appearance)}
          onChange={(event) => onChange({ launcherMode: event.target.value as LauncherMode })}
        >
          <option value="chat">Chat only</option>
          <option value="both">Chat + voice</option>
          <option value="voice">Voice only</option>
        </select>
      </label>
      <label className="block space-y-2 text-sm font-medium">
        <span>Launcher text</span>
        <input
          aria-label="Launcher text"
          className="clean-input"
          value={label}
          placeholder={launcherLabel({ ...appearance, launcherLabel: "" })}
          onChange={(event) => {
            const raw = event.target.value;
            const normalized = normalizeLauncherLabel(raw);
            // Keep a trailing space while typing, without allowing a fifth word.
            const trailing =
              /\s$/u.test(raw) &&
              normalized.split(" ").length < LAUNCHER_WORD_LIMIT &&
              Array.from(normalized).length < LAUNCHER_CHARACTER_LIMIT;
            onChange({ launcherLabel: normalized + (trailing && normalized ? " " : "") });
          }}
          onBlur={() => onChange({ launcherLabel: normalizeLauncherLabel(label) })}
          aria-describedby="launcher-text-limit"
        />
        <span
          id="launcher-text-limit"
          className="flex justify-between gap-2 text-[11px] font-normal text-[#7c7a74]"
        >
          <span>Up to 4 words · leave blank for default</span>
          <span className="shrink-0">
            {words}/4 · {Array.from(label).length}/24
          </span>
        </span>
      </label>
    </div>
  );
}
