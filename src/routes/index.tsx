import { createFileRoute } from "@tanstack/react-router";
import Dither from "@/components/Dither";
import { Sparkles, Zap, MousePointer2, Plus, Smartphone, Globe, Palette, Mic, ArrowUp } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Obseri — Agentic web intelligence" },
      {
        name: "description",
        content:
          "Turn volatile web signals into monitored sources, verifiable data, searchable memory, and repeatable workflows.",
      },
      { property: "og:title", content: "Obseri — Agentic web intelligence" },
      {
        property: "og:description",
        content:
          "Turn volatile web signals into monitored sources, verifiable data, searchable memory, and repeatable workflows.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground font-mono">
      {/* HERO */}
      <section className="relative h-screen w-full overflow-hidden">
        <div className="absolute inset-0">
          <Dither
            waveColor={[0.55, 0.85, 0.35]}
            waveAmplitude={0.32}
            waveFrequency={3}
            waveSpeed={0.05}
            colorNum={4}
            pixelSize={2}
            mouseRadius={0.35}
            enableMouseInteraction
          />
        </div>

        {/* vignette for legibility */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_35%,_rgba(0,0,0,0.75)_100%)]" />

        <header className="relative z-10 flex items-center justify-between px-6 md:px-10 py-6">
          <span className="text-xl font-bold tracking-tight text-foreground">
            Obseri<span className="text-primary">.</span>
          </span>
          <a
            href="#install"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-background/60 backdrop-blur px-4 py-2 text-sm text-foreground hover:bg-secondary transition"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            Request access
          </a>
        </header>

        <div className="relative z-10 flex h-[calc(100vh-96px)] flex-col items-center justify-center px-6 md:px-16 pointer-events-none text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-background/60 backdrop-blur px-4 py-2 text-xs text-primary mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            Agentic web intelligence
          </div>
          <h1 className="text-[18vw] md:text-[12vw] leading-[0.85] font-black tracking-tighter text-foreground">
            Obseri<span className="text-primary">.</span>
          </h1>
          <p className="mt-8 max-w-lg text-lg md:text-xl text-foreground/80 leading-relaxed">
            Turn volatile pixel signals into monitored sources, verifiable waves,
            searchable memory, and repeatable shader workflows.
          </p>
          <div className="mt-10 w-full max-w-4xl pointer-events-auto">
            <PromptBox />
          </div>
        </div>
      </section>



      {/* FEATURES */}
      <section id="features" className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-24">
          <div className="flex items-end justify-between mb-16 flex-wrap gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground mb-3">
                / 01 — Features
              </div>
              <h2 className="text-4xl md:text-6xl font-black tracking-tighter">
                Pixels that
                <br />
                <span className="italic font-serif">actually</span> feel.
              </h2>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
              Built on top of ogl — a tiny WebGL library. The whole component is one
              file, one dependency, zero configuration.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-px bg-border border border-border">
            <Feature
              icon={<Sparkles className="h-5 w-5" />}
              title="Bayer dithering"
              body="Classic 8×8 ordered dither. Quantizes color into a crunchy retro palette."
            />
            <Feature
              icon={<MousePointer2 className="h-5 w-5" />}
              title="Mouse reactive"
              body="Cursor pushes the wave field with soft, smoothed falloff. Feels alive."
            />
            <Feature
              icon={<Zap className="h-5 w-5" />}
              title="GPU-cheap"
              body="Single full-screen triangle, one fragment shader. Runs at 60fps on a toaster."
            />
          </div>
        </div>
      </section>

      {/* PROPS */}
      <section id="props" className="border-t border-border bg-secondary">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-24">
          <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground mb-3">
            / 02 — Props
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-12">
            Nine knobs.
          </h2>

          <div className="overflow-x-auto border border-border bg-background">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr className="text-left uppercase tracking-widest text-xs text-muted-foreground">
                  <th className="px-6 py-4 font-normal">Prop</th>
                  <th className="px-6 py-4 font-normal">Default</th>
                  <th className="px-6 py-4 font-normal">What it does</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {PROPS.map((p) => (
                  <tr key={p.name} className="hover:bg-secondary transition">
                    <td className="px-6 py-4 font-bold">{p.name}</td>
                    <td className="px-6 py-4 text-muted-foreground">{p.def}</td>
                    <td className="px-6 py-4 text-foreground/80">{p.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* INSTALL */}
      <section id="install" className="border-t border-border">
        <div className="mx-auto max-w-4xl px-6 md:px-12 py-24">
          <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground mb-3">
            / 03 — Install
          </div>
          <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-10">
            Three lines.
          </h2>

          <div className="border border-border bg-secondary p-6 mb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              1. add the dependency
            </div>
            <pre className="text-sm overflow-x-auto">
              <code>bun add ogl</code>
            </pre>
          </div>

          <div className="border border-border bg-secondary p-6 mb-4">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              2. import
            </div>
            <pre className="text-sm overflow-x-auto">
              <code>{`import Dither from "@/components/Dither";`}</code>
            </pre>
          </div>

          <div className="border border-border bg-secondary p-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">
              3. use
            </div>
            <pre className="text-sm overflow-x-auto leading-relaxed">
              <code>{`<div className="relative w-full h-[600px]">
  <Dither
    waveColor={[0.5, 0.5, 0.5]}
    mouseRadius={0.3}
    colorNum={4}
    waveAmplitude={0.3}
    waveFrequency={3}
    waveSpeed={0.05}
  />
</div>`}</code>
            </pre>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 md:px-12 py-8 flex items-center justify-between text-xs uppercase tracking-widest text-muted-foreground">
          <span>Obseri · 2026</span>
          <span>Made with ogl + WebGL</span>
        </div>
      </footer>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-background p-8 md:p-10 hover:bg-secondary transition group">
      <div className="mb-8 h-10 w-10 border border-border flex items-center justify-center group-hover:bg-foreground group-hover:text-background transition">
        {icon}
      </div>
      <h3 className="text-xl font-bold mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function PromptBox() {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"app" | "web">("app");

  return (
    <div className="rounded-3xl border border-border/60 bg-background/70 backdrop-blur-xl shadow-2xl p-5 md:p-6 text-left">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What native mobile app shall we design?"
        rows={4}
        className="w-full resize-none bg-transparent text-lg md:text-xl text-foreground placeholder:text-muted-foreground/70 focus:outline-none border-0"
      />
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-full border border-border/60 flex items-center justify-center text-foreground/80 hover:bg-secondary transition"
            aria-label="Add attachment"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="flex items-center rounded-full border border-border/60 bg-background/50 p-1">
            <button
              type="button"
              onClick={() => setMode("app")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition ${
                mode === "app" ? "bg-secondary text-foreground" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              App
            </button>
            <button
              type="button"
              onClick={() => setMode("web")}
              className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm transition ${
                mode === "web" ? "bg-secondary text-foreground" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              <Globe className="h-4 w-4" />
              Web
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/70 hover:bg-secondary transition"
            aria-label="Theme"
          >
            <Palette className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3 py-1.5 text-sm text-foreground hover:bg-secondary transition"
          >
            <Sparkles className="h-4 w-4 text-primary" />
            3 Flash
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-full flex items-center justify-center text-foreground/70 hover:bg-secondary transition"
            aria-label="Voice input"
          >
            <Mic className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition disabled:opacity-50"
            disabled={!value.trim()}
            aria-label="Submit"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const PROPS = [
  { name: "waveSpeed", def: "0.05", desc: "Speed of wave animation." },
  { name: "waveFrequency", def: "3", desc: "Frequency of the wave pattern." },
  { name: "waveAmplitude", def: "0.3", desc: "Amplitude of the wave pattern." },
  { name: "waveColor", def: "[0.5, 0.5, 0.5]", desc: "RGB color for the waves (0–1)." },
  { name: "colorNum", def: "4", desc: "Colors in the dither palette." },
  { name: "pixelSize", def: "2", desc: "Pixel size for the retro effect." },
  { name: "disableAnimation", def: "false", desc: "Freeze the wave field." },
  { name: "enableMouseInteraction", def: "true", desc: "Cursor pushes the field." },
  { name: "mouseRadius", def: "1", desc: "Radius of the cursor influence." },
];
