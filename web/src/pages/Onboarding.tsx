/**
 * 首次使用向导容器（add-zero-config-onboarding T12–T16）
 *
 * 把 s0–s6 六个屏串成状态机：welcome → scan → result → collect → doctor → distribute → done。
 * 外壳为产品级全屏页：顶部产品栏 + 内容区 + 底部步骤轨，不再模拟桌面窗口。
 * 数据全部来自真实接口，不伪造进度；任何一步都可跳过（写本机标记后进资产库）。
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, Loader2 } from 'lucide-react';
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

  /** 步骤条点击直达：数据未就绪的阶段回落到盘点屏，不摆空屏 */
  const jumpToStage = (stage: number): void => {
    setScanEnabled(true);
    if (stage === 1) {
      setStep('scan');
      return;
    }
    if (scanQuery.data === undefined) {
      setStep('scan');
      return;
    }
    const target: OnboardingStepId =
      stage === 2 ? 'result' : stage === 3 ? 'collect' : stage === 4 ? 'doctor' : 'distribute';
    setStep(target);
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
      <div className="grid min-h-screen place-items-center bg-muted/30">
        <div className="flex flex-col items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"
          >
            <Boxes className="h-5 w-5" />
          </span>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <p className="text-12 text-muted-foreground">正在加载本机状态…</p>
        </div>
      </div>
    );
  }

  const tools = stateQuery.data?.tools ?? [];
  const assetCount = assetsQuery.data ?? collectResult?.created ?? 0;
  const currentStage = INDICATOR_INDEX[step];
  // 完成屏不落在「分发」这一段：整条轨全部转为已完成态
  const indicatorCurrent = step === 'done' ? STEP_LABELS.length + 1 : currentStage;

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* 产品栏：真实产品 chrome，不是窗口装饰 */}
      <header className="sticky top-0 z-30 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-[1040px] items-center gap-2.5 px-4 sm:px-6">
          <span
            aria-hidden="true"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"
          >
            <Boxes className="h-4 w-4" />
          </span>
          <span className="text-16 font-semibold tracking-tight">AssetPlex</span>
          <span aria-hidden="true" className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <span className="hidden truncate text-13 text-muted-foreground sm:block">首次设置</span>

          <div className="ml-auto flex shrink-0 items-center gap-3">
            <LocalBadge />
            <button
              type="button"
              onClick={skip}
              className="hidden rounded-sm text-13 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:block"
            >
              退出引导
            </button>
          </div>
        </div>
      </header>

      <main id="onboarding-main" className="flex-1">
        <div className="mx-auto w-full max-w-[1040px] px-4 py-8 sm:px-6 sm:py-10 lg:py-12">
          <div key={step} className="onb-screen-in mx-auto w-full max-w-[960px]">
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

            {step === 'doctor' && (
              <DoctorScreen onNext={() => setStep('distribute')} onSkip={skip} />
            )}

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
          </div>
        </div>
      </main>

      {/* 步骤轨：分段进度 + 序号，当前段实心、已完成段浅色，均可点击直达 */}
      <footer className="sticky bottom-0 z-20 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1040px] items-center gap-4 px-4 py-3 sm:px-6 sm:py-3.5">
          <span className="hidden shrink-0 text-12 tabular-nums text-muted-foreground sm:block">
            步骤 {currentStage} / {STEP_LABELS.length}
          </span>
          <div className="min-w-0 flex-1">
            <StepIndicator
              labels={STEP_LABELS}
              current={indicatorCurrent}
              onSelect={jumpToStage}
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
