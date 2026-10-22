/**
 * github-curate：GitHub 技能确认入库链路 + 全文预览（add-github-skill-source J1/J2）
 *
 * 唯一产生本地写入的环节：逐条 fetchRaw → 命名校验 → 冲突判定（库内同名默认跳过 / 可覆盖，
 * 覆盖前经注入的 backup 备份旧版）→ 整目录写入 vault（source=github:{repo}@{sha}:{path}）。
 * 批量部分成功语义、单条失败不回滚已成功项。二进制附属文件按扩展名判定跳过。
 * 宪法③：只写保险箱 vault，绝不反向写任何工具目录；core 不 import fs，写走注入 SkillWriteFs。
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/preview-curate.spec.md Scenario 1-5/8/9
 */

import { fetchTree, fetchRaw, type GithubHttpClient } from './github-source.js';
import { identifyGithubSkills, type GithubLocatedSkill } from './github-discovery.js';
import {
  parseFrontmatter,
  listSkills,
  type SkillInfo,
  type SkillSources,
  type SkillOverrideStore,
} from './skills-inventory.js';
import { buildAssetMarkdown, validateAssetName, AssetWriteError } from './asset-name.js';
import type { SkillWriteFs } from './skill-write.js';

/** 入库确认动作：库内同名默认跳过，可选覆盖 */
export type GithubCurateAction = 'overwrite' | 'skip';

export interface GithubCurateItem {
  skillPath: string;
  /** 入库名（同时用作 vault 目录名）；缺省取 GitHub 目录 basename */
  name?: string;
  action?: GithubCurateAction;
}

export interface GithubCurateInput {
  repo: string;
  sha: string;
  items: GithubCurateItem[];
}

export interface GithubCurateDeps {
  fs: SkillWriteFs;
  sources: SkillSources;
  store: SkillOverrideStore;
  client: GithubHttpClient;
  /** 覆盖前备份既有 SKILL.md 绝对路径，返回 backupRef（服务端注入 doctor-backup 实现） */
  backup?: (absSkillMdPath: string) => string;
}

export interface GithubCurateBatchResult {
  created: SkillInfo[];
  skipped: { skillPath: string; name: string }[];
  failed: { skillPath: string; name?: string; error: string }[];
  backupRefs: string[];
  suggestDoctor: boolean;
}

/** 附属文件合计写入上限（与风险条款一致：单技能 2MB） */
const MAX_SUPPORT_BYTES = 2 * 1024 * 1024;

/** 视为文本的扩展名（大小写不敏感）；无扩展名文件也按文本处理 */
const TEXT_EXTENSIONS = new Set([
  'md', 'markdown', 'txt', 'text', 'json', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf',
  'csv', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'sh', 'bash', 'ps1', 'bat', 'html', 'css', 'scss', 'xml', 'env', 'example', 'gitignore',
]);

/** 附属文件是否为文本（可安全按行写入）；未知/二进制扩展名判 false */
function isTextFile(path: string): boolean {
  const file = path.slice(path.lastIndexOf('/') + 1);
  const dot = file.lastIndexOf('.');
  if (dot <= 0) return true; // 无扩展名或隐藏文件（.gitignore）按文本
  return TEXT_EXTENSIONS.has(file.slice(dot + 1).toLowerCase());
}

function dirBasename(dirPath: string): string {
  const trimmed = dirPath.replace(/\/+$/, '');
  if (trimmed === '') return '';
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function splitRepo(repo: string): { owner: string; name: string } {
  const idx = repo.indexOf('/');
  return { owner: repo.slice(0, idx), name: repo.slice(idx + 1) };
}

/** 'acme/skills'@sha 下的全仓库技能定位表（skillPath → located） */
async function locateAll(
  client: GithubHttpClient,
  repo: string,
  sha: string,
): Promise<Map<string, GithubLocatedSkill>> {
  const { owner, name } = splitRepo(repo);
  const tree = await fetchTree(client, owner, name, sha);
  const identified = identifyGithubSkills({ tree: tree.tree, root: '' });
  return new Map(identified.candidates.map((c) => [c.skillPath, c]));
}

export async function curateGithubSkills(
  input: GithubCurateInput,
  deps: GithubCurateDeps,
): Promise<GithubCurateBatchResult> {
  if (input.items.length === 0) {
    throw new AssetWriteError('items 不能为空', 400);
  }
  const { fs, sources, store, client } = deps;
  const { owner, name: repoName } = splitRepo(input.repo);
  const locatedMap = await locateAll(client, input.repo, input.sha);
  const existingItems = listSkills({ fs, sources, store }).items;

  const created: SkillInfo[] = [];
  const skipped: GithubCurateBatchResult['skipped'] = [];
  const failed: GithubCurateBatchResult['failed'] = [];
  const backupRefs: string[] = [];

  for (const item of input.items) {
    const located = locatedMap.get(item.skillPath);
    if (!located) {
      failed.push({ skillPath: item.skillPath, error: '候选不存在或仓库树已变化' });
      continue;
    }
    if (located.skippedReason !== undefined) {
      failed.push({ skillPath: item.skillPath, error: `超出护栏上限：${located.skippedReason}` });
      continue;
    }

    let targetName: string;
    try {
      targetName = validateAssetName(item.name ?? dirBasename(located.dirPath) ?? '');
    } catch (err) {
      failed.push({ skillPath: item.skillPath, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    const existing = existingItems.find((s) => s.id === targetName.toLowerCase());
    const action: GithubCurateAction = item.action ?? 'skip';
    if (existing && existing.origin !== 'vault') {
      failed.push({ skillPath: item.skillPath, name: targetName, error: `同名技能已存在（来源 ${existing.origin}），请改名` });
      continue;
    }
    if (existing && existing.origin === 'vault' && action === 'skip') {
      skipped.push({ skillPath: item.skillPath, name: targetName });
      continue; // 默认跳过：不拉内容、不写库
    }

    try {
      const raw = await fetchRaw(client, owner, repoName, input.sha, item.skillPath);
      if (existing && existing.origin === 'vault' && deps.backup) {
        backupRefs.push(deps.backup(existing.sourcePath));
      }
      await writeSkill(input, targetName, located, raw, sources, fs, client, owner, repoName);
      const refreshed = listSkills({ fs, sources, store }).items.find((s) => s.id === targetName.toLowerCase());
      if (refreshed) created.push(refreshed);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failed.push({ skillPath: item.skillPath, name: targetName, error: reason });
    }
  }

  return { created, skipped, failed, backupRefs, suggestDoctor: created.length > 0 };
}

/** 整目录写入：SKILL.md（带溯源 frontmatter）+ 附属文本文件（二进制/超限跳过） */
async function writeSkill(
  input: GithubCurateInput,
  targetName: string,
  located: GithubLocatedSkill,
  rawSkillMd: string,
  sources: SkillSources,
  fs: SkillWriteFs,
  client: GithubHttpClient,
  owner: string,
  repoName: string,
): Promise<void> {
  const fm = parseFrontmatter(rawSkillMd);
  const source = `github:${input.repo}@${input.sha}:${located.skillPath}`;
  const skillDir = `${sources.vaultSkillsDir}/${targetName}`;
  fs.ensureDir(skillDir);
  fs.writeFile(
    `${skillDir}/SKILL.md`,
    buildAssetMarkdown({ name: targetName, description: fm.data.description ?? '', content: fm.body, source }),
  );

  if (located.supportingTotal > MAX_SUPPORT_BYTES) return;
  for (const file of located.supporting) {
    if (!isTextFile(file.path)) continue; // 二进制附属：跳过（清单已在预览/护栏 notes 体现）
    const rel = located.dirPath === '' ? file.path : file.path.slice(located.dirPath.length + 1);
    const dest = `${skillDir}/${rel}`;
    const slash = rel.lastIndexOf('/');
    try {
      const content = await fetchRaw(client, owner, repoName, input.sha, file.path);
      if (slash >= 0) fs.ensureDir(`${skillDir}/${rel.slice(0, slash)}`);
      fs.writeFile(dest, content);
    } catch {
      // 单个附属文件拉取失败（如限额/临时错误）不影响主技能：SKILL.md 已写入，跳过该附属即可
      continue;
    }
  }
}

export interface GithubPreviewInput {
  repo: string;
  sha: string;
  skillPath: string;
}

export interface GithubPreview {
  name: string;
  description: string;
  content: string;
  supportingFiles: { path: string; size: number; binary: boolean }[];
}

export interface GithubPreviewDeps {
  client: GithubHttpClient;
  sources: SkillSources;
  store: SkillOverrideStore;
  fs?: SkillWriteFs;
}

/** 全文预览：raw 读回展示，全程零落盘（宪法③） */
export async function previewGithubSkill(input: GithubPreviewInput, deps: GithubPreviewDeps): Promise<GithubPreview> {
  const locatedMap = await locateAll(deps.client, input.repo, input.sha);
  const located = locatedMap.get(input.skillPath);
  if (!located) throw new AssetWriteError('候选不存在或仓库树已变化', 404);
  const { owner, name } = splitRepo(input.repo);
  const raw = await fetchRaw(deps.client, owner, name, input.sha, input.skillPath);
  const fm = parseFrontmatter(raw);
  return {
    name: fm.data.name ?? dirBasename(located.dirPath) ?? 'skill',
    description: fm.data.description ?? '',
    content: fm.body,
    supportingFiles: located.supporting.map((f) => ({ path: f.path, size: f.size, binary: !isTextFile(f.path) })),
  };
}
