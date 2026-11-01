import { describe, expect, it } from 'vitest';
import { contrastRatio, hexToRgb, hslToHex, relativeLuminance } from './contrast';

/**
 * enhance-a11y-responsive T1/T2（responsive Scenario 6）：
 * WCAG 2.1 相对亮度与对比度的纯函数实现，无任何副作用。
 */
describe('contrast 纯函数（WCAG 2.1）', () => {
  it('hexToRgb 解析 6 位与 3 位十六进制', () => {
    expect(hexToRgb('#ffffff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(hexToRgb('#000000')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('ff8800')).toEqual({ r: 255, g: 136, b: 0 });
    expect(hexToRgb('#f00')).toEqual({ r: 255, g: 0, b: 0 });
  });

  it('hexToRgb 拒绝非法输入', () => {
    expect(() => hexToRgb('#gggggg')).toThrow();
    expect(() => hexToRgb('#fff0')).toThrow();
  });

  it('相对亮度：白 1.0、黑 0.0（WCAG 参考值）', () => {
    expect(relativeLuminance(hexToRgb('#ffffff'))).toBeCloseTo(1, 5);
    expect(relativeLuminance(hexToRgb('#000000'))).toBeCloseTo(0, 5);
  });

  it('对比度四个已知参考值', () => {
    // 黑白 21:1
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 1);
    // 同色 1:1
    expect(contrastRatio('#6b7280', '#6b7280')).toBeCloseTo(1, 5);
    // 中灰 #767676 对白 ≈ 4.54:1（WCAG 经典临界色）
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
    // 纯蓝 #0000ff 对白 ≈ 8.59:1
    expect(contrastRatio('#0000ff', '#ffffff')).toBeCloseTo(8.59, 1);
    // 顺序无关（取较大分子）
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#000000'), 5);
  });

  it('hslToHex 换算 CSS hsl() 三个分量（S/L 百分数、H 度数）', () => {
    // 215.4 16.3% 46.9% ≈ #6b7280 附近的中性灰蓝，逐分量换算应与标准公式一致
    expect(hslToHex(215.4, 16.3, 46.9)).toMatch(/^#[0-9a-f]{6}$/);
    expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    expect(hslToHex(240, 100, 50)).toBe('#0000ff');
  });
});

/**
 * T2 令牌校准（responsive Scenario 6）：数值取自 web/src/index.css 的 :root 令牌，
 * 改动令牌必须同步更新这里——测试即「实测记录」的可执行版。
 */
const TOKENS = {
  background: [0, 0, 100],
  card: [0, 0, 100],
  muted: [210, 40, 96.1],
  foreground: [222.2, 84, 4.9],
  mutedForeground: [215.4, 16.3, 43.5],
  primary: [243, 75, 59],
  primaryForeground: [210, 40, 98],
  success: [142, 71, 29],
  warning: [26, 91, 37],
  destructive: [0, 72, 51],
  info: [224, 76, 48],
} as const;

function ratioOn(text: readonly [number, number, number], bg: readonly [number, number, number]): number {
  const [th, ts, tl] = text;
  const [bh, bs, bl] = bg;
  return contrastRatio(hslToHex(th, ts, tl), hslToHex(bh, bs, bl));
}

describe('设计令牌对比度（index.css 实测锚定）', () => {
  it('--muted-foreground 在三种底色上均 ≥ 4.5:1', () => {
    for (const bg of ['background', 'card', 'muted'] as const) {
      expect(ratioOn(TOKENS.mutedForeground, TOKENS[bg]), bg).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('--foreground 在三种底色上均 ≥ 7:1', () => {
    for (const bg of ['background', 'card', 'muted'] as const) {
      expect(ratioOn(TOKENS.foreground, TOKENS[bg]), bg).toBeGreaterThanOrEqual(7);
    }
  });

  it('主按钮文字 ≥ 4.5:1，语义色文字 ≥ 4.5:1', () => {
    expect(ratioOn(TOKENS.primaryForeground, TOKENS.primary)).toBeGreaterThanOrEqual(4.5);
    for (const semantic of ['success', 'warning', 'destructive', 'info'] as const) {
      expect(ratioOn(TOKENS[semantic], TOKENS.background), semantic).toBeGreaterThanOrEqual(4.5);
    }
  });
});
