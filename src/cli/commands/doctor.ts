/**
 * assetplex doctor 命令
 *
 * 体检：检测各 AI 工具安装状态、Hub 完整性、配置问题
 *
 * 借鉴：
 * - agentsync 的 CI-friendly skip（不可用工具优雅跳过）
 * - yurukusa/cc-safe-setup 的 drift checker hook
 */

import { existsSync } from 'node:fs';
import { log } from '../../utils/logger.js';
import { getHubRoot, hubPath } from '../../utils/paths.js';
import {
  registerBuiltinAdapters,
  getAllAdapters,
} from '../../core/adapters/registry.js';
import type { ToolStatus } from '../../core/types.js';

export interface DoctorOptions {
  /** 自动修复 */
  fix?: boolean;
  /** JSON 输出 */
  json?: boolean;
  /** 仅检查某工具 */
  tool?: string;
}

/**
 * assetplex doctor 实现
 */
export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  // 注册内置适配器
  registerBuiltinAdapters();

  const hubRoot = getHubRoot();
  const hubTomlExists = existsSync(hubPath('hub.toml'));

  const result: {
    hubRoot: string;
    hubInitialized: boolean;
    hubTomlExists: boolean;
    tools: ToolStatus[];
    issues: string[];
  } = {
    hubRoot,
    hubInitialized: hubTomlExists,
    hubTomlExists,
    tools: [],
    issues: [],
  };

  // 检查 Hub 状态
  if (!hubTomlExists) {
    result.issues.push('Hub 未初始化。请先运行 `assetplex init`。');
  }

  // 检查各工具
  const adapters = options.tool
    ? getAllAdapters().filter((a) => a.name === options.tool)
    : getAllAdapters();

  for (const adapter of adapters) {
    try {
      const status = await adapter.detect();
      result.tools.push(status);
    } catch (err) {
      result.tools.push({
        name: adapter.name,
        installed: false,
        configDirExists: false,
        configDir: '',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // 输出结果
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  printDoctorReport(result);
}

/**
 * 打印体检报告（人类可读）
 */
function printDoctorReport(result: {
  hubRoot: string;
  hubInitialized: boolean;
  hubTomlExists: boolean;
  tools: ToolStatus[];
  issues: string[];
}): void {
  log.info('AssetPlex 体检报告');
  log.info('='.repeat(60));
  log.info(`Hub 根目录: ${result.hubRoot}`);
  log.info(`Hub 已初始化: ${result.hubInitialized ? '✓' : '✗'}`);
  log.info('');

  // Hub 问题
  if (result.issues.length > 0) {
    log.warn('Hub 问题：');
    for (const issue of result.issues) {
      log.warn(`  - ${issue}`);
    }
    log.info('');
  }

  // 工具状态表
  log.info('已注册工具状态：');
  log.info('-'.repeat(60));
  for (const tool of result.tools) {
    const status = tool.installed ? '✓ 已安装' : '✗ 未安装';
    const version = tool.version ? ` v${tool.version}` : '';
    const dir = tool.configDir || '(无)';
    log.info(`  ${tool.name.padEnd(15)} ${status}${version}`);
    log.info(`  ${' '.repeat(15)} 配置目录: ${dir}`);
    if (tool.error) {
      log.warn(`  ${' '.repeat(15)} 备注: ${tool.error}`);
    }
    log.info('');
  }

  // 总结
  const installedCount = result.tools.filter((t) => t.installed).length;
  const totalCount = result.tools.length;
  log.info('-'.repeat(60));
  log.info(`总结: ${installedCount}/${totalCount} 个工具已安装`);

  if (installedCount === 0) {
    log.warn('');
    log.warn('未检测到任何 AI 工具，请先安装至少一个工具。');
  } else if (!result.hubInitialized) {
    log.warn('');
    log.warn('Hub 未初始化，请运行: assetplex init');
  } else {
    log.success('');
    log.success('体检完成，可运行 `assetplex sync` 同步配置');
  }
}
