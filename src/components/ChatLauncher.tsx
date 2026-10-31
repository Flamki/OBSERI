import type { AppearanceConfig } from "@/lib/soul";
import { launcherLabel } from "@/lib/launcher";
import { glassSurface } from "@/lib/chat-appearance";

export default function ChatLauncher({
  appearance,
  onClick,
  className = "",
}: {
  appearance: AppearanceConfig;
  onClick: () => void;
  className?: string;
}) {
  const dark = appearance.theme === "dark";
  return (
    <button
      onClick={onClick}
      aria-label={launcherLabel(appearance)}
      style={appearance.theme === "glass" ? glassSurface : undefined}
      className={`flex max-w-[calc(100%-32px)] items-center gap-3 rounded-full border py-2 pl-2 pr-5 text-sm font-medium shadow-[0_12px_36px_rgba(24,29,20,.15)] transition hover:-translate-y-0.5 ${dark ? "border-white/15 bg-[#131211] text-white" : "border-black/10 bg-white text-[#212120]"} ${className}`}
    >
      <span
        aria-hidden="true"
        className="h-10 w-10 shrink-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 28% 24%,#ffe54c,transparent 31%),radial-gradient(circle at 74% 70%,#2fb4ff,transparent 35%),radial-gradient(circle at 24% 78%,#4bcde0,transparent 33%),#88c8d4",
        }}
      />
      <span className="truncate">{launcherLabel(appearance)}</span>
    </button>
  );
}
