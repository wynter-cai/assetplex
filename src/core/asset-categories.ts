/**
 * 资产类别声明源（资产中心唯一真相）
 *
 * spec: asset-center-consistency（Scenario 1 新增类别只改一处）
 * 关联: fix-trust-and-consistency proposal D5
 *
 * 侧栏子项、首页资产快照、类别筛选、类别页页头、连接页分组
 * 都必须从这里派生。前端 `web/src/config/asset-categories.ts` 只保留
 * 同名字段的 fallback 常量（首屏渲染 + 接口不可用时兜底），接口返回后覆盖。
 *
 * 边界：本清单只覆盖「资产中心可见的类别」。Hub 里存在但尚未开放的
 * 条目类型（memory / command / preference）仍由 `types.ts` 的 HubItemType
 * 表达，等阶段 1 接入时在这里追加一条即可。
 */

/** 资产中心类别代码（URL 与 API 参数使用） */
export type AssetCategoryCode = 'identity' | 'skill' | 'rule' | 'mcp' | 'agent' | 'criteria';

/** 资产类别描述符（字段与 api-contract.ts 的 AssetCategoryDescriptor 一致） */
export interface AssetCategoryDescriptor {
  /** 类别代码，用于 URL 与 API 参数 */
  readonly code: AssetCategoryCode;
  /** 中文显示名 */
  readonly label: string;
  /** 一句话描述（类别页副标题） */
  readonly description: string;
  /** Hub 内目录名 */
  readonly hubDir: string;
  /** true = 由专用接口供数，不走 /api/assets */
  readonly external: boolean;
  /** 是否支持跨工具分发 */
  readonly syncable: boolean;
  /** 是否纳入资产医生 */
  readonly doctorSupported: boolean;
  /** 排序权重，小者靠前 */
  readonly order: number;
}

/**
 * 声明源。按 order 升序书写，读取方不得自行重排。
 *
 * external 依据现状：技能走 /api/skills、智能体走 /api/agents、
 * 准则走 /api/criteria；其余三类是 Hub 目录直读。
 */
const DECLARED_CATEGORIES: readonly AssetCategoryDescriptor[] = [
  {
    code: 'identity',
    label: '身份',
    description: '你的人设、背景与身份资料',
    hubDir: 'identity',
    external: false,
    syncable: true,
    doctorSupported: true,
    order: 10,
  },
  {
    code: 'skill',
    label: '技能',
    description: '盘点各工具安装的技能，收藏到我的库后统一同步到各工具',
    hubDir: 'skills',
    external: true,
    syncable: true,
    doctorSupported: true,
    order: 20,
  },
  {
    code: 'rule',
    label: '规则',
    description: '约束 AI 行为的规则与约定',
    hubDir: 'rules',
    external: false,
    syncable: true,
    doctorSupported: true,
    order: 30,
  },
  {
    code: 'mcp',
    label: 'MCP',
    description: 'MCP 服务器配置资产',
    hubDir: 'mcp',
    external: false,
    syncable: true,
    doctorSupported: false,
    order: 40,
  },
  {
    code: 'agent',
    label: '智能体',
    description: '盘点各工具中的子智能体配置',
    hubDir: 'agents',
    external: true,
    syncable: true,
    doctorSupported: true,
    order: 50,
  },
  {
    code: 'criteria',
    label: '裁决准则',
    description: '冲突仲裁与资产诊断依据的最佳实践准则——准则本身也是资产',
    hubDir: 'criteria',
    external: true,
    // 准则只作为仲裁与诊断的依据，不向工具分发
    syncable: false,
    doctorSupported: false,
    order: 60,
  },
];

/** 声明源（已冻结，禁止运行时改写） */
export const ASSET_CATEGORIES: readonly AssetCategoryDescriptor[] = Object.freeze(
  DECLARED_CATEGORIES.map((category) => Object.freeze(category)),
);

/** 声明源版本（GET /api/asset-categories 的 declaredAt） */
export const ASSET_CATEGORY_DECLARED_AT = '2026-10-25';

const CATEGORY_BY_CODE = new Map<string, AssetCategoryDescriptor>(
  ASSET_CATEGORIES.map((category) => [category.code, category]),
);

/** 按 code 取类别，未知 code 返回 undefined（调用方必须显式处理） */
export function getAssetCategory(code: string): AssetCategoryDescriptor | undefined {
  return CATEGORY_BY_CODE.get(code);
}

/** 全部类别 code（顺序即展示顺序） */
export function getAssetCategoryCodes(): AssetCategoryCode[] {
  return ASSET_CATEGORIES.map((category) => category.code);
}

/** 类型守卫：用于 URL 参数与接口入参校验 */
export function isAssetCategory(code: string): code is AssetCategoryCode {
  return CATEGORY_BY_CODE.has(code);
}
