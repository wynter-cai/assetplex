/**
 * GitHub 源串解析（纯逻辑，无网络）
 *
 * spec: 设计文档/changes/add-github-skill-source/specs/github-fetch.spec.md Scenario 4
 * 格式：owner/repo[/subpath][@ref]。ref 缺省为默认分支；解析后由 github-source.ts 落 SHA。
 * 只做格式校验与拆解，路径穿越（..）与非法字符一律拒绝，不发任何网络请求。
 */

/** 解析结果（未含 commit SHA，SHA 由网络层解析后填充为契约 GithubSourceRef） */
export interface GithubSourceSpec {
  owner: string;
  repo: string;
  /** 仓库内相对子路径（技能集合根），无则省略 */
  subpath?: string;
  /** 用户书写的 ref（分支/tag/短 SHA），无则省略（默认分支） */
  ref?: string;
}

const FORMAT_HINT = 'GitHub 源格式应为 owner/repo[/subpath][@ref]';

/** 源串非法（路由映射 400） */
export class GithubRefError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GithubRefError';
  }
}

/** owner/repo 段：字母数字 . _ -，禁止空与纯点段（.. / .） */
function isNameSegment(seg: string): boolean {
  return /^[A-Za-z0-9._-]+$/.test(seg) && seg !== '.' && seg !== '..';
}

/** subpath 段：字母数字 . _ - 与空格，禁止空段与 . / ..（防路径穿越） */
function isPathSegment(seg: string): boolean {
  return /^[A-Za-z0-9._\- ]+$/.test(seg) && seg !== '.' && seg !== '..';
}

/** ref：允许斜杠（feature/x）、字母数字 . _ -，禁止含 .. 与空 */
function isRefValid(ref: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(ref) && !ref.includes('..') && !ref.startsWith('.');
}

/**
 * 解析源串为 owner/repo[/subpath][@ref]。
 * @throws GithubRefError 空串、缺 owner/repo、空段、路径穿越、非法字符、多个 @
 */
export function parseGithubSource(raw: string): GithubSourceSpec {
  const input = (raw ?? '').trim();
  if (input === '') {
    throw new GithubRefError(`${FORMAT_HINT}（不能为空）`);
  }

  const atCount = (input.match(/@/g) ?? []).length;
  if (atCount > 1) {
    throw new GithubRefError(`${FORMAT_HINT}（只能有一个 @ref 分隔符）`);
  }

  const [pathPart, refPart] = atCount === 1 ? input.split('@') : [input, undefined];

  if (refPart !== undefined) {
    if (refPart === '') {
      throw new GithubRefError(`${FORMAT_HINT}（@ 后 ref 不能为空）`);
    }
    if (!isRefValid(refPart)) {
      throw new GithubRefError(`${FORMAT_HINT}（ref 非法：${refPart}）`);
    }
  }

  const segments = (pathPart ?? '').split('/');
  if (segments.length < 2) {
    throw new GithubRefError(`${FORMAT_HINT}（缺少 repo 段）`);
  }
  const [owner, repo, ...rest] = segments;
  if (!owner || !isNameSegment(owner)) {
    throw new GithubRefError(`${FORMAT_HINT}（owner 非法）`);
  }
  if (!repo || !isNameSegment(repo)) {
    throw new GithubRefError(`${FORMAT_HINT}（repo 非法）`);
  }

  const spec: GithubSourceSpec = { owner, repo };
  if (rest.length > 0) {
    if (rest.some((seg) => seg === '' || !isPathSegment(seg))) {
      throw new GithubRefError(`${FORMAT_HINT}（subpath 非法或含路径穿越）`);
    }
    spec.subpath = rest.join('/');
  }
  if (refPart !== undefined) {
    spec.ref = refPart;
  }
  return spec;
}
