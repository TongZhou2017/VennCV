import { test, expect } from "@playwright/test";

test.describe("VennCV Web", () => {
  test("E2E 入口：自动 admin 登录后 window.venncvE2e.state === logged_in", async ({
    page,
  }) => {
    await page.goto("/?venncv_e2e=1");

    await page.waitForFunction(
      () =>
        (window as unknown as { venncvE2e?: { state?: string } }).venncvE2e
          ?.state === "logged_in",
      { timeout: 90_000 }
    );

    const state = await page.evaluate(
      () => (window as unknown as { venncvE2e?: { state?: string } }).venncvE2e?.state
    );
    expect(state).toBe("logged_in");

    await page.waitForFunction(
      () =>
        (window as unknown as { venncvE2e?: { phase?: string } }).venncvE2e
          ?.phase === "main_ui",
      { timeout: 90_000 }
    );
  });

  test("画布存在且 WebGL 上下文可创建", async ({ page }) => {
    await page.goto("/?venncv_e2e=1");
    const canvas = page.locator("#venncv_canvas");
    await expect(canvas).toBeVisible({ timeout: 90_000 });
    const ok = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return false;
      return !!(
        c.getContext("webgl2") ||
        c.getContext("webgl") ||
        c.getContext("experimental-webgl")
      );
    });
    expect(ok).toBe(true);
  });
});
