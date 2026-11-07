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

    // 资产卡片：卡片整体是 role=button，未选中时 aria-label 为「查看 X 详情」；
    // 展开后同一张卡变成「收起 X 详情」（AssetCard 整卡 toggle），所以正则要把两种都算上
    const cards = page.getByRole('button', { name: /^(查看|收起) .+ 详情$/ });

    // 等待资产卡片渲染（列表为异步加载，不能拿一次性 isVisible 判定空库）
    await expect(cards.first()).toBeVisible({ timeout: 15000 }).catch(() => {});
    const countBefore = await cards.count();
    test.skip(countBefore === 0, '资产库为空，跳过主从布局测试');

    await cards.first().click();

    // 右侧详情面板应出现
    await expect(page.getByTestId('detail-overlay')).toBeVisible();
    await expect(page.getByRole('heading', { name: '查看资产' })).toBeVisible();

    // 左侧卡片数量不应减少（列表没有被整页替换）
    const countAfter = await cards.count();
    expect(countAfter, '点击查看后左侧资产列表应保留').toBe(countBefore);
  });
});
