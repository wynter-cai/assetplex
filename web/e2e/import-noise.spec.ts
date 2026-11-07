import { test, expect } from '@playwright/test';

/**
 * 回归：收藏向导降噪（refine-skill-cards-wizard T11/T15/T19）
 *
 * ① 隐藏条目（.git/、.DS_Store、工具自管 .xxx.json）不出现在盘点里；
 * ② 二进制条目有「二进制」徽章，并在同一行说明「收藏时按原样复制」。
 *
 * 「二进制冲突不给合并」由 ConflictDialog / Import 的单测覆盖（环境未必有二进制冲突）。
 */
test.describe('收藏向导 - 降噪', () => {
  test('隐藏文件不出现，二进制条目带原样复制说明', async ({ page }) => {
    await page.goto('/import');
    await expect(page.getByRole('heading', { name: '收藏到我的库' })).toBeVisible();

    await page.getByRole('button', { name: '下一步' }).click();
    await expect(page.getByRole('heading', { name: /发现\s*\d+\s*个文件/ })).toBeVisible();

    // ① 路径里任何一段都不应以点开头
    const paths = await page.locator('span.truncate').allInnerTexts();
    const hidden = paths.filter((p) => p.split('/').some((seg) => seg.startsWith('.')));
    expect(hidden, `隐藏条目不应出现在盘点中：${hidden.join(', ')}`).toEqual([]);

    // ② 二进制徽章与说明同行出现
    const binaryBadges = page.getByText('二进制', { exact: true });
    const binaryCount = await binaryBadges.count();
    if (binaryCount === 0) {
      test.skip(true, '当前环境没有二进制条目，跳过标注校验');
    }

    const rows = page.locator('div.flex-1.min-w-0');
    const binaryRows = rows.filter({ has: page.getByText('二进制', { exact: true }) });
    expect(await binaryRows.count()).toBe(binaryCount);
    for (const text of await binaryRows.allInnerTexts()) {
      expect(text).toContain('收藏时按原样复制');
    }
  });
});
