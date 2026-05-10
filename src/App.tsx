import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { AppHeader } from './components/AppHeader';
import { useGroupsStore } from './store/groupsStore';

export function App() {
  const loadGroups = useGroupsStore((s) => s.loadGroups);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="container flex-1 py-6">
        <Outlet />
      </main>
      <footer className="container py-6 text-center text-xs text-muted-foreground">
        Runs entirely in your browser. Data stays on this device.
      </footer>
    </div>
  );
}
