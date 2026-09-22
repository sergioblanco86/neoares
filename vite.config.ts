import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"],
    },
  },
});
