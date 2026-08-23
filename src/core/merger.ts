/**
 * 智能合并引擎：按文件类型处理冲突合并
 *
 * 合并策略：
 * - .md (Markdown): Hub 内容在前 + 分隔线 + 来源标注 + 新内容在后
 *   - identity/*.md：结构化合并（字段级），同名字段用新值更新，新字段追加
 * - .json (MCP 配置): 深度合并 mcpServers，Hub 优先
 * - .toml: 转 JSON 合并后转回 TOML（供 Codex config.toml 使用）
 * - 其他类型: 按 Markdown 方式追加
 */

import { mcpTomlToJson, mcpJsonToToml } from '../transforms/json-toml.js';

/**
 * 判断文件类型
 */
export function getFileType(filepath: string): 'md' | 'json' | 'toml' | 'other' {
  if (filepath.endsWith('.md')) return 'md';
  if (filepath.endsWith('.json')) return 'json';
  if (filepath.endsWith('.toml')) return 'toml';
  return 'other';
}

/**
 * Markdown 合并：Hub 内容在前，新内容追加在后
 */
export function mergeMarkdown(existingContent: string, newContent: string, source: string): string {
  const sourceLabel = `<!-- 以下内容从 ${source} 导入，导入时间: ${new Date().toISOString()} -->`;
  return [
    existingContent.trimEnd(),
    '',
    '---',
    '',
    sourceLabel,
    '',
    newContent.trimStart(),
  ].join('\n');
}

/**
 * JSON 深度合并（用于 MCP 配置）
 *
 * 合并规则：
 * - mcpServers 中，Hub 已有的 server 保留（Hub 优先），新工具的 server 追加
 * - 其他顶层字段以 Hub 为准
 */
export function mergeMcpJson(existingContent: string, newContent: string): string {
  try {
    const existing = JSON.parse(existingContent);
    const incoming = JSON.parse(newContent);

    // 深度合并 mcpServers
    if (incoming.mcpServers && typeof incoming.mcpServers === 'object') {
      if (!existing.mcpServers) {
        existing.mcpServers = {};
      }
      // Hub 优先，只追加 Hub 中不存在的 server
      for (const [key, value] of Object.entries(incoming.mcpServers)) {
        if (!(key in existing.mcpServers)) {
          existing.mcpServers[key] = value;
        }
      }
    }

    return JSON.stringify(existing, null, 2);
  } catch {
    // JSON 解析失败，降级为 markdown 风格追加
    return mergeMarkdown(existingContent, newContent, 'mcp-json');
  }
}

/**
 * TOML 合并：转 JSON → 合并 → 转回 TOML
 */
export function mergeToml(existingContent: string, newContent: string): string {
  try {
    const existingJson = mcpTomlToJson(existingContent);
    const newJson = mcpTomlToJson(newContent);
    const mergedJson = mergeMcpJson(existingJson, newJson);
    return mcpJsonToToml(mergedJson);
  } catch {
    // 转换失败，降级为 markdown 风格追加
    return mergeMarkdown(existingContent, newContent, 'toml');
  }
}

/**
 * 按文件类型分发合并
 *
 * @param hubTargetPath Hub 中的目标路径（用于判断文件类型）
 * @param newContent 新内容（要导入的内容）
 * @param existingContent Hub 中已有内容
 * @param source 来源工具名（用于标注）
 * @returns 合并后的内容
 */
export function mergeFile(
  hubTargetPath: string,
  newContent: string,
  existingContent: string,
  source: string,
): { content: string; action: 'merged' } {
  // identity/*.md 文件走结构化合并
  if (isStructuredTarget(hubTargetPath)) {
    return mergeStructuredMd(existingContent, newContent, source);
  }

  const type = getFileType(hubTargetPath);

  switch (type) {
    case 'json':
      return { content: mergeMcpJson(existingContent, newContent), action: 'merged' };
    case 'toml':
      return { content: mergeToml(existingContent, newContent), action: 'merged' };
    case 'md':
    default:
      return { content: mergeMarkdown(existingContent, newContent, source), action: 'merged' };
  }
}

// ========== 结构化 Markdown 合并（P1） ==========

/** 结构化字段匹配模式：**字段名**：值 或 - **字段名**：值 */
const STRUCTURED_FIELD_RE = /^[-*\s]*\*\*(.+?)\*\*[：:]\s*(.*)$/;

/**
 * 判断目标路径是否应启用结构化合并
 * 仅 identity/ 目录下的 .md 文件启用
 */
function isStructuredTarget(hubTargetPath: string): boolean {
  return hubTargetPath.startsWith('identity/') && hubTargetPath.endsWith('.md');
}

/**
 * 解析结构化 Markdown 内容
 * 将内容分为结构化字段 map 和非结构化行列表
 */
function parseStructuredMd(content: string): {
  fields: Map<string, string>;
  unstructured: string[];
} {
  const fields = new Map<string, string>();
  const unstructured: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(STRUCTURED_FIELD_RE);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim();
      fields.set(key, value);
    } else {
      unstructured.push(line);
    }
  }

  return { fields, unstructured };
}

/**
 * 结构化 Markdown 合并
 *
 * 策略：
 * - Hub 中有、新内容无 → 保留 Hub 字段
 * - Hub 中有、新内容有 → 用新内容更新（导入源优先）
 * - Hub 中无、新内容有 → 添加新字段
 * - 非结构化行：Hub 在前，分隔线后追加新内容的非结构化行
 */
function mergeStructuredMd(
  existingContent: string,
  newContent: string,
  source: string,
): { content: string; action: 'merged' } {
  const existing = parseStructuredMd(existingContent);
  const incoming = parseStructuredMd(newContent);

  const mergedFields = new Map(existing.fields);

  // 合并字段：新内容覆盖同名，新增不同名
  for (const [key, value] of incoming.fields) {
    mergedFields.set(key, value);
  }

  // 构建输出
  const lines: string[] = [];

  // 结构化字段（按 key 排序保证稳定输出）
  const sortedKeys = [...mergedFields.keys()].sort();
  for (const key of sortedKeys) {
    const value = mergedFields.get(key) ?? '';
    lines.push(`**${key}**：${value}`);
  }

  // 非结构化内容
  const existingUnstructured = existing.unstructured
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  const incomingUnstructured = incoming.unstructured
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (existingUnstructured.length > 0 || incomingUnstructured.length > 0) {
    lines.push('');
    if (existingUnstructured.length > 0) {
      lines.push(...existingUnstructured);
    }
    if (incomingUnstructured.length > 0) {
      if (existingUnstructured.length > 0) {
        lines.push('');
        lines.push('---');
        lines.push(`<!-- 以下内容从 ${source} 导入 -->`);
        lines.push('');
      }
      lines.push(...incomingUnstructured);
    }
  }

  return { content: lines.join('\n') + '\n', action: 'merged' };
}
