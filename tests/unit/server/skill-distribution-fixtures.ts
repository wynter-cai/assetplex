/**
 * 技能批量分发路由测试夹具（refactor-skill-catalog T13 / T14）
 *
 * 用临时 Hub + Fake 适配器驱动真实 AssetWriteEngine；所有示例名中性（demo-*）。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect } from 'vitest';
import { Hono } from 'hono';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { ToolAdapter } from '../../../src/core/adapters/base.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubItem, SyncTarget, ToolStatus } from '../../../src/core/types.js';
import type { SkillFs, SkillFunction, SkillOverrideStore, SkillSources } from '../../../src/core/skills-inventory.js';
import { AssetWriteEngine } from '../../../src/core/asset-write.js';
import { nodeAgentFs } from '../../../src/server/lib/node-agent-fs.js';
import { skillDistributionRoutesFactory } from '../../../src/server/routes/skill-distribution.js';

export const SKILL_MD = (name: string, description: string): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n# ${name}\n正文\n`;

export class FakeSkillAdapter extends BaseAdapter {
  readonly name: string;
  readonly displayName: string;
  protected defaultConfigDir = '';
  protected signatureFiles = ['sig.txt'];
  protected supportedTargets = ['skills/'];

  constructor(
    private readonly dir: string,
    private readonly skillDirs: string[],
    private readonly opts: {
      failApply?: boolean;
      detectThrows?: boolean;
      identityOnly?: boolean;
    } = {},
  ) {
    super();
    this.name = opts.identityOnly === true ? 'identitytool' : `tool-${dir.split(/[\\/]/).pop() ?? 'x'}`;
    this.displayName = this.name;
  }

  override getConfigDir(): string {
    return this.dir;
  }

  targets(): SyncTarget[] {
    return [];
  }

  override async detect(): Promise<ToolStatus> {
    if (this.opts.detectThrows === true) throw new Error('detect 失败');
    const exists = existsSync(this.dir);
    return {
      name: this.name,
      installed: exists && existsSync(join(this.dir, 'sig.txt')),
      configDirExists: exists,
      configDir: this.dir,
    };
  }

  override resolveHubItems(_hubConfig: HubConfig, hubRoot: string): Array<{ item: HubItem; target: SyncTarget }> {
    if (this.opts.identityOnly === true) {
      return [
        {
          item: { type: 'identity', relativePath: 'identity/profile.md', absolutePath: resolve(hubRoot, 'identity/profile.md') },
          target: { tool: this.name, targetPath: resolve(this.dir, 'IDENTITY.md'), strategy: 'copy', isDirectory: false },
        },
      ];
    }
    return this.skillDirs.map((dir) => ({
      item: { type: 'skill', relativePath: `skills/${dir}`, absolutePath: resolve(hubRoot, 'skills', dir) },
      target: { tool: this.name, targetPath: resolve(this.dir, 'skills', dir), strategy: 'copy', isDirectory: true },
    }));
  }

  override async apply(item: HubItem, target: SyncTarget): Promise<void> {
    if (this.opts.failApply === true) throw new Error('模拟写入失败');
    await super.apply(item, target);
  }
}

export class MemoryOverrideStore implements SkillOverrideStore {
  load(): Record<string, SkillFunction> {
    return {};
  }
  save(): void {}
}

export function sourcesFor(root: string, hubDir: string): SkillSources {
  return {
    vaultSkillsDir: join(hubDir, 'skills'),
    userSkillsDir: join(root, 'env', 'skills'),
    builtinRoot: join(root, 'env', 'builtin'),
    builtinSkillsDir: join(root, 'env', 'builtin_skills'),
    pluginsRoot: join(root, 'env', 'plugins'),
    marketplaceSkillsDir: join(root, 'env', 'marketplace'),
    workspaceDirs: [],
  };
}

/** 临时 Hub：预置 demo-a / demo-b 两个库内技能 */
export function seedHub(root: string): string {
  const hubDir = join(root, 'hub');
  for (const name of ['demo-a', 'demo-b']) {
    mkdirSync(join(hubDir, 'skills', name), { recursive: true });
    writeFileSync(join(hubDir, 'skills', name, 'SKILL.md'), SKILL_MD(name, name === 'demo-a' ? '数据同步' : '文档写作'), 'utf-8');
  }
  return hubDir;
}

/** 工具目录：sig.txt 存在即视为已安装 */
export function toolDir(root: string, name: string, installed = true): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  if (installed) writeFileSync(join(dir, 'sig.txt'), 'sig', 'utf-8');
  return dir;
}

/** 环境技能（未入库） */
export function seedEnvSkill(root: string, name: string): void {
  const dir = join(root, 'env', 'skills', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), SKILL_MD(name, '环境技能'), 'utf-8');
}

export interface Harness {
  app: Hono;
  engine: AssetWriteEngine;
  adapters: ToolAdapter[];
}

export function buildHarness(
  root: string,
  hubDir: string,
  adapters: ToolAdapter[],
  options: { now?: () => number; fs?: SkillFs } = {},
): Harness {
  const engine = new AssetWriteEngine(HubConfigSchema.parse({}), adapters);
  const app = new Hono();
  app.route(
    '/api/skills',
    skillDistributionRoutesFactory({
      fs: options.fs ?? nodeAgentFs,
      sources: sourcesFor(root, hubDir),
      store: new MemoryOverrideStore(),
      listAdapters: () => adapters,
      getEngine: () => engine,
      now: options.now,
    }),
  );
  return { app, engine, adapters };
}

export interface PreviewBody {
  token: string;
  generatedAt: string;
  expiresAt: string;
  skills: Array<{ id: string; name: string; hubRelativePath: string }>;
  ineligible: Array<{ id: string; name: string; reason: string }>;
  tools: Array<{
    tool: string;
    displayName: string;
    installed: boolean;
    supported: boolean;
    skipReason?: string;
    defaultSelected: boolean;
    statusUnknown?: boolean;
    files: { total: number; created: number; overwritten: number; unchanged: number; conflicts: number };
    sampleTargets: string[];
  }>;
  totals: { tools: number; files: number; created: number; overwritten: number; unchanged: number; conflicts: number };
  backup: { policy: string; note: string };
}

export async function postJson(
  app: Hono,
  path: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

export async function preview(app: Hono, ids: string[]): Promise<PreviewBody> {
  const { status, body } = await postJson(app, '/api/skills/distribution/preview', { ids });
  expect(status).toBe(200);
  return body as unknown as PreviewBody;
}

export function hashOf(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
