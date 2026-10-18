/**
 * 冲突仲裁面板（add-llm-conflict-arbitration C1-C3）
 *
 * 导入向导 Step 3 differs 冲突项展开区：「AI 仲裁」→ 结构化建议卡 → 采纳仅改前端待确认状态，
 * 落盘永远由「确认导入」触发（advisory-only 信任红线，spec Scenario 3/4）。
 * spec: 设计文档/changes/add-llm-conflict-arbitration/specs/conflict-arbitration.spec.md
 */

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import type {
  ArbitrationDecision,
  ArbitrationRequest,
  ArbitrationRequestCategory,
  ArbitrationResponse,
  ConflictStrategy,
} from '@/types/api';

export interface ArbitrationPanelProps {
  category: ArbitrationRequestCategory;
  /** 工具侧源文件绝对路径（左） */
  leftPath: string;
  /** Hub 相对路径（右，hubTargetPath） */
  rightPath: string;
  leftLabel?: string;
  /** 采纳：仅更新前端待确认策略（merge 时携草案），不直接写盘 */
  onAdopt: (strategy: ConflictStrategy, draft?: string) => void;
}

const DECISION_LABEL: Record<ArbitrationDecision, string> = {
  'keep-left': '保留导入版',
  'keep-right': '保留现有版',
  merge: '智能合并',
  'manual-review': '需人工复核',
};

type PanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; result: ArbitrationResponse }
  | { kind: 'config-missing' }
  | { kind: 'failed'; message: string };

/** 资产类别是否可仲裁（preference 等不在后端闭集内的类别不出入口） */
export function isArbitrableCategory(category: string): category is ArbitrationRequestCategory {
  return (['identity', 'skill', 'rule', 'mcp', 'memory'] as string[]).includes(category);
}

export function ArbitrationPanel({ category, leftPath, rightPath, leftLabel, onAdopt }: ArbitrationPanelProps) {
  const [state, setState] = useState<PanelState>({ kind: 'idle' });
  const [draft, setDraft] = useState('');
  const [adopted, setAdopted] = useState(false);

  async function handleArbitrate() {
    setState({ kind: 'loading' });
    setAdopted(false);
    const body: ArbitrationRequest = { category, leftPath, rightPath };
    if (leftLabel !== undefined) body.leftLabel = leftLabel;
    try {
      const result = await api.arbitrate(body);
      setState({ kind: 'done', result });
      setDraft(result.mergedContent ?? '');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('配置')) setState({ kind: 'config-missing' });
      else setState({ kind: 'failed', message });
    }
  }

  function handleAdopt(strategy: ConflictStrategy, adoptDraft?: string) {
    onAdopt(strategy, adoptDraft);
    setAdopted(true);
  }

  return (
    <div className="mt-2 border border-info/30 bg-info-soft/40 rounded-md p-3 space-y-2" data-testid="arbitration-panel">
      <div className="flex items-center gap-2 flex-wrap">
        {state.kind === 'loading' ? (
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled>
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            仲裁中…
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleArbitrate}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            AI 仲裁
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          由你配置的大模型对比两侧内容给出建议，不自动写入
        </span>
      </div>

      {state.kind === 'config-missing' && (
        <div className="text-xs space-y-1">
          <p className="text-warning">请先在设置中配置 AI 端点</p>
          <a href="/skills" className="text-info underline">去配置 AI 服务</a>
        </div>
      )}

      {state.kind === 'failed' && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}

      {state.kind === 'done' && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className="text-xs">{DECISION_LABEL[state.result.decision]}</Badge>
            {state.result.cached && <Badge variant="secondary" className="text-xs">来自缓存</Badge>}
            <span className="text-xs text-muted-foreground">模型：{state.result.model}</span>
          </div>
          <p className="text-xs text-foreground/80">{state.result.rationale}</p>
          {state.result.criteriaUsed.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap text-xs text-muted-foreground">
              <span>命中准则：</span>
              {state.result.criteriaUsed.map((slug) => (
                <Badge key={slug} variant="outline" className="text-xs font-normal">{slug}</Badge>
              ))}
            </div>
          )}
          {state.result.criteriaSkipped > 0 && (
            <p className="text-xs text-muted-foreground">
              提示：{state.result.criteriaSkipped} 条准则未参与本次裁决（预算截断）
            </p>
          )}

          {state.result.decision === 'merge' && (
            <div className="space-y-1.5">
              <Textarea
                aria-label="仲裁合并草案"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                className="text-xs font-mono"
              />
              <Button size="sm" className="h-7 text-xs" onClick={() => handleAdopt('merge', draft)}>
                以此为准
              </Button>
            </div>
          )}

          {(state.result.decision === 'keep-left' || state.result.decision === 'keep-right') && (
            <Button size="sm" className="h-7 text-xs" onClick={() => handleAdopt(state.result.decision === 'keep-left' ? 'overwrite' : 'skip', undefined)}>
              采纳建议
            </Button>
          )}

          {state.result.decision === 'manual-review' && (
            <p className="text-xs text-muted-foreground">
              建议人工判断：请回到下方差异视图与右侧三个策略按钮手动选择
            </p>
          )}

          {adopted && (
            <p className="text-xs text-success">已采纳，确认导入后生效</p>
          )}
        </div>
      )}
    </div>
  );
}
