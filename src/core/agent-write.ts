/**
 * 保险箱智能体写服务（纯逻辑）
 *
 * 创建/更新/删除 Hub 中的智能体文件 agents/<name>.md（Claude Code 子代理格式）。
 * 文件系统通过注入的 AgentWriteFs 提供，便于测试且不直接依赖 fs。
 *
 * spec: add-skill-agent-write-management / specs/agent-write.spec.md
 */

import {
  listAgents,
  type AgentFs,
  type AgentInfo,
  type AgentSources,
} from './agent-inventory.js';
import { validateAssetName, buildAssetMarkdown, AssetWriteError } from './asset-name.js';

export { AssetWriteError as AgentWriteError } from './asset-name.js';

/** 智能体写管理所需文件系统（在只读 AgentFs 基础上增加写能力） */
export interface AgentWriteFs extends AgentFs {
  /** 路径是否存在（文件或目录） */
  exists(path: string): boolean;
  /** 递归创建目录 */
  ensureDir(path: string): void;
  /** 写入文本文件（覆盖） */
  writeFile(path: string, content: string): void;
  /** 删除文件（不存在时静默） */
  removeFile(path: string): void;
}

/** 新建智能体输入 */
export interface VaultAgentInput {
  /** 智能体名，同时用作文件名 agents/<name>.md；大小写不敏感唯一 */
  name: string;
  /** 描述，写入 frontmatter description；可空 */
  description?: string;
  /** 正文（system prompt） */
  content: string;
}

/** 智能体写服务依赖 */
export interface AgentWriteDeps {
  fs: AgentWriteFs;
  sources: AgentSources;
}

/** 保险箱智能体的盘点 id 前缀（与 agent-inventory 的 makeAgentId 保持一致） */
const HUB_AGENT_ID_PREFIX = 'hub:custom-subagent:';

/** 创建保险箱智能体，返回创建后的盘点条目 */
export function createVaultAgent(input: VaultAgentInput, deps: AgentWriteDeps): AgentInfo {
  const name = validateAssetName(input.name);
  const { fs, sources } = deps;

  // 重名拒绝：仅限保险箱内部（与其他工具同名是合法的独立条目）
  const conflict = listAgents({ fs, sources }).items.find(
    (a) => a.tool === 'hub' && a.name.toLowerCase() === name.toLowerCase(),
  );
  if (conflict) {
    throw new AssetWriteError(`同名智能体已存在：${conflict.name}`, 400);
  }

  const agentsDir = sources.hub.agentsDir;
  fs.ensureDir(agentsDir);
  fs.writeFile(
    `${agentsDir}/${name}.md`,
    buildAssetMarkdown({
      name,
      description: input.description ?? '',
      content: input.content ?? '',
    }),
  );

  const created = listAgents({ fs, sources }).items.find((a) => a.id === `${HUB_AGENT_ID_PREFIX}${name}`);
  if (!created) {
    throw new Error(`智能体创建后未纳入盘点：${name}`);
  }
  return created;
}

/** 更新保险箱智能体（整文件替换），返回刷新后的盘点条目 */
export function updateVaultAgent(id: string, content: string, deps: AgentWriteDeps): AgentInfo {
  const { fs, sources } = deps;
  const target = listAgents({ fs, sources }).items.find((a) => a.id === id);
  if (!target) {
    throw new AssetWriteError(`智能体不存在：${id}`, 404);
  }
  assertEditableAgent(target);

  fs.writeFile(target.sourcePath, content);

  const refreshed = listAgents({ fs, sources }).items.find((a) => a.id === target.id);
  if (!refreshed) {
    throw new Error(`智能体更新后未纳入盘点：${target.name}`);
  }
  return refreshed;
}

/** 删除保险箱智能体文件，成功无返回值 */
export function deleteVaultAgent(id: string, deps: AgentWriteDeps): void {
  const { fs, sources } = deps;
  const target = listAgents({ fs, sources }).items.find((a) => a.id === id);
  if (!target) {
    throw new AssetWriteError(`智能体不存在：${id}`, 404);
  }
  assertEditableAgent(target);

  // 防御：仅允许删除保险箱目录下的一层 .md 文件
  const dir = target.sourcePath.slice(0, target.sourcePath.lastIndexOf('/'));
  if (dir !== sources.hub.agentsDir || !target.sourcePath.endsWith('.md')) {
    throw new AssetWriteError(`非法智能体文件路径：${target.sourcePath}`, 400);
  }

  fs.removeFile(target.sourcePath);
}

function assertEditableAgent(agent: AgentInfo): void {
  if (agent.tool !== 'hub' || agent.kind !== 'custom-subagent') {
    throw new AssetWriteError(
      `仅保险箱智能体可执行写操作：${agent.name}（工具：${agent.tool}）`,
      400,
    );
  }
}
