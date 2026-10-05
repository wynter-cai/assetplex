/**
 * skills-inventory 单元测试
 *
 * spec: specs/skills-taxonomy.spec.md
 * 覆盖：跨来源发现、职能/来源自动分类、同名去重、手动覆盖持久化、兜底降级。
 */
import { describe, it, expect } from 'vitest';
import {
  discoverSkillFiles,
  classifyFunction,
  classifyOrigin,
  dedupeSkills,
  listSkills,
  getSkillRawContent,
  overrideSkillFunction,
  SKILL_FUNCTIONS,
  type SkillFs,
  type SkillSources,
  type SkillOrigin,
  type SkillFunction,
  type SkillOverrideStore,
} from '../../../src/core/skills-inventory.js';

const SKILL = (name: string, description: string, extra = ''): string =>
  `---\nname: ${name}\ndescription: ${description}${extra}\n---\n# ${name}\n正文内容\n`;

/** 以路径→内容的映射构造内存文件系统（目录由文件路径推导） */
function makeFs(files: Record<string, string>): SkillFs {
  const dirs = new Set<string>();
  for (const f of Object.keys(files)) {
    const parts = f.split('/');
    let cur = parts[0] === '' ? '/' : '';
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (i === 0 && seg === '') {
        cur = '/';
        continue;
      }
      cur = cur === '/' ? `/${seg}` : `${cur}/${seg}`;
      dirs.add(cur);
    }
  }
  const mtimes = new Map<string, string>();
  return {
    read: (p) => (Object.prototype.hasOwnProperty.call(files, p) ? files[p] : null),
    listDir: (p) => (dirs.has(p)
      ? Array.from(dirs)
          .filter((d) => d.startsWith(`${p}/`) && d.slice(p.length + 1).includes('/') === false)
          .map((d) => d.slice(p.length + 1))
          .sort()
      : []),
    dirMtime: (p) => mtimes.get(p) ?? null,
  };
}

class MemoryOverrideStore implements SkillOverrideStore {
  public data: Record<string, SkillFunction>;
  public saves = 0;
  constructor(initial: Record<string, SkillFunction> = {}) {
    this.data = initial;
  }
  load(): Record<string, SkillFunction> {
    return { ...this.data };
  }
  save(map: Record<string, SkillFunction>): void {
    this.saves += 1;
    this.data = { ...map };
  }
}

const SOURCES: SkillSources = {
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/u/.codebuddy/skills-marketplace/skills',
};

describe('discoverSkillFiles 跨来源发现', () => {
  it('发现用户/builtin global/builtin_skills/persona/插件/市场五类来源', () => {
    const fs = makeFs({
      [`${SOURCES.userSkillsDir}/my-s/SKILL.md`]: SKILL('my-s', '我的技能'),
      [`${SOURCES.builtinRoot}/global/skills/g-s/SKILL.md`]: SKILL('g-s', '全局内置'),
      [`${SOURCES.builtinSkillsDir}/TRAE-debugger/SKILL.md`]: SKILL('TRAE-debugger', '调试'),
      [`${SOURCES.builtinRoot}/code/default/skills/p-s/SKILL.md`]: SKILL('p-s', 'persona 捆绑'),
      [`${SOURCES.pluginsRoot}/org/plug/1.0.0/skills/x-s/SKILL.md`]: SKILL('x-s', '插件技能'),
      [`${SOURCES.marketplaceSkillsDir}/a-stock/SKILL.md`]: SKILL('a-stock', '股票数据'),
      // _shared 没有 SKILL.md，应被忽略
      [`${SOURCES.builtinSkillsDir}/_shared/readme.md`]: 'not a skill',
    });

    const found = discoverSkillFiles(fs, SOURCES);
    const origins = found.map((s) => s.origin).sort();
    expect(found).toHaveLength(6);
    expect(origins).toEqual<SkillOrigin[]>([
      'builtin', 'builtin', 'builtin', 'marketplace', 'personal', 'plugin',
    ]);
    const market = found.find((s) => s.origin === 'marketplace');
    expect(market?.tool).toBe('codebuddy');
    expect(found.every((s) => s.tool === 'trae' || s.tool === 'codebuddy')).toBe(true);
  });

  it('来源目录全部缺失时返回空数组且不抛错', () => {
    const fs = makeFs({});
    expect(discoverSkillFiles(fs, SOURCES)).toEqual([]);
  });
});

describe('classifyFunction 职能自动分类', () => {
  const cases: Array<[string, string, SkillFunction]> = [
    ['pdf-tools', '处理 pdf/docx/pptx 文档写作与导出', 'writing'],
    ['TRAE-browseruse', 'browser 浏览器自动化与网页抓取', 'browser'],
    ['sheet-helper', 'xlsx/csv 数据表格处理', 'data'],
    ['deploy-kit', 'docker/kubernetes 部署与 devops 运维', 'devops'],
    ['rag-builder', '接入 openai/llm 模型构建 RAG', 'ai-integration'],
    ['figma-mate', 'figma 设计稿与 UI 图标生成', 'design'],
    ['zap-flow', 'workflow 工作流自动化编排', 'workflow'],
    ['refactor-pro', 'typescript 代码重构与 debug', 'coding'],
    ['mystery', '完全无法判断用途的技能', 'other'],
  ];
  for (const [name, desc, expected] of cases) {
    it(`「${name}」→ ${expected}`, () => {
      expect(classifyFunction({ name, description: desc, text: '' })).toBe(expected);
    });
  }

  it('缺失 frontmatter 时依据正文关键词分类', () => {
    expect(classifyFunction({ name: 'whatever-dir', description: '', text: '本文用于生成 PDF 文档' })).toBe('writing');
  });
});

describe('classifyOrigin 来源判定', () => {
  it('按路径前缀判定四种来源', () => {
    expect(classifyOrigin(`${SOURCES.userSkillsDir}/x/SKILL.md`, SOURCES)).toBe('personal');
    expect(classifyOrigin(`${SOURCES.builtinRoot}/code/h/skills/y/SKILL.md`, SOURCES)).toBe('builtin');
    expect(classifyOrigin(`${SOURCES.builtinSkillsDir}/z/SKILL.md`, SOURCES)).toBe('builtin');
    expect(classifyOrigin(`${SOURCES.pluginsRoot}/o/p/1/skills/q/SKILL.md`, SOURCES)).toBe('plugin');
    expect(classifyOrigin(`${SOURCES.marketplaceSkillsDir}/m/SKILL.md`, SOURCES)).toBe('marketplace');
  });
});

describe('dedupeSkills 同名去重', () => {
  it('同名技能合并为主条目，其余副本进入 variants', () => {
    const fs = makeFs({
      [`${SOURCES.builtinRoot}/code/default/skills/pdf/SKILL.md`]: SKILL('pdf', '内置 pdf'),
      [`${SOURCES.builtinRoot}/work/hebe/skills/pdf/SKILL.md`]: SKILL('pdf', '另一 persona 的 pdf'),
      [`${SOURCES.userSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', '用户版 pdf', '\nversion: 2.1.0'),
    });
    const raws = discoverSkillFiles(fs, SOURCES);
    const skills = dedupeSkills(raws, {});

    expect(skills).toHaveLength(1);
    const main = skills[0];
    expect(main.name).toBe('pdf');
    expect(main.origin).toBe('personal'); // 优先级 personal 最高
    expect(main.version).toBe('2.1.0');
    expect(main.variants).toHaveLength(2);
    expect(main.id).toBe('pdf');
  });

  it('主条目来源优先级 personal > plugin > marketplace > builtin', () => {
    const fs = makeFs({
      [`${SOURCES.builtinRoot}/global/skills/s/SKILL.md`]: SKILL('s', 'b'),
      [`${SOURCES.marketplaceSkillsDir}/s/SKILL.md`]: SKILL('s', 'm'),
      [`${SOURCES.pluginsRoot}/o/p/1/skills/s/SKILL.md`]: SKILL('s', 'p'),
    });
    const [skill] = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skill.origin).toBe('plugin');
    expect(skill.variants).toHaveLength(2);
  });
});

describe('listSkills 聚合计数与筛选', () => {
  it('返回两套计数并支持 function/origin/search 筛选', () => {
    const fs = makeFs({
      [`${SOURCES.userSkillsDir}/mycode/SKILL.md`]: SKILL('mycode', 'typescript 编程重构'),
      [`${SOURCES.builtinRoot}/global/skills/TRAE-browseruse/SKILL.md`]: SKILL('TRAE-browseruse', 'browser 浏览器自动化'),
      [`${SOURCES.marketplaceSkillsDir}/a-stock/SKILL.md`]: SKILL('a-stock', '股票 csv 数据'),
    });
    const store = new MemoryOverrideStore();
    const all = listSkills({ fs, sources: SOURCES, store });
    expect(all.total).toBe(3);
    expect(all.countByFunction.coding).toBe(1);
    expect(all.countByFunction.browser).toBe(1);
    expect(all.countByFunction.data).toBe(1);
    expect(all.countByOrigin.marketplace).toBe(1);

    const onlyData = listSkills({ fs, sources: SOURCES, store, params: { function: 'data' } });
    expect(onlyData.items.map((s) => s.name)).toEqual(['a-stock']);
    // 计数仍反映全貌
    expect(onlyData.countByFunction.browser).toBe(1);

    const searched = listSkills({ fs, sources: SOURCES, store, params: { search: 'browser' } });
    expect(searched.items).toHaveLength(1);
  });
});

describe('手动覆盖职能分类', () => {
  it('覆盖后 functionOverridden=true 且重新扫描后保持，不改动 SKILL.md', () => {
    const files: Record<string, string> = {
      [`${SOURCES.userSkillsDir}/odd/SKILL.md`]: SKILL('odd', '奇怪用途'),
    };
    const fs = makeFs(files);
    const store = new MemoryOverrideStore();

    const before = listSkills({ fs, sources: SOURCES, store });
    expect(before.items[0].functionCategory).toBe('other');
    expect(before.items[0].functionOverridden).toBe(false);

    const updated = overrideSkillFunction('odd', 'data', { fs, sources: SOURCES, store });
    expect(updated?.functionCategory).toBe('data');
    expect(updated?.functionOverridden).toBe(true);
    expect(store.saves).toBe(1);

    // 重新扫描（模拟规则更新/重启）
    const after = listSkills({ fs, sources: SOURCES, store });
    expect(after.items[0].functionCategory).toBe('data');
    expect(after.items[0].functionOverridden).toBe(true);

    // 原始 SKILL.md 未被写入
    expect(files[`${SOURCES.userSkillsDir}/odd/SKILL.md`]).toContain('奇怪用途');
    expect(files[`${SOURCES.userSkillsDir}/odd/SKILL.md`]).not.toContain('data');
  });

  it('非法职能抛错，不存在的技能 id 返回 null', () => {
    const fs = makeFs({ [`${SOURCES.userSkillsDir}/a/SKILL.md`]: SKILL('a', '编程') });
    const store = new MemoryOverrideStore();
    expect(() => overrideSkillFunction('a', 'nope' as SkillFunction, { fs, sources: SOURCES, store })).toThrow();
    expect(overrideSkillFunction('ghost', 'data', { fs, sources: SOURCES, store })).toBeNull();
  });
});

describe('缺失 frontmatter 兜底', () => {
  it('名称回退目录名、描述为空，依据正文分类', () => {
    const fs = makeFs({
      [`${SOURCES.userSkillsDir}/dir-name/SKILL.md`]: '# 无 frontmatter\n用于浏览器 browser 自动化',
    });
    const [skill] = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skill.name).toBe('dir-name');
    expect(skill.description).toBe('');
    expect(skill.functionCategory).toBe('browser');
  });

  it('SKILL_FUNCTIONS 常量包含 9 个职能', () => {
    expect(SKILL_FUNCTIONS).toHaveLength(9);
    expect(SKILL_FUNCTIONS).toContain('other');
  });
});

describe('getSkillRawContent 单个技能原文', () => {
  it('按 id 返回技能元信息与主副本 SKILL.md 原文', () => {
    const raw = SKILL('my-s', '我的技能');
    const fs = makeFs({
      [`${SOURCES.userSkillsDir}/my-s/SKILL.md`]: raw,
    });
    const store = new MemoryOverrideStore();
    const result = getSkillRawContent('my-s', { fs, sources: SOURCES, store });
    expect(result).not.toBeNull();
    expect(result?.skill.id).toBe('my-s');
    expect(result?.rawContent).toBe(raw);
  });

  it('id 不存在时返回 null', () => {
    const fs = makeFs({ [`${SOURCES.userSkillsDir}/my-s/SKILL.md`]: SKILL('my-s', '我的技能') });
    const result = getSkillRawContent('nope', { fs, sources: SOURCES, store: new MemoryOverrideStore() });
    expect(result).toBeNull();
  });
});
