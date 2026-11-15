import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Home from './pages/Home';
import Vault from './pages/Vault';
import Connections from './pages/Connections';
import Sync from './pages/Sync';
import Import from './pages/Import';
import Discover from './pages/Discover';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Duplicates from './pages/Duplicates';
import QualityCenter from './pages/QualityCenter';
import QualityRules from './pages/QualityRules';
import QualityBatch from './pages/QualityBatch';
import Activities from './pages/Activities';
import Onboarding from './pages/Onboarding';
import { CriteriaView } from './components/criteria/CriteriaView';
import { FirstRunGate } from './components/onboarding/FirstRunGate';
import { Toaster } from './components/ui/toast';

/**
 * 旧治理地址 → 质量中心（refactor-governance-center T1）
 *
 * 保留子路径、查询串与锚点（`/governance/batch` → `/quality/batch`），
 * 用 `<Navigate replace>`：旧地址被替换出历史，浏览器后退不会弹回。
 */
function LegacyGovernanceRedirect(): JSX.Element {
  const location = useLocation();
  const suffix = location.pathname.slice('/governance'.length);
  return <Navigate to={`/quality${suffix}${location.search}${location.hash}`} replace />;
}

export default function App(): JSX.Element {
  return (
    <>
    <Routes>
      {/* 首次使用向导：独立全屏，不套侧边栏（add-zero-config-onboarding T16） */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route element={<AppLayout />}>
        <Route
          path="/"
          element={
            <FirstRunGate>
              <Home />
            </FirstRunGate>
          }
        />
        <Route path="/vault" element={<Vault />} />
        <Route path="/vault/:category" element={<Vault />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/duplicates" element={<Duplicates />} />
        {/* 质量中心（refactor-governance-center T1）：体检报告 / 跨类别批量 / 规则与忽略 / 裁决准则 */}
        <Route path="/quality" element={<QualityCenter />} />
        <Route path="/quality/batch" element={<QualityBatch />} />
        <Route path="/quality/rules" element={<QualityRules />} />
        <Route path="/quality/criteria" element={<CriteriaView />} />
        <Route path="/connections" element={<Connections />} />
        {/* 活动页：操作时间线（add-activity-log） */}
        <Route path="/activities" element={<Activities />} />

        {/* 旧 URL 重定向（refactor-home-action-panel T13 / refactor-governance-center T1）：替换式跳转，不新增历史记录 */}
        <Route path="/identity" element={<Navigate to="/vault/identity" replace />} />
        <Route path="/rules" element={<Navigate to="/vault/rule" replace />} />
        <Route path="/skills" element={<Navigate to="/vault/skill" replace />} />
        <Route path="/mcp" element={<Navigate to="/vault/mcp" replace />} />
        <Route path="/tools" element={<Navigate to="/connections" replace />} />
        <Route path="/swap" element={<Navigate to="/sync" replace />} />
        <Route path="/legacy/dashboard" element={<Navigate to="/" replace />} />
        <Route path="/governance" element={<LegacyGovernanceRedirect />} />
        <Route path="/governance/*" element={<LegacyGovernanceRedirect />} />
        <Route path="/vault/criteria" element={<Navigate to="/quality/criteria" replace />} />

        <Route path="/sync" element={<Sync />} />
        <Route path="/import" element={<Import />} />
        <Route path="/discover" element={<Discover />} />

        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    <Toaster />
    </>
  );
}
