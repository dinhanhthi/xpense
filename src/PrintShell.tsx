import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useGroupsStore } from './store/groupsStore';

export function PrintShell() {
  const loadGroups = useGroupsStore((s) => s.loadGroups);
  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  return (
    <div className="min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <Outlet />
    </div>
  );
}
