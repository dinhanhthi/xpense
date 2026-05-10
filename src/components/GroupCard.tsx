import { Link } from 'react-router-dom';
import { Users, Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { getCurrency } from '@/lib/currencies';
import type { Group } from '@/types/domain';

export function GroupCard({ group }: { group: Group }) {
  const cur = getCurrency(group.currency);
  const { t, i18n } = useTranslation();
  const updated = new Date(group.updatedAt).toLocaleDateString(i18n.resolvedLanguage);
  return (
    <Link
      to={`/g/${group.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="transition-shadow group-hover:shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="truncate">{group.name}</span>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-xs font-normal text-secondary-foreground">
              {cur.symbol} {cur.code}
            </span>
          </CardTitle>
          <CardDescription>{t('groupCard.lastUpdated', { date: updated })}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="h-4 w-4" />
            {t('groupCard.members', { count: group.members.length })}
          </span>
          <span className="inline-flex items-center gap-1">
            <Receipt className="h-4 w-4" />
            {t('groupCard.expenses', { count: group.expenses.length })}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
