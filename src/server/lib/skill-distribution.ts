/**
 * 技能批量分发预览编排（refactor-skill-catalog T13）
 *
 * 复用资产写入引擎（原 SwapEngine，现 AssetWriteEngine）的逐工具预览，
 * 不新建第二条分发通道（proposal D5）：按所选技能过滤预览条目并生成影响清单。
 * 响应中的目标路径一律为工具内相对路径，绝不回传本机绝对路径。
 */

import { relative, sep } from 'node:path';
import type { ToolAdapter } from '../../core/adapters/base.js';
import { BaseAdapter } from '../../core/adapters/base.js';
import type {
  AssetWriteEngine,
  AssetWritePreview,
  AssetWritePreviewItem,
} from '../../core/asset-write.js';
import type { ListSkillsResult, SkillFs } from '../../core/skills-inventory.js';
import { computeSkillContentHash } from '../../core/skill-diagnosis-summary.js';
import { hubRelativePathOf } from './skill-api.js';
import type {
  IneligibleSkill,
  SelectedSkill,
  SkillDistributionFileImpact,
  SkillDistributionPreview,
  SkillDistributionToolImpact,
  ToolPreviewSnapshot,
} from './skill-distribution-types.js';

/** 技能目录（'skills/demo-a/SKILL.md' → 'skills/demo-a'） */
function skillDirOf(hubRelativePath: string): string {
  const index = hubRelativePath.lastIndexOf('/');
  return index > 0 ? hubRelativePath.slice(0, index) : hubRelativePath;
}

/** 条目是否属于本次所选技能目录（主文件命中即整目录） */
export function isUnderSelectedSkill(itemPath: string, skillDirs: string[]): boolean {
  return skillDirs.some((dir) => itemPath === `${dir}/SKILL.md` || itemPath.startsWith(`${dir}/`));
}

/** 解析所选技能：未入库 / 文件缺失 / id 不存在逐条给原因，不静默丢弃 */
export function resolveDistributionSelection(input: {
  ids: string[];
  listing: ListSkillsResult;
  fs: SkillFs;
  vaultSkillsDir: string;
}): { skills: SelectedSkill[]; ineligible: IneligibleSkill[] } {
  const byId = new Map(input.listing.items.map((skill) => [skill.id, skill]));
  const skills: SelectedSkill[] = [];
  const ineligible: IneligibleSkill[] = [];
  for (const id of input.ids) {
    const skill = byId.get(id);
    if (skill === undefined) {
      ineligible.push({ id, name: id, reason: 'not-found' });
      continue;
    }
    const hubRelativePath = hubRelativePathOf(skill.sourcePath, input.vaultSkillsDir);
    if (hubRelativePath === null) {
      ineligible.push({ id, name: skill.name, reason: 'not-in-library' });
      continue;
    }
    const raw = input.fs.read(skill.sourcePath);
    if (raw === null) {
      ineligible.push({ id, name: skill.name, reason: 'missing-file' });
      continue;
    }
    skills.push({ id, name: skill.name, hubRelativePath, contentHash: computeSkillContentHash(raw) });
  }
  return { skills, ineligible };
}

/** 工具内相对路径：优先相对工具配置目录，越界时退回 Hub 相对路径（绝不回传绝对路径） */
function toToolRelativePath(item: AssetWritePreviewItem, adapter: ToolAdapter): string {
  if (!(adapter instanceof BaseAdapter)) return item.hubRelativePath;
  const rel = relative(adapter.getConfigDir(), item.targetPath).split(sep).join('/');
  return rel === '' || rel.startsWith('..') ? item.hubRelativePath : rel;
}

/** 四态统计：引擎仅 none/exists/differs；differs 一律按冲突（默认不覆盖），故 overwritten 预检恒 0 */
function fileImpactOf(items: AssetWritePreviewItem[]): SkillDistributionFileImpact {
  return {
    total: items.length,
    created: items.filter((i) => i.conflict === 'none').length,
    overwritten: 0,
    unchanged: items.filter((i) => i.conflict === 'exists').length,
    conflicts: items.filter((i) => i.conflict === 'differs').length,
  };
}

/** 不可选原因（状态未知优先，其次不支持类别，最后未安装） */
function skipReasonOf(input: {
  installed: boolean;
  statusUnknown: boolean;
  supported: boolean;
  supportReason?: string;
}): string | undefined {
  if (input.statusUnknown) return '工具状态暂不可用';
  if (!input.supported) return input.supportReason ?? '该工具不支持技能类别';
  if (!input.installed) return '工具未安装';
  return undefined;
}

/** 组装单个工具的影响清单（不写盘） */
export async function previewDistributionTool(input: {
  adapter: ToolAdapter;
  engine: AssetWriteEngine;
  skillDirs: string[];
}): Promise<{ impact: SkillDistributionToolImpact; snapshot: ToolPreviewSnapshot }> {
  let installed = false;
  let statusUnknown = false;
  try {
    installed = (await input.adapter.detect()).installed;
  } catch {
    statusUnknown = true;
  }

  let preview: AssetWritePreview | null = null;
  try {
    preview = await input.engine.preview(input.adapter.name);
  } catch {
    statusUnknown = true;
  }

  const group = preview?.groups.find((g) => g.category === 'skill');
  const supported = group?.support.supported ?? false;
  const items = (group?.items ?? []).filter((i) => isUnderSelectedSkill(i.hubRelativePath, input.skillDirs));
  const existsInAny = items.some((i) => i.conflict === 'exists' || i.conflict === 'differs');
  const skipReason = skipReasonOf({
    installed,
    statusUnknown,
    supported,
    supportReason: group?.support.supported === false ? group.support.reason : undefined,
  });

  const impact: SkillDistributionToolImpact = {
    tool: input.adapter.name,
    displayName: input.adapter.displayName,
    installed,
    supported,
    defaultSelected: installed && supported && existsInAny,
    files: fileImpactOf(items),
    sampleTargets: items.slice(0, 3).map((i) => toToolRelativePath(i, input.adapter)),
  };
  if (skipReason !== undefined) impact.skipReason = skipReason;
  if (statusUnknown) impact.statusUnknown = true;

  return {
    impact,
    snapshot: {
      tool: input.adapter.name,
      previewGeneratedAt: preview?.generatedAt ?? '',
      conflictPaths: items.filter((i) => i.conflict === 'differs').map((i) => i.hubRelativePath),
      installed,
      supported,
      statusUnknown,
    },
  };
}

/** 汇总所有工具影响清单与总计数 */
export async function buildDistributionPreview(input: {
  skills: SelectedSkill[];
  ineligible: IneligibleSkill[];
  adapters: ToolAdapter[];
  engine: AssetWriteEngine;
  /** 生成时间（与 token 有效期同源，测试可注入） */
  generatedAt: string;
}): Promise<{ preview: Omit<SkillDistributionPreview, 'token' | 'expiresAt'>; snapshots: ToolPreviewSnapshot[] }> {
  const skillDirs = input.skills.map((s) => skillDirOf(s.hubRelativePath));
  const outcomes = [];
  for (const adapter of input.adapters) {
    outcomes.push(await previewDistributionTool({ adapter, engine: input.engine, skillDirs }));
  }
  const tools = outcomes.map((o) => o.impact);
  const sum = (pick: (f: SkillDistributionFileImpact) => number): number =>
    tools.reduce((acc, tool) => acc + pick(tool.files), 0);

  return {
    preview: {
      generatedAt: input.generatedAt,
      skills: input.skills.map((s) => ({ id: s.id, name: s.name, hubRelativePath: s.hubRelativePath })),
      ineligible: input.ineligible,
      tools,
      totals: {
        tools: tools.length,
        files: sum((f) => f.total),
        created: sum((f) => f.created),
        overwritten: sum((f) => f.overwritten),
        unchanged: sum((f) => f.unchanged),
        conflicts: sum((f) => f.conflicts),
      },
      backup: { policy: 'swap', note: '覆盖前由 swap 自动备份，可在结果页按工具回滚本次分发' },
    },
    snapshots: outcomes.map((o) => o.snapshot),
  };
}
