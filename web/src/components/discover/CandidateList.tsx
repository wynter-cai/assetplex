/**
 * 候选清单（add-github-skill-source L2，状态机第 2 步）
 *
 * 展示发现结果：源/锁定 SHA（短哈希可展开）、护栏 notes、逐条勾选、打标徽章与筛选、
 * 「智能打标」（未配置 AI 置灰并引导）、「重新发现」force 刷新、「下一步」进入确认屏。
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, RefreshCw, Eye, ArrowRight } from 'lucide-react';
import type { GithubCandidate, GithubDiscoverResult, GithubClassifyEstimate } from '@/types/api';
import { FUNCTION_LABELS } from '@/components/skills/skill-labels';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import type { CandidateDecision } from './discover-utils';

export interface CandidateListProps {
  result: GithubDiscoverResult;
  decisions: Record<string, CandidateDecision>;
  tagging: { busy: boolean; estimate: GithubClassifyEstimate | null };
  aiConfigured: boolean;
  rediscovering: boolean;
  onToggle: (skillPath: string, selected: boolean) => void;
  onTag: () => void;
  onRediscover: () => void;
  onPreview: (skillPath: string) => void;
  onProceed: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

function CandidateRow({
  candidate,
  decision,
  onToggle,
  onPreview,
}: {
  candidate: GithubCandidate;
  decision: CandidateDecision;
  onToggle: (skillPath: string, selected: boolean) => void;
  onPreview: (skillPath: string) => void;
}): JSX.Element {
  const blocked = candidate.skippedReason !== undefined;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0"
          checked={decision.selected && !blocked}
          disabled={blocked}
          onChange={(e) => onToggle(candidate.skillPath, e.target.checked)}
          aria-label={`选择 ${candidate.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{candidate.name}</span>
            {candidate.functionCategory && (
              <Badge variant="secondary">{FUNCTION_LABELS[candidate.functionCategory]}</Badge>
            )}
            {blocked && <Badge variant="warning">超限·不可入库</Badge>}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{candidate.description || '（无描述）'}</p>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{formatBytes(candidate.sizeBytes)}</span>
            <span>附属 {candidate.supportingFileCount}</span>
            <span className="truncate">{candidate.skillPath}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => onPreview(candidate.skillPath)}>
          <Eye className="mr-1 h-3.5 w-3.5" />
          预览
        </Button>
      </CardContent>
    </Card>
  );
}

export function CandidateList({
  result,
  decisions,
  tagging,
  aiConfigured,
  rediscovering,
  onToggle,
  onTag,
  onRediscover,
  onPreview,
  onProceed,
}: CandidateListProps): JSX.Element {
  const [showFullSha, setShowFullSha] = useState(false);
  const [search, setSearch] = useState('');
  const selectedCount = result.candidates.filter((c) => decisions[c.skillPath]?.selected && c.skippedReason === undefined).length;

  const filtered = search.trim()
    ? result.candidates.filter(
        (c) => c.name.toLowerCase().includes(search.toLowerCase()) || c.description.toLowerCase().includes(search.toLowerCase()),
      )
    : result.candidates;

  if (result.candidates.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          该仓库未发现符合约定的技能（需存在 SKILL.md）。{result.notes.length > 0 && ` ${result.notes.join(' ')}`}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{result.repo}</span>
        <button type="button" className="text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowFullSha((v) => !v)}>
          @ {showFullSha ? result.sha : result.shortSha}
        </button>
        {result.cached && <Badge variant="secondary">命中缓存</Badge>}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onRediscover} disabled={rediscovering}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${rediscovering ? 'animate-spin' : ''}`} />
            重新发现
          </Button>
          <Button size="sm" variant="outline" onClick={onTag} disabled={!aiConfigured || tagging.busy} title={aiConfigured ? undefined : '未配置 AI 端点'}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />
            {tagging.busy ? '打标中…' : '智能打标'}
          </Button>
        </div>
      </div>

      {!aiConfigured && (
        <p className="text-xs text-muted-foreground">
          智能打标需先在{' '}
          <Link to="/settings" className="text-primary underline-offset-2 hover:underline">
            设置
          </Link>{' '}
          配置 AI 端点。
        </p>
      )}

      {tagging.estimate && tagging.estimate.aiConfigured && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          打标预算：共 {tagging.estimate.total} 条，命中缓存 {tagging.estimate.cacheHits} 条，将调用模型 {tagging.estimate.willCall} 次。
        </p>
      )}

      {result.notes.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs text-warning">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <Input placeholder="按名称或描述筛选" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      <div className="space-y-2">
        {filtered.map((c) => (
          <CandidateRow key={c.skillPath} candidate={c} decision={decisions[c.skillPath]} onToggle={onToggle} onPreview={onPreview} />
        ))}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <span className="text-sm text-muted-foreground">已选 {selectedCount} / {result.candidates.length} 条</span>
        <Button onClick={onProceed} disabled={selectedCount === 0}>
          下一步：确认入库
          <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
