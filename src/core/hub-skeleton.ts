/**
 * Hub 骨架初始化（add-zero-config-onboarding T3）
 *
 * 骨架 = 目录 + hub.toml + README.md（spec 4.1 修订：不含 mcp/mcp.sources.json——
 * 它位于 mcp/ 资产目录内、会被 listAssets 计为资产，导致「建骨架后 autoEnter 失效」，
 * CLI 首跑建骨架后将进不了向导。该文件由 assetplex init 完整初始化或用户首次添加 MCP 时创建）。
 * 绝不写身份/规则/偏好空模板——它们会与真实资产冲突，也让用户误以为已有内容。
 *
 * `assetplex init`（CLI）复用本模块的 HUB_DIRECTORIES / HUB_BASE_FILES，
 * 在骨架之上继续写完整模板（含 mcp.sources.json），保持原行为不变。
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { generateDefaultConfigToml } from './config.js';

/** Hub 目录结构定义（init 与向导骨架共用，避免两份目录表漂移） */
export const HUB_DIRECTORIES = [
  'identity',
  'skills',
  'rules/always',
  'rules/by-glob',
  'rules/by-project',
  'preferences',
  'mcp',
  'commands',
  'agents',
  '.backups',
] as const;

/** 骨架基础文件（Hub 相对路径使用 / 分隔，跨平台经 resolve 落盘） */
export interface HubBaseFile {
  path: string;
  content: string;
}

const README_CONTENT = `# AssetPlex — 个人 AI 工具配置中心
此目录由 [AssetPlex](https://github.com/wynter-cai/assetplex) 管理。
修改任意文件后，运行 \`assetplex sync\` 同步到所有启用的工具。

## 目录结构
- \`identity/\` — 你的个人身份画像（手写 + AI 自动维护）
- \`skills/\` — 跨工具 Skills 库
- \`rules/\` — 通用规则
- \`preferences/\` — 个人偏好（编码风格、Git 工作流等）
- \`mcp/\` — MCP 服务器集中配置
- \`commands/\` — 自定义 slash commands
- \`agents/\` — 子代理定义
- \`hub.toml\` — Hub 主配置

## 常用命令
\`\`\`bash
assetplex init              # 初始化 Hub 与模板
assetplex sync              # 同步到所有工具
assetplex sync --dry-run    # 预览变更
assetplex doctor            # 体检
assetplex ui                # 打开可视化管理界面
\`\`\`

> 即将支持：让 AI 学习近期行为、社区技能搜索。
`;

/** 骨架基础文件（init 与向导共用同一份内容；mcp.sources.json 由 init 单独补写） */
export const HUB_BASE_FILES: readonly HubBaseFile[] = [
  { path: 'hub.toml', content: generateDefaultConfigToml() },
  { path: 'README.md', content: README_CONTENT },
];

export interface HubSkeletonResult {
  /** 本次新建的相对路径 */
  created: string[];
  /** 已存在而跳过的相对路径 */
  skipped: string[];
}

/**
 * 幂等创建 Hub 骨架：目录递归创建；基础文件仅在不存在时写入。
 * 已存在文件（含用户手改过的 hub.toml）一律不覆盖。
 */
export function ensureHubSkeleton(hubRoot: string): HubSkeletonResult {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of HUB_DIRECTORIES) {
    mkdirSync(resolve(hubRoot, ...dir.split('/')), { recursive: true });
  }

  for (const file of HUB_BASE_FILES) {
    const full = resolve(hubRoot, ...file.path.split('/'));
    if (existsSync(full)) {
      skipped.push(file.path);
      continue;
    }
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.content, 'utf-8');
    created.push(file.path);
  }

  return { created, skipped };
}
