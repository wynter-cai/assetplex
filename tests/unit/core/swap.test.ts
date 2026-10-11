/**
 * swap 核心引擎单元测试
 *
 * spec: enable-tool-hot-swap T3-T6 —— 切换包组装/预览/执行/备份/验证/回滚/历史
 * 说明:用 FakeToolAdapter 定向到临时目录，避免污染真实 ~/.workbuddy。
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BaseAdapter } from '../../../src/core/adapters/base.js';
import type { HubConfig } from '../../../src/core/config.js';
import { HubConfigSchema } from '../../../src/core/config.js';
import type { HubItem, SyncStrategy, SyncTarget } from '../../../src/core/types.js';
import { SwapEngine, SWAP_CATEGORIES } from '../../../src/core/swap.js';
import type { SwapCategory, SwapPreview } from '../../../src/core/swap.js';

/** 六类各备一份库内资产(相对 Hub 根 posix 路径) */
const CATEGORY_HUB_FILE: Record<SwapCategory, string> = {
  identity: 'identity/profile.md',
  rule: 'rules/global.md',
  skill: 'skills/demo/SKILL.md',
  mcp: 'mcp/mcp.sources.json',
  memory: 'memory/notes.md',
  agent: 'agents/researcher.md',
};

/** 每类在 Hub 的文件数(用于计数断言) */
const CATEGORY_HUB_COUNT: Record<SwapCategory, number> = {
  identity: 1,
  rule: 1,
  skill: 1,
  mcp: 1,
  memory: 1,
  agent: 1,
};

const FAKE_LAYOUT: Record<SwapCategory, { rel: string; target: string; strategy: SyncStrategy; isDir: boolean }> = {
  identity: { rel: 'identity/profile.md', target: 'IDENTITY.md', strategy: 'symlink', isDir: false },
  rule: { rel: 'rules', target: 'rules', strategy: 'symlink', isDir: true },
  skill: { rel: 'skills', target: 'skills', strategy: 'symlink', isDir: true },
  mcp: { rel: 'mcp/mcp.sources.json', target: '.mcp.json', strategy: 'copy', isDir: false },
  memory: { rel: 'memory', target: 'memory', strategy: 'symlink', isDir: true },
  agent: { rel: 'agents', target: 'agents', strategy: 'symlink', isDir: true },
};

/** 测试用假适配器:categories 决定其支持的类别(模拟工具能力差异) */
class FakeToolAdapter extends BaseAdapter {
  readonly name = 'faketool';
  readonly displayName = 'Fake Tool';
  protected defaultConfigDir = '';
  protected signatureFiles = ['sig.txt'];
  protected supportedTargets: string[] = [];

  constructor(
    private readonly dir: string,
    private readonly categories: SwapCategory[],
  ) {
    super();
  }

  override getConfigDir(): string {
    return this.dir;
  }

  targets(): SyncTarget[] {
    return [];
  }

  override resolveHubItems(
    _hubConfig: HubConfig,
    hubRoot: string,
  ): Array<{ item: HubItem; target: SyncTarget }> {
    return this.categories.map((cat) => {
      const layout = FAKE_LAYOUT[cat];
      return {
        item: {
          type: cat,
          relativePath: layout.rel,
          absolutePath: resolve(hubRoot, layout.rel),
        } as HubItem,
        target: {
          tool: this.name,
          targetPath: resolve(this.dir, layout.target),
          strategy: layout.strategy,
          isDirectory: layout.isDir,
        } as SyncTarget,
      };
    });
  }
}

describe('swap 核心引擎(enable-tool-hot-swap T3-T6)', () => {
  let hubDir: string;
  let toolDir: string;
  let originalAssetPlexDir: string | undefined;

  beforeEach(() => {
    hubDir = mkdtempSync(join(tmpdir(), 'assetplex-swap-hub-'));
    toolDir = mkdtempSync(join(tmpdir(), 'assetplex-swap-tool-'));
    writeFileSync(join(toolDir, 'sig.txt'), 'sig');
    originalAssetPlexDir = process.env.ASSETPLEX_DIR;
    process.env.ASSETPLEX_DIR = hubDir;
  });

  afterEach(() => {
    if (originalAssetPlexDir === undefined) delete process.env.ASSETPLEX_DIR;
    else process.env.ASSETPLEX_DIR = originalAssetPlexDir;
    rmSync(hubDir, { recursive: true, force: true });
    rmSync(toolDir, { recursive: true, force: true });
  });

  /** 在 Hub(临时 ASSETPLEX_DIR)内写一个文件 */
  function writeHub(relPosix: string, content: string): void {
    const abs = join(hubDir, ...relPosix.split('/'));
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }

  /** 备齐六类资产各一份 */
  function seedAllCategories(): void {
    for (const rel of Object.values(CATEGORY_HUB_FILE)) {
      writeHub(rel, `# ${rel}\ncontent`);
    }
  }

  function engineWith(categories: SwapCategory[]): SwapEngine {
    const adapter = new FakeToolAdapter(toolDir, categories);
    return new SwapEngine(HubConfigSchema.parse({}), [adapter]);
  }

  function groupOf(preview: SwapPreview, cat: SwapCategory) {
    const g = preview.groups.find((x) => x.category === cat);
    expect(g, `分组 ${cat} 应存在`).toBeDefined();
    return g!;
  }

  describe('Bundle 组装与预览(T3)', () => {
    it('SWAP_CATEGORIES 恰好为六类(不含 preference)', () => {
      expect([...SWAP_CATEGORIES].sort()).toEqual(
        ['agent', 'identity', 'mcp', 'memory', 'rule', 'skill'].sort(),
      );
    });

    it('全支持工具预览六类齐全，每类含资产项与 targetPath', async () => {
      seedAllCategories();
      const engine = engineWith([...SWAP_CATEGORIES]);
      const preview = await engine.preview('faketool');

      expect(preview.tool).toBe('faketool');
      expect(preview.toolInstalled).toBe(true);
      expect(preview.groups).toHaveLength(6);
      for (const cat of SWAP_CATEGORIES) {
        const g = groupOf(preview, cat);
        expect(g.support.supported).toBe(true);
        expect(g.items.length).toBe(CATEGORY_HUB_COUNT[cat]);
        expect(g.items[0].category).toBe(cat);
        expect(g.items[0].targetPath).toContain(FAKE_LAYOUT[cat].target);
      }
    });

    it('不支持的类别标注 support=false 与原因，库内该类别计为 skip', async () => {
      seedAllCategories();
      const engine = engineWith(['identity', 'rule', 'skill', 'mcp']);
      const preview = await engine.preview('faketool');

      for (const cat of ['memory', 'agent'] as SwapCategory[]) {
        const g = groupOf(preview, cat);
        expect(g.support.supported).toBe(false);
        if (!g.support.supported) {
          expect(g.support.reason).toContain('不支持');
        }
        expect(g.items).toHaveLength(0);
        expect(g.counts.skipped).toBe(CATEGORY_HUB_COUNT[cat]);
      }
      expect(groupOf(preview, 'identity').items).toHaveLength(1);
    });

    it('differs 项 defaultOverwrite=false;新增项 conflict=none', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeHub('rules/global.md', '# Rule A');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own Identity', 'utf-8');

      const engine = engineWith(['identity', 'rule']);
      const preview = await engine.preview('faketool');

      const idt = groupOf(preview, 'identity').items[0];
      expect(idt.conflict).toBe('differs');
      expect(idt.defaultOverwrite).toBe(false);
      expect(groupOf(preview, 'identity').counts.willOverwrite).toBe(1);

      const rule = groupOf(preview, 'rule').items[0];
      expect(rule.conflict).toBe('none');
      expect(rule.defaultOverwrite).toBe(true);
      expect(groupOf(preview, 'rule').counts.new).toBe(1);
    });

    it('目标内容一致时 conflict=exists 计 unchanged', async () => {
      writeHub('identity/profile.md', '# Same');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Same', 'utf-8');

      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');

      expect(groupOf(preview, 'identity').items[0].conflict).toBe('exists');
      expect(groupOf(preview, 'identity').counts.unchanged).toBe(1);
    });

    it('类别在库中为空则不产生条目', async () => {
      writeHub('identity/profile.md', '# Only Identity');
      const engine = engineWith(['identity', 'skill']);
      const preview = await engine.preview('faketool');

      expect(groupOf(preview, 'skill').items).toHaveLength(0);
      expect(groupOf(preview, 'skill').counts.total).toBe(0);
    });

    it('generatedAt 为有效 ISO 时间戳', async () => {
      seedAllCategories();
      const engine = engineWith([...SWAP_CATEGORIES]);
      const preview = await engine.preview('faketool');

      expect(typeof preview.generatedAt).toBe('string');
      expect(Number.isNaN(Date.parse(preview.generatedAt))).toBe(false);
    });

    it('buildBundle 汇总六类 HubItem 且给出支持矩阵', async () => {
      seedAllCategories();
      const engine = engineWith(['identity', 'rule', 'skill', 'mcp', 'memory']);
      const bundle = engine.buildBundle('faketool');

      expect(bundle.categories).toHaveLength(6);
      const agent = bundle.categories.find((c) => c.category === 'agent')!;
      expect(agent.support.supported).toBe(false);
      expect(agent.hubItems).toHaveLength(1);
      const identity = bundle.categories.find((c) => c.category === 'identity')!;
      expect(identity.support.supported).toBe(true);
      expect(identity.hubItems[0].relativePath).toBe('identity/profile.md');
      expect(existsSync(identity.hubItems[0].absolutePath)).toBe(true);
    });
  });

  describe('执行与覆盖前备份(T4)', () => {
    it('未确认覆盖的 differs 项保持原样且计 skip;新增项照常写入', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeHub('rules/global.md', '# Rule A');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own Identity', 'utf-8');

      const engine = engineWith(['identity', 'rule']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });

      // differs 未确认:目标保持原样
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Tool Own Identity');
      const idtItem = result.items.find((i) => i.hubRelativePath === 'identity/profile.md');
      expect(idtItem?.action).toBe('skipped');
      expect(idtItem?.reason).toContain('未确认');
      // 新增照常写入
      const ruleItem = result.items.find((i) => i.hubRelativePath === 'rules/global.md');
      expect(ruleItem?.action).toBe('written');
      expect(result.counts.skipped).toBeGreaterThanOrEqual(1);
      expect(result.counts.written).toBeGreaterThanOrEqual(1);
      expect(result.success).toBe(true);
    });

    it('确认覆盖的 differs 项先备份再写，rollbackAvailable=true', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own Identity', 'utf-8');

      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
      });

      const idtItem = result.items.find((i) => i.hubRelativePath === 'identity/profile.md');
      expect(idtItem?.action).toBe('written');
      expect(result.rollbackAvailable).toBe(true);

      // 备份清单含覆盖项旧内容
      const backupDir = join(hubDir, '.swap-backup', result.swapId);
      expect(existsSync(backupDir)).toBe(true);
      const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf-8')) as {
        entries: Array<{ targetPath: string; previousExisted: boolean; backupKey?: string }>;
      };
      const entry = manifest.entries.find((e) => e.targetPath.endsWith('IDENTITY.md'));
      expect(entry).toBeDefined();
      expect(entry!.previousExisted).toBe(true);
      expect(entry!.backupKey).toBeDefined();
      expect(readFileSync(join(backupDir, 'files', entry!.backupKey!), 'utf-8')).toBe('# Tool Own Identity');
      // 覆盖生效
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Hub Identity');
    });

    it('备份只含覆盖项:全新投放无备份副本', async () => {
      writeHub('rules/global.md', '# Rule A');

      const engine = engineWith(['rule']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });

      expect(result.counts.written).toBe(1);
      const backupDir = join(hubDir, '.swap-backup', result.swapId);
      const manifest = JSON.parse(readFileSync(join(backupDir, 'manifest.json'), 'utf-8')) as {
        entries: Array<{ previousExisted: boolean; backupKey?: string }>;
      };
      expect(manifest.entries.every((e) => e.previousExisted === false && e.backupKey === undefined)).toBe(true);
      expect(existsSync(join(backupDir, 'files'))).toBe(false);
    });

    it('执行新建的中间目录记入清单，回滚一并清除不留空目录(T10 端到端发现的缺口)', async () => {
      writeHub('skills/demo/SKILL.md', '# demo skill');
      // skills 根已存在但子目录不存在 → 走逐文件路径，执行时会新建 skills/demo/
      mkdirSync(join(toolDir, 'skills'), { recursive: true });

      const engine = engineWith(['skill']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });
      expect(result.counts.written).toBe(1);
      expect(existsSync(join(toolDir, 'skills', 'demo'))).toBe(true);

      const manifest = JSON.parse(
        readFileSync(join(hubDir, '.swap-backup', result.swapId, 'manifest.json'), 'utf-8'),
      ) as { entries: Array<{ targetPath: string; kind: string; previousExisted: boolean }> };
      expect(manifest.entries.some((e) => e.kind === 'dir' && e.previousExisted === false)).toBe(true);

      const rb = await engine.rollback(result.swapId);
      expect(rb.success).toBe(true);
      expect(existsSync(join(toolDir, 'skills', 'demo'))).toBe(false);
      expect(existsSync(join(toolDir, 'skills'))).toBe(true); // 已存在的根目录不误删
    });

    it('staleness:预览后目标目录发生变化则拒绝执行', async () => {
      writeHub('identity/profile.md', '# Hub Identity');

      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');
      // 预览之后，工具侧新出现不同内容文件(指纹变化)
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Someone Changed', 'utf-8');

      await expect(
        engine.execute({
          tool: 'faketool',
          previewGeneratedAt: preview.generatedAt,
          overwriteDecisions: [],
        }),
      ).rejects.toThrow(/重新预览/);
      // 目标未被改动
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Someone Changed');
    });

    it('未知或已消费的 previewGeneratedAt 拒绝执行', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');

      await expect(
        engine.execute({ tool: 'faketool', previewGeneratedAt: 'not-a-real-preview', overwriteDecisions: [] }),
      ).rejects.toThrow(/过期/);

      // 首次成功执行后，同一预览不可复用
      await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });
      await expect(
        engine.execute({ tool: 'faketool', previewGeneratedAt: preview.generatedAt, overwriteDecisions: [] }),
      ).rejects.toThrow(/过期/);
    });

    it('类别不支持的资产不参与执行，其余类别正常投放', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeHub('memory/notes.md', '# Mem');

      const engine = engineWith(['identity']); // 不支持 memory
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });

      expect(result.items.every((i) => i.category === 'identity')).toBe(true);
      expect(result.success).toBe(true);
      expect(existsSync(resolve(toolDir, 'memory'))).toBe(false);
    });
  });

  describe('回读验证(T5)', () => {
    it('目标与源一致 → passed，各维度全绿', () => {
      writeHub('identity/profile.md', '# Same Content');
      const target = resolve(toolDir, 'IDENTITY.md');
      writeFileSync(target, '# Same Content', 'utf-8');

      const engine = engineWith(['identity']);
      const v = engine.verify(join(hubDir, 'identity/profile.md'), target, 'identity/profile.md');

      expect(v.exists).toBe(true);
      expect(v.parseable).toBe(true);
      expect(v.matchesSource).toBe(true);
      expect(v.passed).toBe(true);
      expect(v.failure).toBeUndefined();
    });

    it('目标被篡改 → matchesSource=false 计失败并给出路径', () => {
      writeHub('identity/profile.md', '# Source');
      const target = resolve(toolDir, 'IDENTITY.md');
      writeFileSync(target, '# Tampered', 'utf-8');

      const engine = engineWith(['identity']);
      const v = engine.verify(join(hubDir, 'identity/profile.md'), target, 'identity/profile.md');

      expect(v.exists).toBe(true);
      expect(v.matchesSource).toBe(false);
      expect(v.passed).toBe(false);
      expect(v.failure).toContain('一致');
      expect(v.failure).toContain('IDENTITY.md');
    });

    it('MCP JSON 非法 → parseable=false(即使字节与源一致)', () => {
      writeHub('mcp/mcp.sources.json', '{ invalid json !!');
      const target = resolve(toolDir, '.mcp.json');
      writeFileSync(target, '{ invalid json !!', 'utf-8');

      const engine = engineWith(['mcp']);
      const v = engine.verify(join(hubDir, 'mcp/mcp.sources.json'), target, 'mcp/mcp.sources.json');

      expect(v.matchesSource).toBe(true);
      expect(v.parseable).toBe(false);
      expect(v.passed).toBe(false);
      expect(v.failure).toContain('解析');
    });

    it('TOML 非法 → parseable=false', () => {
      writeHub('mcp/broken.json', '{}');
      const target = resolve(toolDir, 'config.toml');
      writeFileSync(target, 'this = is = not = toml [[', 'utf-8');

      const engine = engineWith(['mcp']);
      const v = engine.verify(join(hubDir, 'mcp/broken.json'), target, 'mcp/broken.json');

      expect(v.parseable).toBe(false);
      expect(v.passed).toBe(false);
    });

    it('目标缺失 → exists=false;源缺失 → matchesSource=false', () => {
      writeHub('identity/profile.md', '# Source');
      const engine = engineWith(['identity']);

      const missingTarget = engine.verify(join(hubDir, 'identity/profile.md'), resolve(toolDir, 'NOPE.md'), 'identity/profile.md');
      expect(missingTarget.exists).toBe(false);
      expect(missingTarget.passed).toBe(false);
      expect(missingTarget.failure).toContain('不存在');

      const target = resolve(toolDir, 'IDENTITY.md');
      writeFileSync(target, '# Whatever', 'utf-8');
      const missingSource = engine.verify(join(hubDir, 'identity/gone.md'), target, 'identity/gone.md');
      expect(missingSource.exists).toBe(true);
      expect(missingSource.matchesSource).toBe(false);
      expect(missingSource.passed).toBe(false);
    });

    it('执行结果中 written 项携带验证结论，未过项计 failed', async () => {
      writeHub('identity/profile.md', '# Hub Identity');

      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [],
      });

      const written = result.items.find((i) => i.action === 'written');
      expect(written).toBeDefined();
      expect(written?.verify?.passed).toBe(true);
      expect(written?.verify?.hubRelativePath).toBe('identity/profile.md');
      expect(result.success).toBe(true);
    });

    it('含 ${VAR} 插值的源按插值后内容比对(不误报不一致)', () => {
      process.env['ASSETPLEX_SWAP_TEST_VAR'] = 'real-value';
      writeHub('mcp/mcp.sources.json', '{"url": "${ASSETPLEX_SWAP_TEST_VAR}"}');
      const target = resolve(toolDir, '.mcp.json');
      writeFileSync(target, '{"url": "real-value"}', 'utf-8');

      const engine = engineWith(['mcp']);
      const v = engine.verify(join(hubDir, 'mcp/mcp.sources.json'), target, 'mcp/mcp.sources.json');

      expect(v.matchesSource).toBe(true);
      expect(v.passed).toBe(true);
      delete process.env['ASSETPLEX_SWAP_TEST_VAR'];
    });
  });

  describe('回滚、切换历史与备份保留(T6)', () => {
    /** 备份根下的 <swapId> 目录名列表 */
    function backupDirNames(): string[] {
      const root = join(hubDir, '.swap-backup');
      if (!existsSync(root)) return [];
      return readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
    }

    /** 拉开时间戳，保证 swapId 可排序 */
    async function sleep(ms: number): Promise<void> {
      await new Promise((r) => setTimeout(r, ms));
    }

    it('回滚后覆盖项回到切换前，本次新增项被移除', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeHub('rules/global.md', '# Rule A');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own', 'utf-8');

      const engine = engineWith(['identity', 'rule']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
      });
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Hub Identity');

      const rollback = await engine.rollback(result.swapId);
      expect(rollback.success).toBe(true);
      expect(rollback.restored).toBe(1);
      expect(rollback.removed).toBe(1); // rules 目录为本次新增，回滚即移除
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Tool Own');
      expect(existsSync(resolve(toolDir, 'rules'))).toBe(false);

      // 历史标记已回滚
      const entry = engine.history().find((h) => h.swapId === result.swapId);
      expect(entry?.rolledBack).toBe(true);
    });

    it('回滚幂等:重复回滚不报错；未知 swapId 明确失败', async () => {
      writeHub('identity/profile.md', '# Hub Identity');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# Tool Own', 'utf-8');

      const engine = engineWith(['identity']);
      const preview = await engine.preview('faketool');
      const result = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: preview.generatedAt,
        overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
      });

      const first = await engine.rollback(result.swapId);
      const second = await engine.rollback(result.swapId);
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# Tool Own');

      const unknown = await engine.rollback('no-such-swap-id');
      expect(unknown.success).toBe(false);
      expect(unknown.error).toContain('不存在');
    });

    it('每次切换记一条历史，最新在前，含工具/时间/计数/可回滚标志', async () => {
      writeHub('identity/profile.md', '# V1');
      const engine = engineWith(['identity']);

      const p1 = await engine.preview('faketool');
      const r1 = await engine.execute({ tool: 'faketool', previewGeneratedAt: p1.generatedAt, overwriteDecisions: [] });
      await sleep(5);

      writeHub('identity/profile.md', '# V2 differs');
      const p2 = await engine.preview('faketool');
      const r2 = await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: p2.generatedAt,
        overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
      });

      const hist = engine.history();
      expect(hist).toHaveLength(2);
      expect(hist[0].swapId).toBe(r2.swapId); // 最新在前
      expect(hist[1].swapId).toBe(r1.swapId);
      expect(hist[0].tool).toBe('faketool');
      expect(hist[0].counts.written).toBeGreaterThanOrEqual(1);
      expect(hist[0].rollbackAvailable).toBe(true);
      expect(hist[0].rolledBack).toBe(false);
    });

    it('备份仅保留最近 3 次，清理只及备份目录不碰工具资产', async () => {
      writeHub('identity/profile.md', '# V1');
      const engine = engineWith(['identity']);

      const swapIds: string[] = [];
      for (let i = 1; i <= 4; i++) {
        const preview = await engine.preview('faketool');
        const result = await engine.execute({
          tool: 'faketool',
          previewGeneratedAt: preview.generatedAt,
          overwriteDecisions: i === 1 ? [] : [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
        });
        swapIds.push(result.swapId);
        await sleep(5);
        if (i < 4) {
          // 下轮制造新差异，保证每轮都产生备份
          writeHub('identity/profile.md', `# V${i + 1}`);
          writeFileSync(resolve(toolDir, 'IDENTITY.md'), `# External ${i}`, 'utf-8');
        }
      }

      // 仅保留最近 3 次备份目录
      expect(backupDirNames()).toHaveLength(3);
      expect(backupDirNames()).not.toContain(swapIds[0]);
      // 工具资产目录未被清理波及
      expect(readFileSync(resolve(toolDir, 'IDENTITY.md'), 'utf-8')).toBe('# V4');
      // 最早的切换历史不可再回滚，最近的可回滚
      const hist = engine.history();
      expect(hist).toHaveLength(4);
      expect(hist[hist.length - 1].swapId).toBe(swapIds[0]);
      expect(hist[hist.length - 1].rollbackAvailable).toBe(false);
      expect(hist[0].rollbackAvailable).toBe(true);
    });

    it('backupRetain 可配置', async () => {
      writeHub('identity/profile.md', '# V1');
      const adapter = new FakeToolAdapter(toolDir, ['identity']);
      const engine = new SwapEngine(HubConfigSchema.parse({}), [adapter], { backupRetain: 1 });

      const p1 = await engine.preview('faketool');
      await engine.execute({ tool: 'faketool', previewGeneratedAt: p1.generatedAt, overwriteDecisions: [] });
      await sleep(5);

      writeHub('identity/profile.md', '# V2');
      writeFileSync(resolve(toolDir, 'IDENTITY.md'), '# External', 'utf-8');
      const p2 = await engine.preview('faketool');
      await engine.execute({
        tool: 'faketool',
        previewGeneratedAt: p2.generatedAt,
        overwriteDecisions: [{ hubRelativePath: 'identity/profile.md', overwrite: true }],
      });

      expect(backupDirNames()).toHaveLength(1);
    });
  });
});
