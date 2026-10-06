/**
 * API 契约：add-project-skills-discovery（项目级技能发现）
 *
 * 前后端共享类型。实施时：
 * - 后端 SkillInfo / SkillOrigin 扩展落在 src/core/skills-inventory.ts
 * - 前端镜像类型落在 web/src/types/api.ts
 */

// ============ 技能盘点的类型扩展 ============

export type SkillOrigin =
  | 'builtin'
  | 'plugin'
  | 'personal'
  | 'project' // 新增：TRAE 项目级技能（<workspace>/.trae/skills）
  | 'marketplace'
  | 'vault';

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  functionCategory:
    | 'coding'
    | 'writing'
    | 'browser'
    | 'data'
    | 'devops'
    | 'ai-integration'
    | 'design'
    | 'workflow'
    | 'other';
  origin: SkillOrigin;
  tool: string;
  sourcePath: string;
  version: string;
  functionSource: 'manual' | 'ai' | 'keyword';
  source?: string;
  variants: string[];

  /** 所属项目名（工作区目录名）；仅 origin='project' 有值 */
  workspaceName?: string;
  /** 所属项目工作区绝对路径；仅 origin='project' 有值 */
  workspacePath?: string;
}

/** GET /api/skills 响应中的计数：新增 project 键（六类齐全，无项目技能时为 0） */
export type CountByOrigin = Record<SkillOrigin, number>;

// ============ GET /api/workspaces ============

/** 工作区配置（持久化于本机 ~/.assetplex/workspaces.json，绝不上传） */
export interface WorkspacesConfig {
  /** 从 TRAE storage.json 自动发现（默认 true） */
  autoDiscover: boolean;
  /** 手动工作区根：可以是工作区本身或多个工作区的父目录；绝对路径、已规范化 */
  roots: string[];
  /** 从自动发现结果中排除的工作区绝对路径（已规范化） */
  disabledWorkspaces: string[];
}

export interface WorkspaceInfo {
  /** 规范化后的工作区绝对路径 */
  path: string;
  /** 工作区目录名（展示用，如 Zhihu） */
  name: string;
  /** 来源：自动发现 / 手动配置（同一目录两者命中时记 manual） */
  source: 'auto' | 'manual';
  /** <workspace>/.trae/skills 是否存在 */
  skillsDirExists: boolean;
  /** .trae/skills 下含 SKILL.md 的有效技能数 */
  skillCount: number;
  /** 自动发现但被用户禁用：不参与扫描，仅展示以便重新启用 */
  disabled?: boolean;
}

export interface WorkspacesResponse {
  config: WorkspacesConfig;
  /** 有效工作区（含被禁用的自动发现项，disabled=true）；手动配置中不可访问的根不进入列表 */
  workspaces: WorkspaceInfo[];
  /** 工作区总数超过上限被截断 */
  truncated: boolean;
  /** 工作区数量上限（默认 100） */
  maxWorkspaces: number;
  /** best-effort 告警：storage.json 不可读/损坏、手动根不存在等；无告警为空数组 */
  errors: string[];
}

// GET /api/workspaces
export type GetWorkspacesResult = WorkspacesResponse;

// ============ PUT /api/workspaces ============

/**
 * 更新请求体：所有字段可选（合并语义，undefined 字段保持原值）。
 * roots / disabledWorkspaces 整体替换；路径服务端规范化去重。
 * 非法（非绝对路径、非布尔、数量超上限）→ 400 { error: string }，原配置不变。
 */
export interface UpdateWorkspacesInput {
  autoDiscover?: boolean;
  roots?: string[];
  disabledWorkspaces?: string[];
}

// PUT /api/workspaces 成功返回更新后的完整全貌
export type UpdateWorkspacesResult = WorkspacesResponse;
