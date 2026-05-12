import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

// ─── Port (dev/preview only — not required at build time) ────────────────────
const isDevOrPreview = process.env.NODE_ENV !== "production";
const rawPort = process.env.PORT;
const port = rawPort ? Number(rawPort) : 3000;
if (isDevOrPreview && rawPort && (Number.isNaN(port) || port <= 0)) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Base path (defaults to "/" — required only when serving under a subpath) ─
const basePath = process.env.BASE_PATH ?? "/";

// ─── Replit dev plugins (only loaded when running inside Replit) ──────────────
const replitPlugins =
  isDevOrPreview && process.env.REPL_ID !== undefined
    ? await Promise.all([
        import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
        import("@replit/vite-plugin-cartographer").then((m) =>
          m.cartographer({ root: path.resolve(import.meta.dirname, "..") }),
        ),
        import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
      ])
    : [];

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss(), ...replitPlugins],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // ─── Manual chunks ──────────────────────────────────────────────────
        // Split large third-party libs into separate cacheable chunks.
        // recharts (~393kB) and radix-ui (~30+ packages) are loaded on most pages
        // so they should be cached independently from app code.
        manualChunks(id: string) {
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) {
            return "recharts";
          }
          if (id.includes("node_modules/@radix-ui/")) {
            return "radix";
          }
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "react-vendor";
          }
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
