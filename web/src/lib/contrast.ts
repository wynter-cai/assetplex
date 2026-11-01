/**
 * WCAG 2.1 对比度纯函数（enhance-a11y-responsive T1，responsive Scenario 6）。
 * 只做数学换算，无 DOM、无副作用；供令牌校准单测与「实测记录」使用。
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** 解析 #rgb / #rrggbb（# 可省略）为 RGB 三分量；非法输入抛错 */
export function hexToRgb(hex: string): Rgb {
  const raw = hex.startsWith('#') ? hex.slice(1) : hex;
  const expanded =
    raw.length === 3
      ? raw
          .split('')
          .map((c) => c + c)
          .join('')
      : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) {
    throw new Error(`非法十六进制颜色：${hex}`);
  }
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
  };
}

/** CSS hsl(h, s%, l%) → #rrggbb（h 度数可带小数，s/l 百分数） */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = clamp01_100(s) / 100;
  const light = clamp01_100(l) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  const [r, g, b] = hslSector(hue, c, x);
  const toHex = (v: number): string =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** WCAG 相对亮度（0 黑 → 1 白） */
export function relativeLuminance(rgb: Rgb): number {
  const channel = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** 两色对比度（1 ~ 21），顺序无关 */
export function contrastRatio(colorA: string, colorB: string): number {
  const la = relativeLuminance(hexToRgb(colorA));
  const lb = relativeLuminance(hexToRgb(colorB));
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

function clamp01_100(v: number): number {
  return Math.min(100, Math.max(0, v));
}

function hslSector(hue: number, c: number, x: number): [number, number, number] {
  if (hue < 60) return [c, x, 0];
  if (hue < 120) return [x, c, 0];
  if (hue < 180) return [0, c, x];
  if (hue < 240) return [0, x, c];
  if (hue < 300) return [x, 0, c];
  return [c, 0, x];
}
