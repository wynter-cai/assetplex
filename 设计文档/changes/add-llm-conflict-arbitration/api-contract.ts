/**
 * api-contract: add-llm-conflict-arbitration
 *
 * 与 specs/ 中 Scenario 一一对应。类型为准，实现落地时放 src/core/types.ts
 * 及 src/server/routes/。禁止 any（AGENTS.md 铁律），未知处用 unknown + 守卫。
 */

// ============ 裁决准则元资产（specs/criteria-meta-asset.spec.md）============

/**
 * criterion 作为新增的 Hub 资产类别：
 * - 'criteria' 追加进 core/hub-files.ts 的 HubFileCategory 与 HUB_CATEGORIES
 * - CRUD 复用现有 /api/files?category=criteria（list/read/write/create/delete 全走这条，零新路由）
 * - 存储：Hub/criteria/<slug>.md，frontmatter 承载下面字段，正文为准则内容
 */
export interface CriterionFrontmatter {
  /** 显示名，如「Skill 渐进披露」 */
  name: string;
  /** 一句话用途 */
  description: string;
  /** 整数，越小越先进 prompt（Scenario 5） */
  priority: number;
  /** 缺省 true；false 时不参与组装（Scenario 4） */
  enabled: boolean;
  /**
   * 适用资产类别（add-asset-doctor 与仲裁共用）：'all' 或类别子集，缺省 ['all']。
   * 诊断/仲裁组装时只取与目标资产类别匹配的准则。
   */
  appliesTo: Array<'all' | 'identity' | 'skill' | 'rule' | 'mcp' | 'command' | 'agent' | 'memory'>;
  /** 可选：准则来源（业内最佳实践的文档标题/链接，开源合规与可信度展示用） */
  source?: string;
}

/** 准则读回（frontmatter 解析后 + 正文 + 定位） */
export interface CriterionAsset extends CriterionFrontmatter {
  /** 文件名去 .md，全库唯一 */
  slug: string;
  /** 相对 Hub 根，恒为 `criteria/<slug>.md` */
  relativePath: string;
  /** 正文（frontmatter 之后的 markdown，进 prompt 的内容） */
  body: string;
}

// ============ LLM 冲突仲裁（specs/conflict-arbitration.spec.md）============

/** 决策闭集（Scenario 6：其余一律解析失败，不新增取值） */
export type ArbitrationDecision =
  | 'keep-left' // 采纳 → overwrite（保留导入版）
  | 'keep-right' // 采纳 → skip（保留目标现有版）
  | 'merge' // 采纳 → merge + mergedContent 草案
  | 'manual-review'; // 无采纳按钮，回落手动（Scenario 5）

/** POST /api/arbitration 请求体 */
export interface ArbitrationRequest {
  /** 冲突资产类别（复用 DiscoveredCategory） */
  category: 'identity' | 'skill' | 'rule' | 'mcp' | 'memory';
  /** 左侧（导入源 / Hub 侧）绝对路径，服务端读取内容 */
  leftPath: string;
  /** 右侧（目标工具已存在）绝对路径，服务端读取内容 */
  rightPath: string;
  /** 展示用来源标签，如 'TRAE' / '我的库' */
  leftLabel?: string;
  rightLabel?: string;
}

/** POST /api/arbitration 响应体 */
export interface ArbitrationResponse {
  decision: ArbitrationDecision;
  /** 模型给出的理由（人类可读，中文） */
  rationale: string;
  /** 仅 decision=merge 必存在，可采纳为草案（Scenario 3） */
  mergedContent?: string;
  /** 本次实际进入 prompt 的准则 slug（Scenario 2 命中清单） */
  criteriaUsed: string[];
  /** 因预算截断未参与的准则条数，>0 时前端提示（Scenario 5） */
  criteriaSkipped: number;
  /** 命中缓存则 true，不重复调模型（Scenario 7） */
  cached: boolean;
  /** 使用的模型名（来自用户配置） */
  model: string;
  generatedAt: string;
}

/**
 * 错误响应（沿用现有路由 { error } 约定）：
 * - 400 AiConfigIncompleteError → "请先在设置中配置 AI 端点"（Scenario 8，前端引导跳转）
 * - 422 模型输出非法/闭集外/merge 缺草案 → "仲裁失败：<原因>"，前端保持手动路径（Scenario 6）
 * - 404 左或右文件读取失败
 * 隐私（Scenario 9 / proposal D6）：仅 leftPath/rightPath 内容与准则正文发往用户自配端点，
 * 复用 AI 分类同一 LlmClient 与 aiConfig，不经第三方。
 */
