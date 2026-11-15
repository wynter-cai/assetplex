/**
 * 静态规则 · 冲突信号组（add-diagnosis-rules T2）
 *
 * 广度、空洞、互斥、重复：一条规则管太多、说话不可验收、与库内资产撞车的信号。
 * 需要「同库其他资产」的检查（SK-05 / DUP-01 / AGT-06）只在注入 peers / siblings 时生效，
 * 未注入时不下结论（既不报错也不假装通过）。
 */

import { lineOfMatch, readDocument } from './diagnosis-evidence.js';
import type { CheckHit, StaticCheck, StaticCheckContext } from './diagnosis-static.js';

const GENERIC_WORDS = /helper|utils|tools|various|general|通用|各种|相关任务/i;
const SPECIFIC_TRIGGERS = /(?:[\w-]+)?\.(?:md|json|ts|tsx|yaml|yml|sh|ps1|xlsx|csv)|仓库|工单|接口|数据库/g;
const VAGUE_WORDS = /专业|严谨|高效|极致|赋能|优质/g;
const BARE_CONDITION = /如适用|必要时|适当|尽量|酌情|视情况/;
const QUALIFIER = /条件|默认|当.{0,8}时|如果|除非|unless/;

/** 归一化：去空白、去 markdown 标记、小写 */
function normalize(text: string): string {
  return text
    .replace(/[#>*`_\-[\]()]/g, ' ')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function tokenSet(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .split(/[\s,，。.;；:：!！?？、()（）[\]【】"'`/\\|]+/)
    .filter((token) => token.length > 1);
  return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function peerDescription(content: string): string {
  const doc = readDocument(content);
  const desc = doc.frontmatter.fields['description'];
  if (desc !== undefined && desc.trim() !== '') return desc;
  return doc.body.slice(0, 300);
}

const RU_04: StaticCheck = {
  ruleId: 'RU-04',
  run(ctx) {
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      if (!/^\s*(?:[-*]|\d+\.)\s/.test(line)) return;
      const connectors = (line.match(/、|并且|以及|同时|，并/g) ?? []).length;
      if (connectors >= 3) hits.push({ line: idx + 1, detail: '单条规则包含 3 个以上动作或跨多个主题：应拆条编号' });
    });
    return hits;
  },
};

const RU_05: StaticCheck = {
  ruleId: 'RU-05',
  run(ctx) {
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      if (!BARE_CONDITION.test(line) || QUALIFIER.test(line)) return;
      hits.push({ line: idx + 1, detail: '命中裸条件词（如适用 / 必要时 / 尽量）且同句没有判定条件或默认动作' });
    });
    return hits;
  },
};

const RU_06: StaticCheck = {
  ruleId: 'RU-06',
  run(ctx) {
    const alwaysOn =
      ctx.doc.frontmatter.fields['alwaysApply'] === 'true' || /alwaysApply\s*[:=]\s*true|始终生效/.test(ctx.doc.content);
    if (!alwaysOn) return [];
    const line = lineOfMatch(ctx.doc.lines, /(?:^|[\s(`])(?:src|apps|packages)\/|[A-Za-z]:[\\/]/);
    if (line === null) return [];
    return [{ line, detail: '规则设为始终生效，正文却只对某个目录或技术栈成立：应改为按路径生效' }];
  },
};

const SK_04: StaticCheck = {
  ruleId: 'SK-04',
  run(ctx) {
    const desc = ctx.doc.frontmatter.fields['description'] ?? '';
    if (!GENERIC_WORDS.test(desc)) return [];
    const specific = (desc.match(SPECIFIC_TRIGGERS) ?? []).length;
    if (specific >= 2) return [];
    const line = ctx.doc.frontmatter.fieldLines['description'] ?? null;
    return [{ line, detail: `description 命中泛化词且具体触发词只有 ${specific} 个：模型无从判断何时该用` }];
  },
};

const SK_05: StaticCheck = {
  ruleId: 'SK-05',
  run(ctx) {
    const mine = tokenSet(peerDescription(ctx.doc.content));
    if (mine.size === 0) return [];
    const similar = ctx.peers.find((peer) => jaccard(mine, tokenSet(peerDescription(peer.content))) > 0.85);
    if (similar === undefined) return [];
    return [
      {
        line: ctx.doc.frontmatter.fieldLines['description'] ?? null,
        detail: `description 与 ${similar.hubRelativePath} 高度相似：需写明分工边界或合并`,
      },
    ];
  },
};

const VAG_01: StaticCheck = {
  ruleId: 'VAG-01',
  confidence: 'medium',
  run(ctx) {
    const hits: CheckHit[] = [];
    const vague = ctx.doc.body.match(VAGUE_WORDS) ?? [];
    const length = ctx.doc.body.length;
    if (length > 0 && (vague.length * 100) / length > 3) {
      hits.push({
        line: lineOfMatch(ctx.doc.lines, VAGUE_WORDS, ctx.doc.bodyStartLine),
        detail: `空洞形容词密度 ${((vague.length * 100) / length).toFixed(1)} 个/100 字：改为可观察行为或验收命令`,
      });
    }
    ctx.doc.lines.forEach((line, idx) => {
      if (!BARE_CONDITION.test(line) || QUALIFIER.test(line)) return;
      hits.push({ line: idx + 1, detail: '裸条件词没有限定：补判定标准或删除' });
    });
    return hits;
  },
};

const DUP_01: StaticCheck = {
  ruleId: 'DUP-01',
  confidence: 'medium',
  run(ctx) {
    const mineBody = normalize(ctx.doc.body);
    const mineTokens = tokenSet(ctx.doc.body);
    if (mineBody === '') return [];
    for (const peer of ctx.peers) {
      const peerBody = normalize(readDocument(peer.content).body);
      if (peerBody === '') continue;
      const same = peerBody === mineBody;
      const similar = !same && jaccard(mineTokens, tokenSet(peerBody)) > 0.85;
      if (same || similar) {
        return [{ line: ctx.doc.bodyStartLine, detail: `正文与 ${peer.hubRelativePath} 重复：保留一处并归档其余` }];
      }
    }
    return [];
  },
};

const MEM_06: StaticCheck = {
  ruleId: 'MEM-06',
  run(ctx: StaticCheckContext) {
    if (/审计|audit|定期检查|检查记录/i.test(ctx.doc.content)) return [];
    return [{ line: null, detail: '库内没有审计记录，也没有定期检查过期与冲突的痕迹' }];
  },
};

const AGT_06: StaticCheck = {
  ruleId: 'AGT-06',
  run(ctx) {
    const base = ctx.hubRelativePath.split('/').pop() ?? '';
    const clash = ctx.siblings.find(
      (path) => path !== ctx.hubRelativePath && (path.split('/').pop() ?? '') === base,
    );
    if (clash === undefined) return [];
    return [{ line: 1, detail: `同目录存在同名子代理：${clash}` }];
  },
};

/** 冲突信号组全部检查（对应规则集里 9 条 static 规则） */
export const CONFLICT_CHECKS: StaticCheck[] = [
  RU_04,
  RU_05,
  RU_06,
  SK_04,
  SK_05,
  VAG_01,
  DUP_01,
  MEM_06,
  AGT_06,
];
