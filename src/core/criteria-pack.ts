/**
 * 内置业内准则包（add-llm-conflict-arbitration A4）
 *
 * 精选业内广泛认可的 AI 资产设计最佳实践，改写为准则模板（不直搬原文）。
 * 仅在用户点「导入业内准则包」并勾选时生成到 Hub/criteria/，不自动播种。
 * 来源标注文档标题（公开指南均可检索），用户导入后可自由编辑——准则是资产。
 *
 * spec: specs/criteria-meta-asset.spec.md Scenario 1b/3
 */

import { createHubFile } from './hub-files.js';
import { serializeCriterionFile, type CriterionAsset, type CriterionAppliesTo } from './criteria.js';

/** 准则模板（与 CriterionAsset 同构 + 文件序列化出口；模板必带 source） */
export interface CriterionTemplate {
  slug: string;
  /** 相对 Hub 根路径 criteria/<slug>.md */
  relativePath: string;
  name: string;
  description: string;
  priority: number;
  appliesTo: CriterionAppliesTo[];
  source: string;
  body: string;
  toFileContent(): string;
}

function template(
  slug: string,
  name: string,
  description: string,
  priority: number,
  appliesTo: CriterionAppliesTo[],
  source: string,
  body: string,
): CriterionTemplate {
  const asset: CriterionAsset = {
    slug,
    relativePath: `criteria/${slug}.md`,
    name,
    description,
    priority,
    enabled: true,
    appliesTo,
    source,
    body,
  };
  return {
    ...asset,
    source,
    relativePath: asset.relativePath,
    toFileContent: () => serializeCriterionFile(asset),
  };
}

export const CRITERIA_PACK: CriterionTemplate[] = [
  template(
    'skill-progressive-disclosure',
    '技能渐进披露',
    'SKILL.md 正文保持精炼，细节下沉到子文件与脚本',
    5,
    ['skill'],
    'Anthropic Agent Skills 设计指南',
    [
      'SKILL.md 是入口不是百科：正文只放"当前步骤必需"的指令，建议控制在 500 行以内。',
      '大段参考资料、输出模板、长示例应下沉到技能目录内的子文件（如 references/、assets/），正文用一句话说明何时去读它们。',
      '确定性、易错的机械操作优先写成脚本文件，让模型执行而不是照描述模仿。',
      '仲裁与诊断时：正文冗长且包含可下沉内容的技能，应判为需关注；合并冲突时优先保留信息密度高的版本。',
    ].join('\n'),
  ),
  template(
    'skill-description-trigger',
    '技能描述面向触发',
    'description 写清何时使用，第三人称、具体场景',
    10,
    ['skill'],
    'Anthropic Agent Skills 设计指南',
    [
      'description 的唯一职责是让模型判断"该不该用这个技能"：用第三人称描述触发场景（"Use when …"式），而不是复述实现步骤。',
      '写清适用与不适用场景；模糊的"帮助处理 X"不如"当用户要求生成周报/汇总进展时使用"。',
      'name 用小写连字符且可检索；正文再详述怎么做。',
      '仲裁与诊断时：description 缺失或与正文步骤雷同，属于高优先级问题；合并时优先保留触发信息更具体的描述。',
    ].join('\n'),
  ),
  template(
    'token-economy',
    'Token 效率',
    '只写模型不知道的，反对重复与凑字数',
    15,
    ['all'],
    '社区 token 优化实践（如 ponytail 类项目思路）',
    [
      '模型已知的通用知识不要复述（如"什么是 HTTP"）；资产的价值在于你的私有约定与偏好。',
      '同一条指令只出现一次；重复强调不增加遵循度，只稀释重点。',
      '短列表优于长段落；一个示例胜过三段描述。删除不改变行为的客套话与背景铺垫。',
      '仲裁与诊断时：更短但信息密度相当的版本优先于冗长版本；合并草案应去重而不是简单拼接两边。',
    ].join('\n'),
  ),
  template(
    'rule-single-topic',
    '规则单主题与可验证',
    '一个规则文件一个主题，条款正向祈使、可逐条验证',
    20,
    ['rule'],
    'AI 编码工具规则文件社区规范（AGENTS.md / rules 生态）',
    [
      '一个文件只覆盖一个主题（代码风格 / 安全约束 / 输出格式），大而混导致模型选择性遵循。',
      '条款用正向祈使句写"做 X"，少用双重否定与"不要"堆叠；每条应能独立判断是否被遵守。',
      '最重要的规则放最前面——长列表的尾部遵循率显著下降。',
      '仲裁与诊断时：条款互相冲突的文件判为有风险；合并时必须消除冲突条款而不是并存。',
    ].join('\n'),
  ),
  template(
    'agents-md-structure',
    'AI 配置结构化',
    '工具级配置文件聚焦可执行事实：命令、约束、入口',
    25,
    ['rule', 'agent', 'identity'],
    'AGENTS.md 开放规范',
    [
      '配置的核心信息前置：怎么构建、怎么测试、代码放哪、有哪些禁区——这些是模型每次会话都要用的。',
      '按模块拆分子目录文件（monorepo 场景），就近覆盖；根文件保持短。',
      '写"是什么/怎么做"的事实，不写团队历史与动机故事。',
      '仲裁与诊断时：两版本一新一全时，优先保留命令与约束准确完整的一方。',
    ].join('\n'),
  ),
  template(
    'agent-config-minimal',
    '子代理最小职责',
    '一个子代理一件事，工具白名单，输出契约明确',
    30,
    ['agent'],
    '主流 AI 编码工具 subagent 配置社区实践',
    [
      '角色单一：一个子代理只负责一类任务；"全能助手"应拆分——职责越宽，行为越不稳定。',
      '工具与权限按任务最小化授予；不需要写库就不给写工具。',
      '描述里写清"何时把任务委派给我"，输出格式给明确契约（结构/文件路径/回报字段）。',
      '仲裁与诊断时：职责重叠的两个 agent 配置应建议合并或划界，而不是各保留一份。',
    ].join('\n'),
  ),
  template(
    'identity-behavior-over-traits',
    '身份写行为不写人设',
    '身份资产的核心是可执行的行为边界，不是性格描写',
    35,
    ['identity'],
    'AI 人设/身份配置跨工具迁移实践',
    [
      '写"遇到 X 时怎么做、绝不做什么"，少写"我是一个温柔的人"式形容词——行为约束跨工具可迁移，语气描写不可验证。',
      '保密与边界条款放最前且逐条明确（什么不外泄、什么要先确认）。',
      '沟通风格类条款给一个示例即可生效，胜过三段抽象描述。',
      '仲裁与诊断时：身份文件被两边改动的合并要格外保守——涉及红线条款（保密/安全）时任何一边缺失都判为高风险，必须补回。',
    ].join('\n'),
  ),
];

/** 导入结果：成功与拒绝（同名/未知 slug）明细 */
export interface CriteriaPackResult {
  inserted: string[];
  rejected: string[];
}

/**
 * 按勾选导入准则到 Hub/criteria/（Scenario 1b）。
 * 同名拒绝不覆盖（createHubFile 守卫）；未知 slug 记入 rejected；永不改动已有文件。
 */
export function insertCriteriaPack(slugs: string[]): CriteriaPackResult {
  const inserted: string[] = [];
  const rejected: string[] = [];
  for (const slug of slugs) {
    const t = CRITERIA_PACK.find((x) => x.slug === slug);
    if (!t) {
      rejected.push(slug);
      continue;
    }
    try {
      createHubFile(t.relativePath, t.toFileContent());
      inserted.push(slug);
    } catch {
      rejected.push(slug); // 已存在：保持用户内容零变化
    }
  }
  return { inserted, rejected };
}
