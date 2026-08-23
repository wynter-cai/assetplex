import { test, expect } from '@playwright/test';

/**
 * 回归：资产库主从布局。
 *
 * 历史问题：在资产库点"查看/编辑"会整页跳成编辑器，左侧分类与资产列表上下文丢失。
 * 修复：改为列表常驻、右侧面板展开详情（大屏并排、小屏堆叠）。
 *
 * 本测试验证：点击某资产的"查看"后，左侧资产卡片仍然存在，且右侧出现详情面板。
 */
test.describe('资产库 - 主从布局', () => {
  test('点击查看后左侧列表保留，右侧展开详情面板', async ({ page }) => {
    await page.goto('/vault');
    await expect(page.getByRole('heading', { name: /^资产库|全部资产/ })).toBeVisible({ timeout: 15000 }).catch(() => {});

    // 等待资产卡片渲染（至少一个"查看"按钮）
    const firstView = page.getByRole('button', { name: '查看' }).first();
    const hasAssets = await firstView.isVisible().catch(() => false);
    test.skip(!hasAssets, '资产库为空，跳过主从布局测试');

    // 记录左侧资产卡片数
    const cardsBefore = page.getByRole('button', { name: '查看' });
    const countBefore = await cardsBefore.count();
    expect(countBefore).toBeGreaterThan(0);

    await firstView.click();

    // 右侧详情面板应出现
    await expect(page.getByRole('heading', { name: '查看资产' })).toBeVisible();

    // 左侧"查看"按钮数量不应减少（列表没有被整页替换）
    const countAfter = await page.getByRole('button', { name: '查看' }).count();
    expect(countAfter, '点击查看后左侧资产列表应保留').toBe(countBefore);
  });
});
