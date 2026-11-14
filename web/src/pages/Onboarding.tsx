/**
 * 首次使用向导容器（add-zero-config-onboarding T12–T16）
 *
 * 把 s0–s6 六个屏串成状态机：welcome → scan → result → collect → doctor → distribute → done。
 * 视觉与交互以原型为准；数据全部来自真实接口，不伪造进度。
 * 任何一步都可跳过：写本机标记后进资产库，之后不再自动进入。
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { StepIndicator } from '@/components/common/StepIndicator';
import { LocalBadge, ScanScreen, WelcomeScreen } from '@/components/onboarding/WelcomeScanScreens';
import { ResultScreen } from '@/components/onboarding/ResultScreen';
import { CollectScreen } from '@/components/onboarding/CollectScreen';
import { DoctorScreen } from '@/components/onboarding/DoctorScreen';
import { DistributeScreen } from '@/components/onboarding/DistributeScreen';
import { DoneScreen } from '@/components/onboarding/DoneScreen';
import { exitOnboarding, finishOnboarding } from '@/lib/onboarding-machine';
import type {
  ImportItem,
  ImportResult,
  OnboardingStepId,
  SyncRunResponse,
} from '@/types/api';

const STEP_LABELS = ['盘点', '结果', '收纳', '体检', '分发'];

const INDICATOR_INDEX: Record<OnboardingStepId, number> = {
  welcome: 1,
  scan: 1,
  result: 2,
  collect: 3,
  doctor: 4,
  distribute: 5,
  done: 5,
};

export default function Onboarding(): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<OnboardingStepId>('welcome');
  const [scanEnabled, setScanEnabled] = useState(false);
  const [collectResult, setCollectResult] = useState<ImportResult | null>(null);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<SyncRunResponse | null>(null);

  const stateQuery = useQuery({
    queryKey: ['onboarding-state'],
    queryFn: api.getOnboardingState,
    retry: 1,
  });

  const scanQuery = useQuery({
    queryKey: ['onboarding-scan'],
    queryFn: api.scanToolsWithInsights,
    enabled: scanEnabled,
    retry: 1,
  });

  const assetsQuery = useQuery({
    queryKey: ['onboarding-asset-count'],
    queryFn: async () => (await api.listAssets()).total,
    enabled: step === 'collect' || step === 'doctor' || step === 'done',
  });

  const healthQuery = useQuery({
    queryKey: ['governance-health'],
    queryFn: () => api.getGovernanceHealth(false),
    enabled: step === 'doctor' || step === 'done',
    retry: 1,
  });

  const invalidateAfterWrite = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
    void queryClient.invalidateQueries({ queryKey: ['onboarding-asset-count'] });
    void queryClient.invalidateQueries({ queryKey: ['assets'] });
    void queryClient.invalidateQueries({ queryKey: ['distributions'] });
    void queryClient.invalidateQueries({ queryKey: ['sync-plan'] });
  };

  const startMutation = useMutation({
    mutationFn: () => api.startOnboarding(),
    // 骨架创建失败也继续盘点：向导本身不因初始化失败而卡死
    onSettled: () => {
      setScanEnabled(true);
      setStep('scan');
    },
  });

  const finishMutation = useMutation({
    mutationFn: (body: Parameters<typeof api.completeOnboarding>[0]) =>
      api.completeOnboarding(body),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['onboarding-state'] });
      navigate('/vault', { replace: true });
    },
  });

  const skip = (): void => {
    finishMutation.mutate(exitOnboarding(step));
  };

  /** 待收纳条目：已安装工具中的非二进制项；同名内容不同保持现有「跳过」语义 */
  const collectItems = useMemo<ImportItem[]>(() => {
    const inventories = scanQuery.data?.inventories ?? [];
    return inventories
      .filter((t) => t.installed)
      .flatMap((t) => t.items)
      .filter((item) => !item.binary)
      .map((item) => ({
        tool: item.tool,
        absolutePath: item.absolutePath,
        hubTargetPath: item.hubTargetPath,
        category: item.category,
        conflict: item.conflict,
        binary: false,
      }));
  }, [scanQuery.data]);

  const collectMutation = useMutation({
    mutationFn: () => api.executeImport(collectItems),
    onSuccess: (data) => {
      setCollectResult(data);
      invalidateAfterWrite();
    },
    onError: (err: unknown) => {
      setCollectError(err instanceof Error ? err.message : String(err));
    },
  });

  const issueCount =
    healthQuery.data?.dimensions.reduce((sum, d) => sum + (d.issueCount ?? 0), 0) ?? null;

  if (stateQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tools = stateQuery.data?.tools ?? [];
  const assetCount = assetsQuery.data ?? collectResult?.created ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <span className="text-sm font-semibold">AssetPlex</span>
          <StepIndicator labels={STEP_LABELS} current={INDICATOR_INDEX[step]} />
          <LocalBadge />
        </div>
      </header>

      <main className="px-6 py-12">
        {step === 'welcome' && (
          <WelcomeScreen
            tools={tools}
            onStart={() => startMutation.mutate()}
            onSkip={skip}
          />
        )}

        {step === 'scan' && (
          <ScanScreen
            tools={tools}
            scan={scanQuery.data ?? null}
            error={
              scanQuery.isError
                ? scanQuery.error instanceof Error
                  ? scanQuery.error.message
                  : String(scanQuery.error)
                : null
            }
            onNext={() => setStep('result')}
            onSkip={skip}
          />
        )}

        {step === 'result' && scanQuery.data !== undefined && (
          <ResultScreen
            scan={scanQuery.data}
            onCollect={() => setStep('collect')}
            onSkip={skip}
          />
        )}

        {step === 'collect' && (
          <CollectScreen
            attempted={collectItems.length}
            pending={collectMutation.isPending}
            error={collectError}
            result={collectResult}
            libraryCount={assetsQuery.data ?? null}
            onCollect={() => {
              setCollectError(null);
              collectMutation.mutate();
            }}
            onRetry={() => {
              setCollectError(null);
              collectMutation.mutate();
            }}
            onNext={() => setStep('doctor')}
            onSkip={skip}
          />
        )}

        {step === 'doctor' && <DoctorScreen onNext={() => setStep('distribute')} onSkip={skip} />}

        {step === 'distribute' && (
          <DistributeScreen
            onDone={(result) => {
              setRunResult(result);
              invalidateAfterWrite();
              setStep('done');
            }}
            onSkip={skip}
          />
        )}

        {step === 'done' && (
          <DoneScreen
            collect={collectResult}
            run={runResult}
            issueCount={issueCount}
            assetCount={assetCount}
            onEnter={() => finishMutation.mutate(finishOnboarding())}
          />
        )}
      </main>
    </div>
  );
}
