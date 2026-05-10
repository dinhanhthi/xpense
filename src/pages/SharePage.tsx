import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ReadOnlyGroupView } from '@/components/ReadOnlyGroupView';
import { decodeGroupFromShare, readTokenFromHash, ShareDecodeError } from '@/lib/share';
import { useGroupsStore } from '@/store/groupsStore';
import type { Group } from '@/types/domain';

export function SharePage() {
  const navigate = useNavigate();
  const importGroup = useGroupsStore((s) => s.importGroup);
  const [hash, setHash] = useState(() => window.location.hash);
  const [manualToken, setManualToken] = useState('');

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const result = useMemo(() => {
    const token = readTokenFromHash(hash) ?? (manualToken.trim() ? manualToken.trim() : null);
    if (!token) return { kind: 'empty' as const };
    try {
      const { group } = decodeGroupFromShare(token);
      return { kind: 'ok' as const, group };
    } catch (err) {
      const msg = err instanceof ShareDecodeError ? err.message : 'Could not decode share token.';
      return { kind: 'error' as const, message: msg };
    }
  }, [hash, manualToken]);

  async function saveCopy(group: Group) {
    const created = await importGroup(group);
    toast.success('Saved to this device');
    navigate(`/g/${created.id}`);
  }

  if (result.kind === 'empty') {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <h1 className="text-xl font-semibold">Open a shared group</h1>
        <p className="text-sm text-muted-foreground">
          Paste a share token below, or open a link that ends with <code>#g=...</code>.
        </p>
        <div className="grid gap-2">
          <Label htmlFor="manual-token">Share token</Label>
          <Input
            id="manual-token"
            placeholder="N4IgZg..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (result.kind === 'error') {
    return (
      <div className="mx-auto max-w-xl space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium text-destructive">Invalid share link</p>
            <p className="text-sm text-destructive/80">{result.message}</p>
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="manual-token">Try pasting the token directly</Label>
          <Input
            id="manual-token"
            placeholder="N4IgZg..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
          />
        </div>
      </div>
    );
  }

  const group = result.group;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{group.name}</h1>
          <p className="text-sm text-muted-foreground">Read-only · shared snapshot · images not included</p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => saveCopy(group)}>
            <Save /> Save a copy to this device
          </Button>
        </div>
      </div>
      <ReadOnlyGroupView group={group} />
    </div>
  );
}
