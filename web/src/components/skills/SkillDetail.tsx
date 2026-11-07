/**
 * 技能详情面板：元信息 + 副本位置 + SKILL.md 原文
 * 我的库（inLibrary=true）技能提供 编辑/删除/同步分发；未入库技能只读、仅同步分发并提供收藏入口。
 * spec: add-skill-agent-write-management / refactor-skill-origin-taxonomy
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles, FileText, Pencil, Archive, Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast-store';
import { errorMessage } from '@/lib/error-message';
import { useEscapeKey } from '@/lib/use-escape-key';
import { Markdown, stripFrontmatter } from '@/components/common/Markdown';
import { SyncDistribute } from '@/components/common/SyncDistribute';
import { DiagnosisPanel } from '@/components/doctor/DiagnosisPanel';
import { FUNCTION_LABELS, FUNCTION_ORDER, PROVENANCE_LABELS, FUNCTION_SOURCE_LABELS, parseCurateSource, provenanceBadgeLabel } from './skill-labels';
import { FunctionDot } from './FunctionDot';
import { useFunctionChange } from './use-function-change';
import { DeleteConfirmDialog, CurateDialog } from './SkillDialogs';
import { useAiClassify } from './use-ai-classify';
import { AiConfigDialog } from './AiConfigDialog';
import type { SkillInfo } from '@/types/api';

interface SkillDetailProps {
  skill: SkillInfo;
  onClose: () => void;
  /** 收藏成功后回调（父组件切换详情到新库内技能） */
  onCurated: (skill: SkillInfo) => void;
}

export function SkillDetail({ skill, onClose, onCurated }: SkillDetailProps): JSX.Element {
  const fnChange = useFunctionChange(skill);
  // 确认区展开时 Esc 先收确认区（detail 的 Esc 关闭让位，避免一按就整页关掉）
  useEscapeKey(!fnChange.open, onClose);
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [curateOpen, setCurateOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['skill', skill.id],
    queryFn: () => api.getSkill(skill.id),
  });

  const isLibrary = skill.inLibrary;
  const sourceInfo = isLibrary && skill.source ? parseCurateSource(skill.source) : null;

  // AI 分类：单条触发，成功后详情与列表同步刷新（spec add-skill-ai-classification）
  const ai = useAiClassify(() => {
    void queryClient.invalidateQueries({ queryKey: ['skill', skill.id] });
  });

  const refresh = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['skills'] });
    void queryClient.invalidateQueries({ queryKey: ['skill', skill.id] });
  };

  const startEdit = (): void => {
    setEditContent(data?.rawContent ?? '');
    setEditing(true);
  };

  const saveEdit = (): void => {
    api
      .updateSkill(skill.id, editContent)
      .then(() => {
        setEditing(false);
        refresh();
      })
      .catch((err: unknown) => {
        // 404（技能已不存在）等错误：提示并刷新列表
        toast.error('保存失败', { description: errorMessage(err) });
        refresh();
      });
  };

  const doDelete = (): void => {
    api
      .deleteSkill(skill.id)
      .then(() => {
        refresh();
        onClose();
      })
      .catch((err: unknown) => {
        toast.error('删除失败', { description: errorMessage(err) });
        setConfirmDelete(false);
      });
  };

  // 宽屏（≥1024px）右栏吸顶：列表滚多远详情都停在视口内（spec navigation-consolidation
  // 长列表滚动中打开详情）；面板高度封顶后由 body 自持滚动，长 SKILL.md 不撑爆页面
  return (
    <div
      data-testid="detail-overlay"
      className="fixed inset-0 z-50 flex min-w-0 flex-col overflow-y-auto bg-background p-4 lg:sticky lg:top-0 lg:left-auto lg:right-auto lg:bottom-auto lg:z-auto lg:max-h-[calc(100vh-3rem)] lg:flex-1 lg:self-start lg:overflow-hidden lg:rounded-lg lg:border lg:bg-card lg:p-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className="text-sm font-semibold truncate">{skill.name}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>关闭</Button>
      </div>

      <div data-testid="detail-body" className="p-4 space-y-4 overflow-y-auto overscroll-contain min-h-0 flex-1 flex flex-col">
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline" className="gap-1">
            <FunctionDot fn={skill.functionCategory} />
            {FUNCTION_LABELS[skill.functionCategory]}
          </Badge>
          <Badge variant="outline">{provenanceBadgeLabel(skill)}</Badge>
          <Badge variant="secondary">{FUNCTION_SOURCE_LABELS[skill.functionSource]}</Badge>
          {isLibrary && sourceInfo && sourceInfo.provenance !== 'self' && (
            <Badge variant="secondary">来自 {PROVENANCE_LABELS[sourceInfo.provenance]}</Badge>
          )}
          {skill.version && <Badge variant="secondary">v{skill.version}</Badge>}
        </div>

        {/* 调整分类：与卡面同一套确认式交互（spec inline-function-confirm Scenario: 详情面板同改） */}
        <div className="flex items-center gap-1.5">
          <Button
            ref={fnChange.triggerRef}
            variant="outline"
            size="sm"
            className="h-8 px-3 text-xs"
            aria-expanded={fnChange.open}
            aria-controls="detail-function-editor"
            onClick={fnChange.begin}
          >
            <Tag className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
            调整分类
          </Button>
          {fnChange.open && (
            <div id="detail-function-editor" className="flex min-w-0 flex-1 items-center gap-1.5">
              <select
                aria-label={`${skill.name} 的新职能分类`}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1.5 text-xs"
                value={fnChange.draft}
                onChange={(e) => fnChange.setDraft(e.target.value as SkillInfo['functionCategory'])}
              >
                {FUNCTION_ORDER.map((f) => (
                  <option key={f} value={f}>{FUNCTION_LABELS[f]}</option>
                ))}
              </select>
              <Button size="sm" className="h-8 px-3 text-xs" onClick={fnChange.apply} disabled={fnChange.pending}>
                {fnChange.pending ? '提交中…' : '应用'}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 px-3 text-xs" onClick={fnChange.cancel}>
                取消
              </Button>
            </div>
          )}
        </div>

        {skill.description && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">描述</h3>
            <p className="text-14">{skill.description}</p>
          </div>
        )}

        {!isLoading && (
          <div className="flex flex-wrap items-center gap-2">
            {isLibrary && (
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={startEdit}>
                <Pencil className="h-3.5 w-3.5 mr-1" />
                编辑
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => ai.classify([skill.id])}
              disabled={ai.running}
            >
              {ai.running ? 'AI 分类中…' : 'AI 分类'}
            </Button>
            {!isLibrary && (
              <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setCurateOpen(true)}>
                <Archive className="h-3.5 w-3.5 mr-1" />
                收藏到我的库
              </Button>
            )}
            {isLibrary && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                删除
              </Button>
            )}
            <SyncDistribute onSynced={refresh} />
          </div>
        )}

        {/* 资产医生：advisory-only 体检入口；库内技能经 hubRoot 解析后才渲染（环境条目自动隐藏） */}
        {isLibrary && (
          <DiagnosisPanel kind="skill" absolutePath={skill.path} />
        )}

        {skill.workspacePath && (
          <div>
            <h3 className="text-xs font-medium text-muted-foreground mb-1">所属工作区</h3>
            <p className="text-sm mb-1">{skill.workspaceName ?? skill.workspacePath}</p>
            <code className="block text-xs bg-muted rounded p-2 break-all">{skill.workspacePath}</code>
          </div>
        )}

        <div>
          <h3 className="text-xs font-medium text-muted-foreground mb-1">
            文件位置（共 {skill.variants + 1} 个副本）
          </h3>
          <code className="block text-xs bg-muted rounded p-2 break-all">{skill.path}</code>
        </div>

        <div className="flex flex-col flex-1 min-h-[max(60vh,576px)]">
          <h3 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1 shrink-0">
            <FileText className="h-3 w-3" />
            SKILL.md 文档
          </h3>
          {isLoading ? (
            <Skeleton className="h-[max(60vh,576px)] w-full" />
          ) : editing ? (
            <div className="flex flex-col gap-2 flex-1">
              <Textarea
                aria-label="编辑 SKILL.md 内容"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="flex-1 min-h-48 font-mono text-xs"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => setEditing(false)}>
                  取消
                </Button>
                <Button size="sm" className="h-8 px-3 text-xs" onClick={saveEdit}>保存</Button>
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded border bg-muted/30 p-3">
              {data?.rawContent ? (
                <Markdown content={stripFrontmatter(data.rawContent)} />
              ) : (
                <p className="text-xs text-muted-foreground">（无内容）</p>
              )}
            </div>
          )}
        </div>
      </div>

      <DeleteConfirmDialog
        skill={skill}
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={doDelete}
      />

      {curateOpen && (
        <CurateDialog skill={skill} onOpenChange={setCurateOpen} onCurated={onCurated} />
      )}

      <AiConfigDialog
        open={ai.configOpen}
        onOpenChange={ai.setConfigOpen}
        onSaved={ai.resumePending}
      />
    </div>
  );
}
