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
  overrideSkillFunctionsBatch,
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
  vaultSkillsDir: '/hub/skills',
  userSkillsDir: '/home/u/.trae-cn/skills',
  builtinRoot: '/home/u/.trae-cn/builtin',
  builtinSkillsDir: '/home/u/.trae-cn/builtin_skills',
  pluginsRoot: '/home/u/.trae-cn/plugins',
  marketplaceSkillsDir: '/home/u/.codebuddy/skills-marketplace/skills',
  workspaceDirs: [],
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
  it('覆盖后 functionSource=manual 且重新扫描后保持，不改动 SKILL.md；未覆盖为 keyword', () => {
    const files: Record<string, string> = {
      [`${SOURCES.userSkillsDir}/odd/SKILL.md`]: SKILL('odd', '奇怪用途'),
    };
    const fs = makeFs(files);
    const store = new MemoryOverrideStore();

    const before = listSkills({ fs, sources: SOURCES, store });
    expect(before.items[0].functionCategory).toBe('other');
    expect(before.items[0].functionSource).toBe('keyword');

    const updated = overrideSkillFunction('odd', 'data', { fs, sources: SOURCES, store });
    expect(updated?.functionCategory).toBe('data');
    expect(updated?.functionSource).toBe('manual');
    expect(store.saves).toBe(1);

    // 重新扫描（模拟规则更新/重启）
    const after = listSkills({ fs, sources: SOURCES, store });
    expect(after.items[0].functionCategory).toBe('data');
    expect(after.items[0].functionSource).toBe('manual');

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

describe('overrideSkillFunctionsBatch 批量覆盖', () => {
  function setup(files: Record<string, string>): { fs: SkillFs; store: MemoryOverrideStore } {
    return { fs: makeFs(files), store: new MemoryOverrideStore() };
  }

  it('一次调用批量更新多个技能，只保存一次', () => {
    const { fs, store } = setup({
      [`${SOURCES.userSkillsDir}/a/SKILL.md`]: SKILL('a', '奇怪用途一'),
      [`${SOURCES.userSkillsDir}/b/SKILL.md`]: SKILL('b', '奇怪用途二'),
      [`${SOURCES.userSkillsDir}/c/SKILL.md`]: SKILL('c', '奇怪用途三'),
    });

    const result = overrideSkillFunctionsBatch(['a', 'B', 'c'], 'data', { fs, sources: SOURCES, store });

    expect(result.updated).toHaveLength(3);
    expect(result.missing).toEqual([]);
    // id 大小写不敏感
    const b = result.updated.find((s) => s.id === 'b');
    expect(b?.functionCategory).toBe('data');
    expect(b?.functionSource).toBe('manual');
    // 只持久化一次
    expect(store.saves).toBe(1);
    // 重新扫描后覆盖保持
    const after = listSkills({ fs, sources: SOURCES, store });
    expect(after.items.every((s) => s.functionCategory === 'data')).toBe(true);
  });

  it('部分 id 不存在时更新其余并报告 missing', () => {
    const { fs, store } = setup({
      [`${SOURCES.userSkillsDir}/a/SKILL.md`]: SKILL('a', '用途一'),
      [`${SOURCES.userSkillsDir}/b/SKILL.md`]: SKILL('b', '用途二'),
    });

    const result = overrideSkillFunctionsBatch(['a', 'ghost'], 'writing', { fs, sources: SOURCES, store });

    expect(result.updated.map((s) => s.id)).toEqual(['a']);
    expect(result.missing).toEqual(['ghost']);
    expect(store.saves).toBe(1);
  });

  it('非法职能抛错且不写存储', () => {
    const { fs, store } = setup({
      [`${SOURCES.userSkillsDir}/a/SKILL.md`]: SKILL('a', '用途'),
    });
    expect(() =>
      overrideSkillFunctionsBatch(['a'], 'nope' as SkillFunction, { fs, sources: SOURCES, store }),
    ).toThrow();
    expect(store.saves).toBe(0);
  });

  it('空 ids 返回空结果且不写存储', () => {
    const { fs, store } = setup({
      [`${SOURCES.userSkillsDir}/a/SKILL.md`]: SKILL('a', '用途'),
    });
    const result = overrideSkillFunctionsBatch([], 'data', { fs, sources: SOURCES, store });
    expect(result.updated).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(store.saves).toBe(0);
  });
});

describe('保险箱（vault）技能纳入盘点', () => {
  it('vault 目录下技能被发现：origin=vault、tool=hub', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/周报助手/SKILL.md`]: SKILL('周报助手', '生成中文周报'),
    });
    const found = discoverSkillFiles(fs, SOURCES);
    expect(found).toHaveLength(1);
    expect(found[0].origin).toBe('vault');
    expect(found[0].tool).toBe('hub');
    expect(found[0].sourcePath).toBe(`${SOURCES.vaultSkillsDir}/周报助手/SKILL.md`);
  });

  it('listSkills 计数包含 vault 来源', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/a/SKILL.md`]: SKILL('a', '用途'),
      [`${SOURCES.userSkillsDir}/b/SKILL.md`]: SKILL('b', '用途'),
    });
    const all = listSkills({ fs, sources: SOURCES, store: new MemoryOverrideStore() });
    expect(all.total).toBe(2);
    expect(all.countByOrigin.vault).toBe(1);
  });

  it('同名去重：vault 主本优先于 personal，其余副本进 variants', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', '保险箱版 pdf'),
      [`${SOURCES.userSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', '用户版 pdf'),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skills).toHaveLength(1);
    expect(skills[0].origin).toBe('vault');
    expect(skills[0].description).toBe('保险箱版 pdf');
    expect(skills[0].variants).toEqual([`${SOURCES.userSkillsDir}/pdf/SKILL.md`]);
  });

  it('符号链接场景：同一真实路径只保留一条且保留 vault 来源', () => {
    const vaultPath = `${SOURCES.vaultSkillsDir}/pdf/SKILL.md`;
    const personalPath = `${SOURCES.userSkillsDir}/pdf/SKILL.md`;
    const base = makeFs({
      [vaultPath]: SKILL('pdf', '保险箱版'),
      [personalPath]: SKILL('pdf', '用户版'),
    });
    // 模拟两个路径指向同一物理文件
    const fs: SkillFs = { ...base, realpath: () => '/real/pdf/SKILL.md' };

    const found = discoverSkillFiles(fs, SOURCES);
    expect(found).toHaveLength(1);
    expect(found[0].origin).toBe('vault');
    expect(found[0].sourcePath).toBe(vaultPath);
  });

  it('classifyOrigin 识别 vault 前缀', () => {
    expect(classifyOrigin(`${SOURCES.vaultSkillsDir}/x/SKILL.md`, SOURCES)).toBe('vault');
  });
});

describe('项目级技能 project（add-project-skills-discovery）', () => {
  const WS: SkillSources = {
    ...SOURCES,
    workspaceDirs: ['/d/demo/Zhihu', '/d/demo/Demo App', '/d/demo/Super Powers'],
  };
  const wsSkill = (ws: string, name: string): string =>
    `/d/demo/${ws}/.trae/skills/${name}/SKILL.md`;

  it('扫描各工作区 .trae/skills：origin=project、tool=trae、携带所属项目信息', () => {
    const fs = makeFs({
      [wsSkill('Zhihu', 'zhihu')]: SKILL('zhihu', '知乎写作'),
      [wsSkill('Demo App', 'douyin-knowledge-extraction')]: SKILL(
        'douyin-knowledge-extraction',
        '抖音知识萃取',
      ),
    });
    const found = discoverSkillFiles(fs, WS);
    expect(found).toHaveLength(2);
    const zhihu = found.find((s) => s.name === 'zhihu');
    expect(zhihu).toMatchObject({
      origin: 'project',
      tool: 'trae',
      workspaceName: 'Zhihu',
      workspacePath: '/d/demo/Zhihu',
    });
  });

  it('工作区没有 .trae/skills 时零贡献不报错', () => {
    const fs = makeFs({
      [wsSkill('Zhihu', 'zhihu')]: SKILL('zhihu', '知乎写作'),
      '/d/demo/Super Powers/README.md': 'no skills here',
    });
    const found = discoverSkillFiles(fs, WS);
    expect(found).toHaveLength(1);
    expect(found[0]?.workspaceName).toBe('Zhihu');
  });

  it('同名技能跨项目副本合并：主条目稳定、variants 收齐其余副本', () => {
    const fs = makeFs({
      [wsSkill('Zhihu', 'dup-skill')]: SKILL('dup-skill', '知乎版'),
      [wsSkill('Super Powers', 'dup-skill')]: SKILL('dup-skill', '改编版'),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, WS), {});
    expect(skills).toHaveLength(1);
    const primary = skills[0];
    expect(primary.workspaceName).toBe('Super Powers');
    expect(primary.variants).toEqual([wsSkill('Zhihu', 'dup-skill')]);
  });

  it('与市场技能同名时 project 胜出：计数计入 project，市场副本进 variants', () => {
    const fs = makeFs({
      [wsSkill('Super Powers', 'brainstorming')]: SKILL('brainstorming', '项目改编版'),
      [`${SOURCES.marketplaceSkillsDir}/brainstorming/SKILL.md`]: SKILL(
        'brainstorming',
        '市场版',
      ),
    });
    const all = listSkills({ fs, sources: WS, store: new MemoryOverrideStore() });
    expect(all.total).toBe(1);
    expect(all.countByOrigin.project).toBe(1);
    expect(all.countByOrigin.marketplace).toBe(0);
    expect(all.items[0]?.origin).toBe('project');
    expect(all.items[0]?.variants).toEqual([
      `${SOURCES.marketplaceSkillsDir}/brainstorming/SKILL.md`,
    ]);
  });

  it('classifyOrigin 按工作区前缀判定 project（容忍 Windows 反斜杠）', () => {
    expect(classifyOrigin(wsSkill('Zhihu', 'x'), WS)).toBe('project');
    expect(classifyOrigin('\\d\\Trae\\Zhihu\\.trae\\skills\\x\\SKILL.md', WS)).toBe('project');
    // 前缀边界：同前缀的另一目录不命中
    expect(classifyOrigin('/d/demo/Zhihu-backup/.trae/skills/x/SKILL.md', WS)).not.toBe('project');
  });

  it('项目技能被链接进保险箱时按真实路径去重并保留 vault', () => {
    const projectPath = wsSkill('Zhihu', 'zhihu');
    const vaultPath = `${SOURCES.vaultSkillsDir}/zhihu/SKILL.md`;
    const base = makeFs({
      [projectPath]: SKILL('zhihu', '项目版'),
      [vaultPath]: SKILL('zhihu', '保险箱版'),
    });
    const fs: SkillFs = { ...base, realpath: () => '/real/zhihu/SKILL.md' };
    const found = discoverSkillFiles(fs, WS);
    expect(found).toHaveLength(1);
    expect(found[0].origin).toBe('vault');
  });

  it('listSkills 支持 origin=project 筛选且 countByOrigin 含 project 键', () => {
    const store = new MemoryOverrideStore();
    const fs = makeFs({
      [wsSkill('Zhihu', 'zhihu')]: SKILL('zhihu', '知乎写作'),
      [`${SOURCES.userSkillsDir}/mine/SKILL.md`]: SKILL('mine', '全局个人技能'),
    });
    const onlyProject = listSkills({
      fs,
      sources: WS,
      store,
      params: { origin: 'project' },
    });
    expect(onlyProject.items.map((s) => s.id)).toEqual(['zhihu']);
    expect(onlyProject.countByOrigin.project).toBe(1);
    expect(onlyProject.countByOrigin.personal).toBe(1);
  });

  it('手动职能覆盖对 project 技能生效（manual 优先）', () => {
    const store = new MemoryOverrideStore();
    const fs = makeFs({ [wsSkill('Zhihu', 'zhihu')]: SKILL('zhihu', '知乎写作') });
    const updated = overrideSkillFunction('zhihu', 'data', { fs, sources: WS, store });
    expect(updated?.origin).toBe('project');
    expect(updated?.functionCategory).toBe('data');
    expect(updated?.functionSource).toBe('manual');
  });
});

describe('SkillInfo source 沉淀来源标识（add-skill-curation）', () => {
  it('vault 技能 frontmatter 的 source 字段透传到盘点条目', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/airbnb/SKILL.md`]: SKILL(
        'airbnb',
        '旅行预订',
        '\nsource: marketplace:/x/airbnb/SKILL.md',
      ),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skills).toHaveLength(1);
    expect(skills[0].source).toBe('marketplace:/x/airbnb/SKILL.md');
  });

  it('frontmatter 无 source 时条目 source 为 undefined（自建技能）', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/mine/SKILL.md`]: SKILL('mine', '自建技能'),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skills[0].source).toBeUndefined();
  });

  it('非 vault 来源技能不透传 source（source 仅表达沉淀来源）', () => {
    const fs = makeFs({
      [`${SOURCES.marketplaceSkillsDir}/x-tool/SKILL.md`]: SKILL('x-tool', '第三方', '\nsource: something-else'),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skills[0].origin).toBe('marketplace');
    expect(skills[0].source).toBeUndefined();
  });

  it('同名合并时取主副本（vault 优先）的 source', () => {
    const fs = makeFs({
      [`${SOURCES.vaultSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', '保险箱版', '\nsource: personal:/home/pdf/SKILL.md'),
      [`${SOURCES.userSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', '用户版'),
    });
    const skills = dedupeSkills(discoverSkillFiles(fs, SOURCES), {});
    expect(skills).toHaveLength(1);
    expect(skills[0].origin).toBe('vault');
    expect(skills[0].source).toBe('personal:/home/pdf/SKILL.md');
  });
});

describe('AI 分类盘点集成（优先级 手动 > AI > 关键词）', () => {
  const files = (): Record<string, string> => ({
    [`${SOURCES.userSkillsDir}/airbnb/SKILL.md`]: SKILL('airbnb', '订房助手'),
    [`${SOURCES.userSkillsDir}/pdf/SKILL.md`]: SKILL('pdf', 'pdf 文档'),
  });

  it('aiLookup 命中时分类生效且来源为 ai，盘点无 LLM 调用语义', () => {
    const fs = makeFs(files());
    const result = listSkills({
      fs, sources: SOURCES, store: new MemoryOverrideStore(),
      aiLookup: (raw) => (raw.includes('airbnb') ? 'workflow' : null),
    });
    const airbnb = result.items.find((s) => s.id === 'airbnb');
    expect(airbnb?.functionCategory).toBe('workflow');
    expect(airbnb?.functionSource).toBe('ai');
  });

  it('手动覆盖优先于 AI 缓存命中', () => {
    const fs = makeFs(files());
    const store = new MemoryOverrideStore({ pdf: 'data' });
    const result = listSkills({
      fs, sources: SOURCES, store,
      aiLookup: () => 'workflow',
    });
    const pdf = result.items.find((s) => s.id === 'pdf');
    expect(pdf?.functionCategory).toBe('data');
    expect(pdf?.functionSource).toBe('manual');
    // 无覆盖的 airbnb 用 AI 结果
    expect(result.items.find((s) => s.id === 'airbnb')?.functionSource).toBe('ai');
  });

  it('aiLookup 返回 null（hash 未命中）时回退关键词兜底', () => {
    const fs = makeFs(files());
    const result = listSkills({
      fs, sources: SOURCES, store: new MemoryOverrideStore(),
      aiLookup: () => null,
    });
    const pdf = result.items.find((s) => s.id === 'pdf');
    expect(pdf?.functionCategory).toBe('writing');
    expect(pdf?.functionSource).toBe('keyword');
  });

  it('不传 aiLookup 时行为与现状一致（全部 keyword/manual）', () => {
    const fs = makeFs(files());
    const result = listSkills({ fs, sources: SOURCES, store: new MemoryOverrideStore() });
    expect(result.items.every((s) => s.functionSource === 'keyword')).toBe(true);
  });

  it('aiLookup 收到的是 SKILL.md 原文（含 frontmatter，hash 建立在原文上）', () => {
    const fs = makeFs(files());
    const seen: string[] = [];
    listSkills({
      fs, sources: SOURCES, store: new MemoryOverrideStore(),
      aiLookup: (raw) => {
        seen.push(raw);
        return null;
      },
    });
    expect(seen.some((raw) => raw.startsWith('---\nname: airbnb'))).toBe(true);
  });
});
