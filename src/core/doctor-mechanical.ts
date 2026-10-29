/**
 * 确定性预检（add-asset-doctor E1）
 *
 * 不调模型的机械检查：frontmatter 必填项 / description 为空 / 正文超长 / 全大写强调滥用。
 * 机械项恒跑（AI 未配置也可见，spec Scenario 3），命中项并入诊断报告并标 fixable。
 * spec: 设计文档/changes/add-asset-doctor/specs/asset-diagnosis.spec.md
 */

import type { DiagnosisIssue, DoctorAssetKind } from './types.js';

/** 各类别 frontmatter 必填字段（rule/identity/memory 无必填，不为凑数报缺失） */
const REQUIRED_FIELDS: Record<DoctorAssetKind, string[]> = {
  skill: ['name', 'description'],
  agent: ['name', 'description'],
  command: ['description'],
  rule: [],
  identity: [],
  memory: [],
};

/** 正文长度阈值（字符数）：超长警示与草案 contentTruncated 联动（fix spec Scenario 7） */
const BODY_LENGTH_LIMIT: Record<DoctorAssetKind, number> = {
  skill: 10_000,
  agent: 6_000,
  rule: 4_000,
  identity: 8_000,
  command: 2_000,
  memory: 8_000,
};

/** shouting 判定：连续 2 个及以上全大写词（≥2 字母）出现的处数阈值 */
const SHOUTING_PATTERN = /\b[A-Z]{2,}(?:\s+[A-Z]{2,})+\b/g;
const SHOUTING_THRESHOLD = 3;

interface FrontmatterView {
  /** 是否存在合法 frontmatter 块（--- 开头并于 --- 结束） */
  present: boolean;
  /** 顶层 key → 值（去除首尾引号）；key 不存在时值为 undefined */
  fields: Record<string, string | undefined>;
  /** frontmatter 之后的正文部分（无 frontmatter 时为全文） */
  body: string;
}

function stripQuotes(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  )) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * 轻量 frontmatter 解析：仅识别顶层 `key: value` 行。
 * 缩进行（嵌套结构/列表项）一律跳过——医生机械检查只看顶层必填键存在性，
 * 不做完整 YAML 解析（避免嵌套字段解析陷阱）。
 */
function parseFrontmatter(content: string): FrontmatterView {
  const lines = content.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { present: false, fields: {}, body: content };
  }
  const end = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (end === -1) {
    return { present: false, fields: {}, body: content };
  }
  const fields: Record<string, string | undefined> = {};
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (match !== null) {
      fields[match[1]] = stripQuotes(match[2]);
    }
  }
  return { present: true, fields, body: lines.slice(end + 1).join('\n') };
}

/**
 * 对一个资产内容跑全部确定性检查，返回机械 DiagnosisIssue（criterion='mechanical:<id>'）。
 * 顺序：必填字段 → description 为空（键存在但值为空才报，避免与缺失项重复）→ 正文超长 → shouting。
 */
export function runMechanicalChecks(kind: DoctorAssetKind, content: string): DiagnosisIssue[] {
  const issues: DiagnosisIssue[] = [];
  const fm = parseFrontmatter(content);

  const missing = REQUIRED_FIELDS[kind].filter((key) => fm.fields[key] === undefined);
  if (missing.length > 0) {
    issues.push({
      severity: 'high',
      criterion: 'mechanical:frontmatter-missing-field',
      finding: `frontmatter 缺失必填字段：${missing.join('、')}`,
      suggestion: `在 frontmatter 中补充 ${missing.join('、')} 字段`,
      fixable: true,
    });
  }

  const description = fm.fields['description'];
  if (description !== undefined && description.trim() === '') {
    issues.push({
      severity: 'high',
      criterion: 'mechanical:description-empty',
      finding: 'description 为空：触发时机与适用范围是模型选读本资产的第一依据',
      suggestion: '补一句「做什么 + 何时用」的清晰描述',
      fixable: true,
    });
  }

  const limit = BODY_LENGTH_LIMIT[kind];
  if (fm.body.length > limit) {
    issues.push({
      severity: 'medium',
      criterion: 'mechanical:body-over-length',
      finding: `正文 ${fm.body.length} 字符，超过该类别 ${limit} 字符阈值（冗长正文稀释关键指令、抬高 token 成本）`,
      suggestion: '精简正文：只保留模型不知道的内容，细节外链或拆分',
      fixable: true,
    });
  }

  const shouting = fm.body.match(SHOUTING_PATTERN);
  if (shouting !== null && shouting.length >= SHOUTING_THRESHOLD) {
    issues.push({
      severity: 'low',
      criterion: 'mechanical:shouting-rules',
      finding: `全大写强调出现 ${shouting.length} 处：滥用会稀释真正的硬约束`,
      suggestion: '仅对不可违反的硬约束保留强调，其余改为普通表述',
      fixable: true,
    });
  }

  return issues;
}
