/**
 * 技能发现页（add-github-skill-source L，状态机编排）
 *
 * 四步：输入源 → 候选清单 → 确认入库 → 结果。全程仅 curate 写库；预览/打标只读。
 * 冲突预校验对照库内技能（服务端 curate 仍兜底）；打标未配置 AI 时按钮置灰并引导。
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Github, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/error-message';
import { toast } from '@/lib/toast-store';
import type {
  GithubCandidate,
  GithubClassifyEstimate,
  GithubCurateItemInput,
  GithubCurateResult,
  GithubDiscoverResult,
  SkillInfo,
} from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CandidateList } from '@/components/discover/CandidateList';
import { ConfirmPanel } from '@/components/discover/ConfirmPanel';
import { ResultPanel } from '@/components/discover/ResultPanel';
import { PreviewDialog } from '@/components/discover/PreviewDialog';
import { defaultDecision, looksLikeGithubSource } from '@/components/discover/discover-utils';
import type { CandidateDecision, DiscoverStep } from '@/components/discover/discover-utils';

const EXAMPLE = 'owner/repo 或 owner/repo/skills 或 owner/repo@v1.2.3';

export default function Discover(): JSX.Element {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<DiscoverStep>('input');
  const [source, setSource] = useState('');
  const [discover, setDiscover] = useState<GithubDiscoverResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, CandidateDecision>>({});
  const [curateResult, setCurateResult] = useState<GithubCurateResult | null>(null);
  const [busy, setBusy] = useState<'discover' | 'rediscover' | 'curate' | 'tag' | null>(null);
  const [estimate, setEstimate] = useState<GithubClassifyEstimate | null>(null);
  const [previewPath, setPreviewPath] = useState<string | null>(null);

  // 库内技能 id 映射（仅 inLibrary 参与覆盖冲突判定；非库同名由服务端兜底报错）
  const libraryQuery = useQuery({ queryKey: ['skills', 'discover-conflict'], queryFn: () => api.listSkills({ scope: 'all' }) });
  const existingByName = useMemo<Record<string, SkillInfo>>(() => {
    const map: Record<string, SkillInfo> = {};
    for (const s of libraryQuery.data?.items ?? []) if (s.inLibrary) map[s.id] = s;
    return map;
  }, [libraryQuery.data]);

  // AI 配置状态（决定打标按钮是否可用）
  const aiConfigQuery = useQuery({ queryKey: ['ai-classify-config'], queryFn: () => api.getAiClassifyConfig() });
  const aiConfigured = Boolean(aiConfigQuery.data?.hasApiKey && aiConfigQuery.data?.baseUrl && aiConfigQuery.data?.model);

  const selectedCandidates = (discover?.candidates ?? []).filter((c) => decisions[c.skillPath]?.selected && c.skippedReason === undefined);

  function initDecisions(candidates: GithubCandidate[]): Record<string, CandidateDecision> {
    const map: Record<string, CandidateDecision> = {};
    for (const c of candidates) map[c.skillPath] = defaultDecision(c);
    return map;
  }

  async function runDiscover(force: boolean): Promise<void> {
    if (!looksLikeGithubSource(source)) {
      toast.error('源串格式不正确', { description: EXAMPLE });
      return;
    }
    setBusy(force ? 'rediscover' : 'discover');
    try {
      const result = await api.github.discover(source, force);
      setDiscover(result);
      setDecisions(initDecisions(result.candidates));
      setEstimate(null);
      setStep('candidates');
    } catch (err) {
      toast.error('发现失败', { description: errorMessage(err, '请检查源串或稍后重试') });
    } finally {
      setBusy(null);
    }
  }

  function patchDecision(skillPath: string, patch: Partial<CandidateDecision>): void {
    setDecisions((prev) => ({ ...prev, [skillPath]: { ...prev[skillPath], ...patch } }));
  }

  async function handleTag(): Promise<void> {
    if (!discover) return;
    const skillPaths = discover.candidates.filter((c) => c.skippedReason === undefined).map((c) => c.skillPath);
    if (skillPaths.length === 0) return;
    setBusy('tag');
    try {
      const est = await api.github.classifyEstimate({ repo: discover.repo, sha: discover.sha, skillPaths });
      setEstimate(est);
      if (!est.aiConfigured) return;
      const { tags } = await api.github.classify({ repo: discover.repo, sha: discover.sha, skillPaths });
      const byPath = new Map(tags.map((t) => [t.skillPath, t]));
      setDiscover({
        ...discover,
        candidates: discover.candidates.map((c) => {
          const t = byPath.get(c.skillPath);
          return t?.function ? { ...c, functionCategory: t.function } : c;
        }),
      });
      const failed = tags.filter((t) => t.error).length;
      toast.success(`打标完成${failed ? `（${failed} 条失败）` : ''}`, { description: `实际调用模型 ${est.willCall} 次` });
    } catch (err) {
      toast.error('打标失败', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!discover) return;
    const items: GithubCurateItemInput[] = selectedCandidates.map((c) => {
      const d = decisions[c.skillPath];
      const conflict = existingByName[d.name.toLowerCase()] !== undefined;
      return { skillPath: c.skillPath, name: d.name, action: conflict ? d.action : undefined };
    });
    setBusy('curate');
    try {
      const result = await api.github.curate({ repo: discover.repo, sha: discover.sha, items });
      setCurateResult(result);
      setStep('result');
      queryClient.invalidateQueries({ queryKey: ['skills'] });
    } catch (err) {
      toast.error('入库失败', { description: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  }

  function restart(): void {
    setStep('input');
    setSource('');
    setDiscover(null);
    setDecisions({});
    setCurateResult(null);
    setEstimate(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Github className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">技能发现</h1>
          <p className="mt-1 text-muted-foreground">从公开 GitHub 仓库发现技能，预览确认后入库（仅本机手动触发，锁版本）</p>
        </div>
      </div>

      {step === 'input' && (
        <Card>
          <CardContent className="space-y-3 py-5">
            <label htmlFor="gh-source" className="text-sm font-medium">
              GitHub 源
            </label>
            <div className="flex gap-2">
              <Input
                id="gh-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={EXAMPLE}
                onKeyDown={(e) => e.key === 'Enter' && runDiscover(false)}
              />
              <Button onClick={() => runDiscover(false)} disabled={busy !== null}>
                {busy === 'discover' && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                发现技能
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              支持 <code>owner/repo</code>、<code>owner/repo/子目录</code>、<code>owner/repo@分支或标签</code>。发现阶段只读不落盘，锁定 commit 版本防上游变动。
            </p>
          </CardContent>
        </Card>
      )}

      {step === 'candidates' && discover && (
        <CandidateList
          result={discover}
          decisions={decisions}
          tagging={{ busy: busy === 'tag', estimate }}
          aiConfigured={aiConfigured}
          rediscovering={busy === 'rediscover'}
          onToggle={(p, v) => patchDecision(p, { selected: v })}
          onTag={handleTag}
          onRediscover={() => runDiscover(true)}
          onPreview={(p) => setPreviewPath(p)}
          onProceed={() => setStep('confirm')}
        />
      )}

      {step === 'confirm' && discover && (
        <ConfirmPanel
          candidates={discover.candidates}
          decisions={decisions}
          existingByName={existingByName}
          submitting={busy === 'curate'}
          onRename={(p, name) => patchDecision(p, { name })}
          onToggleOverwrite={(p, overwrite) => patchDecision(p, { action: overwrite ? 'overwrite' : 'skip' })}
          onBack={() => setStep('candidates')}
          onConfirm={handleConfirm}
        />
      )}

      {step === 'result' && curateResult && <ResultPanel result={curateResult} onRestart={restart} />}

      {discover && previewPath !== null && (
        <PreviewDialog
          open={previewPath !== null}
          onOpenChange={(o) => !o && setPreviewPath(null)}
          repo={discover.repo}
          sha={discover.sha}
          skillPath={previewPath}
        />
      )}
    </div>
  );
}
