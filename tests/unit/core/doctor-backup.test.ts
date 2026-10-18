/**
 * 医生库内备份区测试（add-asset-doctor F3）
 *
 * spec: fix-and-distribute.spec.md Scenario 3（覆盖前旧版入备份区、撤销依据）；
 * 备份语义与保留策略复用 swap（backupTarget/pruneSwapBackups），但独立目录 .doctor-backup/
 * 不混入 swap 历史。临时 ASSETPLEX_DIR 驱动，同 swap 测试惯例。
 */

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  backupHubFileForDoctor,
  readDoctorBackup,
  DOCTOR_BACKUP_RETAIN,
} from '../../../src/core/doctor-backup.js';

describe('doctor-backup（.doctor-backup 备份区）', () => {
  let hubDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-docbak-hub-'));
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(hubDir, { recursive: true, force: true });
  });

  function writeHub(relPosix: string, content: string): void {
    const abs = join(hubDir, ...relPosix.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  it('备份可回读：路径与旧内容完整还原', () => {
    writeHub('skills/demo-skill/SKILL.md', '---\nname: demo-skill\n---\n旧正文\n');
    const backupId = backupHubFileForDoctor('skills/demo-skill/SKILL.md');
    const entry = readDoctorBackup(backupId);
    expect(entry).not.toBeNull();
    expect(entry!.hubRelativePath).toBe('skills/demo-skill/SKILL.md');
    expect(entry!.content).toBe('---\nname: demo-skill\n---\n旧正文\n');
  });

  it('写库改后续：备份仍持旧版（撤销依据不随本体漂移）', () => {
    writeHub('rules/global.md', '旧规则\n');
    const backupId = backupHubFileForDoctor('rules/global.md');
    writeFileSync(join(hubDir, 'rules', 'global.md'), '新规则\n', 'utf-8');
    expect(readDoctorBackup(backupId)!.content).toBe('旧规则\n');
  });

  it('保留策略：超出 3 次只留最近 3 份（复用 swap 语义）', () => {
    writeHub('identity/profile.md', 'v1\n');
    const ids: string[] = [];
    for (let i = 0; i < DOCTOR_BACKUP_RETAIN + 1; i += 1) {
      writeFileSync(join(hubDir, 'identity', 'profile.md'), `v${i}\n`, 'utf-8');
      ids.push(backupHubFileForDoctor('identity/profile.md'));
    }
    const dirs = readdirSync(join(hubDir, '.doctor-backup'), { withFileTypes: true }).filter((e) => e.isDirectory());
    expect(dirs).toHaveLength(DOCTOR_BACKUP_RETAIN);
    // 至少最早的一份被清理（同毫秒并列时不承诺具体哪份）
    const surviving = ids.filter((id) => readDoctorBackup(id) !== null);
    expect(surviving.length).toBeLessThan(ids.length);
  });

  it('未知 id / 路径穿越 id 一律 null（不触碰备份区外路径）', () => {
    expect(readDoctorBackup('nope')).toBeNull();
    expect(readDoctorBackup('../evil')).toBeNull();
    expect(readDoctorBackup('a/b')).toBeNull();
  });

  it('备份不存在的文件：throw（apply 前置 read 守卫外的兜底）', () => {
    expect(() => backupHubFileForDoctor('skills/ghost/SKILL.md')).toThrow(/不存在|无法备份/);
    expect(existsSync(join(hubDir, '.doctor-backup'))).toBe(false);
  });
});
