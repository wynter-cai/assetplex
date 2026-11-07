import { test, expect } from '@playwright/test';
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 回归：收藏向导 Step 3 冲突项不重复显示 + 冲突组计数自洽。
 *
 * 历史 Bug：TRAE 的 mcp.json 与 WorkBuddy 的 .mcp.json 都映射到同一 Hub 目标
 * mcp/mcp.sources.json。前端用 tool:absolutePath 作为 React key，导致 Step 3
 * 把同一 hubTargetPath 渲染成两个独立的冲突卡片。
 * 修复：Import.tsx 用 groupedConflicts 按 hubTargetPath 分组，同一目标只渲染
 * 一张 ConflictDialog。Step 3 改三组折叠后（refine-skill-cards-wizard T17），
 * 冲突组标题带计数，卡片锚点用 data-testid 定位，不依赖文案。
 *
 * 夹具（T19 补强）：本机资产大多已导入，自然冲突可能为 0 导致用例长期跳过。
 * 这里自己造一条冲突：优先挑盘点里「Hub 侧原本不存在」的文本目标（只新建、用完删除）；
 * 没有就退而改写一个已存在的普通文件，并在 finally 里逐字节还原（符号链接一律不碰，
 * 免得改到工具侧真实技能）。
 */

interface ScanItem {
  hubTargetPath: string;
  conflict: 'none' | 'exists' | 'differs';
  binary: boolean;
  tool: string;
}

interface Inventory {
  toolName: string;
  items: ScanItem[];
}

/** Hub 根目录：与后端一致（ASSETPLEX_DIR，缺省 ~/.assetplex） */
const HUB_ROOT = process.env.ASSETPLEX_DIR
  ? path.resolve(process.env.ASSETPLEX_DIR.replace(/^~(?=$|[\\/])/, os.homedir()))
  : path.join(os.homedir(), '.assetplex');

const FIXTURE_MARKER = '# e2e fixture：与工具源内容不同，用于触发内容冲突\n';

interface Fixture {
  target: string;
  /** 同一 hubTargetPath 的来源工具数（>1 才真正覆盖去重回归点） */
  sourceCount: number;
  cleanup: () => void;
}

/** 按 hubTargetPath 聚合盘点项，来源多的排前面（去重场景优先） */
function groupByTarget(inventories: Inventory[]): Array<[string, ScanItem[]]> {
  const map = new Map<string, ScanItem[]>();
  for (const inv of inventories) {
    for (const item of inv.items) {
      if (item.binary) continue;
      const list = map.get(item.hubTargetPath) ?? [];
      list.push(item);
      map.set(item.hubTargetPath, list);
    }
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

/** 造一条内容冲突；返回 null 表示本机没有安全可用的目标 */
function createConflictFixture(inventories: Inventory[]): Fixture | null {
  const groups = groupByTarget(inventories);
  const pick =
    groups.find(([, items]) => items.every((i) => i.conflict === 'none') && items.length > 1) ??
    groups.find(([, items]) => items.every((i) => i.conflict === 'none')) ??
    groups.find(
      ([, items]) => items.length > 0 && items.every((i) => i.conflict === 'exists'),
    );
  if (!pick) return null;

  const [target, items] = pick;
  const full = path.join(HUB_ROOT, target);
  if (existsSync(full) && lstatSync(full).isSymbolicLink()) return null;

  // 记录本次新建的目录，清理时按层回收（非空则保留）
  const createdDirs: string[] = [];
  const backup = existsSync(full) ? readFileSync(full) : null;

  let dir = path.dirname(full);
  const pending: string[] = [];
  while (dir.length > HUB_ROOT.length && !existsSync(dir)) {
    pending.unshift(dir);
    dir = path.dirname(dir);
  }
  for (const d of pending) {
    mkdirSync(d, { recursive: true });
    createdDirs.push(d);
  }

  writeFileSync(full, FIXTURE_MARKER, 'utf8');

  return {
    target,
    sourceCount: items.length,
    cleanup: () => {
      if (backup) {
        writeFileSync(full, backup);
      } else {
        rmSync(full, { force: true });
        for (const d of createdDirs.reverse()) {
          try {
            rmdirSync(d);
          } catch {
            // 目录非空说明里面已有别的资产，保留
          }
        }
      }
    },
  };
}

test.describe('收藏向导 - 冲突去重', () => {
  test('Step 3 同一 hubTargetPath 的冲突只显示一张卡片', async ({ page }) => {
    const scanRes = await page.request.get('/api/sync/scan');
    expect(scanRes.ok()).toBeTruthy();
    const { inventories } = (await scanRes.json()) as { inventories: Inventory[] };

    const fixture = createConflictFixture(inventories);
    test.skip(fixture === null, '本机没有可安全造冲突的盘点目标，跳过');

    try {
      // 夹具写盘在前：页面首次扫描即可看到 conflict: 'differs'
      await page.goto('/import');
      await expect(page.getByRole('heading', { name: '收藏到我的库' })).toBeVisible();

      // Step 1 -> Step 2
      await page.getByRole('button', { name: '下一步' }).click();
      await expect(page.getByRole('heading', { name: /发现\s*\d+\s*个文件/ })).toBeVisible();

      // Step 2 -> Step 3
      await page.getByRole('button', { name: '下一步' }).click();
      await expect(page.getByRole('heading', { name: '确认收藏' })).toBeVisible();

      const conflictGroup = page.getByTestId('confirm-group-conflict');
      await expect(conflictGroup, '夹具应造出至少一条内容冲突').toBeVisible();

      // 组标题的可访问名形如「内容冲突（1）」，从中解析计数
      const toggleLabel = await conflictGroup.getByRole('button').first().getAttribute('aria-label');
      const conflictCount = Number(toggleLabel?.match(/（(\d+)）/)?.[1] ?? 0);
      expect(conflictCount).toBeGreaterThan(0);

      // 同一 hubTargetPath 只渲染一张卡：卡片总数必须等于分组数
      const cardCount = await page.getByTestId('conflict-card').count();
      expect(cardCount, '冲突卡片数应与冲突组计数一致（同一目标不重复渲染）').toBe(conflictCount);

      // 多来源目标被折叠成一张卡时，来源数应写在卡片里而不是拆成多张
      if (fixture.sourceCount > 1) {
        await expect(page.getByTestId('conflict-card').first()).toContainText(
          `${fixture.sourceCount} 个来源`,
        );
      }
    } finally {
      fixture.cleanup();
    }
  });
});
