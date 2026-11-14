/**
 * assetplex init 命令
 *
 * 初始化 ~/.assetplex/ 目录结构，生成模板文件
 *
 * 借鉴：
 * - agentsync 的 bundled skill 提示（init 时询问是否安装自带 SKILL）
 * - Claude Code 的 /init 命令
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { log } from '../../utils/logger.js';
import { getHubRoot, hubPath } from '../../utils/paths.js';
import {
  PROFILE_TEMPLATE,
  COMMUNICATION_STYLE_TEMPLATE,
  TECH_STACK_TEMPLATE,
  CODING_STYLE_TEMPLATE,
  GIT_WORKFLOW_TEMPLATE,
  ENV_TEMPLATE,
} from '../templates.js';
import { HUB_DIRECTORIES, HUB_BASE_FILES } from '../../core/hub-skeleton.js';
import { SyncEngine } from '../../core/sync-engine.js';
import { getAllAdapters } from '../../core/adapters/registry.js';
import { loadHubConfig } from '../../core/config.js';
import type { DiscoveredItem, ImportRequest, ImportResult, ToolInventory } from '../../core/types.js';

export interface InitOptions {
  /** 强制覆盖已存在的目录 */
  force?: boolean;
  /** 从现有各工具反向导入 */
  importExisting?: boolean;
  /** 不显示交互提示 */
  yes?: boolean;
}

/** 依赖注入（测试用；缺省走真实扫描与导入引擎） */
export interface InitDeps {
  scanAll?: () => Promise<ToolInventory[]>;
  executeImport?: (request: ImportRequest) => Promise<ImportResult>;
}

/** init 执行摘要（importExisting 时含导入结果） */
export interface InitSummary {
  /** 盘点到（已安装工具的）条目总数 */
  attempted: number;
  /** 仅 --import-existing 时存在 */
  imported?: ImportResult;
}

/** Hub 初始文件定义（路径 -> 内容）；骨架两件套与 core/hub-skeleton 共用同一份内容 */
const HUB_INITIAL_FILES: Array<{ path: string[]; content: string; overwrite: boolean }> = [
  ...HUB_BASE_FILES.map((file) => ({
    path: file.path.split('/'),
    content: file.content,
    overwrite: false,
  })),
  // MCP 单源配置：位于 mcp/ 资产目录内会被计为资产，骨架不写、init 完整初始化时写入
  {
    path: ['mcp', 'mcp.sources.json'],
    content: [
      '{',
      '  "$schema": "https://json-schema.org/draft-07/schema",',
      '  "mcpServers": {',
      '    // 在此添加 MCP 服务器配置，assetplex 会自动同步到各工具：',
      '    // - Claude Code 的 ~/.claude.json',
      '    // - Codex 的 ~/.codex/config.toml [mcp_servers.x]',
      '    // - TRAE CN 的 ~/.trae-cn/mcp.json',
      '    // - WorkBuddy 的 ~/.workbuddy/.mcp.json',
      '  }',
      '}',
      '',
    ].join('\n'),
    overwrite: false,
  },
  {
    path: ['identity', 'profile.md'],
    content: PROFILE_TEMPLATE,
    overwrite: false,
  },
  {
    path: ['identity', 'profile.auto.md'],
    content: [
      '<!-- 预留给 AI 自动学习画像（即将支持）。上线后自动生成，请勿手动编辑。 -->',
      '# Auto-Learned Profile',
      '',
      '> 此文件预留给「AI 自动学习画像」（即将支持），用于记录 AI 从你的行为中学习到的事实。',
      '> 该能力上线前，请手动维护 identity/profile.md。',
      '',
      '## 最近学习到的事实',
      '<!-- (尚无数据：AI 自动学习即将支持) -->',
      '',
      '## 常用工作流',
      '<!-- (尚无数据) -->',
      '',
      '## 错误教训（Lessons）',
      '<!-- (尚无数据) -->',
      '',
    ].join('\n'),
    overwrite: false,
  },
  {
    path: ['identity', 'communication-style.md'],
    content: COMMUNICATION_STYLE_TEMPLATE,
    overwrite: false,
  },
  {
    path: ['identity', 'tech-stack.md'],
    content: TECH_STACK_TEMPLATE,
    overwrite: false,
  },
  {
    path: ['identity', 'env.md'],
    content: ENV_TEMPLATE,
    overwrite: false,
  },
  {
    path: ['preferences', 'coding-style.md'],
    content: CODING_STYLE_TEMPLATE,
    overwrite: false,
  },
  {
    path: ['preferences', 'git-workflow.md'],
    content: GIT_WORKFLOW_TEMPLATE,
    overwrite: false,
  },
  // 初始规则文件
  {
    path: ['rules', 'always', 'global.md'],
    content: [
      '# Global Rules',
      '',
      '> 此规则文件会同步到所有工具的 rules/always/，对所有 AI 助手始终生效。',
      '',
      '## 通用规则',
      '- 修改代码前先阅读相关文件',
      '- 不要做未被请求的改动',
      '- 不要添加未被请求的注释、文档或类型注解',
      '- 优先编辑现有文件，而非创建新文件',
      '- 简单优先，避免过度设计',
      '',
    ].join('\n'),
    overwrite: false,
  },
];

/**
 * assetplex init 实现
 */
export async function initCommand(options: InitOptions = {}, deps: InitDeps = {}): Promise<InitSummary> {
  const hubRoot = getHubRoot();

  log.info(`正在初始化 AssetPlex...`);
  log.info(`Hub 根目录: ${hubRoot}`);

  // 检查目录是否已存在
  if (existsSync(hubRoot) && !options.force) {
    // 检查是否有 hub.toml
    const hubTomlPath = hubPath('hub.toml');
    if (existsSync(hubTomlPath)) {
      log.warn(`Hub 已存在：${hubRoot}`);
      log.warn(`如需重新初始化，请使用 --force 选项`);
      return { attempted: 0 };
    }
  }

  // 创建目录结构
  log.info('创建目录结构...');
  for (const dir of HUB_DIRECTORIES) {
    const dirPath = resolve(hubRoot, dir);
    mkdirSync(dirPath, { recursive: true });
    log.debug(`  创建目录: ${dir}`);
  }

  // 写入初始文件
  log.info('写入模板文件...');
  let createdCount = 0;
  let skippedCount = 0;
  for (const file of HUB_INITIAL_FILES) {
    const filePath = resolve(hubRoot, ...file.path);
    if (existsSync(filePath) && !file.overwrite && !options.force) {
      log.debug(`  跳过已存在: ${file.path.join('/')}`);
      skippedCount++;
      continue;
    }
    writeFileSync(filePath, file.content, 'utf-8');
    log.debug(`  写入文件: ${file.path.join('/')}`);
    createdCount++;
  }

  log.success(`AssetPlex 初始化完成！`);
  log.info(`  根目录: ${hubRoot}`);
  log.info(`  创建文件: ${createdCount} 个`);
  if (skippedCount > 0) {
    log.info(`  跳过已存在: ${skippedCount} 个`);
  }

  // 盘点式导入（add-zero-config-onboarding T8）：--import-existing 才执行
  if (options.importExisting) {
    const imported = await importExistingAssets(deps);
    return { attempted: imported.attempted, imported: imported.result };
  }

  // 显示后续步骤
  log.info('');
  log.info('下一步：');
  log.info('  1. 编辑 ~/.assetplex/identity/profile.md 填写你的个人画像');
  log.info('  2. 运行 `assetplex doctor` 检测各 AI 工具安装状态');
  log.info('  3. 运行 `assetplex sync` 同步到所有工具');
  log.info('  4. 运行 `assetplex --help` 查看所有命令');
  return { attempted: 0 };
}

/** 盘点各工具并导入可收纳条目（同名冲突一律跳过，不覆盖已有内容；spec 9.3） */
async function importExistingAssets(
  deps: InitDeps,
): Promise<{ attempted: number; result?: ImportResult }> {
  const engine = new SyncEngine(loadHubConfig(hubPath('hub.toml')), getAllAdapters());
  const inventories = deps.scanAll ? await deps.scanAll() : await engine.scanAll();
  const installed = inventories.filter((t) => t.installed);
  const attempted = installed.reduce((sum, t) => sum + t.items.length, 0);

  log.info('');
  log.info('盘点本机工具...');
  for (const inventory of inventories) {
    const note = inventory.installed ? `${inventory.items.length} 个可导入条目` : '未安装';
    log.info(`  ${inventory.displayName}: ${note}`);
  }

  if (attempted === 0) {
    log.info('未检测到可导入的资产——之后可通过 Web 向导或导入页手动添加。');
    return { attempted: 0 };
  }

  const items = installed.flatMap((inventory) =>
    inventory.items.map((item: DiscoveredItem) => ({
      tool: item.tool,
      absolutePath: item.absolutePath,
      hubTargetPath: item.hubTargetPath,
      category: item.category,
      conflict: item.conflict,
      // 库内同名但内容不同：CLI 一律跳过，不覆盖（用户可去导入向导逐条处理）
      ...(item.conflict === 'differs' ? { strategy: 'skip' as const } : {}),
      binary: item.binary,
    })),
  );

  log.info('导入到资产库...');
  const result = deps.executeImport
    ? await deps.executeImport({ items })
    : await engine.executeImport({ items });

  log.info(
    `导入完成：新建 ${result.created}、合并 ${result.merged}、覆盖 ${result.overwritten}、跳过 ${result.skipped}` +
      (result.errors > 0 ? `、失败 ${result.errors}` : ''),
  );
  return { attempted, result };
}
