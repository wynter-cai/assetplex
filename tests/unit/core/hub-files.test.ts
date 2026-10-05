/**
 * hub-files 单元测试 —— deleteHubDirectory（T1.1）
 *
 * spec: add-skill-agent-write-management / specs/skill-write.spec.md
 * hub-files 直接使用 node:fs + getHubRoot()，测试用 ASSETPLEX_DIR 指向临时目录。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deleteHubDirectory } from '../../../src/core/hub-files.js';

describe('deleteHubDirectory 技能目录删除', () => {
  let hubRoot: string;
  let originalEnv: string | undefined;

  beforeEach(() => {
    hubRoot = mkdtempSync(join(tmpdir(), 'hub-files-test-'));
    originalEnv = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubRoot;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalEnv;
    rmSync(hubRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  it('正常删除 skills/<name> 目录（含嵌套内容），兄弟目录不受影响', () => {
    const skillDir = join(hubRoot, 'skills', '周报助手');
    mkdirSync(join(skillDir, 'assets'), { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: 周报助手\n---\n正文');
    writeFileSync(join(skillDir, 'assets', 'a.png'), 'binary');
    mkdirSync(join(hubRoot, 'skills', 'other'), { recursive: true });
    writeFileSync(join(hubRoot, 'skills', 'other', 'SKILL.md'), 'x');

    deleteHubDirectory('skills/周报助手');

    expect(existsSync(skillDir)).toBe(false);
    expect(existsSync(join(hubRoot, 'skills', 'other', 'SKILL.md'))).toBe(true);
  });

  it('不存在时静默返回（幂等）', () => {
    expect(() => deleteHubDirectory('skills/ghost')).not.toThrow();
  });

  it('拒绝删除 skills 根目录', () => {
    mkdirSync(join(hubRoot, 'skills', 'a'), { recursive: true });
    expect(() => deleteHubDirectory('skills')).toThrow();
  });

  it('拒绝非 skills 类别路径', () => {
    mkdirSync(join(hubRoot, 'identity'), { recursive: true });
    expect(() => deleteHubDirectory('identity')).toThrow(/skills/);
    expect(() => deleteHubDirectory('agents/foo')).toThrow(/skills/);
  });

  it('拒绝多层子路径与路径穿越', () => {
    mkdirSync(join(hubRoot, 'skills', 'a', 'b'), { recursive: true });
    expect(() => deleteHubDirectory('skills/a/b')).toThrow();
    expect(() => deleteHubDirectory('skills/../identity')).toThrow();
    expect(() => deleteHubDirectory('../outside')).toThrow(/越界/);
  });

  it('拒绝删除 skills 下的普通文件', () => {
    mkdirSync(join(hubRoot, 'skills'), { recursive: true });
    writeFileSync(join(hubRoot, 'skills', 'flat.md'), 'x');
    expect(() => deleteHubDirectory('skills/flat.md')).toThrow(/目录/);
  });
});
