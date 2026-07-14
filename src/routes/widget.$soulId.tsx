import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LoaderCircle, Orbit } from "lucide-react";
import SoulChat from "@/components/SoulChat";
import type { Soul } from "@/lib/soul";

export const Route = createFileRoute("/widget/$soulId")({
  head: () => ({
    meta: [{ title: "Website soul · Obseri" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EmbeddedSoul,
});

function EmbeddedSoul() {
  const { soulId } = Route.useParams();
  const [soul, setSoul] = useState<Soul | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/souls/${encodeURIComponent(soulId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("This website soul is not published yet.");
        return (await response.json()) as { soul: Soul };
      })
      .then((payload) => setSoul(payload.soul))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "The soul is unavailable.");
      });
    return () => controller.abort();
  }, [soulId]);

  return (
    <main className="min-h-screen bg-transparent p-2 font-mono text-foreground">
      {soul ? (
        <SoulChat
          soul={soul}
          compact
          onMessagesChange={(messages, leadIntent) => {
            void fetch(`/api/souls/${encodeURIComponent(soul.id)}/events`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ messages, leadIntent }),
              keepalive: true,
            });
          }}
        />
      ) : (
        <div className="flex min-h-[220px] items-center justify-center rounded-[1.6rem] border border-white/10 bg-[#09100c]/95 p-8 text-center shadow-2xl backdrop-blur-2xl">
          <div>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/20 bg-primary/8 text-primary">
              {error ? (
                <Orbit className="h-5 w-5" />
              ) : (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              )}
            </span>
            <p className="mt-4 text-xs font-black">{error || "Waking up this website soul…"}</p>
            {error && (
              <p className="mt-2 text-[9px] text-muted-foreground">
                Open Soul Studio and publish it again.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
