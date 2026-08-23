import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PlaceholderPage } from './pages/Placeholder';
import Home from './pages/Home';
import Vault from './pages/Vault';
import Connections from './pages/Connections';
import Tools from './pages/Tools';
import Dashboard from './pages/Dashboard';
import Sync from './pages/Sync';
import Import from './pages/Import';
import Identity from './pages/Identity';
import Skills from './pages/Skills';
import Rules from './pages/Rules';
import Mcp from './pages/Mcp';
import Settings from './pages/Settings';

export default function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/vault/:category" element={<Vault />} />
        <Route path="/connections" element={<Connections />} />
        <Route
          path="/activities"
          element={
            <PlaceholderPage
              title="活动记录"
              description="导入、分发、编辑等操作历史"
            />
          }
        />

        {/* 旧版路由 */}
        <Route path="/legacy/dashboard" element={<Dashboard />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/sync" element={<Sync />} />
        <Route path="/import" element={<Import />} />
        <Route path="/identity" element={<Identity />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/mcp" element={<Mcp />} />

        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
