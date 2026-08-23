import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  interpolateEnv,
  desinterpolateEnv,
  extractEnvVars,
  buildEnvMap,
} from '../../../src/transforms/env-interpolation.js';

describe('env-interpolation', () => {
  describe('interpolateEnv', () => {
    beforeEach(() => {
      process.env.TEST_VAR_HOME = '/Users/testuser';
      process.env.TEST_VAR_KEY = 'secret123';
    });

    afterEach(() => {
      delete process.env.TEST_VAR_HOME;
      delete process.env.TEST_VAR_KEY;
    });

    it('替换 ${VAR} 为环境变量值', () => {
      const input = '{"path": "${TEST_VAR_HOME}/.mcp"}';
      const result = interpolateEnv(input);
      expect(result.output).toBe('{"path": "/Users/testuser/.mcp"}');
      expect(result.replaced).toContain('TEST_VAR_HOME');
      expect(result.missing).toHaveLength(0);
    });

    it('多个变量都被替换', () => {
      const input = '${TEST_VAR_HOME}/${TEST_VAR_KEY}';
      const result = interpolateEnv(input);
      expect(result.output).toBe('/Users/testuser/secret123');
      expect(result.replaced).toHaveLength(2);
    });

    it('缺失变量保留原样并加入 missing 列表', () => {
      const input = '${TEST_VAR_HOME}/${MISSING_VAR}';
      const result = interpolateEnv(input);
      expect(result.output).toBe('/Users/testuser/${MISSING_VAR}');
      expect(result.missing).toContain('MISSING_VAR');
      expect(result.replaced).toContain('TEST_VAR_HOME');
    });

    it('strict 模式下缺失变量抛错', () => {
      const input = '${STRICTLY_MISSING}';
      expect(() => interpolateEnv(input, { strict: true })).toThrow(/环境变量缺失/);
    });

    it('自定义 env 来源', () => {
      const input = '${CUSTOM_VAR}';
      const result = interpolateEnv(input, { env: { CUSTOM_VAR: 'custom-value' } });
      expect(result.output).toBe('custom-value');
    });

    it('无效变量名（小写开头）不被匹配', () => {
      const input = '${lowercase_var}';
      const result = interpolateEnv(input);
      expect(result.output).toBe('${lowercase_var}');
      expect(result.missing).toHaveLength(0);
    });

    it('空字符串无变化', () => {
      const result = interpolateEnv('');
      expect(result.output).toBe('');
      expect(result.missing).toHaveLength(0);
      expect(result.replaced).toHaveLength(0);
    });

    it('不包含 ${VAR} 的字符串无变化', () => {
      const input = 'just plain text';
      const result = interpolateEnv(input);
      expect(result.output).toBe(input);
    });
  });

  describe('extractEnvVars', () => {
    it('提取所有 ${VAR} 引用', () => {
      const input = '${HOME}/${USER}/${HOME}';
      const vars = extractEnvVars(input);
      expect(vars).toContain('HOME');
      expect(vars).toContain('USER');
      expect(vars).toHaveLength(2); // 去重
    });

    it('无效变量名不被提取', () => {
      const input = '${VALID_NAME} ${invalid-name} ${1invalid}';
      const vars = extractEnvVars(input);
      expect(vars).toEqual(['VALID_NAME']);
    });
  });

  describe('buildEnvMap', () => {
    it('构建 actual_value → var_name 映射', () => {
      process.env.TEST_BUILD_VAR = '/some/path';
      const map = buildEnvMap(['TEST_BUILD_VAR']);
      expect(map['/some/path']).toBe('TEST_BUILD_VAR');
      delete process.env.TEST_BUILD_VAR;
    });

    it('缺失变量不出现在 map 中', () => {
      const map = buildEnvMap(['NONEXISTENT_VAR']);
      expect(Object.keys(map)).toHaveLength(0);
    });
  });

  describe('desinterpolateEnv', () => {
    it('把实际值替换回 ${VAR}', () => {
      const input = '/Users/testuser/.mcp';
      const envMap = { '/Users/testuser': 'HOME' };
      const result = desinterpolateEnv(input, envMap);
      expect(result).toBe('${HOME}/.mcp');
    });

    it('多个值同时替换', () => {
      const input = '/home/user/config/secret123';
      const envMap = { '/home/user': 'HOME', 'secret123': 'API_KEY' };
      const result = desinterpolateEnv(input, envMap);
      expect(result).toBe('${HOME}/config/${API_KEY}');
    });

    it('按长度倒序匹配避免短前缀问题', () => {
      const input = '/home/user/sub';
      const envMap = { '/home': 'SHORT', '/home/user': 'LONG' };
      const result = desinterpolateEnv(input, envMap);
      // 应该匹配最长的 /home/user
      expect(result).toBe('${LONG}/sub');
    });

    it('特殊字符正确转义', () => {
      const input = 'path/with*dots';
      const envMap = { 'path/with*dots': 'SPECIAL' };
      const result = desinterpolateEnv(input, envMap);
      expect(result).toBe('${SPECIAL}');
    });

    it('空 envMap 不修改输入', () => {
      const input = 'no change';
      const result = desinterpolateEnv(input, {});
      expect(result).toBe(input);
    });
  });
});
