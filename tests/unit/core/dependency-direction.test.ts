/**
 * 依赖方向守卫：core 不得反向依赖 server / cli
 *
 * 铁律（AGENTS.md §4）：cli / server → core → utils 单向。
 * core 一旦 import server，就会出现「core 测试必须 mock server 单例」的畸形依赖，
 * 拆包、复用、单测都会跟着烂。本测试用静态扫描把它钉死。
 *
 * 关联: fix-trust-and-consistency tasks H6
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// 用 fileURLToPath 而非 url.pathname：仓库路径含中文，pathname 会百分号编码导致 ENOENT
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');
const SRC = join(REPO_ROOT, 'src');
const CORE = join(SRC, 'core');
const FORBIDDEN_DIRS = [join(SRC, 'server'), join(SRC, 'cli')];

/** 递归收集 .ts 文件（跳过 .test.ts 与构建产物） */
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectTsFiles(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** 返回该文件里指向 server / cli 的相对 import 说明符 */
function forbiddenImportsOf(file: string, content: string): string[] {
  const found: string[] = [];
  const pattern = /from\s+'(\.[^']+)'/g;
  for (const match of content.matchAll(pattern)) {
    const spec = match[1] ?? '';
    const target = resolve(dirname(file), spec);
    if (FORBIDDEN_DIRS.some((dir) => target === dir || target.startsWith(dir + sep))) {
      found.push(spec);
    }
  }
  return found;
}

describe('依赖方向守卫（H6）', () => {
  it('守卫自检：能识别违规、不误报同层 import', () => {
    const fake = join(CORE, 'sample.ts');
    expect(forbiddenImportsOf(fake, "import { x } from '../server/lib/hub-context.js';")).toEqual([
      '../server/lib/hub-context.js',
    ]);
    expect(forbiddenImportsOf(fake, "import { y } from '../cli/index.js';")).toEqual(['../cli/index.js']);
    // 同层与更深层的 core 内部 import 不算违规
    expect(forbiddenImportsOf(fake, "import { z } from './config.js';")).toEqual([]);
    expect(forbiddenImportsOf(fake, "import { w } from './adapters/base.js';")).toEqual([]);
    expect(forbiddenImportsOf(fake, "import { v } from '../utils/paths.js';")).toEqual([]);
  });

  it('扫描确实覆盖了 core 目录（防止守卫自己失效变成假绿）', () => {
    const files = collectTsFiles(CORE);
    expect(files.length).toBeGreaterThan(25);
    expect(files.some((file) => file.endsWith('overview.ts'))).toBe(true);
    expect(files.some((file) => file.endsWith('adapters/base.ts') || file.endsWith('adapters\\base.ts'))).toBe(true);
  });

  it('core 下没有任何文件 import server 或 cli', () => {
    const violations: string[] = [];
    for (const file of collectTsFiles(CORE)) {
      const specs = forbiddenImportsOf(file, readFileSync(file, 'utf-8'));
      for (const spec of specs) violations.push(`${file.slice(REPO_ROOT.length + 1)} → ${spec}`);
    }
    expect(violations).toEqual([]);
  });
});
