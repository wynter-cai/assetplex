/**
 * SyncEngine - 核心同步引擎
 *
 * 串联 Hub → 适配器 → 工具目录的完整流程。
 *
 * 借鉴：
 * - agentsmesh 的 plan/run 分离（plan 用于 --dry-run，run 用于实际执行）
 * - agentsync 的 CI-friendly skip（不可用工具优雅跳过）
 * - sync-coding-agents 的"leave non-symlinks untouched"
 *
 * 算法：
 * 1. plan()：遍历 enabled 适配器，跳过未安装工具，对每个 (item, target) 检查状态
 * 2. run()：调用 plan() 后执行 adapter.apply()
 * 3. --dry-run：只调 plan() 不执行
 * 4. --json：把 plan/result 输出为 JSON
 */

import { existsSync, readFileSync } from 'node:fs';
import type {
  HubItem,
  SyncPlan,
  SyncPlanItem,
  SyncResult,
  SyncOptions,
  SyncAction,
  ToolInventory,
  ImportRequest,
  ImportResult,
} from './types.js';
import type { HubConfig } from './config.js';
import type { ToolAdapter } from './adapters/base.js';
import { getAllAdapters } from './adapters/registry.js';
import { getHubRoot } from '../utils/paths.js';
import { log } from '../utils/logger.js';
import { isSymlink, readSymlinkTarget } from '../utils/fs.js';
import { resolve } from 'node:path';
import { scanAll as scanAllAdapters } from './scanner.js';
import { mergeFile } from './merger.js';
import { writeHubFile, readHubFile } from './hub-files.js';

/** 哨兵：工具被过滤条件排除时返回，plan() 会跳过该工具 */
const FILTERED_OUT = Symbol('FILTERED_OUT');

export class SyncEngine {
  constructor(
    private hubConfig: HubConfig,
    private adapters: ToolAdapter[] = getAllAdapters(),
  ) {}

  /**
   * 计算同步计划（不执行）
   *
   * 算法：
   * 1. 过滤 adapters：仅保留 enabled 且（--tool 指定或全部）
   * 2. 对每个 adapter：
   *    - 调用 detect() 检查工具是否安装
   *    - 调用 resolveHubItems() 获取 (item, target) 列表
   *    - 对每个 (item, target)：
   *      - 检查 item.absolutePath 是否存在（不存在 → skip）
   *      - 检查 target.targetPath 当前状态（已是正确 symlink → skip）
   *      - 否则 → 待执行 action
   */
  async plan(options: SyncOptions = {}): Promise<SyncPlan[]> {
    const hubRoot = getHubRoot();
    const plans: SyncPlan[] = [];

    for (const adapter of this.adapters) {
      const planForTool = await this.planForAdapter(adapter, hubRoot, options);
      // 工具过滤时，跳过被排除工具返回的哨兵
      if (planForTool === FILTERED_OUT) continue;
      plans.push(planForTool);
    }

    return plans;
  }

  /**
   * 为单个适配器计算计划
   */
  private async planForAdapter(
    adapter: ToolAdapter,
    hubRoot: string,
    options: SyncOptions,
  ): Promise<SyncPlan | typeof FILTERED_OUT> {
    const toolName = adapter.name;

    // 工具过滤：兼容单工具 tool 与多工具 tools
    const toolFilter = options.tools?.length ? options.tools : options.tool ? [options.tool] : undefined;
    if (toolFilter && !toolFilter.includes(toolName)) {
      return FILTERED_OUT;
    }

    // 从 hubConfig 检查 enabled
    if (!this.isToolEnabled(toolName)) {
      return {
        tool: toolName,
        toolInstalled: false,
        items: [],
      };
    }

    // detect 工具是否安装
    let status;
    try {
      status = await adapter.detect();
    } catch (err) {
      return {
        tool: toolName,
        toolInstalled: false,
        items: [
          {
            item: { type: 'preference', relativePath: '', absolutePath: '' },
            target: {
              tool: toolName,
              targetPath: '',
              strategy: 'symlink',
              isDirectory: false,
            },
            action: 'skip',
            reason: `detect 失败: ${(err as Error).message}`,
          },
        ],
      };
    }

    // Qoder 即使 detect 返回未安装，仍可 per-project 同步（特殊处理）
    const isQoder = toolName === 'qoder';
    if (!status.installed && !isQoder) {
      return {
        tool: toolName,
        toolInstalled: false,
        items: [
          {
            item: { type: 'preference', relativePath: '', absolutePath: '' },
            target: {
              tool: toolName,
              targetPath: status.configDir,
              strategy: 'symlink',
              isDirectory: false,
            },
            action: 'skip',
            reason: status.error ?? 'tool not installed',
          },
        ],
      };
    }

    // 调用 resolveHubItems 获取 (item, target) 列表
    const hubItems = adapter.resolveHubItems(this.hubConfig, hubRoot);

    const items: SyncPlanItem[] = hubItems.map(({ item, target }) => {
      // 检查 Hub 源文件是否存在
      if (!item.absolutePath || !existsSync(item.absolutePath)) {
        return {
          item,
          target,
          action: 'skip',
          reason: `Hub 源不存在: ${item.relativePath || item.absolutePath}`,
        };
      }

      // 检查目标是否已是正确 symlink
      if (target.strategy === 'symlink' && isSymlink(target.targetPath)) {
        const currentTarget = readSymlinkTarget(target.targetPath);
        if (currentTarget && resolve(currentTarget) === resolve(item.absolutePath)) {
          return {
            item,
            target,
            action: 'skip',
            reason: '已是正确符号链接，跳过',
          };
        }
      }

      // 检查目标路径是否已有非 symlink 文件（覆盖预警）
      let warning: string | undefined;
      if (existsSync(target.targetPath) && !isSymlink(target.targetPath)) {
        warning = '目标路径已有非 symlink 文件，同步后将覆盖';
      }

      // 待执行
      return {
        item,
        target,
        action: target.strategy as SyncAction,
        warning,
      };
    });

    return {
      tool: toolName,
      toolInstalled: status.installed,
      items,
    };
  }

  /**
   * 执行同步
   */
  async run(options: SyncOptions = {}): Promise<SyncResult[]> {
    const plans = await this.plan(options);
    const results: SyncResult[] = [];

    for (const plan of plans) {
      const result = await this.runPlan(plan);
      results.push(result);
    }

    return results;
  }

  /**
   * 执行单个工具的同步计划
   */
  private async runPlan(plan: SyncPlan): Promise<SyncResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];
    let itemCount = 0;
    let skippedCount = 0;

    const adapter = this.adapters.find((a) => a.name === plan.tool);
    if (!adapter) {
      return {
        tool: plan.tool,
        success: false,
        itemCount: 0,
        skippedCount: plan.items.length,
        errors: [`适配器未注册: ${plan.tool}`],
        warnings: [],
        durationMs: Date.now() - startTime,
      };
    }

    for (const planItem of plan.items) {
      if (planItem.action === 'skip') {
        skippedCount++;
        if (planItem.reason) {
          log.debug(`[${plan.tool}] 跳过: ${planItem.reason}`);
        }
        continue;
      }

      try {
        await adapter.apply(planItem.item, planItem.target);
        itemCount++;
        log.debug(`[${plan.tool}] ✓ ${planItem.target.targetPath}`);
      } catch (err) {
        const msg = `${planItem.target.targetPath}: ${(err as Error).message}`;
        errors.push(msg);
        log.warn(`[${plan.tool}] ✗ ${msg}`);
      }
    }

    return {
      tool: plan.tool,
      success: errors.length === 0,
      itemCount,
      skippedCount,
      errors,
      warnings,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 反向导入：从工具目录读回 Hub
   *
   * 注意：当前 MVP 实现仅返回 HubItem 列表，不写入 Hub；
   * 由 CLI 命令决定如何处理（询问用户确认后写入）
   */
  async reverseImport(options: SyncOptions = {}): Promise<Array<{ tool: string; items: HubItem[] }>> {
    const hubRoot = getHubRoot();
    const results: Array<{ tool: string; items: HubItem[] }> = [];

    for (const adapter of this.adapters) {
      const toolFilter = options.tools?.length ? options.tools : options.tool ? [options.tool] : undefined;
      if (toolFilter && !toolFilter.includes(adapter.name)) continue;
      if (!this.isToolEnabled(adapter.name)) continue;

      const status = await adapter.detect();
      if (!status.installed && adapter.name !== 'qoder') continue;

      const hubItems = adapter.resolveHubItems(this.hubConfig, hubRoot);
      const imported: HubItem[] = [];

      for (const { target } of hubItems) {
        if (!target.targetPath || !existsSync(target.targetPath)) continue;
        try {
          const item = await adapter.import(target.targetPath);
          imported.push(item);
        } catch (err) {
          log.warn(`[${adapter.name}] import 失败 ${target.targetPath}: ${(err as Error).message}`);
        }
      }

      results.push({ tool: adapter.name, items: imported });
    }

    return results;
  }

  /**
   * 扫描所有工具的可导入内容（导入向导 Step 1-2 使用）
   */
  async scanAll(): Promise<ToolInventory[]> {
    return scanAllAdapters();
  }

  /**
   * 执行导入：接收用户选择的条目列表，写入 Hub（导入向导 Step 4 使用）
   */
  async executeImport(request: ImportRequest): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      created: 0,
      merged: 0,
      overwritten: 0,
      skipped: 0,
      errors: 0,
      items: [],
    };

    for (const item of request.items) {
      try {
        // 读取源文件内容
        const sourceContent = readFileSync(item.absolutePath, 'utf-8');

        // 对 Codex config.toml 做 TOML → JSON 转换
        let contentToWrite = sourceContent;
        if (item.absolutePath.endsWith('config.toml') && item.hubTargetPath.endsWith('.json')) {
          const { mcpTomlToJson } = await import('../transforms/json-toml.js');
          contentToWrite = mcpTomlToJson(sourceContent);
        }

        // 对 WorkBuddy .mcp.json 做去插值
        if (item.tool === 'workbuddy' && item.absolutePath.endsWith('.mcp.json')) {
          const { extractEnvVars, buildEnvMap, desinterpolateEnv } = await import(
            '../transforms/env-interpolation.js'
          );
          const varNames = extractEnvVars(contentToWrite);
          const envMap = buildEnvMap(varNames);
          if (Object.keys(envMap).length > 0) {
            contentToWrite = desinterpolateEnv(contentToWrite, envMap);
          }
        }

        const existing = readHubFile(item.hubTargetPath);

        if (!existing) {
          // 新文件：直接写入
          writeHubFile(item.hubTargetPath, contentToWrite);
          result.items.push({
            tool: item.tool,
            hubTargetPath: item.hubTargetPath,
            status: 'created',
          });
          result.created++;
        } else if (item.strategy === 'overwrite') {
          // 覆盖
          writeHubFile(item.hubTargetPath, contentToWrite);
          result.items.push({
            tool: item.tool,
            hubTargetPath: item.hubTargetPath,
            status: 'overwritten',
          });
          result.overwritten++;
        } else if (item.strategy === 'merge') {
          // 智能合并
          const merged = mergeFile(item.hubTargetPath, contentToWrite, existing.content, item.tool);
          writeHubFile(item.hubTargetPath, merged.content);
          result.items.push({
            tool: item.tool,
            hubTargetPath: item.hubTargetPath,
            status: 'merged',
          });
          result.merged++;
        } else {
          // 跳过（包括 strategy === 'skip' 或未指定策略且文件已存在）
          result.items.push({
            tool: item.tool,
            hubTargetPath: item.hubTargetPath,
            status: 'skipped',
          });
          result.skipped++;
        }
      } catch (err) {
        result.items.push({
          tool: item.tool,
          hubTargetPath: item.hubTargetPath,
          status: 'error',
          message: (err as Error).message,
        });
        result.errors++;
        result.success = false;
      }
    }

    return result;
  }

  /**
   * 判断工具在 hubConfig 中是否 enabled
   */
  private isToolEnabled(toolName: string): boolean {
    const tools = this.hubConfig.tools as unknown as Record<string, { enabled?: boolean }>;
    return tools?.[toolName]?.enabled ?? false;
  }
}

/**
 * 打印同步计划（人类可读）
 */
export function printSyncPlan(plans: SyncPlan[]): void {
  for (const plan of plans) {
    log.info('');
    log.info(`工具: ${plan.tool} ${plan.toolInstalled ? '✓' : '✗'}`);

    if (plan.items.length === 0) {
      log.info('  (无待同步条目)');
      continue;
    }

    for (const item of plan.items) {
      const icon = item.action === 'skip' ? '·' : '→';
      const action = item.action.padEnd(15);
      const target = item.target.targetPath || '(无)';
      log.info(`  ${icon} ${action} ${target}`);
      if (item.reason) {
        log.info(`    └ ${item.reason}`);
      }
    }
  }
}

/**
 * 打印同步结果（人类可读）
 */
export function printSyncResult(results: SyncResult[]): void {
  log.info('');
  log.info('同步结果');
  log.info('='.repeat(60));

  let totalItem = 0;
  let totalSkip = 0;
  let totalError = 0;

  for (const r of results) {
    const icon = r.success ? '✓' : '✗';
    log.info(`${icon} ${r.tool.padEnd(15)} 同步 ${r.itemCount}，跳过 ${r.skippedCount}，错误 ${r.errors.length}（${r.durationMs}ms）`);
    totalItem += r.itemCount;
    totalSkip += r.skippedCount;
    totalError += r.errors.length;

    for (const err of r.errors) {
      log.warn(`  └ ${err}`);
    }
  }

  log.info('-'.repeat(60));
  log.info(`总计：同步 ${totalItem}，跳过 ${totalSkip}，错误 ${totalError}`);
}
