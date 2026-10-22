/**
 * github-ref 源串解析单元测试（add-github-skill-source H3）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 4
 * 纯函数，无网络。格式 owner/repo[/subpath][@ref]。
 */
import { describe, it, expect } from 'vitest';
import { parseGithubSource, GithubRefError } from '../../../src/core/github-ref.js';

describe('parseGithubSource 合法源串', () => {
  it('owner/repo → 基础解析', () => {
    expect(parseGithubSource('owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('带 subpath', () => {
    expect(parseGithubSource('acme/skills/tree/main-dir/skills')).toEqual({
      owner: 'acme',
      repo: 'skills',
      subpath: 'tree/main-dir/skills',
    });
  });

  it('带 @ref（分支/tag/短 SHA）', () => {
    expect(parseGithubSource('owner/repo@v1.2.0')).toEqual({ owner: 'owner', repo: 'repo', ref: 'v1.2.0' });
    expect(parseGithubSource('owner/repo@main')).toEqual({ owner: 'owner', repo: 'repo', ref: 'main' });
  });

  it('subpath + @ref 组合（ref 可含斜杠）', () => {
    expect(parseGithubSource('owner/repo/skills/foo@feature/dev')).toEqual({
      owner: 'owner',
      repo: 'repo',
      subpath: 'skills/foo',
      ref: 'feature/dev',
    });
  });

  it('前后空白裁剪', () => {
    expect(parseGithubSource('  owner/repo  ')).toEqual({ owner: 'owner', repo: 'repo' });
  });
});

describe('parseGithubSource 非法源串（Scenario 4：应抛 GithubRefError）', () => {
  const bad: Array<[string, string]> = [
    ['', '空串'],
    ['   ', '纯空白'],
    ['not-a-repo', '缺斜杠'],
    ['/repo', 'owner 为空'],
    ['owner/', 'repo 为空'],
    ['owner//repo', '空段'],
    ['ow ner/repo', '含空格'],
    ['owner/repo@', '@ 后 ref 为空'],
    ['owner/repo/../etc', 'subpath 路径穿越 ..'],
    ['owner/repo@..', 'ref 含 ..'],
    ['a/b/c/d@e/f@g', '多个 @'],
  ];
  for (const [input, label] of bad) {
    it(`拒绝：${label}`, () => {
      expect(() => parseGithubSource(input)).toThrow(GithubRefError);
    });
  }

  it('错误信息含期望格式提示', () => {
    expect(() => parseGithubSource('bad')).toThrow(/owner\/repo/);
  });
});
