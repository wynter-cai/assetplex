/**
 * MCP 写入路径校验与新建路径生成（add-asset-governance J3）
 *
 * 四道闸中的第③道：Hub 之外、mcp/ 环境条目、类别目录不匹配一律拒写。
 */

import { McpToolError } from './mcp-errors.js';
import { DOCTOR_ASSET_KINDS, type DoctorAssetKind } from './types.js';
import type { McpToolDeps } from './mcp-types.js';

const KIND_DIRS: Record<DoctorAssetKind, string> = {
  identity: 'identity',
  skill: 'skills',
  rule: 'rules',
  agent: 'agents',
  command: 'commands',
  memory: 'memory',
};

export function isDoctorKind(value: unknown): value is DoctorAssetKind {
  return typeof value === 'string' && (DOCTOR_ASSET_KINDS as readonly string[]).includes(value);
}

/** 资产路径校验：Hub 内 → 类别目录 → 非内部条目 → skill 结构 */
export function assertWritablePath(deps: McpToolDeps, kind: DoctorAssetKind, rawPath: string): string {
  if (!isDoctorKind(kind)) {
    throw new McpToolError('INVALID_INPUT', `不支持的资产类别：${String(kind)}`, `可用类别：${DOCTOR_ASSET_KINDS.join(' / ')}`);
  }
  const path = rawPath.trim().replace(/\\/g, '/');
  if (path === '') {
    throw new McpToolError('INVALID_INPUT', '目标路径不能为空', 'update 必须提供 hubRelativePath；create 可省略由服务端生成');
  }
  if (!deps.isHubInternalPath(path)) {
    throw new McpToolError('OUT_OF_HUB', `目标路径在 Hub 之外：${rawPath}`, '只允许写入 AssetPlex Hub 内的资产文件');
  }
  const segments = path.split('/');
  if (segments[0] === 'mcp') {
    throw new McpToolError('OUT_OF_HUB', '环境条目（mcp/）由工具注入，AssetPlex 不代写', '如需维护 MCP 配置，请在 HUB 的环境页操作');
  }
  if (segments[0] !== KIND_DIRS[kind]) {
    throw new McpToolError('INVALID_INPUT', `路径与类别不匹配：${rawPath}`, `kind=${kind} 的资产应位于 ${KIND_DIRS[kind]}/ 下`);
  }
  if (segments.some((s) => s === '.' || s === '..' || s === '' || s.startsWith('_') || s.startsWith('.'))) {
    throw new McpToolError('INVALID_INPUT', `路径包含非法段：${rawPath}`, '去掉 . / .. / 下划线或隐藏目录段后重试');
  }
  if (!path.endsWith('.md')) {
    throw new McpToolError('INVALID_INPUT', `只允许写入 .md 资产文件：${rawPath}`, '资产正文统一为 Markdown');
  }
  if (kind === 'skill') {
    const valid = (segments.length === 3 && segments[2] === 'SKILL.md') || (segments.length === 2 && segments[1].endsWith('.md'));
    if (!valid) {
      throw new McpToolError('INVALID_INPUT', `技能路径应为 skills/<name>/SKILL.md：${rawPath}`, '按技能目录结构组织，便于分发到各工具');
    }
  }
  return path;
}

function slugFromContent(content: string): string {
  const frontmatter = content.match(/^---\n([\s\S]*?)\n---/);
  const nameLine = frontmatter?.[1]?.match(/^name:\s*(.+)$/m)?.[1];
  const heading = content.match(/^#\s+(.+)$/m)?.[1];
  const raw = (nameLine ?? heading ?? '').trim().replace(/^["']|["']$/g, '');
  const slug = raw.replace(/[\\/:*?"<>|\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return slug === '' ? 'untitled' : slug;
}

/** create 模式的安全默认路径：避免覆盖现有文件 */
export function defaultCreatePath(deps: McpToolDeps, kind: DoctorAssetKind, content: string): string {
  const slug = slugFromContent(content);
  if (kind === 'skill') {
    let candidate = `skills/${slug}/SKILL.md`;
    let n = 2;
    while (deps.fileExists(candidate)) candidate = `skills/${slug}-${n++}/SKILL.md`;
    return candidate;
  }
  let candidate = `${KIND_DIRS[kind]}/${slug}.md`;
  let n = 2;
  while (deps.fileExists(candidate)) candidate = `${KIND_DIRS[kind]}/${slug}-${n++}.md`;
  return candidate;
}
