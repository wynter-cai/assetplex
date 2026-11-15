/**
 * 质量中心子页占位（refactor-governance-center T1）
 *
 * 跨类别批量（T5）与规则与忽略（T7）尚未落地，这里只如实说明「即将上线」，
 * 不展示任何伪造的控件、数字或空列表。
 */

interface QualityPlaceholderProps {
  title: string;
}

export default function QualityPlaceholder({ title }: QualityPlaceholderProps): JSX.Element {
  return (
    <div className="space-y-2 p-6">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted-foreground">即将上线，当前版本暂不提供该能力。</p>
    </div>
  );
}
