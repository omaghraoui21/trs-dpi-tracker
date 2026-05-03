import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
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
    },
  },
});
