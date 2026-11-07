import { test, expect } from '@playwright/test';

/**
 * 回归：技能卡「调整分类 → 应用 → 撤销」回环（refine-skill-cards-wizard T9 / T19）
 *
 * 撤销会写回原分类，用例结束应当回到起始状态；
 * 优先挑 functionSource === 'manual' 的技能：覆盖接口会把来源写成 manual，
 * 拿本来就是 manual 的试跑就不会改动用户的分类来源标记；环境没有 manual 技能时退回第一张卡。
 */
test.describe('技能卡分类确认流', () => {
  test('调整分类 → 应用 → 撤销后分类复原', async ({ page }) => {
    // 技能卡在资产库的「技能」类别页（/skills 是旧版页面，没有调整分类入口）
    await page.goto('/vault/skill');

    const firstAdjust = page.getByRole('button', { name: /^调整 .+ 的分类$/ }).first();
    // 技能列表异步加载：先等入口渲染，再判定跳过
    await expect(firstAdjust).toBeVisible({ timeout: 15000 }).catch(() => {});
    const hasSkill = await firstAdjust.isVisible().catch(() => false);
    test.skip(!hasSkill, '当前环境没有技能卡，跳过');

    // 尽量选已标注为手动分类的技能，避免把关键词/AI 来源改成手动（见文件头注释）
    const listRes = await page.request.get('/api/skills');
    const listBody = (await listRes.json()) as {
      items?: Array<{ name: string; functionSource?: string; functionCategory?: string }>;
    };
    const manual = (listBody.items ?? []).find(
      (s) => s.functionSource === 'manual' && Boolean(s.functionCategory),
    );

    let adjust = firstAdjust;
    if (manual) {
      // 列表很大，用搜索框收敛到这一张卡
      await page.getByPlaceholder('搜索技能名称或描述...').fill(manual.name);
      adjust = page.getByRole('button', { name: `调整 ${manual.name} 的分类` });
      await expect(adjust).toBeVisible({ timeout: 15000 });
    }

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
    // 刷新后搜索框已清空，重新收敛到同一张卡再校验
    await page.getByPlaceholder('搜索技能名称或描述...').fill(name);
    const adjustAgain = page.getByRole('button', { name: `调整 ${name} 的分类` });
    await expect(adjustAgain).toBeVisible({ timeout: 15000 });
    await adjustAgain.click();
    await expect(page.getByLabel(`${name} 的新职能分类`)).toHaveValue(original);
  });
});
