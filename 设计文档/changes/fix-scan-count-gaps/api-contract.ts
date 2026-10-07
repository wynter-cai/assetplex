/**
 * fix-scan-count-gaps API 契约增量
 *
 * 对外 REST 契约不变（SkillApiInfo.tool 本就是 string）。
 * 变化在内部来源配置与值域扩展。
 */

/** 内部 SkillSources 增量（可选字段，缺省不扫描） */
export interface SkillSourcesPatch {
  /** ~/.workbuddy/skills（WorkBuddy 个人技能，origin=personal, tool=workbuddy） */
  workbuddySkillsDir?: string;
}

/** 内部 AgentSources.trae 增量 */
export interface TraeSourcePatch {
  /** ~/.trae-cn/agents（TRAE 自定义智能体约定目录，Claude 子代理格式） */
  customAgentsDir?: string;
}

/** 前端 SkillInfo.tool 值域扩展：'trae' | 'codebuddy' | 'workbuddy' | 'hub'（string 透传） */

/** 徽章规则：provenance=builtin 时显示 `官方内置 · ${TOOL_LABELS[tool]}` */
