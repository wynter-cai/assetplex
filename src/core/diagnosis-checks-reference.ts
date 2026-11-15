/**
 * 静态规则 · 引用组（add-diagnosis-rules T2）
 *
 * 引用健壮性：路径写法、被引文件是否存在、时效性表述、本机绝对路径与内网信息。
 * 「是否存在」依赖注入的 exists（只查库内相对路径）；未注入时只判写法类问题，不猜。
 */

import { lineOfMatch } from './diagnosis-evidence.js';
import type { CheckHit, StaticCheck } from './diagnosis-static.js';

const BACKSLASH_PATH = /[\w.-]+\\[\w.-]+/;
const ABSOLUTE_PATH = /[A-Za-z]:[\\/]|(?:^|[\s(（"'`])\/(?:Users|home|var|etc|opt|tmp)\//;
const RELATIVE_REF = /(?:^|[\s(（"'`])(\.{0,2}\/?)((?:references|scripts|assets)\/[\w./-]+)/;
const BACKTICK_PATH = /`([\w.-]+(?:\/[\w.-]+)+\.(?:md|mjs|cjs|js|ts|json|ya?ml|sh|ps1|toml))`/g;
const USER_PATH = /[A-Za-z]:[\\/]Users[\\/]|\/Users\/[\w.-]+|\/home\/[\w.-]+/;
const PRIVATE_IP = /\b(?:10\.\d{1,3}|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/;
const TICKET_ID = /\b[A-Z]{2,}-\d{2,}\b/;

function allMatches(line: string, pattern: RegExp): string[] {
  const probe = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  const found: string[] = [];
  let match = probe.exec(line);
  while (match !== null) {
    found.push(match[2] ?? match[1] ?? match[0]);
    match = probe.exec(line);
  }
  return found;
}

function relativeRefsIn(line: string): string[] {
  return allMatches(line, RELATIVE_REF).map((ref) => ref.replace(/^\.\//, ''));
}

const SK_09: StaticCheck = {
  ruleId: 'SK-09',
  run(ctx) {
    const hits: CheckHit[] = [];
    const backslash = lineOfMatch(ctx.doc.lines, BACKSLASH_PATH);
    if (backslash !== null) hits.push({ line: backslash, detail: '引用使用反斜杠路径：跨工具分发后会失效' });
    const absolute = lineOfMatch(ctx.doc.lines, ABSOLUTE_PATH);
    if (absolute !== null) hits.push({ line: absolute, detail: '引用使用绝对路径：换机器即失效' });
    const exists = ctx.exists;
    ctx.doc.lines.forEach((line, idx) => {
      for (const ref of relativeRefsIn(line)) {
        if (ref.split('/').length > 2) {
          hits.push({ line: idx + 1, detail: `引用链深度超过 1 层：${ref}` });
        } else if (exists !== null && !exists(ref)) {
          hits.push({ line: idx + 1, detail: `引用的文件不存在：${ref}` });
        }
      }
    });
    return hits;
  },
};

const SK_12: StaticCheck = {
  ruleId: 'SK-12',
  run(ctx) {
    const hits: CheckHit[] = [];
    const backslash = lineOfMatch(ctx.doc.lines, BACKSLASH_PATH);
    if (backslash !== null) hits.push({ line: backslash, detail: '正文命中反斜杠路径：统一改为正斜杠' });
    const hasDefault = /默认|default|首选/i.test(ctx.doc.content);
    if (!hasDefault) {
      const optionLine = lineOfMatch(ctx.doc.lines, /或\s*[A-Za-z\u4e00-\u9fa5]/);
      if (optionLine !== null) {
        hits.push({ line: optionLine, detail: '枚举多个选项却没有给出「默认使用 X」' });
      }
    }
    return hits;
  },
};

const STL_01: StaticCheck = {
  ruleId: 'STL-01',
  run(ctx) {
    const exists = ctx.exists;
    if (exists === null) return [];
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      for (const ref of allMatches(line, BACKTICK_PATH)) {
        if (!exists(ref)) hits.push({ line: idx + 1, detail: `引用的文件在库内不存在：${ref}` });
      }
    });
    return hits;
  },
};

const STL_02: StaticCheck = {
  ruleId: 'STL-02',
  run(ctx) {
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      const stamp = /\b20\d{2}\b|\bv\d+\.\d+/.test(line);
      const freshness = /目前|最新|暂时|当前|nowadays/i.test(line);
      if (stamp && freshness) hits.push({ line: idx + 1, detail: '时限性表述：年份/版本与「目前/最新/暂时」并列，很快过时' });
    });
    return hits;
  },
};

const ID_09: StaticCheck = {
  ruleId: 'ID-09',
  run(ctx) {
    const hits: CheckHit[] = [];
    const patterns: Array<{ pattern: RegExp; detail: string }> = [
      { pattern: ABSOLUTE_PATH, detail: '人设里出现本机绝对路径：身份只保留跨项目稳定内容' },
      { pattern: TICKET_ID, detail: '人设里出现工单/项目编号：项目信息应下沉到规则或对话' },
      { pattern: /\b20\d{2}-\d{2}-\d{2}\b/, detail: '人设里出现具体日期：时效性内容不属于身份' },
      { pattern: /客户|项目代号|内部项目/, detail: '人设里出现客户或项目代号：不可跨项目稳定成立' },
    ];
    for (const item of patterns) {
      const line = lineOfMatch(ctx.doc.lines, item.pattern);
      if (line !== null) hits.push({ line, detail: item.detail });
    }
    return hits;
  },
};

const MEM_05: StaticCheck = {
  ruleId: 'MEM-05',
  run(ctx) {
    const hits: CheckHit[] = [];
    const userPath = lineOfMatch(ctx.doc.lines, USER_PATH);
    if (userPath !== null) hits.push({ line: userPath, detail: '记忆正文含本机用户名路径：应改为占位符并加入忽略清单' });
    const privateIp = lineOfMatch(ctx.doc.lines, PRIVATE_IP);
    if (privateIp !== null) hits.push({ line: privateIp, detail: '记忆正文含内网地址：不应入库' });
    return hits;
  },
};

/** 引用组全部检查（对应规则集里 6 条 static 规则） */
export const REFERENCE_CHECKS: StaticCheck[] = [SK_09, SK_12, STL_01, STL_02, ID_09, MEM_05];
