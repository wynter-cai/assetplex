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
/** 工具展示名（结果区断言用；名字本身可能含空格，如“TRAE 中国版”） */
const TOOL_NAMES = ['TRAE 中国版', 'WorkBuddy', 'Claude Code', 'OpenAI Codex', 'Qoder'];

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

    // 工具卡片异步加载：先等渲染再判定，避免误跳过
    await expect(readyCard).toBeVisible({ timeout: 15000 }).catch(() => {});
    const readyExists = await readyCard.count();
    test.skip(!readyExists, '本机没有任何就绪工具，跳过按工具同步测试');

    // 取该卡片的工具名（卡片 accessible name 形如 "WorkBuddy 就绪 1 项待同步..."）
    // 工具名本身可能含空格（如 "TRAE 中国版"），不能按首段截断，改用已知工具名前缀匹配
    const cardName = ((await readyCard.textContent()) ?? '').trim();
    const toolName =
      TOOL_NAMES.find((t) => cardName.startsWith(t)) ?? cardName.split(/\s+/)[0];

    // 先清空，再只勾这一个
    await page.getByRole('button', { name: '清空' }).click();
    await readyCard.click();

    // 变更预览标题应带出所选目标数（fix-trust-and-consistency I5 起用徽章替代旧的"已选 N 个目标"）
    const preview = page.getByRole('heading', { name: /变更预览/ });
    await expect(preview).toBeVisible();
    await expect(preview).toContainText(/1\s*个目标/);

    // 开启预览模式（dryRun），避免真实写入文件
    await page.getByText('预览模式').click();
    const executeBtn = page.getByRole('button', { name: /预览执行|执行同步/ });
    await executeBtn.click();

    // 等待执行结果区出现
    const result = page.getByRole('heading', { name: '最近执行结果' });
    await expect(result).toBeVisible();

    // 关键断言：结果区只出现被选中的工具，不出现其它（含未安装）工具
    const resultText = (await page.locator('main').innerText()) ?? '';
    const otherTools = TOOL_NAMES.filter((t) => t !== toolName);

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
