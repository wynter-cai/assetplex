/**
 * 资产名称校验与 frontmatter 拼装（技能/智能体写管理共用）
 *
 * spec: add-skill-agent-write-management
 */

/** 资产写管理错误（status 供 HTTP 映射：400 参数/冲突，404 不存在） */
export class AssetWriteError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

/** 文件名非法字符（Windows 保留集 + 路径分隔符） */
const ILLEGAL_CHARS = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'] as const;

/**
 * 校验资产名称（用作目录名/文件名）
 *
 * 规则：非空；不得为 . 或 ..；不得含 / \ : * ? " < > |；不得以点或空格结尾（Windows 兼容）。
 * 中文名（\p{L}\p{N}）合法，原样保留。
 *
 * @returns 原样返回合法名称
 * @throws AssetWriteError 名称不合法（status 400）
 */
export function validateAssetName(name: string): string {
  if (name.trim() === '') {
    throw new AssetWriteError('名称不能为空', 400);
  }
  if (name === '.' || name === '..') {
    throw new AssetWriteError(`名称不合法：${name}`, 400);
  }
  const illegal = ILLEGAL_CHARS.find((ch) => name.includes(ch));
  if (illegal !== undefined) {
    throw new AssetWriteError(`名称含非法字符 ${illegal}`, 400);
  }
  if (name.endsWith('.') || name.endsWith(' ')) {
    throw new AssetWriteError(`名称不能以点或空格结尾：${name}`, 400);
  }
  return name;
}

/**
 * 拼装带 frontmatter 的 Markdown（name/description 两行 + 空行 + 正文）
 *
 * 描述中的换行替换为空格，避免破坏 frontmatter 结构；正文保留原文。
 */
export function buildAssetMarkdown(fields: { name: string; description: string; content: string }): string {
  const description = fields.description.replace(/\r?\n/g, ' ');
  const body = fields.content.replace(/^\r?\n/, '');
  return `---\nname: ${fields.name}\ndescription: ${description}\n---\n\n${body}`;
}
