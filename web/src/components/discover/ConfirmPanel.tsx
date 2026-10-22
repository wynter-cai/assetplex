/**
 * 确认入库屏（add-github-skill-source L3，状态机第 3 步）
 *
 * 逐条标注「新增 / 同名已存在」：冲突缺省跳过，可切「覆盖」（旧版入库前自动备份）；
 * 改名即时本地校验，非法名阻断确认。点「确认入库」前不产生任何写库请求。
 */
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import type { GithubCandidate, SkillInfo } from '@/types/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { validateSkillNameLocal } from './discover-utils';
import type { CandidateDecision } from './discover-utils';

export interface ConfirmPanelProps {
  candidates: GithubCandidate[];
  decisions: Record<string, CandidateDecision>;
  existingByName: Record<string, SkillInfo>;
  submitting: boolean;
  onRename: (skillPath: string, name: string) => void;
  onToggleOverwrite: (skillPath: string, overwrite: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export function ConfirmPanel({
  candidates,
  decisions,
  existingByName,
  submitting,
  onRename,
  onToggleOverwrite,
  onBack,
  onConfirm,
}: ConfirmPanelProps): JSX.Element {
  const rows = candidates.filter((c) => decisions[c.skillPath]?.selected);

  const anyInvalid = rows.some((c) => {
    const d = decisions[c.skillPath];
    return d !== undefined && validateSkillNameLocal(d.name) !== null;
  });

  const conflictCount = rows.filter((c) => {
    const d = decisions[c.skillPath];
    return d !== undefined && existingByName[d.name.toLowerCase()] !== undefined;
  }).length;
  const overwriteCount = rows.filter((c) => {
    const d = decisions[c.skillPath];
    return d !== undefined && existingByName[d.name.toLowerCase()] !== undefined && d.action === 'overwrite';
  }).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">确认入库（{rows.length} 条）</h2>
        <Button size="sm" variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          返回候选
        </Button>
      </div>

      {conflictCount > 0 && (
        <p className="rounded-md bg-warning-soft px-3 py-2 text-xs text-warning">
          {conflictCount} 条与库内技能同名，缺省跳过不覆盖；已选择覆盖 {overwriteCount} 条（覆盖前旧版自动存入备份区）。
        </p>
      )}

      <div className="space-y-2">
        {rows.map((c) => {
          const d = decisions[c.skillPath];
          if (!d) return null;
          const nameError = validateSkillNameLocal(d.name);
          const existing = existingByName[d.name.toLowerCase()];
          const conflict = existing !== undefined;
          return (
            <Card key={c.skillPath}>
              <CardContent className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    {conflict ? <Badge variant="warning">同名已存在</Badge> : <Badge variant="success">新增</Badge>}
                  </div>
                  <Link to="/vault/skills" className="text-xs text-primary underline-offset-2 hover:underline">
                    查看已有版本
                  </Link>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">入库名</span>
                  <Input
                    value={d.name}
                    onChange={(e) => onRename(c.skillPath, e.target.value)}
                    className="max-w-xs"
                    aria-label={`入库名 ${c.name}`}
                  />
                </div>
                {nameError !== null && <p className="text-xs text-destructive">{nameError}</p>}
                {conflict && (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={d.action === 'overwrite'}
                      onCheckedChange={(v) => onToggleOverwrite(c.skillPath, v)}
                      aria-label={`覆盖 ${d.name}`}
                    />
                    覆盖库内同名技能（保留原 frontmatter，替换 SKILL.md）
                  </label>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          仅写入保险箱 skills/，绝不改动任何工具目录
        </p>
        <Button onClick={onConfirm} disabled={submitting || anyInvalid || rows.length === 0}>
          {submitting ? '入库中…' : '确认入库'}
        </Button>
      </div>
    </div>
  );
}
