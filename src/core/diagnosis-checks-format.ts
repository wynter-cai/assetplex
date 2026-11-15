/**
 * 静态规则 · 格式组（add-diagnosis-rules T2）
 *
 * 只依赖「路径 + 内容」即可判定的形态问题：frontmatter、命名、描述句式、
 * 参数契约、放置目录、示例缺失。每条检查对应规则集里一个稳定 ruleId。
 */

import { lineOfMatch } from './diagnosis-evidence.js';
import type { CheckHit, StaticCheck, StaticCheckContext } from './diagnosis-static.js';

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_WORDS = /anthropic|claude/i;
const CJK = /[\u4e00-\u9fa5]/;
const GENERIC_TOOL_NAMES = new Set([
  'search',
  'list',
  'get',
  'read',
  'create',
  'update',
  'delete',
  'run',
  'query',
  'fetch',
  'find',
  'open',
]);

function dirNameOf(hubRelativePath: string): string {
  const parts = hubRelativePath.split('/').filter((part) => part !== '');
  return parts.length >= 2 ? parts[parts.length - 2] : '';
}

function fieldLine(ctx: StaticCheckContext, key: string): number | null {
  return ctx.doc.frontmatter.fieldLines[key] ?? null;
}

const SK_01: StaticCheck = {
  ruleId: 'SK-01',
  run(ctx) {
    const fm = ctx.doc.frontmatter;
    if (!fm.present) return [{ line: 1, detail: '缺少以 --- 开头的 frontmatter：技能可能完全不被加载' }];
    if (!fm.closed) return [{ line: 1, detail: 'frontmatter 未闭合：块内字段全部失效' }];
    const missing = ['name', 'description'].filter((key) => (fm.fields[key] ?? '').trim() === '');
    if (missing.length === 0) return [];
    return [{ line: 1, detail: `frontmatter 缺必填字段：${missing.join('、')}` }];
  },
};

const SK_02: StaticCheck = {
  ruleId: 'SK-02',
  run(ctx) {
    const hits: CheckHit[] = [];
    const name = ctx.doc.frontmatter.fields['name'] ?? '';
    if (name !== '' && (!KEBAB_CASE.test(name) || name.length > 64 || RESERVED_WORDS.test(name))) {
      hits.push({
        line: fieldLine(ctx, 'name'),
        detail: `name「${name}」不符合小写连字符规范、超过 64 字符或含保留词`,
      });
    }
    const dir = dirNameOf(ctx.hubRelativePath);
    if (dir !== '' && (/[\s_]/.test(dir) || /[A-Z]/.test(dir))) {
      hits.push({ line: 1, detail: `目录名「${dir}」含空格、下划线或大写：换工具分发会失效` });
    }
    if (name !== '' && dir !== '' && name !== dir) {
      hits.push({ line: fieldLine(ctx, 'name'), detail: `name「${name}」与目录名「${dir}」不一致` });
    }
    return hits;
  },
};

const SK_03: StaticCheck = {
  ruleId: 'SK-03',
  run(ctx) {
    const fm = ctx.doc.frontmatter;
    if (!fm.present || fm.fields['description'] === undefined) return [];
    const desc = fm.fields['description'];
    const line = fieldLine(ctx, 'description');
    if (desc.trim() === '') return [{ line, detail: 'description 为空：触发时机是模型选读本资产的第一依据' }];
    if (desc.length > 1024) return [{ line, detail: `description ${desc.length} 字符，超过 1024 上限` }];
    if (/[<>]/.test(desc)) return [{ line, detail: 'description 含尖括号：会被当成标签或被清洗' }];
    if (!/use when|当用户|适用于|when the user/i.test(desc)) {
      return [{ line, detail: 'description 缺少「Use when / 当用户 / 适用于」触发子句' }];
    }
    if (/^(i can|you can|helps with)/i.test(desc.trim())) {
      return [{ line, detail: 'description 以第一/第二人称开头，未说明触发时机' }];
    }
    return [];
  },
};

const SK_15: StaticCheck = {
  ruleId: 'SK-15',
  run(ctx) {
    const hits: CheckHit[] = [];
    const name = ctx.doc.frontmatter.fields['name'] ?? '';
    if (name !== '' && CJK.test(name)) {
      hits.push({ line: fieldLine(ctx, 'name'), detail: `name「${name}」含中文：跨工具分发时可能不被识别` });
    }
    const dir = dirNameOf(ctx.hubRelativePath);
    if (dir !== '' && /[\s_]/.test(dir)) {
      hits.push({ line: 1, detail: `目录名「${dir}」含空格或下划线，未声明跨工具限制` });
    }
    return hits;
  },
};

const ID_07: StaticCheck = {
  ruleId: 'ID-07',
  run(ctx) {
    const body = ctx.doc.body;
    const hasCode = body.includes('```');
    const hasExample = /示例|例：|例:|for example/i.test(body);
    const hasContrast = /(修改前|改动前|before\b)[\s\S]{0,400}(修改后|改动后|after\b)/i.test(body);
    if (hasCode || hasExample || hasContrast) return [];
    return [{ line: null, detail: '正文没有代码块、示例小节或 before/after 对照：只有规范没有样例' }];
  },
};

const COMMAND_VERBS = ['评审', '修复', '发布', '部署', '重构', '测试', '清理', '迁移', '回滚', '提交'];

const CMD_01: StaticCheck = {
  ruleId: 'CMD-01',
  run(ctx) {
    const found = COMMAND_VERBS.filter((verb) => ctx.doc.body.includes(verb));
    if (found.length < 3) return [];
    const line = lineOfMatch(ctx.doc.lines, new RegExp(COMMAND_VERBS.join('|')), ctx.doc.bodyStartLine);
    return [{ line, detail: `正文含 ${found.length} 个不相关目标动作（${found.join('、')}）：一个命令只做一件事` }];
  },
};

const CMD_02: StaticCheck = {
  ruleId: 'CMD-02',
  run(ctx) {
    const desc = ctx.doc.frontmatter.fields['description'];
    if (desc === undefined || desc.trim() === '') {
      return [{ line: null, detail: '缺少 description：模型无法判断何时该调用这个命令' }];
    }
    if (/^a command that\b/i.test(desc.trim())) {
      return [{ line: fieldLine(ctx, 'description'), detail: 'description 只写摘要（A command that…），没有触发时机' }];
    }
    return [];
  },
};

const CMD_03: StaticCheck = {
  ruleId: 'CMD-03',
  run(ctx) {
    const line = lineOfMatch(ctx.doc.lines, /I can help|You can use this|我可以帮|你可以使用/i);
    if (line === null) return [];
    return [{ line, detail: '描述使用第一/第二人称：应改为第三人称陈述句' }];
  },
};

const CMD_04: StaticCheck = {
  ruleId: 'CMD-04',
  run(ctx) {
    const line = lineOfMatch(ctx.doc.lines, /\$ARGUMENTS|\[[A-Za-z_-]+\]/);
    if (line === null) return [];
    const hasContract = /参数|argument/i.test(ctx.doc.content) && /必填|缺参|默认|required/i.test(ctx.doc.content);
    if (hasContract) return [];
    return [{ line, detail: '引用了参数占位符，却没有定义类型、必填性与缺参行为' }];
  },
};

const CMD_07: StaticCheck = {
  ruleId: 'CMD-07',
  run(ctx) {
    if (ctx.hubRelativePath.startsWith('commands/')) return [];
    return [{ line: 1, detail: `命令不在 commands/ 目录下（当前：${ctx.hubRelativePath}）：目标工具不会加载` }];
  },
};

const MC_05: StaticCheck = {
  ruleId: 'MC-05',
  run(ctx) {
    const hits: CheckHit[] = [];
    ctx.doc.lines.forEach((line, idx) => {
      const match = /"name"\s*:\s*"([^"]+)"|name\s*=\s*"([^"]+)"/.exec(line);
      const name = match?.[1] ?? match?.[2] ?? '';
      if (name === '' || !GENERIC_TOOL_NAMES.has(name)) return;
      hits.push({ line: idx + 1, detail: `工具名「${name}」没有服务前缀：多 server 并存时无法区分来源` });
    });
    return hits;
  },
};

const MC_06: StaticCheck = {
  ruleId: 'MC-06',
  run(ctx) {
    const stringParams = (ctx.doc.content.match(/"type"\s*:\s*"string"/g) ?? []).length;
    if (stringParams < 2) return [];
    if (/"(required|enum|format|pattern)"\s*:/.test(ctx.doc.content)) return [];
    return [
      {
        line: lineOfMatch(ctx.doc.lines, /"type"\s*:\s*"string"/),
        detail: '输入 schema 全是自由文本参数：没有 required / enum / format 约束',
      },
    ];
  },
};

const MEM_04: StaticCheck = {
  ruleId: 'MEM-04',
  run(ctx) {
    const hasOwnerField = ctx.doc.frontmatter.fields['owner'] !== undefined;
    if (hasOwnerField || /\bowner\b|负责人/i.test(ctx.doc.content)) return [];
    return [{ line: null, detail: '记忆文件没有 owner 字段，也没有负责人或评审约定' }];
  },
};

/** 格式组全部检查（对应规则集里 13 条 static 规则） */
export const FORMAT_CHECKS: StaticCheck[] = [
  SK_01,
  SK_02,
  SK_03,
  SK_15,
  ID_07,
  CMD_01,
  CMD_02,
  CMD_03,
  CMD_04,
  CMD_07,
  MC_05,
  MC_06,
  MEM_04,
];
