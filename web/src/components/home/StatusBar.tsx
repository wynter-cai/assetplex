/**
 * 首页顶部状态条（refactor-home-action-panel T6）
 *
 * spec: 设计文档/changes/refactor-home-action-panel/specs/home-dashboard.spec.md
 * Requirement 1：一行四个数字，三处可下钻，上次备份只读；
 * 拿不到的数字一律「暂不可用」，库为空显示「待盘点」，都不得填 0。
 */

import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { HealthGrade, HomeStatusNumbers } from '@/types/api';
import { formatHomeTimestamp } from '@/lib/use-home-dashboard';

const GRADE_LABEL: Record<HealthGrade, string> = {
  empty: '待盘点',
  'at-risk': '有风险',
  'needs-attention': '需要打理',
  good: '状态良好',
  excellent: '家底干净',
};

const UNAVAILABLE = '暂不可用';

const LINK_CLASS =
  'rounded text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

export interface StatusBarProps {
  status: HomeStatusNumbers;
  /** 待治理条目数（= 跨维度去重后的 issues.total）；null = 暂不可用 */
  pendingCount: number | null;
}

function Cell({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-12 text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1">{children}</dd>
    </div>
  );
}

function NumberValue({ testId, value, unit }: { testId: string; value: string; unit?: string }): JSX.Element {
  const unavailable = value === UNAVAILABLE;
  return (
    <span data-testid={testId} className="flex items-baseline gap-1">
      <span className={unavailable ? 'text-13 text-muted-foreground' : 'text-20 font-semibold leading-none'}>
        {value}
      </span>
      {!unavailable && unit !== undefined && <span className="text-12 text-muted-foreground">{unit}</span>}
    </span>
  );
}

/** 健康分：空库「待盘点」，未算出「暂不可用」，都不显示 0 */
function HealthValue({ status }: { status: HomeStatusNumbers }): JSX.Element {
  if (status.healthGrade === 'empty') {
    return <span className="text-13 text-muted-foreground">待盘点</span>;
  }
  if (status.healthScore === null) {
    return <span className="text-13 text-muted-foreground">{UNAVAILABLE}</span>;
  }
  return (
    <>
      <span data-testid="status-health-score" className="text-20 font-semibold leading-none">
        {status.healthScore}
      </span>
      {status.healthGrade !== null && (
        <span className="text-12 text-muted-foreground">{GRADE_LABEL[status.healthGrade]}</span>
      )}
    </>
  );
}

function backupText(status: HomeStatusNumbers): string {
  if (status.backupState === 'none') return '尚无备份';
  if (status.backupState === 'unavailable' || status.lastBackupAt === null) return UNAVAILABLE;
  return formatHomeTimestamp(status.lastBackupAt);
}

export function StatusBar({ status, pendingCount }: StatusBarProps): JSX.Element {
  return (
    <section aria-label="状态条" data-testid="status-bar" className="rounded-xl border bg-card">
      <dl className="flex flex-wrap items-start gap-x-10 gap-y-3 px-4 py-3">
        <Cell label="健康分">
          <Link to="/quality" className={LINK_CLASS} aria-label="健康分" data-testid="status-health">
            <HealthValue status={status} />
          </Link>
        </Cell>

        <Cell label="待治理">
          <Link to="/quality" className={LINK_CLASS} aria-label="待治理">
            <NumberValue
              testId="status-pending"
              value={pendingCount === null ? UNAVAILABLE : String(pendingCount)}
              unit="项"
            />
          </Link>
        </Cell>

        <Cell label="未同步">
          <Link to="/sync" className={LINK_CLASS} aria-label="未同步">
            <NumberValue
              testId="status-unsynced"
              value={status.unsyncedCount === null ? UNAVAILABLE : String(status.unsyncedCount)}
              unit="处"
            />
          </Link>
        </Cell>

        <Cell label="上次备份">
          <span data-testid="status-last-backup" className="text-13 text-foreground">
            {backupText(status)}
          </span>
        </Cell>
      </dl>
    </section>
  );
}
