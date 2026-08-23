import { Boxes, ShieldCheck } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface HomeHeroProps {
  hubInitialized: boolean;
  healthScore: number;
  onStartOnboarding?: () => void;
}

export function HomeHero({ hubInitialized, healthScore, onStartOnboarding }: HomeHeroProps): JSX.Element {
  if (!hubInitialized) {
    return (
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border-indigo-200 dark:border-indigo-800">
        <CardContent className="p-8 text-center">
          <Boxes className="h-12 w-12 mx-auto text-indigo-500 mb-4" />
          <h2 className="text-2xl font-bold mb-2">欢迎使用 AssetPlex</h2>
          <p className="text-muted-foreground mb-6">
            你的AI资产保险箱 — 掌控身份、技能、规则、MCP，换工具不丢东西
          </p>
          <button
            type="button"
            onClick={onStartOnboarding}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 text-white px-6 py-3 text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            开始盘点你的 AI 资产
          </button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
            <ShieldCheck className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">欢迎回来</h2>
            <p className="text-sm text-muted-foreground">
              你的AI资产安全存储在 AssetPlex
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{healthScore}</div>
          <div className="text-xs text-muted-foreground">健康度</div>
        </div>
      </CardContent>
    </Card>
  );
}
