/**
 * assetplex sync 命令
 *
 * 同步 Hub 内容到所有已启用的工具
 *
 * 借鉴：
 * - sync-rules 的 shell chaining（`sync-rules && claude --chat`）
 * - agentsync 的 CI-friendly skip
 */

import { log } from '../../utils/logger.js';
import { getHubRoot, hubPath } from '../../utils/paths.js';
import { existsSync } from 'node:fs';
import {
  loadHubConfig,
  resolveHubConfigPath,
} from '../../core/config.js';
import {
  registerBuiltinAdapters,
  getAllAdapters,
} from '../../core/adapters/registry.js';
import {
  SyncEngine,
  printSyncPlan,
  printSyncResult,
} from '../../core/sync-engine.js';
import type { SyncOptions } from '../../core/types.js';

export interface SyncCommandOptions extends SyncOptions {
  /** 监听模式（暂未实现） */
  watch?: boolean;
}

/**
 * assetplex sync 实现
 */
export async function syncCommand(options: SyncCommandOptions = {}): Promise<void> {
  // 1. --watch 暂未实现
  if (options.watch) {
    log.warn('--watch 将在 Stage 2.5 实现');
    return;
  }

  // 2. 检查 Hub 是否初始化
  const hubRoot = getHubRoot();
  const hubTomlPath = hubPath('hub.toml');
  if (!existsSync(hubTomlPath)) {
    log.error(`Hub 未初始化：${hubTomlPath} 不存在`);
    log.error('请先运行 `assetplex init`');
    process.exit(1);
  }

  // 3. 加载 hub.toml 配置
  let hubConfig;
  try {
    hubConfig = loadHubConfig(resolveHubConfigPath());
  } catch (err) {
    log.error(`加载 hub.toml 失败: ${(err as Error).message}`);
    process.exit(1);
  }

  // 4. 注册适配器
  registerBuiltinAdapters();
  const adapters = getAllAdapters();

  log.info(`Hub 根目录: ${hubRoot}`);
  log.info(`已注册适配器: ${adapters.length} 个`);
  if (options.tool) {
    log.info(`指定工具: ${options.tool}`);
  }
  if (options.dryRun) {
    log.info('模式: --dry-run（仅预览不写入）');
  }

  // 5. 构造 SyncEngine
  const engine = new SyncEngine(hubConfig, adapters);

  // 6. 执行
  if (options.dryRun) {
    const plans = await engine.plan(options);

    if (options.json) {
      console.log(JSON.stringify(plans, null, 2));
      return;
    }

    log.info('');
    log.info('同步计划（dry-run）');
    log.info('='.repeat(60));
    printSyncPlan(plans);
    return;
  }

  // 真实同步
  const results = await engine.run(options);

  if (options.json) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  printSyncResult(results);

  // 7. 总结
  const failedTools = results.filter((r) => !r.success);
  if (failedTools.length > 0) {
    log.warn('');
    log.warn(`有 ${failedTools.length} 个工具同步失败`);
    process.exit(1);
  } else {
    log.success('');
    log.success('同步完成！');
  }
}
