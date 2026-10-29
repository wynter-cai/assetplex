import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

/**
 * Scenario 8（product-surface-hygiene）：不得向用户提示不存在的命令。
 * CLI 真实命令由 src/cli/index.ts 的 `.command('…')` 注册，这里据此派生白名单，
 * 未来新增命令自动纳入，无需改测试。凡模板 / 适配器提示里出现 `assetplex <cmd>`
 * 且 cmd 不在白名单，即判为「可运行的未实现命令」，测试失败。
 */
const SRC = join(process.cwd(), 'src');

function realCommands(): string[] {
  const indexSrc = readFileSync(join(SRC, 'cli', 'index.ts'), 'utf8');
  return [...indexSrc.matchAll(/\.command\('([^']+)'\)/g)].map((m) => m[1]);
}

/** 受检的用户可见来源：init 生成的模板 + Hub README 常用命令 + trae-cn 缺失提示 */
const SOURCES: string[] = [
  join('cli', 'templates.ts'),
  join('cli', 'commands', 'init.ts'),
  join('core', 'adapters', 'trae-cn.ts'),
];

describe('死命令守卫（Scenario 8）', () => {
  it('白名单派生自 CLI 注册表且非空', () => {
    const real = realCommands();
    expect(real.length).toBeGreaterThan(0);
    expect(real).toEqual(expect.arrayContaining(['init', 'doctor', 'sync', 'ui']));
  });

  it('模板与适配器提示不出现未实现命令', () => {
    const real = realCommands();
    const offenders: string[] = [];
    for (const rel of SOURCES) {
      const text = readFileSync(join(SRC, rel), 'utf8');
      for (const m of text.matchAll(/assetplex\s+([a-z][a-z0-9-]*)/g)) {
        if (!real.includes(m[1])) offenders.push(`${rel} → assetplex ${m[1]}`);
      }
    }
    expect(offenders, `发现未实现命令样式：\n${offenders.join('\n')}`).toEqual([]);
  });
});
