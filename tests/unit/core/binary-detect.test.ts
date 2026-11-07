import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isBinaryFile, isBinaryPath, looksBinary } from '../../../src/core/binary-detect.js';

/**
 * 二进制判定纯函数
 * spec: 设计文档/changes/refine-skill-cards-wizard/specs/import-wizard-noise.spec.md
 *       Requirement「二进制条目标注清楚、默认不勾选」
 */
describe('isBinaryPath 扩展名判定', () => {
  it('常见二进制扩展名判为二进制', () => {
    for (const name of ['_icon.png', 'logo.jpg', 'pack.zip', 'font.woff2', 'logo.svg']) {
      expect(isBinaryPath(name), name).toBe(true);
    }
  });

  it('文本扩展名判为文本', () => {
    for (const name of ['SKILL.md', 'notes.md', 'package.json', 'hub.toml', 'index.js']) {
      expect(isBinaryPath(name), name).toBe(false);
    }
  });

  it('大小写不敏感', () => {
    expect(isBinaryPath('ICON.PNG')).toBe(true);
  });

  it('未知扩展名与无扩展名不靠扩展名判定', () => {
    expect(isBinaryPath('asset.bin')).toBe(false);
    expect(isBinaryPath('Makefile')).toBe(false);
  });
});

describe('looksBinary NUL 嗅探', () => {
  it('含 0x00 判为二进制', () => {
    expect(looksBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d]))).toBe(true);
  });

  it('纯 UTF-8 文本（含中文）不误判', () => {
    expect(looksBinary(Buffer.from('# 技能说明\n\n中文内容\n', 'utf-8'))).toBe(false);
  });

  it('空缓冲区判为文本', () => {
    expect(looksBinary(Buffer.alloc(0))).toBe(false);
  });

  it('只嗅探前 8KB：0x00 出现在 8KB 之后不当场判二进制', () => {
    const buf = Buffer.alloc(9000, 0x41);
    buf[8500] = 0x00;
    expect(looksBinary(buf)).toBe(false);
  });
});

describe('isBinaryFile 组合判定', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'assetplex-binary-detect-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('扩展名命中直接判二进制，不读文件内容', () => {
    const file = join(dir, '_icon.png');
    writeFileSync(file, Buffer.from('# 其实是文本\n', 'utf-8'));
    expect(isBinaryFile(file)).toBe(true);
  });

  it('扩展名未知但内容含 NUL 时兜底判二进制', () => {
    const file = join(dir, 'asset.bin');
    writeFileSync(file, Buffer.from([0x00, 0x01, 0x02, 0x03]));
    expect(isBinaryFile(file)).toBe(true);
  });

  it('扩展名未知且内容是文本时判文本', () => {
    const file = join(dir, 'note.unknown');
    writeFileSync(file, Buffer.from('# 文本\n', 'utf-8'));
    expect(isBinaryFile(file)).toBe(false);
  });

  it('文件不存在时不抛错，按扩展名判定', () => {
    expect(isBinaryFile(join(dir, 'missing.png'))).toBe(true);
    expect(isBinaryFile(join(dir, 'missing.md'))).toBe(false);
  });
});
