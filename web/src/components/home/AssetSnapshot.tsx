import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ASSET_CATEGORIES } from '@/config/asset-categories';

interface AssetSnapshotProps {
  assetStats: Record<string, number>;
}

export function AssetSnapshot({ assetStats }: AssetSnapshotProps): JSX.Element {
  const navigate = useNavigate();

  const total = ASSET_CATEGORIES.reduce((sum, cat) => sum + (assetStats[cat.code] ?? 0), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">资产快照</CardTitle>
          <span className="text-sm text-muted-foreground">共 {total} 项</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-3">
          {ASSET_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const count = assetStats[cat.code] ?? 0;
            return (
              <button
                key={cat.code}
                type="button"
                onClick={() => navigate(`/vault/${cat.code}`)}
                className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 p-4 hover:bg-muted/60 hover:border-primary/30 transition-colors group"
              >
                <Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary mb-2 transition-colors" />
                <span className="text-2xl font-bold">{count}</span>
                <span className="text-xs text-muted-foreground mt-0.5">{cat.label}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => navigate('/vault')}
          className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline"
        >
          查看全部资产 <ArrowRight className="h-3 w-3" />
        </button>
      </CardContent>
    </Card>
  );
}
