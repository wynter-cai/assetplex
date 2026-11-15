import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Home from './pages/Home';
import Vault from './pages/Vault';
import Connections from './pages/Connections';
import Sync from './pages/Sync';
import Swap from './pages/Swap';
import Import from './pages/Import';
import Discover from './pages/Discover';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Duplicates from './pages/Duplicates';
import Governance from './pages/Governance';
import Activities from './pages/Activities';
import Onboarding from './pages/Onboarding';
import { FirstRunGate } from './components/onboarding/FirstRunGate';
import { Toaster } from './components/ui/toast';

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
        {/* 治理临时容器页：一期只有体检与待办视图，治理中心落地后替换内容不改 URL */}
        <Route path="/governance" element={<Governance />} />
        <Route path="/connections" element={<Connections />} />
        {/* 活动页：操作时间线（add-activity-log） */}
        <Route path="/activities" element={<Activities />} />

        {/* 旧 URL 重定向（refactor-home-action-panel T13）：替换式跳转，不新增历史记录 */}
        <Route path="/identity" element={<Navigate to="/vault/identity" replace />} />
        <Route path="/rules" element={<Navigate to="/vault/rule" replace />} />
        <Route path="/skills" element={<Navigate to="/vault/skill" replace />} />
        <Route path="/mcp" element={<Navigate to="/vault/mcp" replace />} />
        <Route path="/tools" element={<Navigate to="/connections" replace />} />
        <Route path="/legacy/dashboard" element={<Navigate to="/" replace />} />

        <Route path="/sync" element={<Sync />} />
        <Route path="/swap" element={<Swap />} />
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
