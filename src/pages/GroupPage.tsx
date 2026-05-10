import { useEffect } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { GroupHeader } from '@/components/GroupHeader';
import { ExpensesTab } from '@/components/ExpensesTab';
import { MembersTab } from '@/components/MembersTab';
import { BalancesTab } from '@/components/BalancesTab';
import { ShareTab } from '@/components/ShareTab';
import { useGroupsStore } from '@/store/groupsStore';

export function GroupPage() {
  const { groupId } = useParams<{ groupId: string }>();
  const navigate = useNavigate();
  const groups = useGroupsStore((s) => s.groups);
  const loaded = useGroupsStore((s) => s.loaded);
  const group = groupId ? groups.find((g) => g.id === groupId) : undefined;
  const { t } = useTranslation();

  useEffect(() => {
    if (loaded && !group) {
      navigate('/', { replace: true });
    }
  }, [loaded, group, navigate]);

  if (!loaded) {
    return <div className="h-32 animate-pulse rounded-xl bg-muted/40" />;
  }
  if (!group) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <GroupHeader group={group} />
      <Tabs defaultValue="expenses" className="w-full">
        <TabsList className="w-full justify-start sm:w-auto">
          <TabsTrigger value="expenses">{t('tabs.expenses')}</TabsTrigger>
          <TabsTrigger value="members">{t('tabs.members')}</TabsTrigger>
          <TabsTrigger value="balances">{t('tabs.balances')}</TabsTrigger>
          <TabsTrigger value="share">{t('tabs.share')}</TabsTrigger>
        </TabsList>
        <TabsContent value="expenses">
          <ExpensesTab group={group} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab group={group} />
        </TabsContent>
        <TabsContent value="balances">
          <BalancesTab group={group} />
        </TabsContent>
        <TabsContent value="share">
          <ShareTab group={group} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
