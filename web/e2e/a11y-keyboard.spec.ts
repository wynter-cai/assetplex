import { test, expect } from '@playwright/test';

/**
 * enhance-a11y-responsive（keyboard Scenario 1 / Scenario 5）：
 * - skip-link：首次 Tab 可见「跳到主内容」，激活后焦点进主内容区，侧栏被跳过
 * - 浮层关闭后焦点归还：Esc 关资产详情面板，焦点回到触发它的卡片
 * 均为只读操作，不改 Hub 数据。
 */
test.describe('键盘可达（a11y Scenario 1/5）', () => {
  test('首次 Tab 出现「跳到主内容」，回车后焦点落在主内容且跳过侧栏', async ({ page }) => {
    await page.goto('/vault');
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    const skip = page.getByRole('link', { name: '跳到主内容' });
    // sr-only 的 1px 盒在 Playwright 眼里仍算 visible，所以用尺寸断言「视觉隐藏」
    const hiddenBox = await skip.boundingBox();
    expect(hiddenBox).not.toBeNull();
    expect(hiddenBox!.width).toBeLessThanOrEqual(4);
    expect(hiddenBox!.height).toBeLessThanOrEqual(4);

    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();

    // 聚焦后弹为真实按钮，且在视口内
    const shownBox = await skip.boundingBox();
    expect(shownBox).not.toBeNull();
    expect(shownBox!.height).toBeGreaterThanOrEqual(16);
    expect(shownBox!.width).toBeGreaterThanOrEqual(48);
    expect(shownBox!.x).toBeGreaterThanOrEqual(0);
    expect(shownBox!.y).toBeGreaterThanOrEqual(0);
    expect(shownBox!.y).toBeLessThan(page.viewportSize()!.height);

    await page.keyboard.press('Enter');
    const main = page.getByRole('main', { name: '主内容' });
    await expect(main).toBeFocused();

    // 再按一次 Tab：应落在主内容区内部而不是侧栏导航
    const focusInMain = await page.evaluate(() => {
      const active = document.activeElement;
      const mainEl = document.getElementById('main-content');
      return !!active && !!mainEl && (active === mainEl || mainEl.contains(active));
    });
    expect(focusInMain).toBe(true);

    // 焦点离开后 skip-link 重新隐藏
    const blurredBox = await skip.boundingBox();
    expect(blurredBox).not.toBeNull();
    expect(blurredBox!.height).toBeLessThanOrEqual(4);
  });

  test('Esc 关闭资产详情面板后，焦点归还触发卡片', async ({ page }) => {
    await page.goto('/vault');
    const card = page.getByRole('button', { name: /^查看 .* 详情/ }).first();
    await expect(card).toBeVisible();

    await card.click();
    await expect(page.getByTestId('detail-overlay')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('detail-overlay')).toHaveCount(0);
    await expect(card).toBeFocused();
  });
});
