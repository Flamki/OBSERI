import { createFileRoute } from "@tanstack/react-router";
import Dither from "@/components/Dither";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="relative w-full h-screen overflow-hidden bg-black">
      <Dither
        waveColor={[0.5, 0.5, 0.5]}
        disableAnimation={false}
        enableMouseInteraction={true}
        mouseRadius={0.3}
        colorNum={4}
        waveAmplitude={0.3}
        waveFrequency={3}
        waveSpeed={0.05}
      />
      <div className="relative z-10 flex h-full flex-col items-center justify-center text-center px-4 pointer-events-none">
        <h1 className="text-5xl md:text-7xl font-bold text-white tracking-tight">
          Dither
        </h1>
        <p className="mt-4 text-lg text-white/80 max-w-xl">
          An animated WebGL dither shader background.
        </p>
      </div>
    </div>
  );
}
