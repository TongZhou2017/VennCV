let measureCanvas: HTMLCanvasElement | null = null;

/** 用画布测量文字宽度。没有画布时，中文按字号、英文按字号的一半估算。 */
export function textWidth(text: string, fontSize: number): number {
  if (typeof document !== "undefined") {
    measureCanvas ??= document.createElement("canvas");
    const context = measureCanvas.getContext("2d");
    if (context) {
      context.font = `${fontSize}px sans-serif`;
      const measured = context.measureText(text).width;
      if (measured > 0) return measured;
    }
  }
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 0xff ? fontSize : fontSize * 0.56;
  }
  return width;
}
