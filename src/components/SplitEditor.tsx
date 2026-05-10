import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AmountInput } from './AmountInput';
import { formatMoney } from '@/lib/format';
import { resolveShares, SplitValidationError } from '@/lib/splitting';
import type { Expense, Member, SplitMode, SplitShare } from '@/types/domain';

interface Props {
  members: Member[];
  payerId: string;
  splitMode: SplitMode;
  onSplitModeChange: (m: SplitMode) => void;
  shares: SplitShare[];
  onSharesChange: (s: SplitShare[]) => void;
  amountMinor: number;
  currency: string;
  decimals: number;
}

const MODE_LABEL_KEYS: Record<SplitMode, string> = {
  equal: 'splitEditor.modeEqual',
  percent: 'splitEditor.modePercent',
  amount: 'splitEditor.modeAmount',
  parts: 'splitEditor.modeParts',
};

export function SplitEditor(props: Props) {
  const {
    members,
    payerId,
    splitMode,
    onSplitModeChange,
    shares,
    onSharesChange,
    amountMinor,
    currency,
    decimals,
  } = props;
  const { t } = useTranslation();

  const participantIds = useMemo(() => shares.map((s) => s.memberId), [shares]);

  const previewExpense: Expense = useMemo(
    () => ({
      id: 'preview',
      groupId: '',
      title: '',
      amountMinor,
      currency,
      payerId,
      date: '',
      splitMode,
      shares,
      imageIds: [],
      createdAt: 0,
    }),
    [amountMinor, currency, splitMode, shares, payerId],
  );

  const preview = useMemo(() => {
    if (amountMinor <= 0 || shares.length === 0) {
      return { error: null as string | null, perMember: new Map<string, number>() };
    }
    try {
      return { error: null, perMember: resolveShares(previewExpense) };
    } catch (err) {
      if (err instanceof SplitValidationError) return { error: err.message, perMember: new Map() };
      throw err;
    }
  }, [previewExpense, amountMinor, shares.length]);

  function toggleParticipant(id: string) {
    const isOn = participantIds.includes(id);
    if (isOn) {
      onSharesChange(shares.filter((s) => s.memberId !== id));
    } else {
      onSharesChange([...shares, { memberId: id, value: defaultValueFor(splitMode) }]);
    }
  }

  function changeMode(m: SplitMode) {
    onSplitModeChange(m);
    onSharesChange(participantIds.map((id) => ({ memberId: id, value: defaultValueFor(m) })));
  }

  function updateShare(id: string, value: number) {
    onSharesChange(shares.map((s) => (s.memberId === id ? { ...s, value } : s)));
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2">
        <Label>{t('splitEditor.participants')}</Label>
        <div className="flex flex-wrap gap-2">
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('splitEditor.noMembersHint')}</p>
          ) : (
            members.map((m) => {
              const on = participantIds.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleParticipant(m.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    on
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input bg-background text-foreground hover:bg-accent'
                  }`}
                >
                  {m.name}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="grid gap-2">
        <Label>{t('splitEditor.splitMode')}</Label>
        <RadioGroup
          value={splitMode}
          onValueChange={(v) => changeMode(v as SplitMode)}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
        >
          {(['equal', 'percent', 'amount', 'parts'] as SplitMode[]).map((m) => (
            <Label
              key={m}
              htmlFor={`split-${m}`}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 [&:has([data-state=checked])]:border-primary"
            >
              <RadioGroupItem id={`split-${m}`} value={m} />
              <span>{t(MODE_LABEL_KEYS[m])}</span>
            </Label>
          ))}
        </RadioGroup>
      </div>

      {participantIds.length > 0 && splitMode !== 'equal' && (
        <div className="space-y-2 rounded-md border p-3">
          {shares.map((share) => {
            const m = members.find((mm) => mm.id === share.memberId);
            if (!m) return null;
            return (
              <div key={share.memberId} className="flex items-center gap-2">
                <span className="w-28 truncate text-sm">{m.name}</span>
                {splitMode === 'amount' ? (
                  <AmountInput
                    value={share.value}
                    decimals={decimals}
                    onChange={(v) => updateShare(share.memberId, v)}
                  />
                ) : (
                  <div className="relative flex-1">
                    <Input
                      inputMode="decimal"
                      value={String(share.value)}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        updateShare(share.memberId, isFinite(v) ? v : 0);
                      }}
                      className={splitMode === 'percent' ? 'pr-7' : ''}
                    />
                    {splitMode === 'percent' && (
                      <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-muted-foreground">
                        %
                      </span>
                    )}
                  </div>
                )}
                {splitMode !== 'amount' && preview.perMember.get(share.memberId) !== undefined && (
                  <span className="w-24 text-right text-xs text-muted-foreground">
                    ≈ {formatMoney(preview.perMember.get(share.memberId)!, currency, decimals)}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {participantIds.length > 0 && splitMode === 'equal' && amountMinor > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('splitEditor.eachOwes')}{' '}
          <span className="font-medium text-foreground">
            {formatMoney(Math.floor(amountMinor / Math.max(participantIds.length, 1)), currency, decimals)}
          </span>
        </p>
      )}

      {preview.error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
          {preview.error}
        </p>
      )}
    </div>
  );
}

function defaultValueFor(mode: SplitMode): number {
  switch (mode) {
    case 'equal':
      return 0;
    case 'percent':
      return 0;
    case 'amount':
      return 0;
    case 'parts':
      return 1;
  }
}
