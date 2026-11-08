/**
 * 重复治理页（add-asset-governance K6）
 *
 * 扫描 → 分组卡（可改选保留项）→ 合并草案（可编辑，零写库）→ 归档式执行 → 还原。
 * 铁律：跨类别永不合并（后端按类别分组）；归档只移动不删除；灰区必须显式勾选。
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import type {
  DoctorAssetKind,
  DuplicateApplyResponse,
  DuplicateGroupView,
  DuplicateScanResponse,
  DuplicateUndoResponse,
} from '@/types/api';

const KIND_LABEL: Record<DuplicateGroupView['kind'], string> = {
  exact: '完全重复',
  near: '近重复',
  gray: '需人工判断',
};

const CATEGORY_LABEL: Record<DoctorAssetKind, string> = {
  identity: '身份',
  skill: '技能',
  rule: '规则',
  agent: '子代理',
  command: '命令',
  memory: '记忆',
};

const CATEGORY_ORDER: DoctorAssetKind[] = ['skill', 'rule', 'identity', 'agent', 'command', 'memory'];

function formatBytes(length: number): string {
  return `${length} 字`;
}

export function Duplicates(): JSX.Element {
  const [scan, setScan] = useState<DuplicateScanResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keepByGroup, setKeepByGroup] = useState<Record<string, string>>({});
  const [allowGrayByGroup, setAllowGrayByGroup] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<{
    group: DuplicateGroupView;
    keepPath: string;
    content: string;
    diff: string;
    archivePaths: string[];
  } | null>(null);
  const [applied, setApplied] = useState<DuplicateApplyResponse | null>(null);
  const [undone, setUndone] = useState<DuplicateUndoResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [distribute, setDistribute] = useState(false);

  const groups = useMemo(() => scan?.groups ?? [], [scan]);
  const mergeable = groups.filter((group) => group.kind !== 'gray');

  const runScan = useCallback(async () => {
    setScanning(true);
    setError(null);
    setApplied(null);
    setUndone(null);
    try {
      const result = await api.scanDuplicates({});
      setScan(result);
      const defaults: Record<string, string> = {};
      for (const group of result.groups) defaults[group.id] = group.suggestedKeep;
      setKeepByGroup(defaults);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  }, []);

  const keepPathOf = (group: DuplicateGroupView): string => keepByGroup[group.id] ?? group.suggestedKeep;

  const openDraft = useCallback(
    async (group: DuplicateGroupView) => {
      const keepPath = keepByGroup[group.id] ?? group.suggestedKeep;
      setBusy(true);
      setError(null);
      setApplied(null);
      setUndone(null);
      try {
        const result = await api.getDuplicateMergeDraft({
          groupId: group.id,
          keepPath,
          ...(group.kind === 'gray' ? { allowGray: true } : {}),
        });
        setDraft({
          group,
          keepPath: result.keepPath,
          content: result.draftContent,
          diff: result.unifiedDiff,
          archivePaths: result.archivePaths,
        });
        setDistribute(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [keepByGroup],
  );

  const confirmApply = useCallback(async () => {
    if (draft === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.applyDuplicateMerge({
        groupId: draft.group.id,
        keepPath: draft.keepPath,
        finalContent: draft.content,
        archiveMembers: draft.archivePaths,
        distribute,
        ...(draft.group.kind === 'gray' ? { allowGray: true } : {}),
      });
      setApplied(result);
      setDraft(null);
      setScan((prev) =>
        prev === null
          ? prev
          : { ...prev, groups: prev.groups.filter((group) => group.id !== draft.group.id) },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [draft, distribute]);

  const undo = useCallback(async (groupId: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.undoDuplicateMerge(groupId);
      setUndone(result);
      setApplied(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">重复治理</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            扫描只读、零模型调用；合并会把不保留的成员移到 <code>.archive/duplicates/&lt;日期&gt;/</code>，
            只移动不删除，可一键还原。
          </p>
        </div>
        <Button onClick={() => void runScan()} disabled={scanning} data-testid="duplicates-scan">
          {scanning ? '扫描中…' : scan === null ? '开始扫描' : '重新扫描'}
        </Button>
      </div>

      {error !== null && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {scan !== null && (
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <span>已扫描 {scan.scannedAssets} 个资产</span>
          <span>·</span>
          <span>
            可合并 {mergeable.length} 组，预计减少{' '}
            {mergeable.reduce((sum, group) => sum + Math.max(group.members.length - 1, 0), 0)} 个重复条目
          </span>
          {scan.grayCount > 0 && (
            <span>
              · 灰区 {scan.grayCount} 组需人工判断（将调用 {scan.estimatedAiCalls ?? 0} 次模型）
            </span>
          )}
        </div>
      )}

      {scan !== null && groups.length === 0 && (
        <Card data-testid="duplicates-empty">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            没有发现重复条目
          </CardContent>
        </Card>
      )}

      {[...groups]
        .sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category))
        .map((group) => {
          const keepPath = keepPathOf(group);
          const grayConfirmed = allowGrayByGroup[group.id] === true;
          return (
            <Card key={group.id} data-testid={`duplicate-group-${group.id}`}>
              <CardHeader className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">{CATEGORY_LABEL[group.category]}重复组</CardTitle>
                  <Badge variant={group.kind === 'gray' ? 'secondary' : 'default'}>{KIND_LABEL[group.kind]}</Badge>
                  <span className="text-xs text-muted-foreground">相似度 {Math.round(group.similarity * 100)}%</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  建议保留原因：{group.reason}（跨类别永不合并；同组仅含 {CATEGORY_LABEL[group.category]}）
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  {group.members.map((member) => (
                    <label
                      key={member.hubRelativePath}
                      className="flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={`keep-${group.id}`}
                        value={member.hubRelativePath}
                        checked={keepPath === member.hubRelativePath}
                        onChange={() => setKeepByGroup((prev) => ({ ...prev, [group.id]: member.hubRelativePath }))}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs">{member.hubRelativePath}</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {member.name} · {formatBytes(member.bodyLength)} · 修改于{' '}
                          {new Date(member.modifiedAt).toLocaleDateString()}
                          {member.toolSources.length > 0 ? ` · 来源 ${member.toolSources.join(', ')}` : ''}
                        </span>
                      </span>
                      {member.hubRelativePath === group.suggestedKeep && (
                        <Badge variant="outline">建议保留</Badge>
                      )}
                    </label>
                  ))}
                </div>

                {group.kind === 'gray' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={grayConfirmed}
                      onChange={(event) =>
                        setAllowGrayByGroup((prev) => ({ ...prev, [group.id]: event.target.checked }))
                      }
                    />
                    我已人工确认这组可以合并（灰区默认不自动执行）
                  </label>
                )}

                <Button
                  size="sm"
                  disabled={busy || (group.kind === 'gray' && !grayConfirmed)}
                  onClick={() => void openDraft(group)}
                >
                  生成合并草案
                </Button>
              </CardContent>
            </Card>
          );
        })}

      {draft !== null && (
        <Card data-testid="duplicate-draft">
          <CardHeader>
            <CardTitle className="text-base">合并草案（尚未写库）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              保留项 <span className="font-mono">{draft.keepPath}</span>；以下成员将被移动到归档目录（不删除）：
            </p>
            <ul className="space-y-1 text-xs">
              {draft.archivePaths.map((path) => (
                <li key={path} className="font-mono">
                  → {path}
                </li>
              ))}
            </ul>
            <label className="block text-sm">
              合并后的完整正文（可编辑）
              <textarea
                className="mt-1 min-h-[180px] w-full rounded-md border bg-background p-2 font-mono text-xs"
                value={draft.content}
                onChange={(event) => setDraft((prev) => (prev === null ? prev : { ...prev, content: event.target.value }))}
              />
            </label>
            {draft.diff !== '' && (
              <pre className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-2 text-xs">{draft.diff}</pre>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={distribute} onChange={(event) => setDistribute(event.target.checked)} />
              写库后同时同步到已启用的工具（默认只改库）
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || draft.content.trim() === ''} onClick={() => void confirmApply()}>
                确认执行（只归档，不删除）
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                关闭草案
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {applied !== null && (
        <Card data-testid="duplicate-applied">
          <CardHeader>
            <CardTitle className="text-base">合并结果</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-xs text-muted-foreground">保留项已写入，写前备份：{applied.backupRef || '（无）'}</p>
            <ul className="space-y-1 text-xs">
              {applied.archived.map((item) => (
                <li key={item.from} className={item.status === 'archived' ? '' : 'text-destructive'}>
                  {item.status === 'archived' ? '已归档' : '归档失败'}：{item.from} → {item.to}
                  {item.reason !== undefined ? `（${item.reason}）` : ''}
                </li>
              ))}
            </ul>
            {applied.dispatch.length > 0 && (
              <p className="text-xs text-muted-foreground">
                同步结果：{applied.dispatch.map((item) => `${item.tool}(${item.action})`).join('、')}
              </p>
            )}
            {applied.rollbackAvailable && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void undo(applied.groupId)}>
                还原本组
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {undone !== null && (
        <Card data-testid="duplicate-undone">
          <CardContent className="space-y-2 py-4 text-sm">
            <p>保留项已恢复：{undone.keepRestored ? '是' : '否'}</p>
            <p className="text-xs text-muted-foreground">已还原 {undone.restored.length} 个归档成员</p>
            {undone.failures.length > 0 && (
              <ul className="space-y-1 text-xs text-destructive">
                {undone.failures.map((failure) => (
                  <li key={failure.hubRelativePath}>
                    未还原：{failure.hubRelativePath}（{failure.reason}）
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Duplicates;
