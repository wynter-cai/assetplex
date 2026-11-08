import { Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import Home from './pages/Home';
import Vault from './pages/Vault';
import Connections from './pages/Connections';
import Tools from './pages/Tools';
import Dashboard from './pages/Dashboard';
import Sync from './pages/Sync';
import Swap from './pages/Swap';
import Import from './pages/Import';
import Identity from './pages/Identity';
import Skills from './pages/Skills';
import Discover from './pages/Discover';
import Rules from './pages/Rules';
import Mcp from './pages/Mcp';
import Settings from './pages/Settings';
import Projects from './pages/Projects';
import Duplicates from './pages/Duplicates';
import { Toaster } from './components/ui/toast';

export default function App(): JSX.Element {
  return (
    <>
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/vault/:category" element={<Vault />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/duplicates" element={<Duplicates />} />
        <Route path="/connections" element={<Connections />} />
        {/* 活动页未上线：旧入口直达首页（P1 评估是否做操作时间线） */}
        <Route path="/activities" element={<Navigate to="/" replace />} />

        {/* 旧版路由 */}
        <Route path="/legacy/dashboard" element={<Dashboard />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/sync" element={<Sync />} />
        <Route path="/swap" element={<Swap />} />
        <Route path="/import" element={<Import />} />
        <Route path="/identity" element={<Identity />} />
        <Route path="/skills" element={<Skills />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/mcp" element={<Mcp />} />

        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    <Toaster />
    </>
  );
}
