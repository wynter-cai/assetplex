/**
 * 保险箱技能写服务单元测试（T1.2）
 *
 * spec: add-skill-agent-write-management / specs/skill-write.spec.md
 * 纯逻辑：文件系统通过内存版 SkillWriteFs 注入。
 */

import { describe, it, expect } from 'vitest';
import {
  createVaultSkill,
  updateVaultSkill,
  deleteVaultSkill,
  SkillWriteError,
  type SkillWriteFs,
} from '../../../src/core/skill-write.js';
import { listSkills } from '../../../src/core/skills-inventory.js';
import type { SkillSources, SkillOverrideStore, SkillFunction } from '../../../src/core/skills-inventory.js';

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
};

function makeDeps(fs: MemoryWriteFs): { fs: MemoryWriteFs; sources: SkillSources; store: SkillOverrideStore } {
  return { fs, sources: SOURCES, store: new MemoryStore() };
}

function expectWriteError(fn: () => void, status: 400 | 404, messagePart?: string): void {
  try {
    fn();
    expect.fail('应当抛出 SkillWriteError');
  } catch (err) {
    expect(err).toBeInstanceOf(SkillWriteError);
    const e = err as SkillWriteError;
    expect(e.status).toBe(status);
    if (messagePart) expect(e.message).toContain(messagePart);
  }
}

describe('createVaultSkill 新建保险箱技能', () => {
  it('正常创建：写入 SKILL.md，frontmatter 含 name/description，返回 vault 条目', () => {
    const fs = new MemoryWriteFs();
    const skill = createVaultSkill(
      { name: '周报助手', description: '生成中文周报', content: '# 周报\n正文' },
      makeDeps(fs),
    );

    expect(skill.origin).toBe('vault');
    expect(skill.tool).toBe('hub');
    expect(skill.id).toBe('周报助手');
    expect(skill.name).toBe('周报助手');
    expect(skill.description).toBe('生成中文周报');
    expect(skill.sourcePath).toBe('/hub/skills/周报助手/SKILL.md');

    const raw = fs.files.get('/hub/skills/周报助手/SKILL.md');
    expect(raw).toContain('name: 周报助手');
    expect(raw).toContain('description: 生成中文周报');
    expect(raw).toContain('# 周报');
  });

  it('创建后立即纳入盘点（来源=保险箱，计数+1）', () => {
    const fs = new MemoryWriteFs();
    createVaultSkill({ name: '代码审查', content: '审查代码' }, makeDeps(fs));

    const list = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    expect(list.total).toBe(1);
    expect(list.items[0]?.origin).toBe('vault');
    expect(list.countByOrigin.vault).toBe(1);
  });

  it('描述含换行时替换为空格，避免破坏 frontmatter', () => {
    const fs = new MemoryWriteFs();
    createVaultSkill({ name: 'a', description: '第一行\n第二行', content: '' }, makeDeps(fs));
    const raw = fs.files.get('/hub/skills/a/SKILL.md') ?? '';
    expect(raw).toContain('description: 第一行 第二行');
  });

  it('重名拒绝（跨全部来源，大小写不敏感）', () => {
    const fs = new MemoryWriteFs();
    fs.files.set(`${SOURCES.userSkillsDir}/pdf/SKILL.md`, '---\nname: pdf\ndescription: 已存在\n---');
    expectWriteError(
      () => createVaultSkill({ name: 'PDF', content: '' }, makeDeps(fs)),
      400,
      '同名',
    );
  });

  it.each(['', '   ', '.', '..', 'a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'foo.'])(
    '非法名称 %j 拒绝创建',
    (name) => {
      const fs = new MemoryWriteFs();
      expectWriteError(() => createVaultSkill({ name, content: '' }, makeDeps(fs)), 400);
    },
  );
});

describe('updateVaultSkill 编辑保险箱技能', () => {
  it('正常更新：整文件替换并返回刷新条目', () => {
    const fs = new MemoryWriteFs();
    createVaultSkill({ name: '周报助手', description: '旧', content: '旧正文' }, makeDeps(fs));

    const updated = updateVaultSkill('周报助手', '---\nname: 周报助手\ndescription: 新描述\n---\n新正文', makeDeps(fs));

    expect(updated.description).toBe('新描述');
    const raw = fs.files.get('/hub/skills/周报助手/SKILL.md') ?? '';
    expect(raw).toContain('新正文');
    expect(raw).not.toContain('旧正文');
  });

  it('id 大小写不敏感', () => {
    const fs = new MemoryWriteFs();
    createVaultSkill({ name: 'MySkill', content: 'x' }, makeDeps(fs));
    expect(() => updateVaultSkill('myskill', 'y', makeDeps(fs))).not.toThrow();
  });

  it('技能不存在返回 404', () => {
    const fs = new MemoryWriteFs();
    expectWriteError(() => updateVaultSkill('ghost', 'x', makeDeps(fs)), 404, '不存在');
  });

  it('非保险箱来源拒绝编辑', () => {
    const fs = new MemoryWriteFs();
    fs.files.set(`${SOURCES.userSkillsDir}/mine/SKILL.md`, '---\nname: mine\ndescription: 个人技能\n---');
    expectWriteError(() => updateVaultSkill('mine', 'x', makeDeps(fs)), 400);
  });
});

describe('deleteVaultSkill 删除保险箱技能', () => {
  it('正常删除：技能目录整体移除，列表不再显示', () => {
    const fs = new MemoryWriteFs();
    createVaultSkill({ name: '周报助手', content: 'x' }, makeDeps(fs));

    deleteVaultSkill('周报助手', makeDeps(fs));

    expect(fs.files.has('/hub/skills/周报助手/SKILL.md')).toBe(false);
    const list = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    expect(list.total).toBe(0);
  });

  it('删除保险箱技能时，同名工具副本保留', () => {
    const fs = new MemoryWriteFs();
    // 主本由外部直接写入布景：创建 API 会拒绝与已有来源同名
    fs.files.set(`${SOURCES.userSkillsDir}/周报助手/SKILL.md`, '---\nname: 周报助手\ndescription: 副本\n---');
    fs.files.set('/hub/skills/周报助手/SKILL.md', '---\nname: 周报助手\ndescription: 主本\n---');

    deleteVaultSkill('周报助手', makeDeps(fs));

    expect(fs.files.has('/hub/skills/周报助手/SKILL.md')).toBe(false);
    expect(fs.files.has(`${SOURCES.userSkillsDir}/周报助手/SKILL.md`)).toBe(true);
    const list = listSkills({ fs, sources: SOURCES, store: new MemoryStore() });
    expect(list.total).toBe(1);
    expect(list.items[0]?.origin).toBe('personal');
  });

  it('技能不存在返回 404', () => {
    const fs = new MemoryWriteFs();
    expectWriteError(() => deleteVaultSkill('ghost', makeDeps(fs)), 404, '不存在');
  });

  it('非保险箱来源拒绝删除', () => {
    const fs = new MemoryWriteFs();
    fs.files.set(`${SOURCES.userSkillsDir}/mine/SKILL.md`, '---\nname: mine\ndescription: 个人技能\n---');
    expectWriteError(() => deleteVaultSkill('mine', makeDeps(fs)), 400);
  });
});
