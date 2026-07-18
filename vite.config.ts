import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  css: {
    // Keep development and production on the same CSS transformation path.
    transformer: "lightningcss",
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
      // Route the bundled server through the application's SSR error wrapper.
      server: { entry: "server" },
    }),
    ...(command === "build" ? [nitro({ defaultPreset: "vercel" })] : []),
    react(),
  ],
}));
