import { test, expect } from '@playwright/test';

/**
 * 回归：技能卡「调整分类 → 应用 → 撤销」回环（refine-skill-cards-wizard T9 / T19）
 *
 * 撤销会写回原分类，用例结束应当回到起始状态；
 * 取第一张技能卡操作，环境没有技能时跳过。
 */
test.describe('技能卡分类确认流', () => {
  test('调整分类 → 应用 → 撤销后分类复原', async ({ page }) => {
    // 技能卡在资产库的「技能」类别页（/skills 是旧版页面，没有调整分类入口）
    await page.goto('/vault/skill');

    const adjust = page.getByRole('button', { name: /^调整 .+ 的分类$/ }).first();
    // 技能列表异步加载：先等入口渲染，再判定跳过
    await expect(adjust).toBeVisible({ timeout: 15000 }).catch(() => {});
    const hasSkill = await adjust.isVisible().catch(() => false);
    test.skip(!hasSkill, '当前环境没有技能卡，跳过');

    const label = (await adjust.getAttribute('aria-label')) ?? '';
    const name = label.replace(/^调整 /, '').replace(/ 的分类$/, '');

    await adjust.click();
    const select = page.getByLabel(`${name} 的新职能分类`);
    await expect(select).toBeVisible();

    const original = await select.inputValue();
    const values = await select
      .locator('option')
      .evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
    const next = values.find((v) => v !== original);
    test.skip(next === undefined, '职能分类只有一个可选项，跳过');

    await select.selectOption(next!);
    await page.getByRole('button', { name: '应用' }).click();

    const success = page.getByRole('status', { name: '成功' }).last();
    await expect(success).toContainText('已改为');

    // 30 秒窗口内撤销：写回原分类
    await success.getByRole('button', { name: '撤销' }).click();
    await expect(page.getByRole('status', { name: '成功' }).last()).toContainText('已撤销');

    // 复原校验：撤销已写回服务端，刷新后重新展开确认区，下拉值回到原分类
    // （不刷新会读到列表缓存里的旧值，断言会误判）
    await page.reload();
    const adjustAgain = page.getByRole('button', { name: `调整 ${name} 的分类` });
    await expect(adjustAgain).toBeVisible({ timeout: 15000 });
    await adjustAgain.click();
    await expect(page.getByLabel(`${name} 的新职能分类`)).toHaveValue(original);
  });
});
