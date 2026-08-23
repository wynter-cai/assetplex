import { describe, it, expect } from 'vitest';
import { mergeFile, mergeMarkdown, mergeMcpJson, mergeToml } from '../../../src/core/merger.js';

describe('merger', () => {
  describe('mergeMarkdown', () => {
    it('将新内容追加到现有内容后', () => {
      const existing = '# 现有内容\n\n这是 Hub 已有的内容。';
      const newContent = '# 新内容\n\n这是从工具导入的内容。';
      const result = mergeMarkdown(existing, newContent, 'trae-cn');
      expect(result).toContain('现有内容');
      expect(result).toContain('新内容');
      expect(result).toContain('---');
      expect(result).toContain('trae-cn');
    });
  });

  describe('mergeMcpJson', () => {
    it('深度合并 mcpServers，Hub 优先', () => {
      const existing = JSON.stringify({
        mcpServers: { serverA: { url: 'http://hub.local' } },
      });
      const newContent = JSON.stringify({
        mcpServers: {
          serverA: { url: 'http://tool.local' },
          serverB: { url: 'http://tool2.local' },
        },
      });
      const result = mergeMcpJson(existing, newContent);
      const parsed = JSON.parse(result);
      expect(parsed.mcpServers.serverA.url).toBe('http://hub.local'); // Hub 优先
      expect(parsed.mcpServers.serverB.url).toBe('http://tool2.local'); // 新 server 追加
    });
  });

  describe('mergeToml', () => {
    it('TOML 转 JSON 合并后转回 TOML', () => {
      const existing = `[mcpServers.serverA]\nurl = "http://hub.local"`;
      const newContent = `[mcpServers.serverB]\nurl = "http://tool.local"`;
      const result = mergeToml(existing, newContent);
      expect(result).toContain('serverA');
      expect(result).toContain('serverB');
    });
  });

  describe('mergeFile - 结构化 Markdown 合并（identity/*.md）', () => {
    it('同名字段用新值更新', () => {
      const existing = '**姓名**：张三\n**角色**：前端工程师\n';
      const newContent = '**姓名**：张三\n**角色**：全栈工程师\n**技能**：React, Node.js\n';
      const result = mergeFile('identity/profile.md', newContent, existing, 'workbuddy');
      expect(result.content).toContain('**姓名**：张三');
      expect(result.content).toContain('**角色**：全栈工程师'); // 更新
      expect(result.content).toContain('**技能**：React, Node.js'); // 新增
      expect(result.action).toBe('merged');
    });

    it('Hub 独有字段保留', () => {
      const existing = '**姓名**：李四\n**公司**：字节跳动\n';
      const newContent = '**姓名**：李四\n';
      const result = mergeFile('identity/profile.md', newContent, existing, 'trae-cn');
      expect(result.content).toContain('**公司**：字节跳动'); // Hub 独有保留
      expect(result.content).toContain('**姓名**：李四');
    });

    it('非结构化内容追加到末尾', () => {
      const existing = '**姓名**：王五\n\n这是一段自由文本。';
      const newContent = '**姓名**：王五\n\n这是新工具的自由文本。';
      const result = mergeFile('identity/profile.md', newContent, existing, 'codex');
      expect(result.content).toContain('这是一段自由文本');
      expect(result.content).toContain('这是新工具的自由文本');
      expect(result.content).toContain('---');
    });

    it('非 identity 路径走普通 Markdown 合并', () => {
      const existing = '# 规则A\n内容';
      const newContent = '# 规则B\n新内容';
      const result = mergeFile('rules/my-rule.md', newContent, existing, 'trae-cn');
      expect(result.content).toContain('规则A');
      expect(result.content).toContain('规则B');
      expect(result.content).toContain('---');
      // 不应有结构化字段解析
      expect(result.content).not.toMatch(/^\*\*.*\*\*：/m);
    });

    it('空内容正常处理', () => {
      const existing = '';
      const newContent = '**姓名**：赵六\n';
      const result = mergeFile('identity/profile.md', newContent, existing, 'trae-cn');
      expect(result.content).toContain('**姓名**：赵六');
      expect(result.action).toBe('merged');
    });
  });
});