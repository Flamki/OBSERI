import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Orbit } from "lucide-react";
import SoulChat from "@/components/SoulChat";
import type { Soul } from "@/lib/soul";

export const Route = createFileRoute("/widget/$soulId")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "chat" ? ("chat" as const) : ("voice" as const),
  }),
  head: () => ({
    meta: [{ title: "Website soul · Obseri" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: EmbeddedSoul,
});

function EmbeddedSoul() {
  const { soulId } = Route.useParams();
  const { mode } = Route.useSearch();
  const [soul, setSoul] = useState<Soul | null>(null);
  const [error, setError] = useState("");
  const conversationId = useRef(crypto.randomUUID());
  const context = readWidgetContext();

  useEffect(() => {
    const controller = new AbortController();
    if (!context.session) {
      setError("This widget session is invalid.");
      return () => controller.abort();
    }
    void fetch(`/api/souls/${encodeURIComponent(soulId)}`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${context.session}` },
    })
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
  }, [context.session, soulId]);

  return (
    <main className="min-h-screen bg-transparent p-2 font-sans text-foreground">
      {soul ? (
        <SoulChat
          soul={soul}
          compact
          voiceMode
          sessionToken={context.session}
          initialPanelMode={mode}
          onClose={() =>
            window.parent.postMessage(
              { type: "obseri:close" },
              context.parentOrigin || window.location.origin,
            )
          }
          onMessagesChange={(messages, leadIntent) => {
            void fetch(`/api/souls/${encodeURIComponent(soul.id)}/events`, {
              method: "POST",
              headers: {
                "content-type": "application/json",
                authorization: `Bearer ${context.session}`,
              },
              body: JSON.stringify({
                conversationId: conversationId.current,
                messages,
                leadIntent,
              }),
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

function readWidgetContext(): { session: string; parentOrigin: string } {
  if (typeof window === "undefined") return { session: "", parentOrigin: "" };
  try {
    const value = JSON.parse(window.name) as { session?: unknown; parentOrigin?: unknown };
    return {
      session: typeof value.session === "string" ? value.session : "",
      parentOrigin: typeof value.parentOrigin === "string" ? value.parentOrigin : "",
    };
  } catch {
    return { session: "", parentOrigin: "" };
  }
}
