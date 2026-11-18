/**
 * 静态规则 · 凭证组（add-diagnosis-rules T2）
 *
 * 密钥泄露、提示注入、MCP 投毒与权限越界——静态可判的安全信号。
 * 这一类命中一律 high：宁可多报一次，不可漏报一条。
 */

import { lineOfMatch } from './diagnosis-evidence.js';
import type { CheckHit, StaticCheck } from './diagnosis-static.js';

const SECRET_PATTERNS: Array<{ pattern: RegExp; detail: string }> = [
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}/, detail: '命中 OpenAI 风格密钥前缀 sk-' },
  { pattern: /\bghp_[A-Za-z0-9]{20,}/, detail: '命中 GitHub token 前缀 ghp_' },
  { pattern: /\bAKIA[0-9A-Z]{12,}/, detail: '命中 AWS access key 前缀 AKIA' },
  { pattern: /\bxoxb-[A-Za-z0-9-]{10,}/, detail: '命中 Slack token 前缀 xoxb-' },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, detail: '命中私钥头：私钥不得放进我的库' },
  {
    pattern: /(?:api[_-]?key|access[_-]?token|secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
    detail: '配置里写的是实值而不是环境变量引用',
  },
];

const SEC_01: StaticCheck = {
  ruleId: 'SEC-01',
  run(ctx) {
    const hits: CheckHit[] = [];
    for (const item of SECRET_PATTERNS) {
      const line = lineOfMatch(ctx.doc.lines, item.pattern);
      if (line !== null) hits.push({ line, detail: item.detail });
    }
    return hits;
  },
};

const SEC_02: StaticCheck = {
  ruleId: 'SEC-02',
  run(ctx) {
    const line = lineOfMatch(
      ctx.doc.lines,
      /忽略(?:此前|之前|以上)(?:的)?指令|ignore (?:all )?previous instructions|你现在是|重要[：:]\s*必须始终/i,
    );
    if (line === null) return [];
    return [{ line, detail: '正文出现要求模型改变身份或忽略既有指令的语句：按提示注入处理' }];
  },
};

/** 未固定版本：latest 标签、无版本号的 npx / uvx */
function isUnpinnedToolchain(line: string): boolean {
  if (/@latest|:latest\b/i.test(line)) return true;
  const npx = /npx\s+(?:-y\s+)?([@\w/.-]+)/.exec(line);
  if (npx !== null && npx[1].lastIndexOf('@') <= 0) return true;
  const uvx = /uvx\s+([\w@/.-]+)/.exec(line);
  if (uvx !== null && !uvx[1].includes('@')) return true;
  return false;
}

const MC_01: StaticCheck = {
  ruleId: 'MC-01',
  run(ctx) {
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      if (line.trim() === '') return;
      if (isUnpinnedToolchain(line)) hits.push({ line: idx + 1, detail: '启动命令或镜像未固定精确版本（latest / 无版本号）' });
    });
    return hits;
  },
};

const MC_02: StaticCheck = {
  ruleId: 'MC-02',
  run(ctx) {
    const hasSource = /https?:\/\/|来源|source|repository|homepage/i.test(ctx.doc.content);
    if (hasSource) return [];
    return [{ line: null, detail: '配置没有来源 URL、维护者或审核日期：无法确认 server 出处' }];
  },
};

const MC_03: StaticCheck = {
  ruleId: 'MC-03',
  run(ctx) {
    const poison = /ignore (?:all )?previous|you must|crucial|忽略(?:此前|之前)|你现在是/i;
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      const isDescription = /"?description"?\s*[:=]/.test(line);
      if (!isDescription && !/ignore (?:all )?previous|忽略(?:此前|之前)指令/i.test(line)) return;
      if (poison.test(line)) hits.push({ line: idx + 1, detail: '工具描述含祈使句或系统提示口吻：视为投毒迹象' });
    });
    return hits;
  },
};

const DESTRUCTIVE_WORD = /delete|remove|send|pay\b|publish|purchase|transfer|drop|purge/i;
const APPROVAL_WORDS = /approval|approve|confirm|two[- ]step|审批|确认|二次确认|--yes/i;

const MC_07: StaticCheck = {
  ruleId: 'MC-07',
  run(ctx) {
    if (APPROVAL_WORDS.test(ctx.doc.content)) return [];
    const line = lineOfMatch(ctx.doc.lines, DESTRUCTIVE_WORD);
    if (line === null) return [];
    return [{ line, detail: '破坏性或外发工具与只读工具同权：没有审批模式或确认步骤' }];
  },
};

const MC_08: StaticCheck = {
  ruleId: 'MC-08',
  run(ctx) {
    const content = ctx.doc.content;
    const readsPrivate = /read_file|filesystem|read_text_file|\.env|credential|database|sql/i.test(content);
    const ingestsUntrusted = /fetch|https?:\/\/|browser|url|web|scrape/i.test(content);
    const sendsOut = /send|post|upload|publish|write_file|create_/i.test(content);
    if (!readsPrivate || !ingestsUntrusted || !sendsOut) return [];
    return [{ line: 1, detail: '同一能力池同时具备私密读取、不可信摄入与外发写入，且无隔离说明' }];
  },
};

const MC_09: StaticCheck = {
  ruleId: 'MC-09',
  run(ctx) {
    if (/sha256|hash|fingerprint|指纹|baseline|基线/i.test(ctx.doc.content)) return [];
    return [{ line: null, detail: '没有工具描述哈希基线，也没有把扫描接入定期检查' }];
  },
};

const MC_11: StaticCheck = {
  ruleId: 'MC-11',
  run(ctx) {
    if (/disabled\s*[:=]\s*true|停用|enabled\s*[:=]\s*false/i.test(ctx.doc.content)) return [];
    const line = lineOfMatch(ctx.doc.lines, /token|secret|password|api[_-]?key/i);
    if (line === null) return [];
    return [{ line, detail: 'server 仍带高权限配置，但没有显式禁用开关或使用记录' }];
  },
};

const AGT_03: StaticCheck = {
  ruleId: 'AGT-03',
  run(ctx) {
    const readOnlyIntent = /只读|read[- ]only|审查|review|分析/i.test(ctx.doc.content);
    if (!readOnlyIntent) return [];
    const line = lineOfMatch(ctx.doc.lines, /(?:tools?[^\n]*(?:Write|Edit))|Bash\(\*\)|Bash\b[^\n]*\*/);
    if (line === null) return [];
    return [{ line, detail: '只读用途的子代理却带写文件、改代码或无限 Bash 权限' }];
  },
};

/** 凭证组全部检查（对应规则集里 10 条 static 规则） */
export const SECURITY_CHECKS: StaticCheck[] = [
  SEC_01,
  SEC_02,
  MC_01,
  MC_02,
  MC_03,
  MC_07,
  MC_08,
  MC_09,
  MC_11,
  AGT_03,
];
