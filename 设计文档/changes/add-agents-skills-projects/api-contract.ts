/**
 * API 契约：add-agents-skills-projects
 *
 * 本文件定义三个能力的 HTTP 接口契约（仅类型，不含实现）。
 * 所有接口仅由本地服务（127.0.0.1:17521）提供，不对外暴露。
 *
 * 路由前缀：
 *   /api/agents    智能体只读盘点
 *   /api/skills    技能分类全貌
 *   /api/projects  AI-Coding 项目可视化
 */

// ============================================================================
// 通用
// ============================================================================

/** 统一错误响应 */
export interface ErrorResponse {
  error: string;
}

// ============================================================================
// A. 智能体只读盘点  /api/agents
// ============================================================================

/** 智能体来源工具 */
export type AgentTool = 'trae' | 'codebuddy' | 'claude' | 'codex';

/** 智能体类型（按来源形态分类） */
export type AgentKind =
  | 'custom-subagent' // 用户自建子代理（Claude agents/*.md、Codex 内嵌）
  | 'expert' // CodeBuddy Expert/专家
  | 'builtin-persona' // TRAE 内置 persona（hebe/iris/thetis 等）
  | 'plugin-agent'; // 插件包内智能体

export interface AgentInfo {
  /** 稳定 ID：tool:kind:name */
  id: string;
  /** 智能体名称 */
  name: string;
  /** 描述（取自 frontmatter/正文首段，可能为空字符串） */
  description: string;
  /** 来源工具 */
  tool: AgentTool;
  /** 智能体类型 */
  kind: AgentKind;
  /** 定义文件/目录的绝对路径（本机路径） */
  sourcePath: string;
  /** 最后修改时间（ISO 字符串；无法获取时为 null） */
  lastModifiedAt: string | null;
  /** 是否用户自建（true=可迁移性高；false=工具内置） */
  userCreated: boolean;
  /** 工具专属的额外字段（如 model/tools），无统一 schema */
  extra?: Record<string, string>;
}

export interface ListAgentsParams {
  /** 按工具筛选（可多选，逗号分隔）；省略为全部 */
  tool?: string;
  /** 按类型筛选 */
  kind?: AgentKind;
  /** 名称/描述关键字 */
  search?: string;
}

export interface ListAgentsResult {
  items: AgentInfo[];
  total: number;
  /** 按 kind 聚合计数，用于前端全貌统计 */
  countByKind: Record<AgentKind, number>;
  /** 按 tool 聚合计数 */
  countByTool: Record<AgentTool, number>;
}

/**
 * GET /api/agents
 *   query: tool?, kind?, search?
 *   200: ListAgentsResult
 *   400: ErrorResponse（kind 非法）
 * 来源目录缺失时不报错，返回空集合并正常聚合。
 */

export interface GetAgentResult {
  agent: AgentInfo;
  /** 原始定义内容（Markdown/TOML/JSON 文本；目录型 persona 为其 manifest 摘要） */
  rawContent: string;
}

/**
 * GET /api/agents/:id
 *   200: GetAgentResult
 *   404: ErrorResponse
 * 只读，不提供 POST/PUT/DELETE。
 */

// ============================================================================
// B. 技能分类全貌  /api/skills
// ============================================================================

/** 职能分类（维度一） */
export type SkillFunction =
  | 'coding' // 编码开发
  | 'writing' // 文档写作
  | 'browser' // 浏览器自动化
  | 'data' // 数据处理
  | 'devops' // DevOps/部署
  | 'ai-integration' // AI 集成
  | 'design' // 设计创意
  | 'workflow' // 工作流自动化
  | 'other'; // 其他

/** 来源分类（维度二） */
export type SkillOrigin =
  | 'builtin' // 官方内置
  | 'plugin' // 插件自带
  | 'personal' // 个人自建
  | 'marketplace'; // 市场安装

export interface SkillInfo {
  /** 稳定 ID */
  id: string;
  /** 技能名（SKILL.md frontmatter name） */
  name: string;
  /** 描述 */
  description: string;
  /** 职能分类 */
  functionCategory: SkillFunction;
  /** 来源分类 */
  origin: SkillOrigin;
  /** 来源工具 */
  tool: string;
  /** SKILL.md 绝对路径 */
  sourcePath: string;
  /** 版本（frontmatter version，可能为空） */
  version: string;
  /** 职能分类是否被用户手动覆盖（true 时不再随自动规则变动） */
  functionOverridden: boolean;
  /** 同一技能在不同 persona/工具下的其他副本路径 */
  variants: string[];
}

export interface ListSkillsParams {
  /** 按职能筛选 */
  function?: SkillFunction;
  /** 按来源筛选 */
  origin?: SkillOrigin;
  /** 关键字 */
  search?: string;
}

export interface ListSkillsResult {
  items: SkillInfo[];
  total: number;
  countByFunction: Record<SkillFunction, number>;
  countByOrigin: Record<SkillOrigin, number>;
}

/**
 * GET /api/skills
 *   200: ListSkillsResult
 * 跨全部来源盘点（用户 skills、builtin persona 包、builtin_skills、插件、CodeBuddy 市场），
 * 同名技能去重为主条目，其余计入 variants。
 */

/** 覆盖某技能的职能分类 */
export interface OverrideSkillFunctionRequest {
  functionCategory: SkillFunction;
}

/**
 * PUT /api/skills/:id/function
 *   body: OverrideSkillFunctionRequest
 *   200: { skill: SkillInfo }
 *   400: ErrorResponse（function 非法）
 *   404: ErrorResponse
 * 覆盖结果持久化到 Hub 配置（.trae 元数据），不修改原始 SKILL.md。
 */

// ============================================================================
// C. AI-Coding 项目可视化  /api/projects
// ============================================================================

/** 项目内识别到的 AI 工具标记 */
export interface ProjectToolMarker {
  tool: string;
  /** 标记类型，如 ".trae 目录" / "AGENTS.md" / ".claude 目录" */
  marker: string;
  /** 标记文件/目录的相对路径 */
  path: string;
}

/** 项目资产统计 */
export interface ProjectAssetStats {
  /** 规则类文件数（.md in rules） */
  rules: number;
  /** 技能数 */
  skills: number;
  /** 文档数（*.md，不含规则/技能） */
  docs: number;
}

/** Git 信息 */
export interface ProjectGitInfo {
  isGitRepo: boolean;
  /** 当前分支（无法获取为 null） */
  branch: string | null;
  /** 是否有未提交变更（非 git 仓库为 false） */
  hasUncommittedChanges: boolean;
}

export interface ProjectInfo {
  id: string;
  /** 项目名（目录名） */
  name: string;
  /** 项目绝对路径 */
  path: string;
  /** 最近访问时间（workspaceStorage 的 mtime，ISO） */
  lastAccessedAt: string;
  /** 项目目录是否仍存在 */
  exists: boolean;
  tools: ProjectToolMarker[];
  assetStats: ProjectAssetStats;
  git: ProjectGitInfo;
}

export interface ListProjectsParams {
  /** "true" 时仅返回目录仍存在的项目 */
  existingOnly?: string;
  search?: string;
}

export interface ListProjectsResult {
  items: ProjectInfo[];
  total: number;
  existingCount: number;
}

/**
 * GET /api/projects
 *   200: ListProjectsResult
 * 主数据源：%APPDATA%/Trae CN/User/workspaceStorage/*\/workspace.json（真实路径 + mtime）；
 * 历史补充：~/.trae-cn/worktrees 名称。按最近访问倒序。
 */

/** 打开目标位置 */
export interface OpenProjectRequest {
  /** 打开方式 */
  target: 'explorer' | 'terminal' | 'ide';
}

/**
 * POST /api/projects/:id/open
 *   body: OpenProjectRequest
 *   200: { ok: true }
 *   400: ErrorResponse（target 非法 / 项目路径不存在）
 *   404: ErrorResponse
 * 服务端仅接受 path 属于已扫描项目清单内的请求，防止任意路径执行。
 */
