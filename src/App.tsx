import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppHeader } from './components/AppHeader';
import { useGroupsStore } from './store/groupsStore';
import { clearAllData } from './lib/db';
import { Dialog, DialogContent, DialogTitle } from './components/ui/dialog';
import { Button } from './components/ui/button';

export function App() {
  const loadGroups = useGroupsStore((s) => s.loadGroups);
  const { t } = useTranslation();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  async function handleConfirmClear() {
    setClearing(true);
    try {
      await clearAllData();
    } finally {
      location.reload();
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="container max-w-4xl flex-1 py-6">
        <Outlet />
      </main>
      <footer className="container flex flex-col items-center gap-1 py-6 text-center text-xs text-muted-foreground">
        <span>{t('app.footer')}</span>
        <button
          type="button"
          onClick={() => setClearDialogOpen(true)}
          className="text-destructive underline-offset-2 hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {t('app.clearData')}
        </button>
      </footer>

      <Dialog open={clearDialogOpen} onOpenChange={(o) => !clearing && setClearDialogOpen(o)}>
        <DialogContent className="sm:max-w-md gap-6 p-6">
          <DialogTitle>{t('clearData.title')}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t('clearData.warning')}</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearDialogOpen(false)}
              disabled={clearing}
            >
              {t('clearData.cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleConfirmClear}
              disabled={clearing}
            >
              {clearing ? t('clearData.clearing') : t('clearData.confirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
