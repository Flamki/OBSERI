import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, Globe2, LoaderCircle, Monitor, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { Soul } from "@/lib/soul";

export const Route = createFileRoute("/demo/$soulId")({
  head: () => ({
    meta: [
      { title: "Live demo · Obseri" },
      {
        name: "description",
        content: "A live Obseri voice and chat agent, trained on this website.",
      },
      { name: "robots", content: "noindex, nofollow, noarchive" },
    ],
  }),
  component: DemoPage,
});

type DemoState =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; soul: Soul };

function DemoPage() {
  const { soulId } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<DemoState>({ status: "loading" });
  const [view, setView] = useState<"site" | "simple">("site");

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (!token) {
      setState({ status: "error", message: "This demo link is incomplete." });
      return;
    }
    const controller = new AbortController();
    (async () => {
      const sessionResponse = await fetch(
        `/api/widgets/${encodeURIComponent(soulId)}/session?token=${encodeURIComponent(token)}`,
        { cache: "no-store", signal: controller.signal },
      );
      const sessionPayload = (await sessionResponse.json().catch(() => null)) as {
        session?: string;
      } | null;
      if (!sessionResponse.ok || !sessionPayload?.session) throw new Error("inactive");
      const soulResponse = await fetch(`/api/souls/${encodeURIComponent(soulId)}`, {
        headers: { authorization: `Bearer ${sessionPayload.session}` },
        cache: "no-store",
        signal: controller.signal,
      });
      const soulPayload = (await soulResponse.json().catch(() => null)) as {
        soul?: Soul;
      } | null;
      if (!soulResponse.ok || !soulPayload?.soul) throw new Error("inactive");
      setState({ status: "ready", soul: soulPayload.soul });
    })().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState({
        status: "error",
        message:
          "This demo isn’t active right now. Ask the person who shared it to switch the demo on and publish again.",
      });
    });
    return () => controller.abort();
  }, [soulId, token]);

  const soul = state.status === "ready" ? state.soul : null;

  // Load the real widget, exactly as a customer's website would.
  useEffect(() => {
    if (!soul || !token) return;
    const script = document.createElement("script");
    script.src = "/obseri-widget.js";
    script.async = true;
    script.dataset.soulId = soul.id;
    script.dataset.widgetToken = token;
    script.dataset.position = soul.appearance.position;
    script.dataset.autoOpen = "true";
    document.body.appendChild(script);
    return () => {
      script.remove();
      document.getElementById(`obseri-soul-${soul.id}`)?.remove();
    };
  }, [soul, token]);

  const host = soul ? hostOf(soul.siteUrl) : "";
  const agentName = soul?.personality.name || "the agent";
  const home = soul?.knowledge.pages[0];
  const suggestions = soul
    ? soul.knowledge.pages
        .slice(1, 4)
        .map((page) => page.title.split(/[|–—-]/)[0]?.trim())
        .filter((title): title is string => Boolean(title))
    : [];

  return (
    <div className="obs-app flex min-h-screen flex-col bg-[#f3f3f1] text-[#0b0b0c]">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#e7e7e4] bg-white px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" aria-label="Obseri" className="shrink-0">
            <img src="/obseri-logo-dark.svg" alt="Obseri" className="h-6 w-auto" />
          </a>
          {soul && (
            <>
              <span className="hidden h-5 w-px bg-[#e7e7e4] sm:block" />
              <span className="hidden min-w-0 items-center gap-2 text-sm sm:flex">
                <span className="truncate font-medium">{host}</span>
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#e9f9ef] px-2 py-0.5 text-[11px] font-semibold text-[#15803d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#22c55e]" /> Live demo
                </span>
              </span>
            </>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {soul && (
            <div className="hidden rounded-full border border-[#e7e7e4] p-0.5 md:flex">
              {(
                [
                  ["site", "Website", <Monitor key="m" className="h-3.5 w-3.5" />],
                  ["simple", "Simple", <Sparkles key="s" className="h-3.5 w-3.5" />],
                ] as const
              ).map(([id, label, icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setView(id)}
                  aria-pressed={view === id}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition ${view === id ? "bg-[#0b0b0c] text-white" : "text-[#5f5e5a] hover:text-[#0b0b0c]"}`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          )}
          <a
            href={`mailto:flamki@obseri.com?subject=${encodeURIComponent(`Obseri for ${host || "our website"}`)}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#0b0b0c] px-4 text-[13px] font-medium text-white transition hover:bg-[#2a2a2e]"
          >
            Get this on your site <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main className="relative flex flex-1 flex-col p-3 sm:p-5">
        {state.status === "loading" && (
          <div className="flex flex-1 items-center justify-center text-sm text-[#6f6e69]">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> Preparing your demo…
          </div>
        )}
        {state.status === "error" && (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-[24px] border border-[#ebebe8] bg-white p-8 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f3f3f1]">
                <Globe2 className="h-5 w-5" />
              </span>
              <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em]">Demo unavailable</h1>
              <p className="mt-2 text-sm leading-6 text-[#6f6e69]">{state.message}</p>
              <a
                href="/"
                className="mt-6 inline-flex h-10 items-center gap-2 rounded-full border border-[#e2e2df] px-4 text-sm font-medium hover:bg-[#f5f5f3]"
              >
                Learn about Obseri
              </a>
            </div>
          </div>
        )}
        {soul && (
          <div className="relative flex flex-1 flex-col overflow-hidden rounded-[20px] border border-[#e2e2df] bg-white shadow-[0_24px_80px_-32px_rgba(0,0,0,.25)]">
            <div className="flex h-10 shrink-0 items-center gap-3 border-b border-[#efefec] px-4">
              <span className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
              </span>
              <span className="mx-auto truncate rounded-md bg-[#f3f3f1] px-3 py-1 text-xs text-[#6f6e69]">
                {host}
              </span>
              <span className="w-10" />
            </div>
            {view === "site" ? (
              <iframe
                title={`${host} website`}
                src={soul.siteUrl}
                className="min-h-[70vh] w-full flex-1 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="relative flex flex-1 items-center overflow-hidden px-6 py-16 sm:px-14">
                <div className="obs-hero-glow pointer-events-none absolute inset-0 opacity-60" />
                <div className="relative max-w-2xl">
                  <p className="obs-mono text-xs uppercase tracking-[0.14em] text-[#8a8a8f]">
                    {host}
                  </p>
                  <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1] tracking-[-0.05em]">
                    {home?.title || soul.name}
                  </h1>
                  {home?.description && (
                    <p className="mt-5 max-w-xl text-[17px] leading-7 text-[#6f6e69]">
                      {home.description}
                    </p>
                  )}
                  {suggestions.length > 0 && (
                    <div className="mt-8">
                      <p className="text-sm font-medium">Try asking {agentName} about</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {suggestions.map((suggestion) => (
                          <span
                            key={suggestion}
                            className="rounded-full border border-[#e7e7e4] bg-white px-3.5 py-1.5 text-sm text-[#3d3d3a]"
                          >
                            {suggestion}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            <p className="pointer-events-none absolute bottom-4 left-4 hidden max-w-xs rounded-2xl bg-[#0b0b0c]/90 px-4 py-3 text-[13px] leading-5 text-white shadow-lg backdrop-blur md:block">
              This is {agentName}, trained on {host}. Talk or type in the corner. Website not
              showing? Switch to Simple view.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function hostOf(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
