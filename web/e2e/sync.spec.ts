import { test, expect } from '@playwright/test';

/**
 * 回归：同步中心"按工具选择同步"
 *
 * 历史 Bug：只勾选 WorkBuddy 执行同步时，后端 plan() 对被过滤掉的工具
 * 仍返回空 plan，run() 又对每个 plan 都执行，导致"最近执行结果"里
 * 错误地出现了全部 5 个工具（包括未安装的 Claude/Codex/Qoder）。
 *
 * 修复：sync-engine 用 FILTERED_OUT 哨兵在 plan() 阶段剔除未选中工具。
 * 本测试固化该行为：只选一个目标执行，结果里只能出现这个目标。
 */
test.describe('同步中心 - 按工具选择同步', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/sync');
    // 等待工具卡片加载（就绪/未安装都算渲染完成）
    await expect(page.getByRole('heading', { name: '同步中心' })).toBeVisible();
  });

  test('只勾选一个目标工具时，执行结果只包含该工具（回归：不再误执行全部工具）', async ({ page }) => {
    // 找一个"就绪"的工具卡片（本地至少 TRAE 或 WorkBuddy 其一）
    const readyCard = page
      .getByRole('button', { name: /就绪/ })
      .first();

    const readyExists = await readyCard.count();
    test.skip(!readyExists, '本机没有任何就绪工具，跳过按工具同步测试');

    // 取该卡片的工具名（卡片 accessible name 形如 "WorkBuddy 就绪 1 项待同步..."）
    const cardName = (await readyCard.textContent()) ?? '';
    const toolName = cardName.split(/\s+/)[0];

    // 先清空，再只勾这一个
    await page.getByRole('button', { name: '清空' }).click();
    await readyCard.click();

    // 底部应显示"已选 1 个目标"
    await expect(page.getByText(/已选\s*1\s*个目标/)).toBeVisible();

    // 开启预览模式（dryRun），避免真实写入文件
    await page.getByText('预览模式').click();
    const executeBtn = page.getByRole('button', { name: /预览执行|执行同步/ });
    await executeBtn.click();

    // 等待执行结果区出现
    const result = page.getByRole('heading', { name: '最近执行结果' });
    await expect(result).toBeVisible();

    // 关键断言：结果区只出现被选中的工具，不出现其它（含未安装）工具
    const resultText = (await page.locator('main').innerText()) ?? '';
    const otherTools = ['TRAE 中国版', 'Claude Code', 'OpenAI Codex', 'Qoder'].filter(
      (t) => t !== toolName,
    );

    // 结果区内，选中工具必须出现
    expect(resultText).toContain(toolName);

    // 未选中的工具不应出现在"最近执行结果"块内
    const resultBlock = await page
      .locator('text=最近执行结果')
      .locator('xpath=ancestor::*[contains(@class,"card") or contains(@class,"rounded")][1]')
      .innerText()
      .catch(async () => {
        // 兜底：取 heading 之后的兄弟文本
        return resultText;
      });

    for (const other of otherTools) {
      expect(resultBlock, `未选中的工具「${other}」不应出现在执行结果中`).not.toContain(other);
    }
  });
});
