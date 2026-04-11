/**
 * Cursor / 嵌入式 WebView 里 flex 子项常出现 clientWidth×clientHeight 为 0，
 * 但父链或 visualViewport 仍有有效尺寸。用于 Konva Stage 的 width/height。
 */
export function measureCanvasHost(el: HTMLElement): { w: number; h: number } {
  const r = el.getBoundingClientRect();
  let w = Math.round(r.width) || el.clientWidth;
  let h = Math.round(r.height) || el.clientHeight;

  if (typeof window !== "undefined") {
    const iw = window.innerWidth;
    const ih = window.innerHeight;
    const vv = window.visualViewport;
    const vw = vv?.width ?? iw;
    const vh = vv?.height ?? ih;

    if (w < 2 || h < 2) {
      // 与 MainShell 大致对齐：左栏 220 + 右栏 280 + 余量
      const horizChrome = 520;
      const vertChrome = 56;
      if (w < 2) w = Math.max(280, Math.floor(vw) - horizChrome);
      if (h < 2) h = Math.max(260, Math.floor(vh) - vertChrome);
    }
  }

  if (w < 2) w = 800;
  if (h < 2) h = 600;
  return { w, h };
}
