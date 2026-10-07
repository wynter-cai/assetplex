/**
 * 智能体只读盘点服务测试
 *
 * spec: agents-inventory.spec.md
 * 为保持纯逻辑与可测，所有文件系统访问通过注入的 fs 参数提供。
 */

import { describe, it, expect } from 'vitest';
import { parseTraePersonas, parseCustomAgentFiles, parseTraeCustomAgents, parseCodeBuddyExperts, parsePluginAgents, parseHubAgents, listAgents, getAgentRawContent } from '../../../src/core/agent-inventory.js';
import type { AgentFs } from '../../../src/core/agent-inventory.js';

/** 构造内存文件系统 */
function makeFs(files: Record<string, string>, dirMtimes: Record<string, string> = {}): AgentFs {
  return {
    read: (p: string): string | null => files[p] ?? null,
    listDir: (p: string): string[] => {
      const prefix = p.replace(/[/\\]+$/, '');
      const names = new Set<string>();
      for (const f of Object.keys(files)) {
        const norm = f.replace(/\\/g, '/');
        const base = prefix.replace(/\\/g, '/');
        if (norm.startsWith(base + '/')) {
          const rest = norm.slice(base.length + 1);
          const seg = rest.split('/')[0];
          if (seg) names.add(seg);
        }
      }
      return Array.from(names).sort();
    },
    dirMtime: (p: string): string | null => dirMtimes[p] ?? null,
  };
}

describe('parseTraePersonas', () => {
  const builtinRoot = '/home/u/.trae-cn/builtin';

  const soloManifest = JSON.stringify({
    agent_types: [
      {
        name: 'work',
        models: [
          { name: 'default', skills: [{ name: 'pdf', frontmatter: { name: 'pdf', description: 'PDF toolkit' } }] },
          { name: 'hebe', skills: [{ name: 'pdf', frontmatter: { name: 'pdf', description: 'PDF toolkit' } }] },
        ],
      },
      {
        name: 'code',
        models: [
          { name: 'default', skills: [{ name: 'debug', frontmatter: { name: 'debug', description: 'debug skill' } }] },
        ],
      },
    ],
  });

  it('为每个被引用的 persona 产生一个 builtin-persona 条目', () => {
    const fs = makeFs({ [`${builtinRoot}/manifests/solo.json`]: soloManifest });
    const agents = parseTraePersonas({ builtinRoot, fs });

    const personas = agents.filter((a) => a.kind === 'builtin-persona');
    const names = personas.map((a) => a.name).sort();
    expect(names).toEqual(['default', 'hebe']);
  });

  it('persona 条目的 userCreated 为 false，tool 为 trae', () => {
    const fs = makeFs({ [`${builtinRoot}/manifests/solo.json`]: soloManifest });
    const agents = parseTraePersonas({ builtinRoot, fs });

    for (const a of agents) {
      expect(a.tool).toBe('trae');
      expect(a.userCreated).toBe(false);
    }
  });

  it('sourcePath 指向对应 persona 技能目录', () => {
    const fs = makeFs({ [`${builtinRoot}/manifests/solo.json`]: soloManifest });
    const agents = parseTraePersonas({ builtinRoot, fs });

    const hebe = agents.find((a) => a.name === 'hebe');
    expect(hebe?.sourcePath).toBe(`${builtinRoot}/work/hebe/skills`);
  });

  it('manifests 缺失时返回空数组不抛错', () => {
    const fs = makeFs({});
    expect(parseTraePersonas({ builtinRoot, fs })).toEqual([]);
  });

it('同名 persona 跨 agentType 去重，保留首次出现', () => {
    const fs = makeFs({ [`${builtinRoot}/manifests/solo.json`]: soloManifest });
    const agents = parseTraePersonas({ builtinRoot, fs });
    // work 下 default 与 code 下 default 同名，视为同一 persona
    const defaults = agents.filter((a) => a.name === 'default');
    expect(defaults.length).toBe(1);
  });
});

describe('parseCustomAgentFiles', () => {
  it('解析 Claude agents/*.md 的 frontmatter 为 custom-subagent', () => {
    const claudeDir = '/home/u/.claude';
    const md = `---\nname: code-reviewer\ndescription: 审查代码的专家\ntools: Read, Grep\n---\n# Code Reviewer\n正文`;
    const fs = makeFs({ [`${claudeDir}/agents/code-reviewer.md`]: md });

    const agents = parseCustomAgentFiles({ claudeDir, fs });
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('code-reviewer');
    expect(agents[0].description).toBe('审查代码的专家');
    expect(agents[0].kind).toBe('custom-subagent');
    expect(agents[0].tool).toBe('claude');
    expect(agents[0].userCreated).toBe(true);
    expect(agents[0].extra?.tools).toBe('Read, Grep');
  });

  it('解析 Codex config.toml 内嵌 agents', () => {
    const codexDir = '/home/u/.codex';
    const toml = `[agents.reviewer]\nmodel = "gpt"\nprompt = "审查代码"\n`;
    const fs = makeFs({ [`${codexDir}/config.toml`]: toml });

    const agents = parseCustomAgentFiles({ codexDir, fs });
    const reviewer = agents.find((a) => a.name === 'reviewer');
    expect(reviewer).toBeDefined();
    expect(reviewer?.kind).toBe('custom-subagent');
    expect(reviewer?.tool).toBe('codex');
    expect(reviewer?.description).toBe('审查代码');
    expect(reviewer?.extra?.model).toBe('gpt');
  });

  it('无 frontmatter name 时回退为文件名', () => {
    const claudeDir = '/home/u/.claude';
    const fs = makeFs({ [`${claudeDir}/agents/my-agent.md`]: '# 无 frontmatter' });
    const agents = parseCustomAgentFiles({ claudeDir, fs });
    expect(agents[0].name).toBe('my-agent');
  });

  it('目录缺失时返回空数组', () => {
    const fs = makeFs({});
    expect(parseCustomAgentFiles({ claudeDir: '/nope', fs })).toEqual([]);
  });
});

describe('parseTraeCustomAgents 约定目录（spec: fix-scan-count-gaps）', () => {
  it('解析 ~/.trae-cn/agents/*.md 为 tool=trae 的 custom-subagent', () => {
    const agentsDir = '/home/u/.trae-cn/agents';
    const md = '---\nname: ui-designer\ndescription: UI 设计专家\n---\n# UI Designer\n提示词正文';
    const fs = makeFs({ [`${agentsDir}/ui-designer.md`]: md });

    const agents = parseTraeCustomAgents({ agentsDir, fs });

    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe('ui-designer');
    expect(agents[0].description).toBe('UI 设计专家');
    expect(agents[0].tool).toBe('trae');
    expect(agents[0].kind).toBe('custom-subagent');
    expect(agents[0].userCreated).toBe(true);
  });

  it('未配置目录或目录缺失时返回空数组', () => {
    expect(parseTraeCustomAgents({ agentsDir: '/nope', fs: makeFs({}) })).toEqual([]);
    expect(parseTraeCustomAgents({ fs: makeFs({}) })).toEqual([]);
  });

  it('listAgents 聚合纳入 TRAE 约定目录智能体并计入 countByTool.trae', () => {
    const fs = makeFs({
      '/h/.trae-cn/builtin/manifests/solo.json': JSON.stringify({
        agent_types: [{ name: 'work', models: [{ name: 'hebe' }] }],
      }),
      '/h/.trae-cn/agents/ui-designer.md': '---\nname: ui-designer\ndescription: UI 设计\n---',
    });
    const result = listAgents({
      fs,
      sources: {
        trae: { builtinRoot: '/h/.trae-cn/builtin', customAgentsDir: '/h/.trae-cn/agents' },
        claude: { claudeDir: '/h/.claude' },
        codebuddy: { codebuddyDir: '/h/.codebuddy' },
        codex: { codexDir: '/h/.codex' },
        pluginsRoot: '/h/.trae-cn/plugins',
        hub: { agentsDir: '/h/hub/agents' },
      },
    });

    const designer = result.items.find((a) => a.name === 'ui-designer');
    expect(designer).toBeDefined();
    expect(designer?.tool).toBe('trae');
    expect(designer?.kind).toBe('custom-subagent');
    expect(result.countByTool.trae).toBe(2);
  });
});

describe('parseCodeBuddyExperts', () => {
  const codebuddyDir = '/home/u/.codebuddy';

  it('为每个有名称的 expert session 产生 expert 条目', () => {
    const json = JSON.stringify({
      sessions: {
        s1: { name: '架构师', description: '系统设计' },
        s2: { expertName: '测试专家', desc: '写测试' },
      },
    });
    const fs = makeFs({ [`${codebuddyDir}/expert-history.json`]: json });
    const agents = parseCodeBuddyExperts({ codebuddyDir, fs });

    expect(agents).toHaveLength(2);
    expect(agents[0].kind).toBe('expert');
    expect(agents[0].tool).toBe('codebuddy');
    expect(agents.map((a) => a.name).sort()).toEqual(['架构师', '测试专家']);
  });

  it('sessions 为空对象时不产生条目不报错', () => {
    const fs = makeFs({ [`${codebuddyDir}/expert-history.json`]: JSON.stringify({ sessions: {} }) });
    expect(parseCodeBuddyExperts({ codebuddyDir, fs })).toEqual([]);
  });

  it('文件缺失时返回空数组', () => {
    const fs = makeFs({});
    expect(parseCodeBuddyExperts({ codebuddyDir, fs })).toEqual([]);
  });
});

describe('parsePluginAgents', () => {
  const pluginsRoot = '/home/u/.trae-cn/plugins';

  it('携带独立 agent 定义的插件产生 plugin-agent 条目', () => {
    const agentMd = `---\nname: lark-helper\ndescription: 飞书助手\n---\n正文`;
    const pluginJson = JSON.stringify({ name: 'lark', version: '1.0.5' });
    const fs = makeFs({
      [`${pluginsRoot}/trae-remote-official/lark/1.0.5/.trae-plugin/plugin.json`]: pluginJson,
      [`${pluginsRoot}/trae-remote-official/lark/1.0.5/agents/lark-helper.md`]: agentMd,
    });

    const agents = parsePluginAgents({ pluginsRoot, fs });
    expect(agents).toHaveLength(1);
    expect(agents[0].kind).toBe('plugin-agent');
    expect(agents[0].name).toBe('lark-helper');
    expect(agents[0].extra?.plugin).toBe('lark');
    expect(agents[0].extra?.version).toBe('1.0.5');
  });

  it('只有 skills 无 agents 的插件不产生条目', () => {
    const fs = makeFs({
      [`${pluginsRoot}/p/lark/1.0.5/skills/x/SKILL.md`]: '---\nname: x\n---',
    });
    expect(parsePluginAgents({ pluginsRoot, fs })).toEqual([]);
  });
});

describe('listAgents 聚合', () => {
  const builtinRoot = '/h/.trae-cn/builtin';
  const claudeDir = '/h/.claude';

  function setup(): AgentFs {
    return makeFs({
      [`${builtinRoot}/manifests/solo.json`]: JSON.stringify({
        agent_types: [
          { name: 'work', models: [{ name: 'hebe', skills: [{ name: 'pdf', frontmatter: { name: 'pdf', description: 'pdf' } }] }] },
        ],
      }),
      [`${claudeDir}/agents/zzz.md`]: '---\nname: zzz\ndescription: z\n---',
      [`${claudeDir}/agents/aaa.md`]: '---\nname: aaa\ndescription: a\n---',
    });
  }

  const sources = {
    trae: { builtinRoot: '/h/.trae-cn/builtin' },
    claude: { claudeDir },
    codebuddy: { codebuddyDir: '/h/.codebuddy' },
    codex: { codexDir: '/h/.codex' },
    pluginsRoot: '/h/.trae-cn/plugins',
    hub: { agentsDir: '/h/hub/agents' },
  };

  it('聚合全部来源并按自建优先、名称排序', () => {
    const fs = setup();
    const result = listAgents({ fs, sources });
    expect(result.total).toBe(3);
    // 两个 custom-subagent（自建）在前，按名称 aaa < zzz，persona 最后
    expect(result.items.map((a) => a.name)).toEqual(['aaa', 'zzz', 'hebe']);
  });

  it('按 kind 筛选', () => {
    const fs = setup();
    const result = listAgents({ fs, sources, params: { kind: 'custom-subagent' } });
    expect(result.items.every((a) => a.kind === 'custom-subagent')).toBe(true);
    expect(result.total).toBe(2);
  });

  it('按 tool 筛选（支持逗号分隔多选）', () => {
    const fs = setup();
    const result = listAgents({ fs, sources, params: { tool: 'trae' } });
    expect(result.items.every((a) => a.tool === 'trae')).toBe(true);
    expect(result.total).toBe(1);
  });

  it('关键字匹配名称与描述', () => {
    const fs = setup();
    const result = listAgents({ fs, sources, params: { search: 'aaa' } });
    expect(result.items.map((a) => a.name)).toEqual(['aaa']);
  });

  it('返回按 kind 与 tool 的计数（基于筛选后全集）', () => {
    const fs = setup();
    const result = listAgents({ fs, sources });
    expect(result.countByKind['custom-subagent']).toBe(2);
    expect(result.countByKind['builtin-persona']).toBe(1);
    expect(result.countByTool.claude).toBe(2);
    expect(result.countByTool.trae).toBe(1);
  });

  it('非法 kind 抛错', () => {
    const fs = setup();
    expect(() => listAgents({ fs, sources, params: { kind: 'nope' as never } })).toThrow(/kind/);
  });
});

describe('getAgentRawContent', () => {
  it('返回智能体及其原始定义内容', () => {
    const claudeDir = '/h/.claude';
    const md = '---\nname: aaa\ndescription: a\n---\n正文内容';
    const fs = makeFs({ [`${claudeDir}/agents/aaa.md`]: md });
    const sources = { trae: { builtinRoot: '/h/.trae-cn/builtin' }, claude: { claudeDir }, codebuddy: { codebuddyDir: '/h/.codebuddy' }, codex: { codexDir: '/h/.codex' }, pluginsRoot: '/h/.trae-cn/plugins', hub: { agentsDir: '/h/hub/agents' } };

    const result = getAgentRawContent('claude:custom-subagent:aaa', { fs, sources });
    expect(result?.agent.name).toBe('aaa');
    expect(result?.rawContent).toContain('正文内容');
  });

  it('id 不存在返回 null', () => {
    const fs = makeFs({});
    const sources = { trae: { builtinRoot: '/x' }, claude: { claudeDir: '/x' }, codebuddy: { codebuddyDir: '/x' }, codex: { codexDir: '/x' }, pluginsRoot: '/x', hub: { agentsDir: '/x/hub/agents' } };
    expect(getAgentRawContent('nope', { fs, sources })).toBeNull();
  });
});

describe('parseHubAgents 保险箱智能体发现', () => {
  const agentsDir = '/h/hub/agents';

  it('hub agents/*.md 解析为 custom-subagent（tool=hub、userCreated=true）', () => {
    const fs = makeFs({
      [`${agentsDir}/审查员.md`]: '---\nname: 审查员\ndescription: 审查代码\n---\n正文',
    });
    const agents = parseHubAgents({ agentsDir, fs });
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('hub:custom-subagent:审查员');
    expect(agents[0].tool).toBe('hub');
    expect(agents[0].kind).toBe('custom-subagent');
    expect(agents[0].userCreated).toBe(true);
    expect(agents[0].description).toBe('审查代码');
  });

  it('无 frontmatter name 时回退为文件名', () => {
    const fs = makeFs({ [`${agentsDir}/note.md`]: '# 无 frontmatter' });
    const agents = parseHubAgents({ agentsDir, fs });
    expect(agents[0].name).toBe('note');
    expect(agents[0].id).toBe('hub:custom-subagent:note');
  });

  it('目录缺失返回空数组', () => {
    const fs = makeFs({});
    expect(parseHubAgents({ agentsDir, fs })).toEqual([]);
  });
});

describe('listAgents 纳入保险箱来源', () => {
  const hubAgentsDir = '/h/hub/agents';

  it('hub 智能体进入聚合列表并计入 countByTool.hub', () => {
    const fs = makeFs({
      [`${hubAgentsDir}/note.md`]: '---\nname: note\ndescription: hub 里的笔记专家\n---',
    });
    const sources = {
      trae: { builtinRoot: '/h/.trae-cn/builtin' },
      claude: { claudeDir: '/h/.claude' },
      codebuddy: { codebuddyDir: '/h/.codebuddy' },
      codex: { codexDir: '/h/.codex' },
      pluginsRoot: '/h/.trae-cn/plugins',
      hub: { agentsDir: hubAgentsDir },
    };
    const result = listAgents({ fs, sources });
    expect(result.total).toBe(1);
    expect(result.countByTool.hub).toBe(1);
    expect(result.items[0].tool).toBe('hub');
  });

  it('符号链接场景：hub 与 claude 同真实路径只保留一条且保留 hub', () => {
    const hubPath = `${hubAgentsDir}/note.md`;
    const claudePath = '/h/.claude/agents/note.md';
    const base = makeFs({
      [hubPath]: '---\nname: note\ndescription: hub 版\n---',
      [claudePath]: '---\nname: note\ndescription: claude 版\n---',
    });
    const fs: AgentFs = { ...base, realpath: () => '/real/agents/note.md' };
    const sources = {
      trae: { builtinRoot: '/h/.trae-cn/builtin' },
      claude: { claudeDir: '/h/.claude' },
      codebuddy: { codebuddyDir: '/h/.codebuddy' },
      codex: { codexDir: '/h/.codex' },
      pluginsRoot: '/h/.trae-cn/plugins',
      hub: { agentsDir: hubAgentsDir },
    };
    const result = listAgents({ fs, sources });
    expect(result.total).toBe(1);
    expect(result.items[0].tool).toBe('hub');
    expect(result.items[0].sourcePath).toBe(hubPath);
  });
});
