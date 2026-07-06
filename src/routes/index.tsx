import { createFileRoute } from "@tanstack/react-router";
import Dither from "@/components/Dither";
import { ArrowRight, Sparkles, Zap, MousePointer2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dither — Retro WebGL Shader Backgrounds" },
      {
        name: "description",
        content:
          "A drop-in WebGL dithered wave background component. Retro pixel aesthetic, mouse-reactive, GPU-accelerated.",
      },
      { property: "og:title", content: "Dither — Retro WebGL Shader Backgrounds" },
      {
        property: "og:description",
        content:
          "A drop-in WebGL dithered wave background component. Retro pixel aesthetic, mouse-reactive, GPU-accelerated.",
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
            waveColor={[0.55, 0.55, 0.6]}
            waveAmplitude={0.32}
            waveFrequency={3}
            waveSpeed={0.05}
            colorNum={4}
            pixelSize={2}
            mouseRadius={0.35}
            enableMouseInteraction
          />
        </div>

        {/* subtle vignette for legibility */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_40%,_rgba(0,0,0,0.55)_100%)]" />

        <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
          <div className="flex items-center gap-2 text-sm tracking-[0.3em] uppercase text-white/90">
            <span className="inline-block h-2 w-2 bg-white" />
            Dither/OS
          </div>
          <nav className="hidden md:flex items-center gap-8 text-xs uppercase tracking-widest text-white/70">
            <a href="#features" className="hover:text-white transition">Features</a>
            <a href="#props" className="hover:text-white transition">Props</a>
            <a href="#install" className="hover:text-white transition">Install</a>
          </nav>
          <a
            href="#install"
            className="text-xs uppercase tracking-widest border border-white/40 px-4 py-2 text-white hover:bg-white hover:text-black transition"
          >
            Get it
          </a>
        </header>

        <div className="relative z-10 flex h-[calc(100vh-96px)] flex-col items-center justify-center px-6 text-center pointer-events-none">
          <span className="text-xs uppercase tracking-[0.5em] text-white/70 mb-6">
            v1.0 · WebGL · ogl
          </span>
          <h1 className="text-[15vw] md:text-[10vw] leading-[0.85] font-black tracking-tighter text-white">
            DITHER.
          </h1>
          <p className="mt-6 max-w-xl text-base md:text-lg text-white/80">
            A Bayer-dithered wave shader you can drop behind anything. Mouse-reactive.
            GPU-cheap. Unapologetically retro.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 pointer-events-auto">
            <a
              href="#install"
              className="group inline-flex items-center gap-2 bg-white text-black px-6 py-3 text-sm uppercase tracking-widest hover:bg-white/90 transition"
            >
              Copy component
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </a>
            <a
              href="#features"
              className="inline-flex items-center gap-2 border border-white/40 text-white px-6 py-3 text-sm uppercase tracking-widest hover:bg-white/10 transition"
            >
              What it does
            </a>
          </div>

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-white/60">
            move your cursor ↴
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
          <span>Dither/OS · 2026</span>
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
