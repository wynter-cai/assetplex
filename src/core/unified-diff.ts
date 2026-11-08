/**
 * 统一 diff 预览（MCP propose 用）
 *
 * 只做整文件级 hunk：足够让人/Agent 判断内容变化，不追求最小 diff。
 */

export function buildUnifiedDiff(
  hubRelativePath: string,
  oldContent: string | null,
  newContent: string,
): string {
  const newLines = newContent.split('\n');
  if (oldContent === null) {
    return [
      '--- /dev/null',
      `+++ b/${hubRelativePath}`,
      `@@ -0,0 +1,${newLines.length} @@`,
      ...newLines.map((line) => `+${line}`),
    ].join('\n');
  }
  if (oldContent === newContent) return '';
  const oldLines = oldContent.split('\n');
  return [
    `--- a/${hubRelativePath}`,
    `+++ b/${hubRelativePath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n');
}
