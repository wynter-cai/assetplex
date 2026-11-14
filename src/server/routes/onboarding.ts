/**
 * 引导路由（add-zero-config-onboarding T7）
 *
 * 仅 3 个端点（proposal D 决策：盘点/收纳/分发复用既有 /api/sync 接口）：
 * - GET  /api/onboarding/state    首次判定与工具摘要（只读，无副作用）
 * - POST /api/onboarding/start    幂等创建 Hub 骨架（不含身份/规则空模板）
 * - POST /api/onboarding/complete 写 onboarded 标记（完成或跳过）
 *
 * spec: onboarding.spec Requirement 1 / 4.1 / 7 / 8
 */

import { Hono } from 'hono';
import { hubContext } from '../lib/hub-context.js';
import { listAssets } from '../../core/assets.js';
import { ensureHubSkeleton } from '../../core/hub-skeleton.js';
import {
  readOnboardingState,
  writeOnboardingMarker,
  type OnboardingOutcome,
  type OnboardingStepId,
} from '../../core/onboarding-state.js';
import { getHubRoot } from '../../utils/paths.js';

const OUTCOMES: readonly string[] = ['completed', 'skipped'];
const STEPS: readonly string[] = ['welcome', 'scan', 'result', 'collect', 'doctor', 'distribute', 'done'];

/** 单个工具的检测摘要（与 api-contract OnboardingToolSummary 一致） */
export interface OnboardingToolSummary {
  toolId: string;
  displayName: string;
  installed: boolean;
  configDir: string;
}

/** state 响应（core 纯状态 + 工具摘要） */
export interface OnboardingStateWithTools {
  hubRoot: string;
  initialized: boolean;
  onboarded: boolean;
  autoEnter: boolean;
  assetCount: number;
  lastOutcome: { outcome: string; step: string; at: string } | null;
  tools: OnboardingToolSummary[];
}

export interface OnboardingRouteDeps {
  /** Hub 根目录（缺省 getHubRoot，支持 ASSETPLEX_DIR） */
  hubRoot?: () => string;
  /** 资产库真实计数（缺省 listAssets 口径） */
  assetCount?: () => Promise<number> | number;
  /** 工具摘要（缺省 hubContext 适配器 detect） */
  detectTools?: () => Promise<OnboardingToolSummary[]>;
}

/** 默认工具摘要：全部适配器 detect（与 /api/tools 同源） */
async function detectAllTools(): Promise<OnboardingToolSummary[]> {
  const adapters = hubContext.getAllAdapters();
  const statuses = await Promise.all(adapters.map((adapter) => adapter.detect()));
  return adapters.map((adapter, i) => ({
    toolId: adapter.name,
    displayName: adapter.displayName,
    installed: statuses[i].installed,
    configDir: statuses[i].configDir,
  }));
}

export function createOnboardingRoutes(deps: OnboardingRouteDeps = {}): Hono {
  const routes = new Hono();

  const getHub = (): string => deps.hubRoot?.() ?? getHubRoot();
  const getAssets = async (): Promise<number> => {
    if (deps.assetCount !== undefined) return await deps.assetCount();
    const { items } = await listAssets();
    return items.length;
  };
  const detect = deps.detectTools ?? detectAllTools;

  routes.get('/state', async (c) => {
    const [assetCount, tools] = await Promise.all([getAssets(), detect()]);
    const state = readOnboardingState({ hubRoot: getHub(), assetCount });
    return c.json({ ...state, tools });
  });

  routes.post('/start', async (c) => {
    const hubRoot = getHub();
    const skeleton = ensureHubSkeleton(hubRoot);
    const [assetCount, tools] = await Promise.all([getAssets(), detect()]);
    const state = readOnboardingState({ hubRoot, assetCount });
    return c.json({ ...skeleton, state: { ...state, tools } });
  });

  routes.post('/complete', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: '请求体必须是 JSON' }, 400);
    }
    if (typeof body !== 'object' || body === null) {
      return c.json({ error: '请求体必须是 JSON 对象' }, 400);
    }
    const rec = body as Record<string, unknown>;
    if (typeof rec.outcome !== 'string' || !OUTCOMES.includes(rec.outcome)) {
      return c.json({ error: 'outcome 必须是 completed/skipped' }, 400);
    }
    if (typeof rec.step !== 'string' || !STEPS.includes(rec.step)) {
      return c.json({ error: `step 必须是 ${STEPS.join('/')}` }, 400);
    }

    const hubRoot = getHub();
    const { persisted } = writeOnboardingMarker({
      outcome: rec.outcome as OnboardingOutcome,
      step: rec.step as OnboardingStepId,
    }, { hubRoot });

    const assetCount = await getAssets();
    const tools = await detect();
    const state = readOnboardingState({ hubRoot, assetCount });
    return c.json({ ok: true, persisted, state: { ...state, tools } });
  });

  return routes;
}
