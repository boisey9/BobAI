import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.mjs", "../Web/tests/hosted-network.test.ts"],
    clearMocks: true,
  },
});
