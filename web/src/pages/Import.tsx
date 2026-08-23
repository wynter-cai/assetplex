import { useState, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
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
  AlertTriangle,
  FileText,
  Loader2,
} from 'lucide-react';
import { ToolCard } from '@/components/import/ToolCard';
import { FileItem } from '@/components/import/FileItem';
import { ConflictDialog } from '@/components/import/ConflictDialog';
import type { DiscoveredItem, ConflictStrategy, ImportItem } from '@/types/api';

type Step = 1 | 2 | 3 | 4;

const stepLabels = ['检测工具', '发现内容', '确认冲突', '导入完成'];

/** 按 hubTargetPath 分组的冲突项 */
interface GroupedConflict {
  hubTargetPath: string;
  category: string;
  existingSize?: number;
  sources: Array<{
    tool: string;
    sourcePath: string;
    size: number;
    absolutePath: string;
  }>;
}

export default function Import() {
  const [step, setStep] = useState<Step>(1);
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set());
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, ConflictStrategy>>(new Map());

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

  // 有冲突的项（conflict === 'differs'），仅包含已选中的
  const selectedConflictItems = useMemo(
    () => allItems.filter((i) => i.conflict === 'differs' && selectedItemKeys.has(itemKey(i))),
    [allItems, selectedItemKeys],
  );

  // 按 hubTargetPath 分组冲突项（避免多工具映射同一目标时重复显示）
  const groupedConflicts = useMemo<GroupedConflict[]>(() => {
    const map = new Map<string, GroupedConflict>();
    for (const item of selectedConflictItems) {
      const existing = map.get(item.hubTargetPath);
      if (existing) {
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

  // 全选/取消全选
  const toggleAll = useCallback(() => {
    if (allItems.length === 0) return;
    const allSelected = allItems.length === selectedItemKeys.size;
    if (allSelected) {
      setSelectedItemKeys(new Set());
    } else {
      setSelectedItemKeys(new Set(allItems.map(itemKey)));
    }
  }, [allItems, selectedItemKeys]);

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

  const setConflictStrategy = useCallback((key: string, strategy: ConflictStrategy) => {
    setConflictResolutions((prev) => {
      const next = new Map(prev);
      next.set(key, strategy);
      return next;
    });
  }, []);

  // 构建导入请求
  const buildImportRequest = useCallback((): ImportItem[] => {
    return allItems
      .filter((i) => selectedItemKeys.has(itemKey(i)))
      .map((i) => ({
        tool: i.tool,
        absolutePath: i.absolutePath,
        hubTargetPath: i.hubTargetPath,
        category: i.category,
        conflict: i.conflict,
        strategy: i.conflict === 'differs' ? (conflictResolutions.get(i.hubTargetPath) ?? 'merge') : undefined,
      }));
  }, [allItems, selectedItemKeys, conflictResolutions]);

  // 进入 Step 3 时，为冲突项设置默认策略（按 hubTargetPath 分组）
  const goToStep3 = useCallback(() => {
    const newResolutions = new Map(conflictResolutions);
    for (const gc of groupedConflicts) {
      if (!newResolutions.has(gc.hubTargetPath)) {
        newResolutions.set(gc.hubTargetPath, 'merge');
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">智能导入</h1>
          <p className="text-muted-foreground mt-2">
            从已安装的 AI 编码工具中自动发现身份、技能、规则和 MCP 配置，一键导入到 AssetPlex 统一管理
          </p>
        </div>
        {step === 1 && (
          <Button variant="outline" onClick={() => rescan()} disabled={scanLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${scanLoading ? 'animate-spin' : ''}`} />
            重新检测
          </Button>
        )}
      </div>

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
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
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
                      // 进入 Step 2 前，自动全选
                      if (allItems.length > 0 && selectedItemKeys.size === 0) {
                        setSelectedItemKeys(new Set(allItems.map(itemKey)));
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
                {selectedItemKeys.size === allItems.length ? '取消全选' : '全选'}
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
                  未发现可导入的文件
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
                if (groupedConflicts.length > 0) {
                  goToStep3();
                } else {
                  handleExecuteImport();
                }
              }}
              disabled={selectedItemKeys.size === 0}
            >
              {groupedConflicts.length > 0 ? '下一步' : '开始导入'}
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
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                {groupedConflicts.length} 个文件存在冲突
                {groupedConflicts.some((g) => g.sources.length > 1) && (
                  <Badge variant="outline" className="text-xs ml-1">含多来源</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {groupedConflicts.map((gc) => (
                <ConflictDialog
                  key={gc.hubTargetPath}
                  hubTargetPath={gc.hubTargetPath}
                  sources={gc.sources}
                  existingSize={gc.existingSize}
                  category={gc.category}
                  strategy={conflictResolutions.get(gc.hubTargetPath) ?? 'merge'}
                  onChange={(s) => setConflictStrategy(gc.hubTargetPath, s)}
                />
              ))}
              {groupedConflicts.length === 0 && (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  所选文件中没有冲突项
                </div>
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
              开始导入
            </Button>
          </div>
        </>
      )}

      {/* Step 4: 导入完成 */}
      {step === 4 && result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">导入完成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* 汇总 */}
            <div className="grid gap-4 md:grid-cols-5">
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{result.created}</div>
                  <div className="text-xs text-muted-foreground">新增</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{result.merged}</div>
                  <div className="text-xs text-muted-foreground">合并</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 text-center">
                  <div className="text-2xl font-bold text-amber-600">{result.overwritten}</div>
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
                  <div className={`text-2xl font-bold ${result.errors > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
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
                  {item.status === 'created' && <CheckCircle className="h-3.5 w-3.5 text-green-500" />}
                  {item.status === 'merged' && <CheckCircle className="h-3.5 w-3.5 text-blue-500" />}
                  {item.status === 'overwritten' && <CheckCircle className="h-3.5 w-3.5 text-amber-500" />}
                  {item.status === 'skipped' && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  {item.status === 'error' && <XCircle className="h-3.5 w-3.5 text-red-500" />}
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
                重新导入
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