/**
 * SkillsCheckupSection 技能页批量体检入口（add-asset-doctor F5）
 *
 * 容器职责：发起前组装清单——仅库内技能（inLibrary）且物理路径在 Hub 内的条目
 * （医生只服务资产侧，与 asset-first-view 口径一致）。编排全在 BatchCheckup。
 */

import { Stethoscope } from 'lucide-react';
import { BatchCheckup, type BatchCheckupAsset } from './BatchCheckup';
import { api } from '@/lib/api';
import { toHubRelative } from '@/lib/hub-path';

async function buildSkillAssets(): Promise<BatchCheckupAsset[]> {
  const [health, list] = await Promise.all([
    api.getHubHealth(),
    api.listSkills({ scope: 'asset' }),
  ]);
  return list.items
    .filter((s) => s.inLibrary)
    .map((s) => {
      const rel = toHubRelative(health.hubRoot, s.path);
      return rel === null ? null : { label: s.name, hubRelativePath: rel };
    })
    .filter((a): a is BatchCheckupAsset => a !== null);
}

export function SkillsCheckupSection(): JSX.Element {
  return (
    <div className="flex items-center gap-2">
      <BatchCheckup kind="skill" getAssets={buildSkillAssets} />
      <span className="text-xs text-muted-foreground flex items-center gap-1">
        <Stethoscope className="h-3 w-3" />
        批量只到诊断为止，逐条修复走资产详情单点确认
      </span>
    </div>
  );
}
