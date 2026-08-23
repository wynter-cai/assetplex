import { test, expect } from '@playwright/test';

/**
 * 回归：智能导入 Step 3 冲突项不重复显示。
 *
 * 历史 Bug：TRAE 的 mcp.json 与 WorkBuddy 的 .mcp.json 都映射到同一 Hub 目标
 * mcp/mcp.sources.json。前端用 tool:absolutePath 作为 React key，导致 Step 3
 * 把同一 hubTargetPath 渲染成两个独立的冲突卡片。
 *
 * 修复：Import.tsx 用 groupedConflicts 按 hubTargetPath 分组，同一目标只渲染
 * 一张 ConflictDialog。本测试验证冲突标题中的数量与页面上的冲突卡片数一致。
 */
test.describe('智能导入 - 冲突去重', () => {
  test('Step 3 同一 hubTargetPath 的冲突只显示一张卡片', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByRole('heading', { name: '智能导入' })).toBeVisible();

    // Step 1 -> Step 2
    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByRole('heading', { name: /发现\s*\d+\s*个文件/ })).toBeVisible();

    // Step 2 -> Step 3
    await page.getByRole('button', { name: '下一步' }).click();

    // 若没有冲突，向导可能直接进入完成页；此时没有可回归的场景，跳过
    const conflictHeading = page.getByRole('heading', { name: /个文件存在冲突/ });
    const hasConflict = await conflictHeading.isVisible().catch(() => false);
    test.skip(!hasConflict, '当前环境无冲突项，跳过去重测试');

    // 从标题解析冲突数量，例如 "1 个文件存在冲突"
    const headingText = (await conflictHeading.textContent()) ?? '';
    const match = headingText.match(/(\d+)/);
    const conflictCount = match ? Number(match[1]) : 0;

    // 统计页面上冲突策略按钮组（每张冲突卡片都有"智能合并/覆盖/跳过"三个按钮）
    // 以"智能合并"按钮数作为冲突卡片数
    const mergeButtons = page.getByRole('button', { name: '智能合并' });
    const cardCount = await mergeButtons.count();

    expect(cardCount, '冲突卡片数应与标题中的冲突文件数一致').toBe(conflictCount);
  });
});
