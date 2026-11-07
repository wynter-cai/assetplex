import { test, expect } from '@playwright/test';

/**
 * 回归：收藏向导 Step 3 冲突项不重复显示。
 *
 * 历史 Bug：TRAE 的 mcp.json 与 WorkBuddy 的 .mcp.json 都映射到同一 Hub 目标
 * mcp/mcp.sources.json。前端用 tool:absolutePath 作为 React key，导致 Step 3
 * 把同一 hubTargetPath 渲染成两个独立的冲突卡片。
 *
 * 修复：Import.tsx 用 groupedConflicts 按 hubTargetPath 分组，同一目标只渲染
 * 一张 ConflictDialog。Step 3 改三组折叠后（refine-skill-cards-wizard T17），
 * 冲突组标题带计数，卡片锚点用 data-testid 定位，不依赖文案。
 */
test.describe('收藏向导 - 冲突去重', () => {
  test('Step 3 同一 hubTargetPath 的冲突只显示一张卡片', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByRole('heading', { name: '收藏到我的库' })).toBeVisible();

    // Step 1 -> Step 2
    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByRole('heading', { name: /发现\s*\d+\s*个文件/ })).toBeVisible();

    // Step 2 -> Step 3
    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByRole('heading', { name: '确认收藏' })).toBeVisible();

    // 若没有冲突，冲突组不渲染；此时没有可回归的场景，跳过
    const conflictGroup = page.getByTestId('confirm-group-conflict');
    const hasConflict = await conflictGroup.isVisible().catch(() => false);
    test.skip(!hasConflict, '当前环境无冲突项，跳过去重测试');

    // 组标题的可访问名形如「内容冲突（1）」，从中解析计数
    const toggleLabel = await conflictGroup.getByRole('button').first().getAttribute('aria-label');
    const conflictCount = Number(toggleLabel?.match(/（(\d+)）/)?.[1] ?? 0);
    expect(conflictCount).toBeGreaterThan(0);

    const cardCount = await page.getByTestId('conflict-card').count();
    expect(cardCount, '冲突卡片数应与冲突组计数一致').toBe(conflictCount);
  });
});
