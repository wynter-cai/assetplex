/**
 * 技能诊断并发池（refactor-skill-catalog T11）
 *
 * 从 BatchCheckup 抽出的可复用执行骨架：并发 ≤4、逐条隔离失败、进度可读。
 * 「全部体检」（BatchCheckup）与「子集诊断」（SkillDiagnosisDialog）共用同一套，
 * 避免两套并发逻辑；本 hook 只负责执行，不估算成本、不改写库。
 */

import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';
import type { DiagnosisReport } from '@/types/api';

export const DIAGNOSIS_CONCURRENCY = 4;

export interface DiagnosisTarget {
  id: string;
  name: string;
  hubRelativePath: string;
}

export interface DiagnosisRow {
  target: DiagnosisTarget;
  report: DiagnosisReport | null;
  error: string | null;
}

export interface SkillDiagnosisPool {
  /** 与 run 入参同序；未完成的槽位为 null */
  rows: Array<DiagnosisRow | null>;
  done: number;
  running: boolean;
  /** 执行完毕（全部成功或失败）后 resolve，返回与入参同序的结果，便于摘要回写 */
  run: (targets: DiagnosisTarget[]) => Promise<DiagnosisRow[]>;
}

/** 单条诊断：失败只记录原因，不中断其他条目 */
function diagnoseOne(target: DiagnosisTarget): Promise<DiagnosisRow> {
  return api
    .doctorDiagnose({ kind: 'skill', hubRelativePath: target.hubRelativePath })
    .then((report) => ({ target, report, error: null }))
    .catch((err: unknown) => ({
      target,
      report: null,
      error: err instanceof Error ? err.message : String(err),
    }));
}

export function useSkillDiagnosisPool(): SkillDiagnosisPool {
  const [rows, setRows] = useState<Array<DiagnosisRow | null>>([]);
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const runId = useRef(0);

  const run = useCallback((targets: DiagnosisTarget[]): Promise<DiagnosisRow[]> => {
    const id = runId.current + 1;
    runId.current = id;
    const total = targets.length;
    const slots: Array<DiagnosisRow | null> = new Array(total).fill(null);
    setRows(slots);
    setDone(0);
    setRunning(total > 0);
    if (total === 0) return Promise.resolve([]);

    return new Promise<DiagnosisRow[]>((resolve) => {
      let cursor = 0;
      let active = 0;
      let finished = 0;

      const next = (): void => {
        while (active < DIAGNOSIS_CONCURRENCY && cursor < total) {
          const index = cursor;
          cursor += 1;
          active += 1;
          void diagnoseOne(targets[index]).then((row) => {
            active -= 1;
            if (runId.current !== id) return;
            slots[index] = row;
            finished += 1;
            setRows([...slots]);
            setDone(finished);
            if (finished >= total) {
              setRunning(false);
              resolve(slots.filter((row): row is DiagnosisRow => row !== null));
              return;
            }
            next();
          });
        }
      };

      next();
    });
  }, []);

  return { rows, done, running, run };
}
