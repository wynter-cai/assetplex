import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="container mx-auto h-full max-w-7xl p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
