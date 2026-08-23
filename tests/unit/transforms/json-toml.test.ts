import { describe, it, expect } from 'vitest';
import {
  jsonToToml,
  jsonObjToToml,
  tomlToJsonObj,
  tomlToJson,
  mcpJsonToToml,
  mcpTomlToJson,
  isValidToml,
  isValidJson,
} from '../../../src/transforms/json-toml.js';

describe('json-toml', () => {
  describe('jsonToToml / jsonObjToToml', () => {
    it('基础 JSON → TOML', () => {
      const json = '{"name": "agenthub", "version": "1.0"}';
      const toml = jsonToToml(json);
      expect(toml).toContain('name = "agenthub"');
      expect(toml).toContain('version = "1.0"');
    });

    it('嵌套对象转 TOML 表', () => {
      const obj = { server: { host: 'localhost', port: 8080 } };
      const toml = jsonObjToToml(obj);
      expect(toml).toContain('[server]');
      expect(toml).toContain('host = "localhost"');
      // @iarna/toml 会把 ≥1000 的整数格式化为下划线分隔（8080 → 8_080）
      expect(toml).toMatch(/port\s*=\s*8[_]?080/);
    });

    it('数组转 TOML', () => {
      const obj = { args: ['-y', '--force'] };
      const toml = jsonObjToToml(obj);
      // @iarna/toml 数组元素间会有空格：[ "-y", "--force" ]
      expect(toml).toMatch(/args\s*=\s*\[\s*"-y"\s*,\s*"--force"\s*\]/);
    });
  });

  describe('tomlToJsonObj / tomlToJson', () => {
    it('TOML → JSON 对象', () => {
      const toml = 'name = "agenthub"\nversion = "1.0"\n';
      const obj = tomlToJsonObj(toml) as { name: string; version: string };
      expect(obj.name).toBe('agenthub');
      expect(obj.version).toBe('1.0');
    });

    it('TOML 表 → JSON 嵌套', () => {
      const toml = '[server]\nhost = "localhost"\nport = 8080\n';
      const obj = tomlToJsonObj(toml) as { server: { host: string; port: number } };
      expect(obj.server.host).toBe('localhost');
      expect(obj.server.port).toBe(8080);
    });
  });

  describe('mcpJsonToToml', () => {
    it('mcpServers → mcp_servers 字段名转换', () => {
      const json = JSON.stringify({
        mcpServers: {
          'memory': {
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-memory'],
          },
        },
      });
      const toml = mcpJsonToToml(json);
      expect(toml).toContain('[mcp_servers.memory]');
      expect(toml).toContain('command = "npx"');
      // @iarna/toml 数组元素间会有空格
      expect(toml).toMatch(/args\s*=\s*\[\s*"-y"\s*,\s*"@modelcontextprotocol\/server-memory"\s*\]/);
      // 不应出现 mcpServers
      expect(toml).not.toContain('mcpServers');
    });

    it('保留其他顶层字段', () => {
      const json = JSON.stringify({
        mcpServers: { x: { command: 'foo' } },
        model: 'gpt-4',
        log_level: 'info',
      });
      const toml = mcpJsonToToml(json);
      expect(toml).toContain('[mcp_servers.x]');
      expect(toml).toContain('model = "gpt-4"');
      expect(toml).toContain('log_level = "info"');
    });

    it('无 mcpServers 时仅保留其他字段', () => {
      const json = JSON.stringify({ foo: 'bar' });
      const toml = mcpJsonToToml(json);
      expect(toml).toContain('foo = "bar"');
      expect(toml).not.toContain('mcp_servers');
    });
  });

  describe('mcpTomlToJson', () => {
    it('mcp_servers → mcpServers 反向转换', () => {
      const toml = `
[mcp_servers.memory]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-memory"]
`;
      const json = mcpTomlToJson(toml);
      const obj = JSON.parse(json);
      expect(obj.mcpServers).toBeDefined();
      expect(obj.mcpServers.memory.command).toBe('npx');
      expect(obj.mcpServers.memory.args).toEqual(['-y', '@modelcontextprotocol/server-memory']);
      // 不应出现 mcp_servers
      expect(obj.mcp_servers).toBeUndefined();
    });

    it('往返转换无信息丢失', () => {
      const original = JSON.stringify({
        mcpServers: {
          'test': { command: 'test-cmd', args: ['a', 'b'] },
        },
      });
      const toml = mcpJsonToToml(original);
      const backToJson = mcpTomlToJson(toml);
      const obj = JSON.parse(backToJson);
      expect(obj.mcpServers.test.command).toBe('test-cmd');
      expect(obj.mcpServers.test.args).toEqual(['a', 'b']);
    });
  });

  describe('isValidToml / isValidJson', () => {
    it('isValidToml 正确识别', () => {
      expect(isValidToml('name = "x"')).toBe(true);
      expect(isValidToml('invalid = =')).toBe(false);
      expect(isValidToml('')).toBe(true); // 空 TOML 是有效的
    });

    it('isValidJson 正确识别', () => {
      expect(isValidJson('{"a":1}')).toBe(true);
      expect(isValidJson('{invalid}')).toBe(false);
      expect(isValidJson('')).toBe(false);
    });
  });
});
