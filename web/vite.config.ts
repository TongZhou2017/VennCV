import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { userLibraryPlugin } from "./vite-plugin-user-library";

export default defineConfig({
  plugins: [react(), userLibraryPlugin()],
  base: "./",
  server: {
    port: 5173,
    strictPort: true,
  },
});
