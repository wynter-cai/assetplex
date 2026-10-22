/**
 * github-discovery 布局识别与护栏单元测试（add-github-skill-source I3）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 1/2/7
 * 纯函数：从 git 树识别候选技能，不拉内容、不碰网络。
 */
import { describe, it, expect } from 'vitest';
import {
  identifyGithubSkills,
  MAX_CANDIDATES,
  MAX_SKILL_BYTES,
  type GithubTreeEntry,
} from '../../../src/core/github-discovery.js';

function blob(path: string, size = 100): GithubTreeEntry {
  return { path, type: 'blob', size };
}
function dir(path: string): GithubTreeEntry {
  return { path, type: 'tree' };
}

describe('布局识别（根 / skills/<name> / subpath）', () => {
  it('根 SKILL.md → 单技能仓库（dirPath 为空）', () => {
    const tree = [blob('README.md'), blob('SKILL.md', 300)];
    const r = identifyGithubSkills({ tree, root: '' });
    expect(r.candidates).toHaveLength(1);
    expect(r.candidates[0]).toMatchObject({ skillPath: 'SKILL.md', dirPath: '', skillSize: 300 });
  });

  it('skills/<name>/SKILL.md 多技能 + references 附属归属', () => {
    const tree = [
      dir('skills'),
      blob('skills/foo/SKILL.md', 120),
      blob('skills/foo/references/a.md', 50),
      blob('skills/bar/SKILL.md', 200),
    ];
    const r = identifyGithubSkills({ tree, root: '' });
    const foo = r.candidates.find((c) => c.dirPath === 'skills/foo');
    expect(foo?.skillPath).toBe('skills/foo/SKILL.md');
    expect(foo?.supporting.map((s) => s.path)).toEqual(['skills/foo/references/a.md']);
    expect(r.candidates).toHaveLength(2);
  });

  it('subpath 限定技能集合根', () => {
    const tree = [blob('pkg/SKILL.md'), blob('skills/x/SKILL.md')];
    const r = identifyGithubSkills({ tree, root: 'skills' });
    expect(r.candidates.map((c) => c.skillPath)).toEqual(['skills/x/SKILL.md']);
  });

  it('无约定布局 → 空候选', () => {
    const r = identifyGithubSkills({ tree: [blob('README.md'), blob('src/main.ts')], root: '' });
    expect(r.candidates).toHaveLength(0);
  });
});

describe('护栏限额（Scenario 7：截断并如实标注，不整体报错）', () => {
  it('超单文件 512KB 的 SKILL.md 标记跳过原因、不计入可入库候选', () => {
    const tree = [blob('big/SKILL.md', MAX_SKILL_BYTES + 1)];
    const r = identifyGithubSkills({ tree, root: '' });
    const hit = r.candidates.find((c) => c.dirPath === 'big');
    expect(hit?.skippedReason).toBe('over-size-limit');
    expect(r.notes.some((n) => n.includes('big'))).toBe(true);
  });

  it(`候选数超 ${MAX_CANDIDATES} 截断并入 notes`, () => {
    const tree: GithubTreeEntry[] = [];
    for (let i = 0; i < MAX_CANDIDATES + 5; i += 1) tree.push(blob(`skills/s${i}/SKILL.md`));
    const r = identifyGithubSkills({ tree, root: '' });
    expect(r.candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(r.notes.join()).toContain('前');
  });

  it('树被 GitHub 截断（truncated）→ note 如实提示清单可能不完整', () => {
    const r = identifyGithubSkills({ tree: [blob('SKILL.md')], root: '', truncated: true });
    expect(r.notes.join()).toContain('不完整');
  });
});
