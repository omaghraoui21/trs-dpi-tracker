import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // Vitest 4 ships with rolldown-vite which uses oxc for parsing/transforms.
  // We need to teach it how to handle JSX in .tsx test files.
  // @ts-expect-error rolldown-vite extends vite config with `oxc`
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/__tests__/**/*.test.tsx", "**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "**/mockup-sandbox/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["artifacts/api-server/src/lib/**", "lib/**"],
    },
  },
  resolve: {
    alias: {
      "@workspace/db": path.resolve(__dirname, "lib/db/src/index.ts"),
      "@": path.resolve(__dirname, "artifacts/trs-app/src"),
    },
  },
});
