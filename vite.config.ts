/// <reference types="vitest/config" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Web-first build. The library is bundled (no CDN) so a future Tauri wrapper
// works fully offline. `clearScreen: false` keeps Tauri CLI logs readable.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: false },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
