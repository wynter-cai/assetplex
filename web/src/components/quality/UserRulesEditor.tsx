/**
 * 用户规则编辑（refactor-governance-center T7，拍板 D16）
 *
 * 落 `<Hub>/diagnosis-rules/*.yaml`：同编号覆盖内置、其余追加。
 * 保存前必须先校验通过；坏条只告警（保存后该条被跳过），整文件不可解析禁止保存。
 *
 * spec: governance-center.spec.md Scenario 5.3 / 5.4 / 5.6
 */

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { RuleValidateResponse } from '@/types/api';

const TEMPLATE = `version: "1.0.0"
updatedAt: "2026-01-01"
rules:
  - id: USER-01
    category: skill
    severity: medium
    mode: static
    signal: "一句话说明什么情况算命中"
    recommendation: "一句话说明怎么改"
    source: "我的团队规范 v1"
`;

const WARNING_LABEL: Record<string, string> = {
  'missing-field': '缺字段，该条已跳过',
  'invalid-category': '类别不在闭集，该条已跳过',
  'invalid-severity': '严重度不在闭集，该条已跳过',
  'invalid-mode': '模式不在闭集，该条已跳过',
  'duplicate-id': '覆盖了同编号内置规则',
  'invalid-applies-to': 'appliesTo 非法，该条已跳过',
  unparsable: '无法解析',
};

export function UserRulesEditor(): JSX.Element {
  const queryClient = useQueryClient();
  const [targetPath, setTargetPath] = useState('diagnosis-rules/my-rules.yaml');
  const [content, setContent] = useState(TEMPLATE);
  const [result, setResult] = useState<RuleValidateResponse | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** 内容一改，之前的校验结论立即失效——不允许拿旧结论保存新内容 */
  function updateContent(next: string): void {
    setContent(next);
    setResult(null);
    setSaved(false);
    setError(null);
  }

  async function validate(): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      setResult(await api.validateUserRules({ content, targetPath: targetPath.trim() }));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : '校验失败');
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await api.writeFile(targetPath.trim(), content);
      await queryClient.invalidateQueries({ queryKey: ['diagnosis-rules'] });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  }

  const canSave = result !== null && result.ok && !busy;

  return (
    <section className="space-y-2" data-testid="user-rules-editor">
      <h2 className="text-lg font-semibold">我的规则</h2>
      <p className="text-sm text-muted-foreground">
        同编号覆盖内置规则，其余追加；内置规则随版本升级只读，不会被改写。保存前会先校验。
      </p>

      <Card>
        <CardContent className="space-y-2 p-3">
          <label className="block text-xs text-muted-foreground">
            保存位置（资产库内相对路径）
            <Input
              value={targetPath}
              onChange={(event) => {
                setTargetPath(event.target.value);
                setResult(null);
                setSaved(false);
              }}
              className="mt-1 h-8 text-xs"
              aria-label="规则文件路径"
            />
          </label>
          <textarea
            value={content}
            onChange={(event) => updateContent(event.target.value)}
            aria-label="规则文件内容"
            spellCheck={false}
            className="h-56 w-full rounded-md border bg-background p-2 font-mono text-xs"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void validate()}>
              校验
            </Button>
            <Button size="sm" disabled={!canSave} onClick={() => void save()}>
              保存
            </Button>
            {error !== null && <span className="text-xs text-destructive">{error}</span>}
            {saved && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已保存，下次诊断生效
              </span>
            )}
          </div>

          {result !== null && (
            <div className="space-y-1 text-xs" data-testid="user-rules-validate-result">
              {result.ok ? (
                <p className="text-muted-foreground">
                  校验通过：生效 {result.effectiveRules} 条
                  {result.warnings.length > 0 ? `，${result.warnings.length} 条告警` : ''}
                </p>
              ) : (
                result.errors.map((item, index) => (
                  <p key={`${item.ruleId ?? 'file'}-${index}`} className="flex items-start gap-1 text-destructive">
                    <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                    {item.message}
                  </p>
                ))
              )}
              {result.warnings.map((warning, index) => (
                <p key={`${warning.originLabel}-${warning.ruleId ?? 'file'}-${index}`} className="text-muted-foreground">
                  告警：{warning.ruleId ?? '文件'} {WARNING_LABEL[warning.reason] ?? warning.reason}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
