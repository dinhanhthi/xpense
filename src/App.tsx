import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { useGroupsStore } from './store/groupsStore';

export function App() {
  const loadGroups = useGroupsStore((s) => s.loadGroups);
  const { t } = useTranslation();

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="container max-w-4xl flex-1 py-6">
        <Outlet />
      </main>
      <footer className="container py-6 text-center text-xs text-muted-foreground">
        {t('app.footer')}
      </footer>
    </div>
  );
}
