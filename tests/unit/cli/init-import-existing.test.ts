/**
 * assetplex init --import-existing 测试（add-zero-config-onboarding T8）
 *
 * spec 9.3：真实扫描并导入，输出新建/跳过/失败真实计数；
 * 同名冲突（differs）一律跳过不覆盖；不写 onboarded 标记；
 * 无工具安装时输出空态而非报错。
 * 扫描/导入通过 deps 注入，绝不触真实工具目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initCommand, type InitDeps } from '../../../src/cli/commands/init.js';
import type { ToolInventory, ImportRequest, ImportResult, DiscoveredItem } from '../../../src/core/types.js';

let tempDir: string;
let envBackup: string | undefined;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'assetplex-init-imp-'));
  envBackup = process.env.ASSETPLEX_DIR;
  process.env.ASSETPLEX_DIR = tempDir;
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
  if (envBackup === undefined) delete process.env.ASSETPLEX_DIR;
  else process.env.ASSETPLEX_DIR = envBackup;
});

function discovered(tool: string, hubTargetPath: string, conflict: DiscoveredItem['conflict']): DiscoveredItem {
  return {
    absolutePath: `C:/fake/${tool}/${hubTargetPath}`,
    relativePath: hubTargetPath,
    size: 10,
    modified: '2026-11-14T00:00:00.000Z',
    category: hubTargetPath.startsWith('rules') ? 'rule' : 'identity',
    hubTargetPath,
    conflict,
    tool,
    binary: false,
  };
}

function fakeInventories(): ToolInventory[] {
  return [
    {
      toolName: 'trae-cn',
      displayName: 'TRAE 中国版',
      installed: true,
      configDir: 'C:/fake/trae',
      items: [
        discovered('trae-cn', 'identity/profile.md', 'none'),
        discovered('trae-cn', 'rules/always/commit.md', 'differs'),
      ],
    },
    {
      toolName: 'codex',
      displayName: 'OpenAI Codex',
      installed: true,
      configDir: 'C:/fake/codex',
      items: [discovered('codex', 'identity/profile.md', 'differs')],
    },
    { toolName: 'qoder', displayName: 'Qoder', installed: false, configDir: '', items: [] },
  ];
}

function fakeResult(overrides: Partial<ImportResult>): ImportResult {
  return {
    success: true,
    created: 0,
    merged: 0,
    overwritten: 0,
    skipped: 0,
    errors: 0,
    items: [],
    ...overrides,
  };
}

describe('init --import-existing（spec 9.3）', () => {
  it('扫描→导入，differs 一律携带 skip 策略，返回真实计数', async () => {
    const requests: ImportRequest[] = [];
    const deps: InitDeps = {
      scanAll: async () => fakeInventories(),
      executeImport: async (req) => {
        requests.push(req);
        return fakeResult({ created: 1, skipped: 2, items: [
          { tool: 'trae-cn', hubTargetPath: 'identity/profile.md', status: 'created' },
          { tool: 'trae-cn', hubTargetPath: 'rules/always/commit.md', status: 'skipped' },
          { tool: 'codex', hubTargetPath: 'identity/profile.md', status: 'skipped' },
        ] });
      },
    };

    const summary = await initCommand({ importExisting: true }, deps);

    expect(summary.imported).toEqual(expect.objectContaining({ created: 1, skipped: 2, errors: 0 }));
    expect(requests).toHaveLength(1);
    const differsItems = requests[0].items.filter((i) => i.conflict === 'differs');
    expect(differsItems.length).toBe(2);
    for (const item of differsItems) {
      expect(item.strategy).toBe('skip');
    }
    // 非 differs 条目不携带覆盖类策略
    const plain = requests[0].items.filter((i) => i.conflict === 'none');
    expect(plain.length).toBe(1);
    expect(plain[0].strategy).toBeUndefined();
    // 不写 onboarded 标记
    expect(existsSync(join(tempDir, 'onboarding.json'))).toBe(false);
  });

  it('无已安装工具 → attempted=0，不调用导入，不报错', async () => {
    let called = 0;
    const deps: InitDeps = {
      scanAll: async () => [
        { toolName: 'qoder', displayName: 'Qoder', installed: false, configDir: '', items: [] },
      ],
      executeImport: async () => {
        called += 1;
        return fakeResult({});
      },
    };

    const summary = await initCommand({ importExisting: true }, deps);
    expect(summary.imported).toBeUndefined();
    expect(summary.attempted).toBe(0);
    expect(called).toBe(0);
  });

  it('默认 init（无 --import-existing）不触发导入', async () => {
    let called = 0;
    const deps: InitDeps = {
      scanAll: async () => fakeInventories(),
      executeImport: async () => {
        called += 1;
        return fakeResult({});
      },
    };
    const summary = await initCommand({}, deps);
    expect(summary.imported).toBeUndefined();
    expect(called).toBe(0);
    expect(existsSync(join(tempDir, 'identity', 'profile.md'))).toBe(true);
  });

  it('导入失败计数如实透传（errors>0 时 success=false）', async () => {
    const deps: InitDeps = {
      scanAll: async () => fakeInventories(),
      executeImport: async () => fakeResult({ success: false, created: 1, errors: 1 }),
    };
    const summary = await initCommand({ importExisting: true }, deps);
    expect(summary.imported?.success).toBe(false);
    expect(summary.imported?.errors).toBe(1);
  });
});
