import { defineConfig } from "@playwright/test";

/**
 * 用法（仓库根目录）：
 *   cd e2e && npm install && npx playwright install chromium && npm test
 *
 * 或已手动在 legacy/wasm 下 `trunk serve`（默认端口见 legacy/wasm/Trunk.toml，当前 8081）时：
 *   cd e2e && PW_TEST_WEB_SERVER=0 npm test
 */
const useWebServer = process.env.PW_TEST_WEB_SERVER !== "0";

export default defineConfig({
  testDir: "./tests",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  retries: 0,
  use: {
    baseURL: "http://127.0.0.1:8081",
    trace: "on-first-retry",
  },
  webServer: useWebServer
    ? {
        command:
          "cd ../legacy/wasm && env -u NO_COLOR -u CI trunk serve",
        url: "http://127.0.0.1:8081/",
        // 设为 true 可复用已在 8081 运行的 `trunk serve`（需自行保证已重新构建含 E2E 的 WASM）
        reuseExistingServer: process.env.PW_REUSE_SERVER === "1",
        timeout: 180_000,
      }
    : undefined,
});
