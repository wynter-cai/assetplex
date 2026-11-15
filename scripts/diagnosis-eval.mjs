/**
 * 诊断规则标注集回归脚本（add-diagnosis-rules T8）
 *
 * 用法：node scripts/diagnosis-eval.mjs
 * 逻辑与断言在 tests/unit/core/diagnosis-eval.test.ts（锚定真实 diagnosis-rules.yaml）；
 * 本脚本只负责以 Node 直接拉起回归并透传退出码，方便 CI / 发布前手工执行。
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'tests/unit/core/diagnosis-eval.test.ts'],
  { cwd: root, stdio: 'inherit', env: { ...process.env, FORCE_COLOR: '1' } },
);

if (result.error !== undefined) {
  console.error(`[diagnosis-eval] 启动失败：${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
