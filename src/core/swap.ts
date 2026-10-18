/**
 * SwapEngine - 工具热切换核心编排（enable-tool-hot-swap）
 *
 * 纯逻辑层：组装切换包 → 冲突预览 → 执行(覆盖前备份) → 回读验证 → 回滚/历史。
 * 复用 SyncEngine.plan 的目标解析与 skip 逻辑，不改动既有 /sync 契约。
 * 诚实边界：验证仅表"已写入并校验"，不代表工具已加载(spec: swap-verify-rollback)。
 * 全流程仅本机文件读写，零数据上传(宪法②)。
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { HubConfig } from './config.js';
import type { HubItem } from './types.js';
import type { ToolAdapter } from './adapters/base.js';
import { SyncEngine } from './sync-engine.js';
import { getHubRoot } from '../utils/paths.js';
import {
  listFilesRecursive,
  writeBackupManifest,
  readBackupManifest,
  restoreTarget,
  hasBackup,
  appendHistory,
  updateHistory,
  readHistory,
  pruneSwapBackups,
  type SwapBackupEntry,
  type SwapBackupManifest,
} from './swap-fs.js';
import { executeUnit, type ExecContext, type WriteUnit } from './swap-exec.js';
import {
  CATEGORY_HUB_DIR,
  asSwapCategory,
  configWithToolEnabled,
  expandPlanItem,
  fingerprintOf,
  hubRelativeOf,
  unsupportedGroup,
} from './swap-plan.js';
import { verifyTarget } from './swap-verify.js';
import type {
  CategorySupport,
  SwapBundle,
  SwapBundleCategory,
  SwapCategory,
  SwapExecuteRequest,
  SwapExecuteResult,
  SwapHistoryEntry,
  SwapPreview,
  SwapRollbackResult,
  SwapVerifyResult,
} from './swap-types.js';
import { SWAP_CATEGORIES } from './swap-types.js';

export * from './swap-types.js';

/** 预览快照(执行时做 staleness 校验) */
interface PreviewSnapshot {
  preview: SwapPreview;
  units: WriteUnit[];
  fingerprint: string;
}

/**
 * 单资产分发范围过滤（add-asset-doctor F3）：单元级保留——entries 命中任一路径即整单元执行
 * （技能目录的主文件命中时，同目录子文件随资产一同分发）；缺省/空 = 全量不过滤。
 */
export function filterUnitsByScope(units: WriteUnit[], scope?: string[]): WriteUnit[] {
  if (scope === undefined || scope.length === 0) return units;
  const set = new Set(scope);
  return units.filter((unit) => unit.entries.some((e) => set.has(e.preview.hubRelativePath)));
}

export class SwapEngine {
  private readonly snapshots = new Map<string, PreviewSnapshot>();

  constructor(
    private readonly hubConfig: HubConfig,
    private readonly adapters: ToolAdapter[],
    private readonly options: { backupRetain?: number } = {},
  ) {}

  /** 备份保留次数(默认 3，swap.backupRetain 可配) */
  get backupRetain(): number {
    return this.options.backupRetain ?? 3;
  }

  /** Hub 内备份根目录:.swap-backup/ */
  get backupRoot(): string {
    return resolve(getHubRoot(), '.swap-backup');
  }

  private requireAdapter(tool: string): ToolAdapter {
    const adapter = this.adapters.find((a) => a.name === tool);
    if (!adapter) {
      throw new Error(`未注册适配器: ${tool}`);
    }
    return adapter;
  }

  /** 某类别在 Hub 内的资产文件(相对根 posix 路径) */
  private hubFilesOfCategory(category: SwapCategory): string[] {
    const dir = resolve(getHubRoot(), CATEGORY_HUB_DIR[category]);
    if (!existsSync(dir)) return [];
    return listFilesRecursive(dir).map(hubRelativeOf);
  }

  /** 适配器解析出的类型集合(决定支持矩阵) */
  private supportedTypesOf(adapter: ToolAdapter): Set<string> {
    const resolved = adapter.resolveHubItems(this.hubConfig, getHubRoot());
    return new Set(resolved.map((r) => r.item.type as string));
  }

  /**
   * 组装切换包:六类 HubItem 汇总 + 目标工具支持矩阵。
   * 不支持的类别也列出库内资产(仅供展示"已跳过"，不参与执行)。
   */
  buildBundle(tool: string): SwapBundle {
    const adapter = this.requireAdapter(tool);
    const supported = this.supportedTypesOf(adapter);
    return {
      tool,
      generatedAt: new Date().toISOString(),
      categories: SWAP_CATEGORIES.map((category): SwapBundleCategory => {
        const support: CategorySupport = supported.has(category)
          ? { supported: true }
          : { supported: false, reason: `此工具不支持${category}类别，已跳过` };
        const hubItems = this.hubFilesOfCategory(category).map((rel): HubItem => ({
          type: category,
          relativePath: rel,
          absolutePath: resolve(getHubRoot(), rel),
        }));
        return { category, support, hubItems };
      }),
    };
  }

  /**
   * 冲突预览:复用 SyncEngine.plan 解析目标，展开为文件级条目并判定冲突。
   * differs 项 defaultOverwrite=false；不支持类别整组标 skip。
   */
  async preview(tool: string): Promise<SwapPreview> {
    const adapter = this.requireAdapter(tool);
    const engine = new SyncEngine(configWithToolEnabled(this.hubConfig, tool), [adapter]);
    const plans = await engine.plan({ tool });
    const plan = plans.find((p) => p.tool === tool);
    const supported = this.supportedTypesOf(adapter);

    const groups: SwapPreview['groups'] = [];
    const units: WriteUnit[] = [];

    for (const category of SWAP_CATEGORIES) {
      if (!supported.has(category)) {
        groups.push(unsupportedGroup(category, this.hubFilesOfCategory(category).length));
        continue;
      }

      const support: CategorySupport = { supported: true };
      const items: SwapPreview['groups'][number]['items'] = [];
      const planItems = (plan?.items ?? []).filter((pi) => asSwapCategory(pi.item.type) === category);
      for (const planItem of planItems) {
        // 源不存在而 skip 的项不进入预览；其余 skip(如已是正确链接)仍展开做内容比对
        if (planItem.action === 'skip' && planItem.reason?.includes('Hub 源不存在')) continue;
        const entries = expandPlanItem(planItem, category, support);
        if (entries.length === 0) continue;
        items.push(...entries.map((e) => e.preview));
        units.push({ item: planItem.item, target: planItem.target, entries });
      }

      groups.push({
        category,
        support,
        items,
        counts: {
          total: items.length,
          new: items.filter((i) => i.conflict === 'none').length,
          willOverwrite: items.filter((i) => i.conflict === 'differs').length,
          unchanged: items.filter((i) => i.conflict === 'exists').length,
          skipped: 0,
        },
      });
    }

    const preview: SwapPreview = {
      tool,
      toolInstalled: plan?.toolInstalled ?? false,
      groups,
      generatedAt: new Date().toISOString(),
    };
    this.snapshots.set(`${tool}::${preview.generatedAt}`, {
      preview,
      units,
      fingerprint: fingerprintOf(preview),
    });
    return preview;
  }

  /** 执行 staleness 校验:快照存在且与当前目录状态指纹一致才放行 */
  private async requireFreshSnapshot(req: SwapExecuteRequest): Promise<PreviewSnapshot> {
    const key = `${req.tool}::${req.previewGeneratedAt}`;
    const snapshot = this.snapshots.get(key);
    if (!snapshot) {
      throw new Error('预览已过期或不存在，请重新预览');
    }
    if (!snapshot.preview.toolInstalled) {
      throw new Error(`工具未安装: ${req.tool}`);
    }
    const fresh = await this.preview(req.tool);
    const freshSnap = this.snapshots.get(`${req.tool}::${fresh.generatedAt}`);
    if (!freshSnap || freshSnap.fingerprint !== snapshot.fingerprint) {
      throw new Error('目标工具目录已变化，请重新预览后再执行');
    }
    this.snapshots.delete(key);
    this.snapshots.delete(`${req.tool}::${fresh.generatedAt}`);
    return snapshot;
  }

  /**
   * 执行切换:staleness 校验 → 逐单元落盘(覆盖前备份) → 回读验证 → 写清单 → 记历史 → 保留策略清理。
   */
  async execute(req: SwapExecuteRequest): Promise<SwapExecuteResult> {
    const adapter = this.requireAdapter(req.tool);
    const snapshot = await this.requireFreshSnapshot(req);
    const swapId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const createdAt = new Date().toISOString();
    const backupDir = join(this.backupRoot, swapId);
    const decisions = new Map(req.overwriteDecisions.map((d) => [d.hubRelativePath, d.overwrite]));

    const ctx: ExecContext = {
      adapter,
      backupDir,
      decisions,
      manifest: [],
      createdDirs: new Set<string>(),
      results: [],
      counts: { written: 0, skipped: 0, failed: 0 },
    };
    const scopedUnits = filterUnitsByScope(snapshot.units, req.onlyHubRelativePaths);
    for (const unit of scopedUnits) {
      await executeUnit(ctx, unit);
    }
    this.attachVerifyResults(ctx, scopedUnits);

    if (ctx.manifest.length > 0) {
      const manifest: SwapBackupManifest = { swapId, tool: req.tool, createdAt, entries: ctx.manifest };
      writeBackupManifest(backupDir, manifest);
    }
    const result: SwapExecuteResult = {
      tool: req.tool,
      swapId,
      success: ctx.counts.failed === 0,
      counts: ctx.counts,
      items: ctx.results,
      rollbackAvailable: ctx.manifest.length > 0,
      createdAt,
    };
    appendHistory(this.backupRoot, {
      swapId,
      tool: req.tool,
      createdAt,
      counts: ctx.counts,
      rolledBack: false,
      rollbackAvailable: ctx.manifest.length > 0,
    });
    pruneSwapBackups(this.backupRoot, this.backupRetain);
    return result;
  }

  /**
   * 回读验证(诚实边界):仅断言"已写入并校验"——存在 + 可解析 + 与源一致，
   * 不代表工具已加载。md 直读；json/toml 用既有 transforms 校验语法。
   */
  verify(sourcePath: string, targetPath: string, hubRelativePath: string): SwapVerifyResult {
    return verifyTarget(sourcePath, targetPath, hubRelativePath);
  }

  /** 对 written 项逐一回读验证；未通过项改计 failed，不谎报成功 */
  private attachVerifyResults(ctx: ExecContext, units: WriteUnit[]): void {
    const locations = new Map<string, { sourcePath: string; targetPath: string }>();
    for (const unit of units) {
      for (const e of unit.entries) {
        locations.set(e.preview.hubRelativePath, { sourcePath: e.sourcePath, targetPath: e.preview.targetPath });
      }
    }
    for (const item of ctx.results) {
      if (item.action !== 'written') continue;
      const loc = locations.get(item.hubRelativePath);
      if (!loc) continue;
      const v = this.verify(loc.sourcePath, loc.targetPath, item.hubRelativePath);
      item.verify = v;
      if (!v.passed) {
        item.action = 'failed';
        item.reason = v.failure;
        ctx.counts.written -= 1;
        ctx.counts.failed += 1;
      }
    }
  }

  /**
   * 回滚本次切换:覆盖项从备份恢复、本次新增项移除。
   * 原子性:先预检所有备份文件齐全，再执行恢复；要么完整，要么明确报失败。
   */
  async rollback(swapId: string): Promise<SwapRollbackResult> {
    const backupDir = join(this.backupRoot, swapId);
    const manifest = readBackupManifest(backupDir);
    if (!manifest) {
      return { swapId, restored: 0, removed: 0, success: false, error: '该次切换的备份记录不存在或已被保留策略清理' };
    }
    // 预检:备份文件缺失则整体拒绝，不留下半恢复状态
    for (const entry of manifest.entries) {
      if (entry.backupKey !== undefined && !existsSync(join(backupDir, 'files', entry.backupKey))) {
        return { swapId, restored: 0, removed: 0, success: false, error: `备份文件缺失: ${entry.backupKey}` };
      }
    }

    let restored = 0;
    let removed = 0;
    const errors: string[] = [];
    // 倒序恢复:后写入的先回退，目录新增项在其子文件之前整体移除
    for (const entry of [...manifest.entries].reverse()) {
      try {
        restoreTarget(entry, backupDir);
        if (entry.backupKey !== undefined) restored++;
        else if (!entry.previousExisted) removed++;
      } catch (err) {
        errors.push(`${entry.targetPath}: ${(err as Error).message}`);
      }
    }
    const success = errors.length === 0;
    if (success) {
      updateHistory(this.backupRoot, swapId, { rolledBack: true });
    }
    return { swapId, restored, removed, success, error: errors.join('; ') || undefined };
  }

  /** 切换历史(最新在前，仅本机)；rollbackAvailable 以备份目录实际存在为准 */
  history(): SwapHistoryEntry[] {
    return readHistory(this.backupRoot)
      .map((e) => ({ ...e, rollbackAvailable: e.rollbackAvailable && hasBackup(this.backupRoot, e.swapId) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.swapId.localeCompare(a.swapId, 'en'));
  }
}

/** 供执行层引用的清单条目类型(re-export 方便路由层标注) */
export type { SwapBackupEntry };
