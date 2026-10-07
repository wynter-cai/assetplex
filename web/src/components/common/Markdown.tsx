import { createElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** 去掉文件开头的 frontmatter 块（--- ... ---），用于 Markdown 展示 */
export function stripFrontmatter(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

/** react-markdown 传给自定义组件的 props（node 为内部元数据，不渲染） */
interface MdTagProps {
  node?: unknown;
  className?: string;
  children?: ReactNode;
}

/** 生成带统一样式的原生标签组件（Tag 为 HTML 标签名） */
function styled(Tag: string, className: string) {
  return function StyledTag({ children, node, ...rest }: MdTagProps): JSX.Element {
    return createElement(Tag, { ...rest, className }, children);
  };
}

/**
 * 技能/智能体文档通用样式（spec refactor-design-system markdown-typography）：
 * H1 18px bold / H2 16px semibold / H3-H4 14px semibold / 正文与列表 14px、行高 1.6（text-14 自带 1.4rem），
 * 字号+字重双通道区分标题层级，适配详情面板阅读场景
 */
const tagStyles: Record<string, (props: MdTagProps) => JSX.Element> = {
  h1: styled('h1', 'text-18 font-bold mt-4 mb-2'),
  h2: styled('h2', 'text-16 font-semibold mt-3.5 mb-1.5'),
  h3: styled('h3', 'text-14 font-semibold mt-3 mb-1.5'),
  h4: styled('h4', 'text-14 font-semibold mt-2.5 mb-1'),
  p: styled('p', 'text-14 my-1.5'),
  ul: styled('ul', 'list-disc pl-5 my-1.5 space-y-0.5 text-14'),
  ol: styled('ol', 'list-decimal pl-5 my-1.5 space-y-0.5 text-14'),
  li: styled('li', 'leading-relaxed'),
  a: styled('a', 'text-primary underline break-all'),
  blockquote: styled('blockquote', 'border-l-2 border-muted-foreground/40 pl-3 text-muted-foreground my-2'),
  table: styled('table', 'text-xs border-collapse my-2 w-full'),
  th: styled('th', 'border px-2 py-1 bg-muted/50 text-left font-medium'),
  td: styled('td', 'border px-2 py-1 align-top'),
};

/** 纯只读 Markdown 渲染（GFM 表格/删除线；默认不执行原始 HTML） */
export function Markdown({ content }: { content: string }): JSX.Element {
  return (
    <div className="min-w-0 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...tagStyles,
          code: ({ className, children, node, ...rest }: MdTagProps) => {
            const isBlock = typeof className === 'string' && className.includes('language-');
            return createElement(
              'code',
              {
                ...rest,
                className: isBlock
                  ? 'block text-xs whitespace-pre-wrap break-words'
                  : 'bg-muted rounded px-0.5 py-0.5 text-xs break-all',
              },
              children,
            );
          },
          pre: ({ children }: MdTagProps) => (
            <pre className="bg-muted rounded p-2.5 overflow-x-auto my-2">{children}</pre>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
