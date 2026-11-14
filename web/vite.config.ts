import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { jianguoyunPlugin } from "./vite-plugin-jianguoyun";
import { userLibraryPlugin } from "./vite-plugin-user-library";

export default defineConfig({
  plugins: [react(), userLibraryPlugin(), jianguoyunPlugin()],
  // 桌面端打包用相对路径。网页用根路径，这样 /leisun 也能载入脚本。
  base: process.env.TAURI_ENV_PLATFORM ? "./" : "/",
  server: {
    port: 5173,
    strictPort: true,
  },
});
