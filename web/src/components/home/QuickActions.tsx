import { useNavigate } from 'react-router-dom';
import { Download, RefreshCw, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface QuickActionsProps {
  hubInitialized: boolean;
  onImport?: () => void;
}

export function QuickActions({ hubInitialized, onImport }: QuickActionsProps): JSX.Element {
  const navigate = useNavigate();

  const actions = hubInitialized
    ? [
        { label: '导入资产', icon: Download, onClick: onImport ?? (() => navigate('/import')), primary: true },
        { label: '分发同步', icon: RefreshCw, onClick: () => navigate('/sync') },
        { label: '新建技能', icon: Plus, onClick: () => navigate('/vault/skill') },
      ]
    : [
        { label: '开始盘点', icon: Download, onClick: onImport ?? (() => navigate('/import')), primary: true },
      ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">快速动作</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              onClick={action.onClick}
              className={`flex items-center gap-2 w-full rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                action.primary
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                  : 'border hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {action.label}
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
