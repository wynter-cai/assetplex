/**
 * 连接页工具详情·三口径摘要
 *
 * spec: asset-center-consistency
 * - Scenario 2 计数一致：数字取自接口 `assetCounts`，并紧跟口径名（我的库 / 已同步 / 可收藏）
 * - Scenario 3 已同步来自真实状态：未安装工具不显示任何「已同步」数字
 * spec: asset-distribution-truth Scenario 6 + proposal D3：项目级工具按项目表达
 * spec: product-surface-hygiene Scenario 1：本组件文案不含禁用词
 *
 * 关联: fix-trust-and-consistency tasks I4。这里禁止任何就地统计——
 * 组件只渲染服务端算好的数字，避免同一类别长出第二个真相。
 */

import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Download, Folder, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AssetCategoryConfig } from '@/config/asset-categories';
import type { DiscoveredFileEntry, DiscoveredFiles, ToolAssetCounts, ToolCategoryCounts } from '@/types/api';

/** 类别 → 发现列表字段名（准则/智能体等类别第一版不扫文件，故不在表内） */
const DISCOVERED_KEY_BY_CATEGORY: Record<string, keyof DiscoveredFiles> = {
  identity: 'identities',
  skill: 'skills',
  rule: 'rules',
  mcp: 'mcps',
};

export interface ToolAssetSummaryProps {
  /** 未安装的工具不产出任何已同步/可收藏数字 */
  installed: boolean;
  /** 服务端三口径；读不到时为 null，界面直说「暂不可用」 */
  counts: ToolAssetCounts | null;
  /** 可收藏文件列表（服务端已按 conflict=none 筛过） */
  discovered?: DiscoveredFiles;
  /** 类别清单（fallback + 接口覆盖，由 useAssetCategories 提供） */
  categories: AssetCategoryConfig[];
}

/** 单类别展示数据 */
interface CountRowView {
  code: string;
  label: string;
  icon: LucideIcon;
  counts: ToolCategoryCounts;
}

function hasAnyNumber(counts: ToolCategoryCounts | undefined): counts is ToolCategoryCounts {
  return counts !== undefined && (counts.library > 0 || counts.synced > 0 || counts.pendingImport > 0);
}

/**
 * 需要显示的类别行
 *
 * 只按声明源渲染（与侧栏、资产库同一清单）。接口里存在但未纳入声明源的类别
 * （如阶段 1 之前的 memory）一律不展示：把它当英文 code 直出是产品卫生事故，
 * 而它的可收藏数又无法在文件列表里落地，只会多出一个无依无据的数字。
 */
function countRows(counts: ToolAssetCounts, categories: AssetCategoryConfig[]): CountRowView[] {
  const rows: CountRowView[] = [];
  for (const category of categories) {
    const value = counts.byCategory[category.code];
    if (!hasAnyNumber(value)) continue;
    rows.push({ code: category.code, label: category.label, icon: category.icon, counts: value });
  }
  return rows;
}

/** 单类别一行：已同步 N / 我的库 M（+ 可收藏 K） */
function CountRow({ row }: { row: CountRowView }): JSX.Element {
  const Icon = row.icon;
  return (
    <div data-testid={`count-row-${row.code}`} className="flex items-center gap-2 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <span>{row.label}</span>
      <span className="ml-auto text-xs text-muted-foreground">
        已同步 {row.counts.synced} / 我的库 {row.counts.library}
      </span>
      {row.counts.pendingImport > 0 && (
        <Badge variant="secondary" className="shrink-0">
          可收藏 {row.counts.pendingImport}
        </Badge>
      )}
    </div>
  );
}

/** 项目级工具（如 Qoder）：状态是「资产 × 项目」二维，一维数字装不下（proposal D3） */
function ProjectToolNote({ projectCount }: { projectCount: number }): JSX.Element {
  const configured = projectCount > 0;
  return (
    <div className="space-y-2 text-sm">
      <p className="text-muted-foreground">
        本工具按项目同步，请在项目页查看
        {configured ? `（已接入 ${projectCount} 个项目）` : '（尚未选择项目）'}
      </p>
      <Button variant="outline" size="sm" className="h-7 px-2 text-xs" asChild>
        <Link to="/projects">{configured ? '查看项目' : '去配置'}</Link>
      </Button>
    </div>
  );
}

/** 单个文件条目的展示名（只显示文件名，不把本机绝对路径摊到界面上） */
function fileName(path: string): string {
  const segments = path.split(/[/\\]/);
  const base = segments[segments.length - 1] ?? path;
  if (base.toLowerCase() === 'skill.md') return segments[segments.length - 2] ?? base;
  return base.replace(/\.(md|json|toml)$/i, '');
}

/** 同步情况：普通工具逐类给数，项目级工具按项目说，读不到数就直说 */
function SyncStatusSection({ counts, categories }: ToolAssetSummaryProps): JSX.Element {
  if (!counts) return <p className="text-sm text-muted-foreground">同步状态暂不可用</p>;
  if (counts.projectCount !== null) return <ProjectToolNote projectCount={counts.projectCount} />;

  const rows = countRows(counts, categories);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">我的库还没有资产可同步</p>;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <CountRow key={row.code} row={row} />
      ))}
      {counts.partial && (
        <p className="text-xs text-warning flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />
          部分工具状态暂不可用，数字可能不完整
        </p>
      )}
    </div>
  );
}

/** 可收藏的新文件：工具里有、我的库里没有 */
function CollectableSection({ counts, discovered, categories }: ToolAssetSummaryProps): JSX.Element {
  const groups: Array<{ code: string; label: string; icon: LucideIcon; files: DiscoveredFileEntry[] }> = [];
  for (const category of categories) {
    const key = DISCOVERED_KEY_BY_CATEGORY[category.code];
    const files = key ? discovered?.[key] ?? [] : [];
    if (files.length > 0) groups.push({ code: category.code, label: category.label, icon: category.icon, files });
  }
  if (groups.length === 0) return <p className="text-sm text-muted-foreground">没有可收藏的新文件</p>;

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const Icon = group.icon;
        return (
          <div key={group.code}>
            <div className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
              <Icon className="h-3.5 w-3.5" />
              {group.label}（{group.files.length}）
            </div>
            <div className="space-y-1">
              {group.files.slice(0, 5).map((file) => (
                <div key={file.path} className="flex items-center gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                  <Folder className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1 font-mono">{fileName(file.path)}</span>
                </div>
              ))}
              {group.files.length > 5 && (
                <div className="text-xs text-muted-foreground pl-5">还有 {group.files.length - 5} 个文件…</div>
              )}
            </div>
          </div>
        );
      })}
      <Button size="sm" className="w-full mt-1" asChild>
        <Link to="/import">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          去收藏
        </Link>
      </Button>
      {/* 计数缺失时不在这里补数字：口径一律以「同步情况」区块为准 */}
      {counts === null && <p className="text-xs text-muted-foreground">计数暂不可用，列表以扫描结果为准</p>}
    </div>
  );
}

export default function ToolAssetSummary(props: ToolAssetSummaryProps): JSX.Element {
  if (!props.installed) {
    return (
      <div className="p-4 border-b">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          同步情况
        </h3>
        <p className="text-sm text-muted-foreground">工具未安装，无法同步</p>
      </div>
    );
  }
  return (
    <>
      <div className="p-4 border-b">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-success" />
          同步情况
        </h3>
        <SyncStatusSection {...props} />
      </div>
      <div className="p-4">
        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-warning" />
          可收藏的新文件
        </h3>
        <CollectableSection {...props} />
      </div>
    </>
  );
}
