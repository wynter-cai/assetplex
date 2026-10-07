# Spec: Markdown 阅读排版层级

> Capability: markdown-typography
> Change: refactor-design-system（P1-3）
> 背景实测：Markdown.tsx 中 h1 与 h2 同为 14px semibold，h3/h4 13px，正文 13px；
> 真实技能文档的 H2 与文档标题视觉同权。技能详情是高频阅读场景。

## MODIFIED Requirements

### Requirement: 技能文档排版层级可辨

#### Scenario: 阅读含多级标题的技能文档

- **Given** 用户打开一篇含 H1/H2/H3 与正文的技能文档（技能详情页）
- **When** 阅读文档内容
- **Then** 标题层级视觉可辨：H1 > H2 > H3 > 正文（H1 18px / H2 16px / H3 14px / 正文 14px 基调）
- **And** H2 不再与 H1 视觉同权
- **And** 正文中文字号 14px、行高 ≥1.6，阅读不局促（替换现状 12px/行高 1.33 的描述区）

#### Scenario: 标题与正文的从属关系

- **Given** 同一文档内相邻的 H2 标题与其下属正文
- **When** 对比两者
- **Then** H2 通过字号与字重双通道与正文区分（非仅靠颜色/间距）

#### Scenario: 纯文本短文档

- **Given** 用户打开一篇无标题的短技能文档
- **When** 页面渲染
- **Then** 正文按 14px/1.6 渲染，无异常空白或层级样式泄漏
