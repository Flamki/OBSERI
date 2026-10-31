import { useEffect, useState } from "react";
import { countryName } from "@/lib/country";

// Databuddy's country matching and square-root shading, adapted to a local SVG map.
// Source and attribution: THIRD_PARTY_NOTICES.md.
export function CountryMap({
  countries,
  onSelect,
}: {
  countries: Array<{ country: string | null; sessions: number }>;
  onSelect: (code: string) => void;
}) {
  const [shapes, setShapes] = useState<Array<{ code: string; path: string }>>([]);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    fetch("/analytics/world-countries.json", { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Map unavailable");
        return response.json();
      })
      .then(setShapes)
      .catch(() => {
        if (!abort.signal.aborted) setFailed(true);
      });
    return () => abort.abort();
  }, []);
  const counts = new Map(countries.map((row) => [row.country, row.sessions]));
  const max = Math.max(1, ...countries.filter((row) => row.country).map((row) => row.sessions));
  if (!shapes.length)
    return (
      <div role="status" className="flex h-60 items-center justify-center text-sm text-neutral-400">
        {failed ? "Map unavailable. Country totals are listed alongside." : "Loading map…"}
      </div>
    );
  return (
    <svg viewBox="0 0 720 300" className="w-full" role="group" aria-label="Visitor countries map">
      {shapes.map((shape) => {
        const count = counts.get(shape.code) || 0;
        const opacity = count ? 0.15 + 0.75 * Math.sqrt(count / max) : 0;
        return (
          <path
            key={shape.code}
            d={shape.path}
            fill={count ? `rgba(255,85,124,${opacity})` : "#eeeef0"}
            stroke="white"
            strokeWidth=".6"
            role={count ? "button" : undefined}
            tabIndex={count ? 0 : undefined}
            aria-label={`${countryName(shape.code)}: ${count} sessions`}
            onClick={() => {
              if (count) onSelect(shape.code);
            }}
            onKeyDown={(e) => {
              if (count && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onSelect(shape.code);
              }
            }}
            className={
              count
                ? "cursor-pointer hover:stroke-neutral-700 focus:stroke-neutral-900 focus:outline-none"
                : ""
            }
          >
            <title>
              {countryName(shape.code)}: {count} sessions
            </title>
          </path>
        );
      })}
    </svg>
  );
}
