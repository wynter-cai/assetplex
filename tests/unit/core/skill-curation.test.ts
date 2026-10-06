/**
 * 技能沉淀工作流单元测试
 *
 * spec: add-skill-curation / specs/skill-curation.spec.md
 * 纯逻辑：文件系统通过内存版 SkillWriteFs 注入。
 */

import { describe, it, expect } from 'vitest';
import {
  curateVaultSkill,
  curateVaultSkills,
  SkillCurateError,
} from '../../../src/core/skill-curation.js';
import { updateVaultSkill } from '../../../src/core/skill-write.js';
import { listSkills } from '../../../src/core/skills-inventory.js';
import type { SkillWriteFs } from '../../../src/core/skill-write.js';
import type { SkillSources, SkillOverrideStore, SkillFunction, SkillInfo } from '../../../src/core/skills-inventory.js';

/** 内存版可写文件系统（同时满足只读扫描与写管理） */
class MemoryWriteFs implements SkillWriteFs {
  files = new Map<string, string>();

  read(p: string): string | null {
    return this.files.get(p) ?? null;
  }

  listDir(p: string): string[] {
    const base = p.replace(/\\/g, '/').replace(/\/+$/, '');
    const names = new Set<string>();
    for (const key of this.files.keys()) {
      const k = key.replace(/\\/g, '/');
      if (k.startsWith(`${base}/`)) {
        const seg = k.slice(base.length + 1).split('/')[0];
        if (seg) names.add(seg);
      }
    }
    return Array.from(names).sort();
  }

  dirMtime(): string | null {
    return null;
  }

  exists(p: string): boolean {
    return this.files.has(p);
  }

  ensureDir(): void {
    // 内存实现无需动作
  }

  writeFile(p: string, content: string): void {
    this.files.set(p, content);
  }

  removeDir(p: string): void {
    const prefix = `${p.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
    for (const key of [...this.files.keys()]) {
      if (key.replace(/\\/g, '/').startsWith(prefix)) this.files.delete(key);
    }
  }
}

class MemoryStore implements SkillOverrideStore {
  data: Record<string, SkillFunction> = {};
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(m: Record<string, SkillFunction>): void {
    this.data = { ...m };
  }
}

const SOURCES: SkillSources = {
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/u/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
};

function makeDeps(fs: MemoryWriteFs): { fs: MemoryWriteFs; sources: SkillSources; store: SkillOverrideStore } {
  return { fs, sources: SOURCES, store: new MemoryStore() };
}

function addSkill(fs: MemoryWriteFs, root: string, name: string, description: string, body: string): void {
  fs.files.set(
    `${root}/${name}/SKILL.md`,
    `---\nname: ${name}\ndescription: ${description}\n---\n${body}`,
  );
}

function expectCurateError(fn: () => unknown, status: 400 | 404, messagePart?: string): void {
  try {
    fn();
    expect.fail('应当抛出 SkillCurateError');
  } catch (err) {
    expect(err).toBeInstanceOf(SkillCurateError);
    const e = err as SkillCurateError;
    expect(e.status).toBe(status);
    if (messagePart) expect(e.message).toContain(messagePart);
  }
}

describe('curateVaultSkill 单条沉淀', () => {
  it('正常沉淀：市场技能复制进保险箱，返回合并后的 vault 条目并带来源', () => {
    const fs = new MemoryWriteFs();
    const marketPath = `${SOURCES.marketplaceSkillsDir}/airbnb/SKILL.md`;
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行预订技能', '# airbnb\n预订指南');

    const skill = curateVaultSkill({ id: 'airbnb' }, makeDeps(fs));

    expect(skill.origin).toBe('vault');
    expect(skill.tool).toBe('hub');
    expect(skill.name).toBe('airbnb');
    expect(skill.source).toBe(`marketplace:${marketPath}`);

    const raw = fs.files.get('/hub/skills/airbnb/SKILL.md') ?? '';
    expect(raw).toContain('name: airbnb');
    expect(raw).toContain('description: 旅行预订技能');
    expect(raw).toContain(`source: marketplace:${marketPath}`);
    expect(raw).toContain('# airbnb\n预订指南');
    // 源文件不动（沉淀 = 复制）
    expect(fs.files.get(marketPath)).toContain('预订指南');
  });

  it('沉淀时改名：创建改名副本，原市场技能仍在盘点中', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行预订技能', '正文');

    const skill = curateVaultSkill({ id: 'airbnb', name: 'airbnb-travel' }, makeDeps(fs));

    expect(skill.name).toBe('airbnb-travel');
    expect(skill.sourcePath).toBe('/hub/skills/airbnb-travel/SKILL.md');
    const list = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    expect(list.total).toBe(2);
    expect(list.items.map((s) => s.origin).sort()).toEqual<SkillInfo['origin'][]>(['marketplace', 'vault']);
  });

  it('源技能不存在返回 404', () => {
    const fs = new MemoryWriteFs();
    expectCurateError(() => curateVaultSkill({ id: 'ghost' }, makeDeps(fs)), 404, '不存在');
  });

  it('保险箱技能拒绝沉淀（400）', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.vaultSkillsDir, 'mine', '自建技能', '正文');
    expectCurateError(() => curateVaultSkill({ id: 'mine' }, makeDeps(fs)), 400, '保险箱');
  });

  it('改名撞上已有技能（跨来源）拒绝（400）', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行预订', '正文');
    addSkill(fs, SOURCES.userSkillsDir, 'pdf', '已有技能', '正文');

    expectCurateError(
      () => curateVaultSkill({ id: 'airbnb', name: 'pdf' }, makeDeps(fs)),
      400,
      '同名',
    );
  });

  it('保险箱已存在同名技能时拒绝沉淀（400，防御重复沉淀）', () => {
    const fs = new MemoryWriteFs();
    // 保险箱与市场各有一份 airbnb：合并卡片主本为 vault，市场副本在 variants
    addSkill(fs, SOURCES.vaultSkillsDir, 'airbnb', '保险箱版', '正文');
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '市场版', '正文');
    // 直接按市场路径构造一个独立卡片来源测试冲突：改名后与 vault 同名
    expectCurateError(
      () => curateVaultSkill({ id: 'airbnb', name: 'airbnb' }, makeDeps(fs)),
      400,
    );
  });

  it.each(['a/b', 'a\\b', 'foo.', ''])('非法名称 %j 拒绝沉淀（400）', (name) => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行预订', '正文');
    expectCurateError(() => curateVaultSkill({ id: 'airbnb', name }, makeDeps(fs)), 400);
  });

  it('编辑沉淀技能正文后来源标识保留（整文件替换）', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行预订技能', '# 旧正文');
    const deps = makeDeps(fs);
    curateVaultSkill({ id: 'airbnb' }, deps);

    const raw = fs.files.get('/hub/skills/airbnb/SKILL.md') ?? '';
    const edited = raw.replace('# 旧正文', '# 新正文');
    const updated = updateVaultSkill('airbnb', edited, deps);

    expect(updated.source).toContain('marketplace:');
    const after = fs.files.get('/hub/skills/airbnb/SKILL.md') ?? '';
    expect(after).toContain('# 新正文');
    expect(after).toContain('source: marketplace:');
  });
});

describe('项目技能（project）沉淀回归', () => {
  const PROJECT_SOURCES: SkillSources = { ...SOURCES, workspaceDirs: ['d:/trae/ws1'] };
  const projectSkillPath = 'd:/trae/ws1/.trae/skills/douyin-x/SKILL.md';

  it('项目技能沉淀：frontmatter source 记录 project:绝对路径，携带工作区名', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, 'd:/trae/ws1/.trae/skills', 'douyin-x', '抖音知识提取', '# 项目技能正文');

    const before = listSkills({ fs, sources: PROJECT_SOURCES, store: new MemoryStore() });
    const project = before.items.find((s) => s.id === 'douyin-x');
    expect(project?.origin).toBe('project');
    expect(project?.workspaceName).toBe('ws1');
    expect(before.countByOrigin.project).toBe(1);

    const skill = curateVaultSkill(
      { id: 'douyin-x' },
      { fs, sources: PROJECT_SOURCES, store: new MemoryStore() },
    );

    expect(skill.origin).toBe('vault');
    expect(skill.source).toBe(`project:${projectSkillPath}`);
    const raw = fs.files.get('/hub/skills/douyin-x/SKILL.md') ?? '';
    expect(raw).toContain(`source: project:${projectSkillPath}`);
    expect(raw).toContain('# 项目技能正文');
    // 源项目技能不被移动或删除
    expect(fs.files.get(projectSkillPath)).toContain('项目技能正文');

    const after = listSkills({ fs, sources: PROJECT_SOURCES, store: new MemoryStore() });
    // 翻转守恒：同名卡片主本变 vault，项目副本保留在 variants
    expect(after.total).toBe(1);
    expect(after.countByOrigin).toMatchObject({ project: 0, vault: 1 });
    const card = after.items[0];
    expect(card.origin).toBe('vault');
    expect(card.variants).toContain(projectSkillPath);
  });

  it('保险箱已存在同名时项目技能沉淀被拒（400），源文件不动', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, 'd:/trae/ws1/.trae/skills', 'douyin-x', '项目版', '正文');
    addSkill(fs, SOURCES.vaultSkillsDir, 'douyin-x', '保险箱版', '正文');

    expectCurateError(
      () =>
        curateVaultSkill(
          { id: 'douyin-x' },
          { fs, sources: PROJECT_SOURCES, store: new MemoryStore() },
        ),
      400,
    );
    expect(fs.files.get(projectSkillPath)).toContain('正文');
  });
});

describe('curateVaultSkills 批量沉淀', () => {
  it('混合勾选：第三方创建成功，保险箱技能跳过并报告', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行', '正文a');
    addSkill(fs, SOURCES.vaultSkillsDir, 'mine', '自建', '正文b');
    addSkill(fs, SOURCES.userSkillsDir, 'x-tool', '个人', '正文c');

    const result = curateVaultSkills({ ids: ['airbnb', 'mine', 'x-tool'] }, makeDeps(fs));

    expect(result.created.map((s) => s.name).sort()).toEqual(['airbnb', 'x-tool']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe('mine');
    expect(result.failed[0]?.error).toContain('保险箱');
  });

  it('批量中个别失败不影响其他（已成功不回滚）', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行', '正文a');

    const result = curateVaultSkills({ ids: ['airbnb', 'ghost'] }, makeDeps(fs));

    expect(result.created.map((s) => s.name)).toEqual(['airbnb']);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.id).toBe('ghost');
    expect(fs.files.has('/hub/skills/airbnb/SKILL.md')).toBe(true);
  });

  it('勾选全部为保险箱技能时全部跳过', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.vaultSkillsDir, 'a1', '自建1', 'x');
    addSkill(fs, SOURCES.vaultSkillsDir, 'a2', '自建2', 'y');

    const result = curateVaultSkills({ ids: ['a1', 'a2'] }, makeDeps(fs));

    expect(result.created).toHaveLength(0);
    expect(result.failed).toHaveLength(2);
  });

  it('重复 id 去重后只沉淀一次', () => {
    const fs = new MemoryWriteFs();
    addSkill(fs, SOURCES.marketplaceSkillsDir, 'airbnb', '旅行', '正文');

    const result = curateVaultSkills({ ids: ['airbnb', 'airbnb'] }, makeDeps(fs));

    expect(result.created).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
  });

  it('ids 为空时抛参数错误', () => {
    const fs = new MemoryWriteFs();
    expectCurateError(() => curateVaultSkills({ ids: [] }, makeDeps(fs)), 400, 'ids');
  });
});
