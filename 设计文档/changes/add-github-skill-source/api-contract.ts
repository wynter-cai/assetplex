/**
 * api-contract: add-github-skill-source
 *
 * 与 specs/ 三 capability 一一对应：github-fetch（发现/预览）、
 * preview-curate（确认入库）、curation-tagging（策展打标）。
 * 禁止 any；实现落 src/core/github-*.ts + src/server/routes/github.ts。
 * 前端 mock 必须对照本文件（环境坑 8：API 契约漂移）。
 */

/** 与 src/core/skills-inventory.ts 对齐（契约文档独立可读，不真实 import） */
export type SkillFunction =
  | 'coding'
  | 'writing'
  | 'browser'
  | 'data'
  | 'devops'
  | 'ai-integration'
  | 'design'
  | 'workflow'
  | 'other';

/** 盘点条目投影（实现处直接复用 SkillInfo，此处仅声明引用名） */
export type SkillInfo = import('../../../src/core/skills-inventory.js').SkillInfo;

// ============ provenance 扩展（preview-curate.spec.md 定义节 / proposal D5）============

/** SkillProvenance 由四值扩为五值：vault source 以 `github:` 开头 → 'github' */
export type SkillProvenanceV2 = 'self' | 'marketplace' | 'plugin' | 'builtin' | 'github';

// ============ 发现与预览（specs/github-fetch.spec.md）============

/** 源串解析结果：owner/repo[/subpath][@ref]，ref 已落到具体 commit SHA */
export interface GithubSourceRef {
  owner: string;
  repo: string;
  /** 仓库内相对子路径（技能集合根），无则仓库根 */
  subpath?: string;
  /** 用户书写的 ref（分支/tag/短 SHA），缺省默认分支 */
  ref?: string;
  /** 解析后的全量 commit SHA（锁版依据，红线 2） */
  sha: string;
}

/** 候选技能（内存对象，未确认入库前不落盘、不进盘点） */
export interface GithubCandidate {
  /** frontmatter name（缺失时取目录名） */
  name: string;
  description: string;
  /** 仓库内 SKILL.md 相对路径，如 'skills/foo/SKILL.md' */
  skillPath: string;
  /** 技能目录相对路径（附属文件归属），根布局时为 '' */
  dirPath: string;
  sizeBytes: number;
  supportingFileCount: number;
  /** 超护栏被跳过时的原因（如 'over-size-limit'），正常为空 */
  skippedReason?: string;
}

/** POST /api/github/discover 请求（source 非法 → 400，不发网络请求，Scenario 4） */
export interface DiscoverRequest {
  source: string;
}

/** POST /api/github/discover 响应 */
export interface DiscoverResult {
  repo: string; // 'owner/repo'
  sha: string;
  /** 展示用：sha 前 7 位 */
  shortSha: string;
  candidates: GithubCandidate[];
  /** 护栏截断/跳过等如实提示（Scenario 7），如 '仅展示前 50 条候选' */
  notes: string[];
  /** 命中进程内缓存（TTL 10 分钟，Scenario 8） */
  cached: boolean;
}

/** POST /api/github/preview 请求：全文预览（G2，不是只看元数据） */
export interface PreviewRequest {
  repo: string;
  sha: string;
  skillPath: string;
}

export interface SupportingFile {
  path: string;
  sizeBytes: number;
  /** 二进制附属：入库时跳过并如实标注（curate.spec Scenario 5） */
  binary: boolean;
}

/** POST /api/github/preview 响应 */
export interface SkillPreview {
  skillPath: string;
  name: string;
  description: string;
  /** SKILL.md 全文（超展示阈值截断并置 contentTruncated） */
  content: string;
  contentTruncated: boolean;
  supportingFiles: SupportingFile[];
}

// ============ 确认入库（specs/preview-curate.spec.md）============

/** 单条入库动作（确认屏逐条标注，Scenario 2/3） */
export type CurateAction = 'create' | 'overwrite' | 'skip';

export interface CurateItemInput {
  skillPath: string;
  /** 目标库名，缺省沿用候选 name；撞名预校验由前端对照盘点，服务端 curate 时兜底（400 入 failed） */
  name?: string;
  /** 同名已存在时生效：缺省 'skip'（默认跳过，红线：不悄悄覆盖） */
  action?: Exclude<CurateAction, 'create'>;
}

/** POST /api/github/curate 请求：显式确认后的落盘动作（确认前零写入，Scenario 2） */
export interface GithubCurateRequest {
  repo: string;
  sha: string;
  items: CurateItemInput[];
}

export interface GithubCurateFailure {
  skillPath: string;
  name: string;
  error: string;
}

/** POST /api/github/curate 响应：批量部分成功、已成功不回滚（Scenario 5） */
export interface GithubCurateResult {
  created: SkillInfo[];
  /** 含用户在确认屏主动选择 skip 的条目 */
  skipped: Array<{ skillPath: string; name: string }>;
  failed: GithubCurateFailure[];
  /** 覆盖项旧版备份引用（复用 doctor-backup/swap 备份语义，Scenario 4）；无覆盖则空 */
  backupRefs: string[];
  /** ≥1 条 created 时为 true：前端渲染「建议立即体检」CTA，不自动发起（Scenario 6 / 拍板 2） */
  suggestDoctor: boolean;
}

// ============ 策展打标（specs/curation-tagging.spec.md）============

/** POST /api/github/classify/estimate：发起前预算披露（手动触发，Scenario 1/6） */
export interface ClassifyEstimate {
  total: number;
  cacheHits: number;
  willCall: number;
  /** AI 端点未配置：入口降级依据（Scenario 2） */
  aiConfigured: boolean;
}

/** POST /api/github/classify 请求：对 repo+sha 下的指定候选逐条九职能打标 */
export interface ClassifyCandidatesRequest {
  repo: string;
  sha: string;
  skillPaths: string[];
}

export interface CandidateTag {
  skillPath: string;
  /** 成功时九职能之一；失败为 null 并填 error（Scenario 3 失败隔离） */
  function: SkillFunction | null;
  /** 命中内容哈希缓存、未实际调模型（Scenario 4） */
  cached: boolean;
  error?: string;
}

/** POST /api/github/classify 响应 */
export interface ClassifyCandidatesResult {
  tags: CandidateTag[];
  called: number;
}

// ============ 错误码约定（三 capability 共用）============

/**
 * 400：源串非法 / items 为空 / 目标名非法兜底
 * 404：仓库不存在或不可公开访问（不区分私有，Scenario 5 fetch）
 * 422：GitHub 限流（响应含 retryAfterMinutes，fetch Scenario 6）或上游内容异常
 * 500：网络层失败
 * 路由层统一：任何错误都不产生磁盘写入；限额/网络信息如实透传，不粉饰
 */
