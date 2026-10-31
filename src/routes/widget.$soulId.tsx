import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Orbit } from "lucide-react";
import SoulChat from "@/components/SoulChat";
import ContactCapture from "@/components/ContactCapture";
import type { Soul } from "@/lib/soul";

export const Route = createFileRoute("/widget/$soulId")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "voice" ? ("voice" as const) : ("chat" as const),
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
  const [context, setContext] = useState(readWidgetContext);
  const conversationStarted = useRef(false);

  useEffect(() => {
    const update = (event: MessageEvent) => {
      if (
        event.source !== window.parent ||
        event.origin !== context.parentOrigin ||
        event.data?.type !== "obseri:context"
      )
        return;
      if (typeof event.data.session !== "string") return;
      setContext({
        session: event.data.session,
        parentOrigin: context.parentOrigin,
        sessionId: typeof event.data.sessionId === "string" ? event.data.sessionId : undefined,
        path: typeof event.data.path === "string" ? event.data.path : "/",
      });
    };
    window.addEventListener("message", update);
    return () => window.removeEventListener("message", update);
  }, [context.parentOrigin]);

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
    <main className="obs-app min-h-screen bg-transparent p-2 text-[#0b0b0c]">
      {soul ? (
        <SoulChat
          soul={soul}
          compact
          voiceMode
          sessionToken={context.session}
          initialPanelMode={mode}
          contactAction={
            soul.personality.leadCapture ? (
              <ContactCapture
                soulId={soul.id}
                conversationId={conversationId.current}
                sessionToken={context.session}
                sessionId={context.sessionId}
                path={context.path}
                businessName={soul.name}
              />
            ) : undefined
          }
          onClose={() =>
            window.parent.postMessage(
              { type: "obseri:close" },
              context.parentOrigin || window.location.origin,
            )
          }
          onMessagesChange={(messages, leadIntent) => {
            if (
              !conversationStarted.current &&
              messages.some((message) => message.role === "visitor")
            ) {
              conversationStarted.current = true;
              window.parent.postMessage(
                { type: "obseri:conversation-started" },
                context.parentOrigin,
              );
            }
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
        <div className="flex min-h-[220px] items-center justify-center rounded-[1.6rem] border border-[#e7e7e4] bg-white p-8 text-center shadow-[0_24px_60px_-20px_rgba(0,0,0,.25)]">
          <div>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f5f5f3] text-[#0b0b0c]">
              {error ? (
                <Orbit className="h-5 w-5" />
              ) : (
                <LoaderCircle className="h-5 w-5 animate-spin" />
              )}
            </span>
            <p className="mt-4 text-sm font-semibold">
              {error || "Connecting you to this website…"}
            </p>
            {error && <p className="mt-2 text-xs text-[#8a8a8f]">Please try again in a moment.</p>}
          </div>
        </div>
      )}
    </main>
  );
}

function readWidgetContext(): {
  session: string;
  parentOrigin: string;
  sessionId?: string;
  path: string;
} {
  if (typeof window === "undefined") return { session: "", parentOrigin: "", path: "/" };
  try {
    const value = JSON.parse(window.name) as {
      session?: unknown;
      parentOrigin?: unknown;
      sessionId?: unknown;
      path?: unknown;
    };
    return {
      session: typeof value.session === "string" ? value.session : "",
      parentOrigin: typeof value.parentOrigin === "string" ? value.parentOrigin : "",
      sessionId: typeof value.sessionId === "string" ? value.sessionId : undefined,
      path: typeof value.path === "string" ? value.path : "/",
    };
  } catch {
    return { session: "", parentOrigin: "", path: "/" };
  }
}
