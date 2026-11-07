/**
 * api-contract: refine-skill-cards-wizard（P2-B）
 *
 * 只记录本次变更涉及的类型增量与新字段，不是全量 API 快照。
 * 后端真实类型在 `src/core/types.ts`，前端镜像在 `web/src/types/api.ts`，两侧必须同步改。
 */

// 复用的既有类型：形状与 `src/core/types.ts`、`web/src/types/api.ts` 一致，此处自包含声明
// （文档目录不参与构建，因此不 import 源码，避免改一处源码让文档类型失效）
export type DiscoveredCategory = 'identity' | 'skill' | 'rule' | 'mcp' | 'agent' | 'memory' | 'preference';
export type ConflictStatus = 'none' | 'exists' | 'differs';
export type ConflictStrategy = 'merge' | 'overwrite' | 'skip';
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

// ========== ① 九职能色彩（web 侧，无网络契约） ==========

/** 九个职能令牌名，与 `index.css` 的 `--fn-*` 一一对应 */
export type FunctionColorKey =
  | 'coding'
  | 'writing'
  | 'browser'
  | 'data'
  | 'devops'
  | 'ai-integration'
  | 'design'
  | 'workflow'
  | 'other';

/**
 * 色彩元信息（`web/src/components/skills/skill-colors.ts` 导出 `FUNCTION_COLORS`）
 * `token` 只用于 `style={{ backgroundColor: 'hsl(var(--fn-...))' }}` 或 tailwind 映射类，
 * 不在组件里写具体 HSL 数值（颜色只在 `index.css` 定义一次）。
 */
export interface FunctionColorMeta {
  key: FunctionColorKey;
  /** CSS 变量名（含 `--` 前缀），如 `--fn-coding` */
  token: `--fn-${string}`;
  /** 色相（°，仅文档/单测用） */
  hue: number;
}

// ========== ② 扫描结果：二进制标注 ==========

/** 扫描发现的单个条目（新增 `binary`） */
export interface DiscoveredItem {
  absolutePath: string;
  relativePath: string;
  size: number;
  modified: string;
  category: DiscoveredCategory;
  hubTargetPath: string;
  conflict: ConflictStatus;
  existingSize?: number;
  tool: string;
  /** 二进制文件标记：扩展名判定为主，未知扩展名再按内容嗅探兜底 */
  binary: boolean;
}

// ========== ③ 导入请求：二进制透传 ==========

/**
 * 导入请求中的单个条目（新增 `binary`）
 * 前端把扫描结果里的 `binary` 原样透传，后端据此选择字节写入而不是文本写入；
 * 缺省（旧客户端）时后端按内容嗅探自行判断。
 */
export interface ImportItem {
  tool: string;
  absolutePath: string;
  hubTargetPath: string;
  category: DiscoveredCategory;
  conflict: ConflictStatus;
  strategy?: ConflictStrategy;
  mergeDraft?: string;
  binary?: boolean;
}

// ========== ④ 导入结果：跳过原因 ==========

/** 跳过原因闭集（`message` 仍是人读文案，这里给 UI 判定用） */
export type ImportSkipReason = 'binary-merge' | 'user-skip';

export interface ImportResultItem {
  tool: string;
  hubTargetPath: string;
  status: 'created' | 'merged' | 'overwritten' | 'skipped' | 'error';
  /** 可选机器可读原因；`skipped` 且为 `binary-merge` 时 UI 单独归组 */
  skipReason?: ImportSkipReason;
  message?: string;
}

// ========== ⑤ toast 动作（撤销） ==========

/**
 * `web/src/lib/toast-store.ts` 的 `ToastOptions` 增量。
 * 渲染为 toast 内文字按钮；带 action 的 toast 最短存活 30 秒，不受 `DEFAULT_DURATION` 影响。
 */
export interface ToastOptionsPatch {
  action?: {
    label: string;
    onClick: () => void;
  };
}

// ========== ⑥ 路由契约（无新增接口） ==========

/**
 * PUT /api/skills/:id/function
 * 请求：{ functionCategory: SkillFunction }
 * 响应 200：{ skill: SkillApiInfo }
 * 响应 400：{ error: '无效职能，支持：...' | '请求体必须是 JSON' }
 * 响应 404：{ error: '技能不存在：<id>' }
 *
 * 运行期 schema 校验不变；前端「应用改分类」与「撤销」都复用它，
 * 撤销前先比对当前 `functionCategory` 是否仍等于改动后的值（并发保护），不等则不发请求。
 */
export interface PutSkillFunctionRequest {
  functionCategory: SkillFunction;
}

/** GET /api/skills：本次不新增字段（`binary` 只出现在扫描接口 `GET /api/import/scan`） */
export type SkillsResponseChange = never;
