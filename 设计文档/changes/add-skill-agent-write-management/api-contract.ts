/**
 * API 契约：保险箱技能/智能体写管理
 *
 * 变更: add-skill-agent-write-management
 * 前后端共用类型，禁止写实现。
 */

// ============ 依赖的基础类型（摘自现有 inventory 类型） ============

/** 技能来源（本变更新增 'vault'） */
export type SkillOriginWithVault = 'builtin' | 'plugin' | 'personal' | 'marketplace' | 'vault';

/** 智能体来源工具（本变更新增 'hub'） */
export type AgentToolWithHub = 'trae' | 'codebuddy' | 'claude' | 'codex' | 'hub';

// ============ 技能写管理 ============

/** POST /api/skills 请求体 */
export interface CreateSkillRequest {
  /** 技能名，同时用作目录名；大小写不敏感唯一 */
  name: string;
  /** 技能描述，写入 frontmatter description；可空 */
  description?: string;
  /** SKILL.md 正文（frontmatter 之后的内容），可空字符串 */
  content: string;
}

/** POST /api/skills 响应（201） */
export interface CreateSkillResponse {
  skill: {
    id: string;
    name: string;
    description: string;
    functionCategory: string;
    origin: SkillOriginWithVault;
    sourcePath: string;
    variants: string[];
  };
}

/** PUT /api/skills/:id 请求体（整文件替换） */
export interface UpdateSkillRequest {
  /** 完整 SKILL.md 文本（含或不含 frontmatter 均按原文保存） */
  content: string;
}

/** PUT /api/skills/:id 响应 */
export interface UpdateSkillResponse {
  skill: CreateSkillResponse['skill'];
}

/** DELETE /api/skills/:id 响应（删除 skills/<id>/ 目录） */
export interface DeleteSkillResponse {
  success: true;
}

// ============ 智能体写管理 ============

/** POST /api/agents 请求体 */
export interface CreateAgentRequest {
  /** 智能体名，同时用作文件名 agents/<name>.md；大小写不敏感唯一 */
  name: string;
  /** 描述，写入 frontmatter description；可空 */
  description?: string;
  /** 正文（system prompt），可空字符串 */
  content: string;
}

/** POST /api/agents 响应（201） */
export interface CreateAgentResponse {
  agent: {
    id: string;
    name: string;
    description: string;
    kind: 'custom-subagent';
    tool: AgentToolWithHub;
    sourcePath: string;
    userCreated: true;
  };
}

/** PUT /api/agents/:id 请求体（整文件替换） */
export interface UpdateAgentRequest {
  content: string;
}

/** PUT /api/agents/:id 响应 */
export interface UpdateAgentResponse {
  agent: CreateAgentResponse['agent'];
}

/** DELETE /api/agents/:id 响应（删除 agents/<id>.md） */
export interface DeleteAgentResponse {
  success: true;
}

// ============ 错误契约 ============

/** 统一错误响应体 */
export interface WriteApiError {
  error: string;
}

/** 400：名称非法（含保留名 . .. 或非法字符 / \ : * ? " < > |）
 *  400：同名已存在（大小写不敏感）
 *  404：技能/智能体不存在
 *  500：文件系统失败（错误信息带上下文）
 */
export interface WriteApiErrorCodes {
  '400': WriteApiError;
  '404': WriteApiError;
}
