export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function svgDocument(markup: string): string {
  if (markup.includes("xmlns=")) return markup;
  return markup.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** 把一张 PNG 嵌进 SVG，方便在没有矢量画面时仍给出 SVG 文件。 */
export function svgWrappingPng(dataUrl: string, width: number, height: number): string {
  const href = dataUrl.replace(/"/g, "");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <image width="${width}" height="${height}" href="${href}"/>
</svg>
`;
}

export async function blobFromDataUrl(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function copyImageToClipboard(blob: Blob): Promise<void> {
  if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
    throw new Error("这个浏览器不能把图片放进剪贴板");
  }
  window.focus();
  try {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
  } catch {
    throw new Error("图片没有放进剪贴板，请点一下页面后再试");
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法导出图片"));
    image.src = url;
  });
}

export function serializeSvg(svg: SVGSVGElement): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  return svgDocument(new XMLSerializer().serializeToString(clone));
}

export async function pngBlobFromSvg(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const markup = serializeSvg(svg);
  const blob = new Blob([markup], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImage(url);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法导出图片");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("无法导出图片");
    return png;
  } finally {
    URL.revokeObjectURL(url);
  }
}
