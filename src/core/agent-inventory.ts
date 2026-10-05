/**
 * 智能体只读盘点服务
 *
 * 从各工具配置目录发现子智能体，统一为 AgentInfo 模型。
 * 纯逻辑：所有文件系统访问通过注入的 AgentFs 提供，便于测试且不直接依赖 fs。
 *
 * spec: agents-inventory.spec.md
 */

import * as TOML from '@iarna/toml';

// ============ 类型 ============

export type AgentTool = 'trae' | 'codebuddy' | 'claude' | 'codex';

export type AgentKind =
  | 'custom-subagent'
  | 'expert'
  | 'builtin-persona'
  | 'plugin-agent';

export interface AgentInfo {
  id: string;
  name: string;
  description: string;
  tool: AgentTool;
  kind: AgentKind;
  sourcePath: string;
  lastModifiedAt: string | null;
  userCreated: boolean;
  extra?: Record<string, string>;
}

/** 文件系统抽象（只读） */
export interface AgentFs {
  /** 读取文件文本；不存在返回 null */
  read(absolutePath: string): string | null;
  /** 列出目录直接子项（文件与目录名） */
  listDir(absolutePath: string): string[];
  /** 目录修改时间；不可得返回 null */
  dirMtime(absolutePath: string): string | null;
}

export interface ListAgentsParams {
  tool?: string;
  kind?: AgentKind;
  search?: string;
}

export interface ListAgentsResult {
  items: AgentInfo[];
  total: number;
  countByKind: Record<AgentKind, number>;
  countByTool: Record<AgentTool, number>;
}

/** 各来源根目录配置 */
export interface AgentSources {
  trae: { builtinRoot: string };
  claude: { claudeDir: string };
  codebuddy: { codebuddyDir: string };
  codex: { codexDir: string };
  pluginsRoot: string;
}

// ============ frontmatter 解析 ============

interface ParsedFrontmatter {
  data: Record<string, string>;
  body: string;
}

/** 解析 Markdown 开头的 YAML-ish frontmatter（仅支持 key: value 扁平结构） */
function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(content);
  if (!match) return { data: {}, body: content };

  const data: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    data[key] = value;
  }
  return { data, body: content.slice(match[0].length) };
}

function makeAgentId(tool: AgentTool, kind: AgentKind, name: string): string {
  return `${tool}:${kind}:${name}`;
}

// ============ TRAE 内置 persona ============

interface SoloManifestSkill {
  name?: string;
  frontmatter?: { name?: string; description?: string };
}
interface SoloManifestModel {
  name?: string;
  skills?: SoloManifestSkill[];
}
interface SoloManifestAgentType {
  name?: string;
  models?: SoloManifestModel[];
}
interface SoloManifest {
  agent_types?: SoloManifestAgentType[];
}

/**
 * 解析 TRAE 内置 persona。
 *
 * solo.json 中每个 agent_type（code/work/design）下的每个 model 名即一个 persona。
 * 同名 persona 在不同 agentType 下各自保留（技能目录不同）。
 */
export function parseTraePersonas(input: { builtinRoot: string; fs: AgentFs }): AgentInfo[] {
  const { builtinRoot, fs } = input;
  const raw = fs.read(`${builtinRoot}/manifests/solo.json`);
  if (raw === null) return [];

  let manifest: SoloManifest;
  try {
    manifest = JSON.parse(raw) as SoloManifest;
  } catch {
    return [];
  }

  const agents: AgentInfo[] = [];
  const seen = new Set<string>();

  for (const agentType of manifest.agent_types ?? []) {
    const typeName = agentType.name ?? '';
    for (const model of agentType.models ?? []) {
      const personaName = model.name ?? '';
      if (!personaName) continue;

      // 收集该 persona 下技能描述，作为 persona 描述
      const skillDescs = (model.skills ?? [])
        .map((s) => s.frontmatter?.description ?? '')
        .filter((d): d is string => d.length > 0);

      const sourcePath = `${builtinRoot}/${typeName}/${personaName}/skills`;
      if (seen.has(personaName)) continue;
      seen.add(personaName);

      agents.push({
        id: makeAgentId('trae', 'builtin-persona', personaName),
        name: personaName,
        description: skillDescs.slice(0, 3).join('；'),
        tool: 'trae',
        kind: 'builtin-persona',
        sourcePath,
        lastModifiedAt: fs.dirMtime(sourcePath),
        userCreated: false,
      });
    }
  }

  return agents;
}

// ============ 用户自建子代理 ============

/** 解析 Claude agents/*.md 与 Codex config.toml 内嵌 agents */
export function parseCustomAgentFiles(input: {
  claudeDir?: string;
  codexDir?: string;
  fs: AgentFs;
}): AgentInfo[] {
  const { fs } = input;
  const agents: AgentInfo[] = [];

  // Claude Code: agents/*.md
  if (input.claudeDir) {
    const agentsDir = `${input.claudeDir}/agents`;
    for (const entry of fs.listDir(agentsDir)) {
      if (!entry.endsWith('.md')) continue;
      const fullPath = `${agentsDir}/${entry}`;
      const content = fs.read(fullPath);
      if (content === null) continue;

      const { data } = parseFrontmatter(content);
      const fallbackName = entry.replace(/\.md$/, '');
      const extra: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (k !== 'name' && k !== 'description') extra[k] = v;
      }

      agents.push({
        id: makeAgentId('claude', 'custom-subagent', data.name ?? fallbackName),
        name: data.name ?? fallbackName,
        description: data.description ?? '',
        tool: 'claude',
        kind: 'custom-subagent',
        sourcePath: fullPath,
        lastModifiedAt: fs.dirMtime(fullPath),
        userCreated: true,
        ...(Object.keys(extra).length > 0 ? { extra } : {}),
      });
    }
  }

  // Codex: config.toml [agents.*]
  if (input.codexDir) {
    const configPath = `${input.codexDir}/config.toml`;
    const raw = fs.read(configPath);
    if (raw !== null) {
      let parsed: unknown;
      try {
        parsed = TOML.parse(raw);
      } catch {
        parsed = null;
      }
      const agentsTable = (parsed as { agents?: Record<string, Record<string, string>> } | null)?.agents;
      if (agentsTable && typeof agentsTable === 'object') {
        for (const [name, conf] of Object.entries(agentsTable)) {
          const extra: Record<string, string> = {};
          for (const [k, v] of Object.entries(conf)) {
            if (k !== 'prompt') extra[k] = String(v);
          }
          agents.push({
            id: makeAgentId('codex', 'custom-subagent', name),
            name,
            description: conf.prompt ?? '',
            tool: 'codex',
            kind: 'custom-subagent',
            sourcePath: configPath,
            lastModifiedAt: fs.dirMtime(configPath),
            userCreated: true,
            ...(Object.keys(extra).length > 0 ? { extra } : {}),
          });
        }
      }
    }
  }

  return agents;
}

// ============ CodeBuddy Expert ============

interface CodeBuddyHistory {
  sessions?: Record<string, { name?: string; expertName?: string; description?: string; desc?: string }>;
}

export function parseCodeBuddyExperts(input: { codebuddyDir: string; fs: AgentFs }): AgentInfo[] {
  const { codebuddyDir, fs } = input;
  const raw = fs.read(`${codebuddyDir}/expert-history.json`);
  if (raw === null) return [];

  let history: CodeBuddyHistory;
  try {
    history = JSON.parse(raw) as CodeBuddyHistory;
  } catch {
    return [];
  }

  const agents: AgentInfo[] = [];
  for (const [sessionId, session] of Object.entries(history.sessions ?? {})) {
    const name = session.name ?? session.expertName ?? '';
    if (!name) continue;
    agents.push({
      id: makeAgentId('codebuddy', 'expert', name),
      name,
      description: session.description ?? session.desc ?? '',
      tool: 'codebuddy',
      kind: 'expert',
      sourcePath: `${codebuddyDir}/expert-history.json#${sessionId}`,
      lastModifiedAt: null,
      userCreated: true,
    });
  }
  return agents;
}

// ============ 插件包内智能体 ============

/** 递归（受限深度）发现插件版本目录下的 agents/*.md */
export function parsePluginAgents(input: { pluginsRoot: string; fs: AgentFs }): AgentInfo[] {
  const { pluginsRoot, fs } = input;
  const agents: AgentInfo[] = [];

  // plugins/<org>/<plugin>/<version>/
  for (const org of fs.listDir(pluginsRoot)) {
    const orgDir = `${pluginsRoot}/${org}`;
    for (const plugin of fs.listDir(orgDir)) {
      const pluginDir = `${orgDir}/${plugin}`;
      for (const version of fs.listDir(pluginDir)) {
        const versionDir = `${pluginDir}/${version}`;

        // 读取插件元信息
        let pluginName = plugin;
        const pluginMetaRaw = fs.read(`${versionDir}/.trae-plugin/plugin.json`);
        if (pluginMetaRaw !== null) {
          try {
            const meta = JSON.parse(pluginMetaRaw) as { name?: string };
            pluginName = meta.name ?? plugin;
          } catch {
            // 忽略
          }
        }

        const agentsDir = `${versionDir}/agents`;
        for (const entry of fs.listDir(agentsDir)) {
          if (!entry.endsWith('.md')) continue;
          const fullPath = `${agentsDir}/${entry}`;
          const content = fs.read(fullPath);
          if (content === null) continue;
          const { data } = parseFrontmatter(content);
          const fallbackName = entry.replace(/\.md$/, '');

          agents.push({
            id: makeAgentId('trae', 'plugin-agent', data.name ?? fallbackName),
            name: data.name ?? fallbackName,
            description: data.description ?? '',
            tool: 'trae',
            kind: 'plugin-agent',
            sourcePath: fullPath,
            lastModifiedAt: fs.dirMtime(fullPath),
            userCreated: false,
            extra: { plugin: pluginName, version },
          });
        }
      }
    }
  }

  return agents;
}

// ============ 聚合 ============

const ALL_KINDS: AgentKind[] = ['custom-subagent', 'expert', 'builtin-persona', 'plugin-agent'];
const ALL_TOOLS: AgentTool[] = ['trae', 'codebuddy', 'claude', 'codex'];

function collectAll(fs: AgentFs, sources: AgentSources): AgentInfo[] {
  return [
    ...parseTraePersonas({ builtinRoot: sources.trae.builtinRoot, fs }),
    ...parseCustomAgentFiles({ claudeDir: sources.claude.claudeDir, codexDir: sources.codex.codexDir, fs }),
    ...parseCodeBuddyExperts({ codebuddyDir: sources.codebuddy.codebuddyDir, fs }),
    ...parsePluginAgents({ pluginsRoot: sources.pluginsRoot, fs }),
  ];
}

export function listAgents(input: {
  fs: AgentFs;
  sources: AgentSources;
  params?: ListAgentsParams;
}): ListAgentsResult {
  const { fs, sources, params = {} } = input;

  if (params.kind && !ALL_KINDS.includes(params.kind)) {
    throw new Error(`无效 kind：${params.kind}，支持：${ALL_KINDS.join(', ')}`);
  }

  let agents = collectAll(fs, sources);

  // 去重（id）
  const byId = new Map<string, AgentInfo>();
  for (const a of agents) {
    if (!byId.has(a.id)) byId.set(a.id, a);
  }
  agents = Array.from(byId.values());

  // 筛选
  if (params.kind) agents = agents.filter((a) => a.kind === params.kind);
  if (params.tool) {
    const wanted = params.tool.split(',').map((t) => t.trim()).filter(Boolean);
    agents = agents.filter((a) => wanted.includes(a.tool));
  }
  if (params.search && params.search.trim()) {
    const q = params.search.trim().toLowerCase();
    agents = agents.filter(
      (a) => a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q),
    );
  }

  // 排序：自建优先，其次名称
  agents.sort((a, b) => {
    if (a.userCreated !== b.userCreated) return a.userCreated ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const countByKind = emptyCounts<AgentKind>(ALL_KINDS);
  const countByTool = emptyCounts<AgentTool>(ALL_TOOLS);
  for (const a of agents) {
    countByKind[a.kind] += 1;
    countByTool[a.tool] += 1;
  }

  return { items: agents, total: agents.length, countByKind, countByTool };
}

function emptyCounts<T extends string>(keys: T[]): Record<T, number> {
  const obj = {} as Record<T, number>;
  for (const k of keys) obj[k] = 0;
  return obj;
}

// ============ 单智能体原始内容 ============

export function getAgentRawContent(id: string, input: { fs: AgentFs; sources: AgentSources }): { agent: AgentInfo; rawContent: string } | null {
  const all = collectAll(input.fs, input.sources);
  const agent = all.find((a) => a.id === id);
  if (!agent) return null;

  // 去掉 #fragment
  const filePath = agent.sourcePath.split('#')[0];
  const raw = input.fs.read(filePath);
  return { agent, rawContent: raw ?? '' };
}
