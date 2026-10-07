import type { ReactNode } from 'react';

/**
 * 标准页头（spec refactor-design-system page-headers）
 *
 * 任一主要页面顶部统一呈现：H1 标题（20px 档）+ 一句话副标题 + 右侧操作区（该页主操作）。
 * 各页不再自写 24px/30px 标题，一律走本组件。
 */
interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** 该页主操作（新建/导入/同步等），渲染在页头右侧 */
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-20 font-semibold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
