/**
 * Hub 路径换算（add-asset-doctor E6）
 *
 * 把「Hub 内绝对路径」换算为医生 API 需要的 Hub 相对路径；
 * Hub 外（环境条目/工具侧文件）返回 null——医生只服务库内资产的 UI 侧判定。
 */

function normalize(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** hubRoot 与 absolutePath 均为本机原生路径（同源取自后端 API，风格一致） */
export function toHubRelative(hubRoot: string, absolutePath: string): string | null {
  const root = normalize(hubRoot);
  const abs = normalize(absolutePath);
  if (!abs.startsWith(root + '/')) return null;
  const relative = abs.slice(root.length + 1);
  return relative === '' ? null : relative;
}
