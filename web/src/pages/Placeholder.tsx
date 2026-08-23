/**
 * 占位页面 - Phase 1 临时使用
 *
 * 这些页面将在后续任务中替换为真实实现：
 * - Home: P1-T2~T8
 * - Vault: P2-T1~T5
 * - Connections: P2-T7~T10
 * - Activity: P3-T1
 */

export function PlaceholderPage({ title, description }: { title: string; description: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground">{description}</p>
      <p className="text-xs text-muted-foreground mt-4">🚧 建设中 · Phase 1</p>
    </div>
  );
}
