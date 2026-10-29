import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';
import { findForbiddenInSource, type TermHit } from './forbidden-terms';

/** 扫描根 = web/src；vitest 从 web 目录运行，process.cwd() 即 web */
const SRC_ROOT = join(process.cwd(), 'src');

/** 豁免：测试文件（是断言而非用户可见文案）、禁词清单自身（含字面量） */
function isExempt(name: string): boolean {
  return name.includes('.test.') || name === 'forbidden-terms.ts';
}

function collectSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSources(full, out);
    } else if ((entry.endsWith('.ts') || entry.endsWith('.tsx')) && !isExempt(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface LabeledHit extends TermHit {
  file: string;
}

describe('界面术语走查守卫（product-surface-hygiene Scenario 1）', () => {
  it('全站用户可见文案禁用词命中为 0', () => {
    expect(existsSync(SRC_ROOT), `扫描根不存在：${SRC_ROOT}`).toBe(true);
    const files = collectSources(SRC_ROOT);
    expect(files.length).toBeGreaterThan(20);
    const hits: LabeledHit[] = [];
    for (const file of files) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, '/');
      for (const hit of findForbiddenInSource(readFileSync(file, 'utf8'))) {
        hits.push({ ...hit, file: rel });
      }
    }
    const report = hits
      .map((h) => `${h.file}:${h.line} 「${h.term}」 → ${h.text}`)
      .join('\n');
    expect(hits, `发现 ${hits.length} 处禁用词：\n${report}`).toEqual([]);
  });
});
