/**
 * 入库结果屏（add-github-skill-source L4，状态机第 4 步）
 *
 * 成功/跳过/失败分组展示；覆盖备份 backupRef 计数提示；「建议立即体检」为跳转 CTA（不自动发起）；
 * 「去库内查看」「分发」入口跳既有页面；「再发现一批」回到输入源。
 */
import { Link } from 'react-router-dom';
import type { GithubCurateResult } from '@/types/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export interface ResultPanelProps {
  result: GithubCurateResult;
  onRestart: () => void;
}

export function ResultPanel({ result, onRestart }: ResultPanelProps): JSX.Element {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">入库结果</CardTitle>
          <div className="flex gap-2">
            <Badge variant="success">成功 {result.created.length}</Badge>
            <Badge variant="secondary">跳过 {result.skipped.length}</Badge>
            <Badge variant={result.failed.length > 0 ? 'destructive' : 'outline'}>失败 {result.failed.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {result.created.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">已入库</div>
              <ul className="list-disc pl-5">
                {result.created.map((s) => (
                  <li key={s.id}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}
          {result.backupRefs.length > 0 && (
            <p className="text-xs text-muted-foreground">
              覆盖 {result.backupRefs.length} 项旧版已存入备份区（backupRef：{result.backupRefs.join('、')}），如需可回滚。
            </p>
          )}
          {result.skipped.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">因同名已存在而跳过</div>
              <ul className="list-disc pl-5 text-muted-foreground">
                {result.skipped.map((s) => (
                  <li key={s.skillPath}>{s.name}</li>
                ))}
              </ul>
            </div>
          )}
          {result.failed.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-medium text-destructive">失败（部分成功，已成功项不回滚）</div>
              <ul className="list-disc pl-5">
                {result.failed.map((f) => (
                  <li key={f.skillPath}>
                    {f.name ?? f.skillPath}：{f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {result.suggestDoctor && (
        <div className="rounded-md border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning">
          刚入库 {result.created.length} 条外部技能，建议立即体检以确认无冲突与规范问题。
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {result.suggestDoctor && (
          <Link to="/vault">
            <Button>立即体检</Button>
          </Link>
        )}
        <Link to="/vault/skills">
          <Button variant="outline">去库内查看</Button>
        </Link>
        <Link to="/sync">
          <Button variant="outline">分发到工具</Button>
        </Link>
        <Button variant="ghost" onClick={onRestart}>
          再发现一批
        </Button>
      </div>
    </div>
  );
}
