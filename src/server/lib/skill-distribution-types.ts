/**
 * 技能批量分发的契约类型与 token 快照表（refactor-skill-catalog T13 / T14）
 *
 * 纯类型 + 进程内快照存储，不含 IO；编排逻辑见 skill-distribution.ts。
 */

/** token 有效期（T13：建议 10 分钟） */
export const DISTRIBUTION_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface SelectedSkill {
  id: string;
  name: string;
  /** Hub 内相对路径，如 'skills/demo-a/SKILL.md' */
  hubRelativePath: string;
  /** 预览时的正文哈希（执行前校验快照是否仍然有效） */
  contentHash: string;
}

export interface IneligibleSkill {
  id: string;
  name: string;
  reason: 'not-in-library' | 'missing-file' | 'not-found';
}

export interface SkillDistributionFileImpact {
  total: number;
  created: number;
  overwritten: number;
  unchanged: number;
  conflicts: number;
}

export interface SkillDistributionToolImpact {
  tool: string;
  displayName: string;
  installed: boolean;
  supported: boolean;
  skipReason?: string;
  defaultSelected: boolean;
  statusUnknown?: boolean;
  files: SkillDistributionFileImpact;
  sampleTargets: string[];
}

export interface SkillDistributionPreview {
  token: string;
  generatedAt: string;
  expiresAt: string;
  skills: Array<{ id: string; name: string; hubRelativePath: string }>;
  ineligible: IneligibleSkill[];
  tools: SkillDistributionToolImpact[];
  totals: {
    tools: number;
    files: number;
    created: number;
    overwritten: number;
    unchanged: number;
    conflicts: number;
  };
  backup: { policy: 'swap'; note: string };
}

/** 单工具预览快照（token 内保存，供执行时定位引擎快照与冲突路径） */
export interface ToolPreviewSnapshot {
  tool: string;
  previewGeneratedAt: string;
  /** differs 条目：默认不覆盖，overwriteConflicts 才写入 */
  conflictPaths: string[];
  installed: boolean;
  supported: boolean;
  statusUnknown: boolean;
}

export interface DistributionTokenRecord {
  id: string;
  expiresAtMs: number;
  used: boolean;
  skills: SelectedSkill[];
  tools: ToolPreviewSnapshot[];
}

/** 内存 token 快照表（进程内，过期即清理；服务重启后按 404 处理） */
export class DistributionTokenStore {
  private readonly tokens = new Map<string, DistributionTokenRecord>();

  create(input: { skills: SelectedSkill[]; tools: ToolPreviewSnapshot[] }, nowMs: number): {
    token: string;
    expiresAt: string;
  } {
    this.prune(nowMs);
    const id = `dt-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const expiresAtMs = nowMs + DISTRIBUTION_TOKEN_TTL_MS;
    this.tokens.set(id, { id, expiresAtMs, used: false, skills: input.skills, tools: input.tools });
    return { token: id, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  get(token: string): DistributionTokenRecord | undefined {
    return this.tokens.get(token);
  }

  markUsed(token: string): void {
    const record = this.tokens.get(token);
    if (record !== undefined) record.used = true;
  }

  /** 清理过期快照，避免长跑进程内存堆积 */
  prune(nowMs: number): void {
    for (const [key, record] of this.tokens) {
      if (record.expiresAtMs <= nowMs) this.tokens.delete(key);
    }
  }
}
