import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Download,
  CheckCircle,
  XCircle,
  FileText,
  Loader2,
} from 'lucide-react';
import { ToolCard } from '@/components/import/ToolCard';
import { FileItem } from '@/components/import/FileItem';
import { ConflictDialog } from '@/components/import/ConflictDialog';
import { ConfirmGroup, ConfirmGroupRow } from '@/components/import/ConfirmGroup';
import type { DiscoveredItem, ConflictStrategy, ImportItem } from '@/types/api';

type Step = 1 | 2 | 3 | 4;

const stepLabels = ['检测工具', '发现内容', '确认收藏', '收藏完成'];

/** 按 hubTargetPath 分组的冲突项 */
interface GroupedConflict {
  hubTargetPath: string;
  category: string;
  existingSize?: number;
  /** 多来源里有任一二进制即整组按二进制处理（不提供合并） */
  binary: boolean;
  sources: Array<{
    tool: string;
    sourcePath: string;
    size: number;
    absolutePath: string;
  }>;
}

/** 冲突项解决状态：策略 + 可选的已采纳仲裁草案（仅 merge 时有意义） */
interface ConflictResolution {
  strategy: ConflictStrategy;
  draft?: string;
}

export default function Import() {
  const [step, setStep] = useState<Step>(1);
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, ConflictResolution>>(new Map());

  // Step 1: 扫描工具
  const { data: scanData, isLoading: scanLoading, refetch: rescan } = useQuery({
    queryKey: ['import-scan'],
    queryFn: api.scanTools,
    enabled: true,
  });

  // Step 4: 执行导入
  const importMutation = useMutation({
    mutationFn: (items: ImportItem[]) => api.executeImport(items),
  });

  const inventories = scanData?.inventories ?? [];
  const installedTools = inventories.filter((t) => t.installed);

  // 键：tool:absolutePath
  const itemKey = (item: DiscoveredItem) => `${item.tool}:${item.absolutePath}`;

  // 所有发现项（仅已安装工具的）
  const allItems = useMemo(
    () => inventories.filter((t) => t.installed).flatMap((t) => t.items),
    [inventories],
  );

  // 可一键全选的条目：二进制默认不勾选（spec import-wizard-noise Scenario Step 2 默认选择）
  const selectableItems = useMemo(() => allItems.filter((i) => !i.binary), [allItems]);

  // 有冲突的项（conflict === 'differs'），仅包含已选中的
  const selectedConflictItems = useMemo(
    () => allItems.filter((i) => i.conflict === 'differs' && selectedItemKeys.has(itemKey(i))),
    [allItems, selectedItemKeys],
  );

  // 已选中的无冲突项（none/exists）：Step 3 确认屏预览用
  const selectedNonConflictItems = useMemo(
    () => allItems.filter((i) => i.conflict !== 'differs' && selectedItemKeys.has(itemKey(i))),
    [allItems, selectedItemKeys],
  );

  // 确认屏后两组：已存在（保持不动）/ 新增（将写入）
  const existingItems = useMemo(
    () => selectedNonConflictItems.filter((i) => i.conflict === 'exists'),
    [selectedNonConflictItems],
  );
  const newItems = useMemo(
    () => selectedNonConflictItems.filter((i) => i.conflict === 'none'),
    [selectedNonConflictItems],
  );

  // 按 hubTargetPath 分组冲突项（避免多工具映射同一目标时重复显示）
  const groupedConflicts = useMemo<GroupedConflict[]>(() => {
    const map = new Map<string, GroupedConflict>();
    for (const item of selectedConflictItems) {
      const existing = map.get(item.hubTargetPath);
      if (existing) {
        existing.binary = existing.binary || item.binary;
        existing.sources.push({
          tool: item.tool,
          sourcePath: item.absolutePath,
          size: item.size,
          absolutePath: item.absolutePath,
        });
      } else {
        map.set(item.hubTargetPath, {
          hubTargetPath: item.hubTargetPath,
          category: item.category,
          existingSize: item.existingSize,
          binary: item.binary,
          sources: [{
            tool: item.tool,
            sourcePath: item.absolutePath,
            size: item.size,
            absolutePath: item.absolutePath,
          }],
        });
      }
    }
    return Array.from(map.values());
  }, [selectedConflictItems]);

  // 全选/取消全选（只作用于非二进制条目）
  const toggleAll = useCallback(() => {
    if (selectableItems.length === 0) return;
    const allSelected = selectableItems.every((i) => selectedItemKeys.has(itemKey(i)));
    if (allSelected) {
      setSelectedItemKeys(new Set());
    } else {
      setSelectedItemKeys(new Set(selectableItems.map(itemKey)));
    }
  }, [selectableItems, selectedItemKeys]);

  const toggleItem = useCallback((item: DiscoveredItem) => {
    const key = itemKey(item);
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleTool = useCallback((_tool: string, items: DiscoveredItem[]) => {
    setSelectedItemKeys((prev) => {
      const next = new Set(prev);
      const allSelected = items.every((i) => next.has(itemKey(i)));
      if (allSelected) {
        items.forEach((i) => next.delete(itemKey(i)));
      } else {
        items.forEach((i) => next.add(itemKey(i)));
      }
      return next;
    });
  }, []);

  const setConflictStrategy = useCallback((key: string, strategy: ConflictStrategy, draft?: string) => {
    setConflictResolutions((prev) => {
      const next = new Map(prev);
      const existing = next.get(key);
      // 草案仅由仲裁采纳路径传入；未传时：同策略重选 merge 保留旧草案，切到其他策略清除
      const effectiveDraft = draft !== undefined
        ? draft
        : (existing !== undefined && strategy === 'merge' && existing.strategy === 'merge' ? existing.draft : undefined);
      next.set(key, strategy === 'merge'
        ? { strategy, ...(effectiveDraft !== undefined ? { draft: effectiveDraft } : {}) }
        : { strategy });
      return next;
    });
  }, []);

  // 构建导入请求（differs 项携带解决策略；已采纳仲裁草案时透传 mergeDraft，后端以此为准落盘）
  const buildImportRequest = useCallback((): ImportItem[] => {
    return allItems
      .filter((i) => selectedItemKeys.has(itemKey(i)))
      .map((i) => {
        const resolution = i.conflict === 'differs'
          ? (conflictResolutions.get(i.hubTargetPath) ?? { strategy: 'merge' as ConflictStrategy })
          : undefined;
        return {
          tool: i.tool,
          absolutePath: i.absolutePath,
          hubTargetPath: i.hubTargetPath,
          category: i.category,
          conflict: i.conflict,
          strategy: resolution?.strategy,
          // 二进制标记透传：后端据此走字节写入，不把图标当文本重编码
          binary: i.binary,
          ...(resolution !== undefined && resolution.strategy === 'merge' && resolution.draft !== undefined
            ? { mergeDraft: resolution.draft }
            : {}),
        };
      });
  }, [allItems, selectedItemKeys, conflictResolutions]);

  // 进入 Step 3 时，为冲突项设置默认策略（按 hubTargetPath 分组）：
  // 二进制冲突默认跳过（不默认覆盖库内已有的图标），文本冲突仍默认智能合并
  const goToStep3 = useCallback(() => {
    const newResolutions = new Map(conflictResolutions);
    for (const gc of groupedConflicts) {
      if (!newResolutions.has(gc.hubTargetPath)) {
        newResolutions.set(gc.hubTargetPath, { strategy: gc.binary ? 'skip' : 'merge' });
      }
    }
    setConflictResolutions(newResolutions);
    setStep(3);
  }, [groupedConflicts, conflictResolutions]);

  const handleExecuteImport = useCallback(() => {
    const items = buildImportRequest();
    if (items.length === 0) return;
    importMutation.mutate(items, { onSuccess: () => setStep(4) });
  }, [buildImportRequest, importMutation]);

  const result = importMutation.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="收藏到我的库"
        subtitle="从已安装的 AI 编码工具中自动发现身份、技能、规则和 MCP 配置，选中后收藏进我的库统一管理"
        actions={
          step === 1 && (
            <Button variant="outline" onClick={() => rescan()} disabled={scanLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${scanLoading ? 'animate-spin' : ''}`} />
              重新检测
            </Button>
          )
        }
      />

      {/* 步骤指示器 */}
      <div className="flex items-center gap-2">
        {stepLabels.map((label, i) => {
          const s = (i + 1) as Step;
          const active = s === step;
          const done = s < step;
          return (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                  active
                    ? 'bg-primary text-primary-foreground'
                    : done
                      ? 'bg-success-soft text-success'
                      : 'bg-muted text-muted-foreground'
                }`}
              >
                {done ? <CheckCircle className="h-3.5 w-3.5" /> : <span className="text-xs">{s}</span>}
                {label}
              </div>
              {i < stepLabels.length - 1 && (
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step 1: 检测工具 */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">检测到的 AI 编码工具</CardTitle>
          </CardHeader>
          <CardContent>
            {scanLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在扫描系统安装的工具...
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    已安装 {installedTools.length} 个工具，共发现 {allItems.length} 个文件
                  </span>
                </div>
                {inventories.map((tool) => (
                  <ToolCard
                    key={tool.toolName}
                    tool={tool}
                    selected={tool.items.length > 0}
                    onToggle={() => {}}
                  />
                ))}
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => {
                      // 进入 Step 2 前自动全选，但二进制条目默认不勾选
                      if (selectableItems.length > 0 && selectedItemKeys.size === 0) {
                        setSelectedItemKeys(new Set(selectableItems.map(itemKey)));
                      }
                      setStep(2);
                    }}
                    disabled={allItems.length === 0}
                  >
                    下一步
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: 发现内容 */}
      {step === 2 && (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">
                发现 {allItems.length} 个文件
              </CardTitle>
              <Button variant="outline" size="sm" onClick={toggleAll}>
                {selectableItems.length > 0 && selectableItems.every((i) => selectedItemKeys.has(itemKey(i)))
                  ? '取消全选'
                  : '全选'}
              </Button>
            </CardHeader>
            <CardContent>
              {inventories
                .filter((t) => t.installed && t.items.length > 0)
                .map((tool) => (
                  <div key={tool.toolName} className="mb-4 last:mb-0">
                    <div
                      className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 cursor-pointer hover:bg-muted"
                      onClick={() => toggleTool(tool.toolName, tool.items)}
                    >
                      <span className="text-sm font-medium">{tool.displayName}</span>
                      <Badge variant="secondary" className="text-xs">
                        {tool.items.length} 个文件
                      </Badge>
                    </div>
                    {tool.items.map((item) => (
                      <FileItem
                        key={itemKey(item)}
                        item={item}
                        selected={selectedItemKeys.has(itemKey(item))}
                        onToggle={() => toggleItem(item)}
                      />
                    ))}
                  </div>
                ))}
              {allItems.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2" />
                  未发现可收藏的文件
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一步
            </Button>
            <Button
              onClick={() => {
                // 无冲突不再一键直达落盘：统一进 Step 3 确认屏，预览后才执行
                if (groupedConflicts.length > 0) {
                  goToStep3();
                } else {
                  setStep(3);
                }
              }}
              disabled={selectedItemKeys.size === 0}
            >
              下一步
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </>
      )}

      {/* Step 3: 确认冲突 */}
      {step === 3 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-success" />
                确认收藏
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groupedConflicts.length > 0 && (
                <ConfirmGroup
                  testId="confirm-group-conflict"
                  title="内容冲突"
                  count={groupedConflicts.length}
                  summary="需逐项选择处理方式"
                  defaultOpen
                >
                  {groupedConflicts.map((gc) => (
                    <ConflictDialog
                      key={gc.hubTargetPath}
                      hubTargetPath={gc.hubTargetPath}
                      sources={gc.sources}
                      existingSize={gc.existingSize}
                      category={gc.category}
                      strategy={conflictResolutions.get(gc.hubTargetPath)?.strategy ?? (gc.binary ? 'skip' : 'merge')}
                      hasAdoptedDraft={conflictResolutions.get(gc.hubTargetPath)?.draft !== undefined}
                      binary={gc.binary}
                      onChange={(s, draft) => setConflictStrategy(gc.hubTargetPath, s, draft)}
                    />
                  ))}
                </ConfirmGroup>
              )}
              {existingItems.length > 0 && (
                <ConfirmGroup
                  testId="confirm-group-exists"
                  title="库内已存在"
                  count={existingItems.length}
                  summary="已存在，跳过不覆盖"
                >
                  {existingItems.map((item) => (
                    <ConfirmGroupRow
                      key={itemKey(item)}
                      path={item.hubTargetPath}
                      tool={item.tool}
                      label="已存在，跳过不覆盖"
                      className="text-muted-foreground border-muted"
                    />
                  ))}
                </ConfirmGroup>
              )}
              {newItems.length > 0 && (
                <ConfirmGroup
                  testId="confirm-group-new"
                  title="新增文件"
                  count={newItems.length}
                  summary="将写入我的库"
                >
                  {newItems.map((item) => (
                    <ConfirmGroupRow
                      key={itemKey(item)}
                      path={item.hubTargetPath}
                      tool={item.tool}
                      label="将写入我的库"
                      className="text-success border-success/40"
                    />
                  ))}
                </ConfirmGroup>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              上一步
            </Button>
            <Button onClick={handleExecuteImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-1" />
              )}
              开始收藏
            </Button>
          </div>
        </>
      )}

      {/* Step 4: 收藏完成 */}
      {step === 4 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">收藏完成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 汇总 */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-success">{result.created}</div>
                  <div className="text-xs text-muted-foreground">新增</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-info">{result.merged}</div>
                  <div className="text-xs text-muted-foreground">合并</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-warning">{result.overwritten}</div>
                  <div className="text-xs text-muted-foreground">覆盖</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-muted-foreground">{result.skipped}</div>
                  <div className="text-xs text-muted-foreground">跳过</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className={`text-2xl font-bold ${result.errors > 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {result.errors}
                  </div>
                  <div className="text-xs text-muted-foreground">错误</div>
                </CardContent>
              </Card>
            </div>

            {/* 详情列表 */}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {result.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded text-sm">
                  {item.status === 'created' && <CheckCircle className="h-3.5 w-3.5 text-success" />}
                  {item.status === 'merged' && <CheckCircle className="h-3.5 w-3.5 text-info" />}
                  {item.status === 'overwritten' && <CheckCircle className="h-3.5 w-3.5 text-warning" />}
                  {item.status === 'skipped' && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                  <span className="truncate">{item.hubTargetPath}</span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0">
                    {item.status === 'created' && '新增'}
                    {item.status === 'merged' && '合并'}
                    {item.status === 'overwritten' && '覆盖'}
                    {item.status === 'skipped' && '跳过'}
                    {item.status === 'error' && item.message}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setStep(1)}>
                继续收藏
              </Button>
              <Button onClick={() => (window.location.href = '/sync')}>
                前往同步中心
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}