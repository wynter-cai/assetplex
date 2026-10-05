import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown, stripFrontmatter } from './Markdown';

describe('Markdown 组件', () => {
  it('渲染标题', () => {
    render(<Markdown content="# 主标题" />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('主标题');
  });

  it('渲染加粗与列表', () => {
    render(<Markdown content={'- **重点**项一\n- 项二'} />);
    expect(screen.getByText('重点').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('渲染行内代码与代码块', () => {
    render(<Markdown content={'用 `npm test` 跑测试\n\n```bash\nnpm run build\n```'} />);
    expect(screen.getByText('npm test').tagName).toBe('CODE');
    expect(screen.getByText(/npm run build/)).toBeInTheDocument();
  });

  it('渲染 GFM 表格', () => {
    render(<Markdown content={'| 参数 | 说明 |\n| --- | --- |\n| mode | 运行模式 |'} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('运行模式')).toBeInTheDocument();
  });

  it('原始 HTML 不被执行（默认安全）', () => {
    const { container } = render(<Markdown content={'<script>window.__xss=1</script>\n\n正常文字'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('正常文字')).toBeInTheDocument();
    expect((window as unknown as { __xss?: string }).__xss).toBeUndefined();
  });

  it('stripFrontmatter 去掉 frontmatter 保留正文', () => {
    const raw = '---\nname: demo\ndescription: 测试\n---\n\n# 正文标题';
    expect(stripFrontmatter(raw)).toBe('# 正文标题');
  });

  it('stripFrontmatter 对无 frontmatter 的原文原样返回', () => {
    expect(stripFrontmatter('# 直接正文')).toBe('# 直接正文');
  });
});
