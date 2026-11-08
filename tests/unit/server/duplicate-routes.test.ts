/**
 * 重复治理路由测试（add-asset-governance K2/K3/K4/K5）
 *
 * spec: specs/duplicate-governance.spec.md Scenario 2/3/4/5/7
 * 全依赖注入：假 Hub 文件 + 内存批次存储，不碰真实目录。
 */

import { describe, it, expect, vi } from 'vitest';
import { createGovernanceRoutes, type GovernanceRouteDeps } from '../../../src/server/routes/governance.js';
import {
  createMemoryDuplicateBatchStore,
  type DuplicateMergeBatchStore,
} from '../../../src/server/lib/duplicate-batch-store.js';
import type { DuplicateMergePorts } from '../../../src/core/duplicate-merge.js';

const SKILL_A = 'skills/example-skill-a/SKILL.md';
const SKILL_B = 'skills/example-skill-b/SKILL.md';
const BODY = [
  '步骤一 打开设置面板',
  '步骤二 选择目标模型',
  '步骤三 保存本地配置',
  '步骤四 验证生成结果',
  '步骤五 记录调用日志',
  '步骤六 归档历史版本',
  '步骤七 检查分发状态',
].join('\n');
const CONTENT_A = `---\nname: example-skill-a\ndescription: 示例技能\n---\n\n${BODY}\n`;
const CONTENT_B = `---\nname: example-skill-b\ndescription: 示例技能\n---\n\n${BODY}\n步骤八 补充说明\n`;

function makeFiles(): Map<string, string> {
  return new Map([
    [SKILL_A, CONTENT_A],
    [SKILL_B, CONTENT_B],
  ]);
}

function makePorts(files: Map<string, string>, store: DuplicateMergeBatchStore) {
  const distribute = vi.fn(async () => [{ tool: 'trae-cn', action: 'written' as const }]);
  const ports: DuplicateMergePorts = {
    now: () => new Date('2026-11-08T00:00:00.000Z'),
    read: (path) => files.get(path) ?? null,
    backup: (path) => `backups/${path}-1`,
    write: (path, content) => {
      files.set(path, content);
    },
    archive: (original, archived) => {
      const content = files.get(original);
      if (content === undefined) throw new Error('文件不存在');
      if (files.has(archived)) throw new Error('归档目标已存在');
      files.set(archived, content);
      files.delete(original);
    },
    distribute,
    saveBatch: (batch) => store.save(batch),
  };
  return { ports, distribute };
}

function harness(options: { aiConfigured?: boolean } = {}) {
  const files = makeFiles();
  const store = createMemoryDuplicateBatchStore();
  const { ports, distribute } = makePorts(files, store);
  const deps: GovernanceRouteDeps = {
    listAssets: (kind) => [...files.keys()].filter((path) => path.startsWith(`${kind === 'skill' ? 'skills' : kind}/`)),
    read: (path) => files.get(path) ?? null,
    lastModified: () => '2026-11-07T00:00:00.000Z',
    aiConfigured: () => options.aiConfigured ?? false,
    now: () => '2026-11-08T00:00:00.000Z',
    duplicates: {
      apply: ports,
      batchStore: store,
      undo: {
        restoreArchived: (archived, original) => {
          const content = files.get(archived);
          if (content === undefined) throw new Error(`归档缺失：${archived}`);
          files.set(original, content);
          files.delete(archived);
        },
        write: (path, content) => {
          files.set(path, content);
        },
      },
    },
  };
  const routes = createGovernanceRoutes(deps);
  const post = async (path: string, body: unknown) => {
    const response = await routes.request(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, unknown> };
  };
  return { post, files, store, distribute };
}

describe('POST /duplicates/scan（Scenario 2/7）', () => {
  it('确定性扫描分组，零模型调用', async () => {
    const { post } = harness();
    const { status, body } = await post('/duplicates/scan', {});
    expect(status).toBe(200);
    expect(body.aiUsed).toBe(false);
    expect(body.scannedAssets).toBe(2);
    const groups = body.groups as Array<Record<string, unknown>>;
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ category: 'skill', suggestedKeep: SKILL_B });
    const members = groups[0]?.members as Array<Record<string, unknown>>;
    expect(members.map((m) => m.name)).toEqual(['example-skill-a', 'example-skill-b']);
    expect(members[0]?.contentHash).not.toBe(members[1]?.contentHash);
  });

  it('useAiJudgement=true 但 AI 未配置：503', async () => {
    const { post } = harness({ aiConfigured: false });
    const { status } = await post('/duplicates/scan', { useAiJudgement: true });
    expect(status).toBe(503);
  });

  it('AI 已配置时也返回确定性结果与估算调用次数', async () => {
    const { post } = harness({ aiConfigured: true });
    const { status, body } = await post('/duplicates/scan', { useAiJudgement: true });
    expect(status).toBe(200);
    expect(body.aiUsed).toBe(false);
    expect(typeof body.estimatedAiCalls).toBe('number');
  });

  it('类别非法返回 400', async () => {
    const { post } = harness();
    expect((await post('/duplicates/scan', { categories: ['unknown'] })).status).toBe(400);
  });
});

describe('POST /duplicates/merge-draft（Scenario 3/7）', () => {
  async function scanGroupId(): Promise<string> {
    const { post } = harness();
    const scanned = await post('/duplicates/scan', {});
    return ((scanned.body.groups as Array<Record<string, unknown>>)[0]?.id ?? '') as string;
  }

  it('产出合并正文与待归档清单，零写库', async () => {
    const groupId = await scanGroupId();
    const { post, files } = harness();
    const before = new Map(files);
    const { status, body } = await post('/duplicates/merge-draft', { groupId, keepPath: SKILL_B });
    expect(status).toBe(200);
    expect(body.archivePaths).toEqual([SKILL_A]);
    expect(body.draftContent).toContain('补充');
    expect(files).toEqual(before);
  });

  it('保留项不在组内 → 422；分组不存在 → 404', async () => {
    const groupId = await scanGroupId();
    const { post } = harness();
    expect((await post('/duplicates/merge-draft', { groupId, keepPath: 'skills/other/SKILL.md' })).status).toBe(422);
    expect((await post('/duplicates/merge-draft', { groupId: 'dup-near-missing', keepPath: SKILL_B })).status).toBe(404);
  });
});

describe('POST /duplicates/apply + undo（Scenario 4/5）', () => {
  async function prepare() {
    const ctx = harness();
    const scanned = await ctx.post('/duplicates/scan', {});
    const groupId = ((scanned.body.groups as Array<Record<string, unknown>>)[0]?.id ?? '') as string;
    return { ...ctx, groupId };
  }

  it('默认不分发：写保留项 + 归档其余，可还原', async () => {
    const { post, files, groupId, distribute } = await prepare();
    const { status, body } = await post('/duplicates/apply', {
      groupId,
      keepPath: SKILL_B,
      finalContent: `${CONTENT_B}统一后的补充\n`,
      archiveMembers: [SKILL_A],
      distribute: false,
    });
    expect(status).toBe(200);
    expect(body.archived).toEqual([
      {
        from: SKILL_A,
        to: '.archive/duplicates/2026-11-08/skills/example-skill-a/SKILL.md',
        status: 'archived',
      },
    ]);
    expect(distribute).not.toHaveBeenCalled();
    expect(files.has(SKILL_A)).toBe(false);
    expect(files.get(SKILL_B)).toContain('统一后的补充');

    const undone = await post('/duplicates/undo', { groupId });
    expect(undone.status).toBe(200);
    expect(undone.body.keepRestored).toBe(true);
    expect(undone.body.restored).toEqual([SKILL_A]);
    expect(files.get(SKILL_A)).toBe(CONTENT_A);
    expect(files.get(SKILL_B)).toBe(CONTENT_B);
  });

  it('archiveMembers 与草案不一致 → 400', async () => {
    const { post, groupId } = await prepare();
    const { status } = await post('/duplicates/apply', {
      groupId,
      keepPath: SKILL_B,
      finalContent: CONTENT_B,
      archiveMembers: [SKILL_B],
      distribute: false,
    });
    expect(status).toBe(400);
  });

  it('显式分发才调用分发通道', async () => {
    const { post, groupId, distribute } = await prepare();
    const { status, body } = await post('/duplicates/apply', {
      groupId,
      keepPath: SKILL_B,
      finalContent: CONTENT_B,
      archiveMembers: [SKILL_A],
      distribute: true,
      targets: ['trae-cn'],
    });
    expect(status).toBe(200);
    expect(distribute).toHaveBeenCalledTimes(1);
    expect(body.dispatch).toEqual([{ tool: 'trae-cn', action: 'written' }]);
  });

  it('没有合并记录的组还原返回 404', async () => {
    const { post } = harness();
    expect((await post('/duplicates/undo', { groupId: 'dup-near-missing' })).status).toBe(404);
  });
});
