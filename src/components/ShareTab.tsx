import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Download, Upload, Link as LinkIcon, FileText, QrCode } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { encodeGroupForShare, buildShareUrl, decodeGroupFromShare } from '@/lib/share';
import { useGroupsStore } from '@/store/groupsStore';
import type { Group } from '@/types/domain';

const WARN_TOKEN_LEN = 6000;
// QR codes can encode about 2,950 alphanumeric chars at version 40 with low EC.
// URLs are typically a mix of cases/symbols, so the practical ceiling is lower.
// Above this length the QR becomes unreadable on a phone screen, so we hide it.
const QR_MAX_URL_LEN = 2000;

export function ShareTab({ group }: { group: Group }) {
  const navigate = useNavigate();
  const importGroup = useGroupsStore((s) => s.importGroup);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { token, strippedImages } = useMemo(() => encodeGroupForShare(group), [group]);
  const url = useMemo(() => buildShareUrl(token), [token]);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const sizeBytes = new Blob([token]).size;
  const tooLong = token.length > WARN_TOKEN_LEN;
  const qrTooLong = url.length > QR_MAX_URL_LEN;

  useEffect(() => {
    if (!showQr || qrTooLong) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'L',
      width: 320,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(
      (dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      },
      (err) => {
        if (!cancelled) {
          toast.error(`QR generation failed: ${(err as Error).message}`);
          setShowQr(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [showQr, url, qrTooLong]);

  function copyLink() {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        toast.success('Share link copied');
        setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error('Could not copy link'),
    );
  }

  function exportJson() {
    const payload = JSON.stringify({ v: 1, group }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const a = document.createElement('a');
    const dlUrl = URL.createObjectURL(blob);
    a.href = dlUrl;
    a.download = `${slugify(group.name) || 'group'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
  }

  async function importJson(file: File) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.v !== 1 || !parsed.group) {
        throw new Error('Unsupported file format.');
      }
      const incoming = parsed.group as Group;
      const newName = prompt('Name for the imported group:', `${incoming.name} (imported)`);
      if (newName === null) return;
      const created = await importGroup({ ...incoming, name: newName.trim() || incoming.name });
      toast.success('Imported');
      navigate(`/g/${created.id}`);
    } catch (err) {
      toast.error(`Import failed: ${(err as Error).message}`);
    }
  }

  // Sanity check: encoded token should round-trip cleanly. Surface failure visibly
  // rather than silently saving a broken share link.
  const roundTripError = useMemo<string | null>(() => {
    try {
      decodeGroupFromShare(token);
      return null;
    } catch (err) {
      return (err as Error).message;
    }
  }, [token]);

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Share link</h2>
        <p className="text-sm text-muted-foreground">
          The link below contains all group data — members, expenses, splits — encoded into the URL itself.
          Open it on any device and the same group is reconstructed.{' '}
          <strong>Attached photos are NOT included</strong> (they live only on this device).
        </p>

        <div className="flex gap-2">
          <Input value={url} readOnly className="font-mono text-xs" />
          <Button onClick={copyLink} variant="outline">
            <Copy /> {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button onClick={() => setShowQr(true)} variant="outline">
            <QrCode /> QR
          </Button>
        </div>

        <Dialog open={showQr} onOpenChange={setShowQr}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Share via QR code</DialogTitle>
              <DialogDescription>
                Scan with your phone camera to open this group on another device.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="flex justify-center">
                {qrTooLong ? (
                  <p className="text-sm text-muted-foreground">
                    Link is too long ({url.length} chars) to fit in a QR code. Use the copy button instead,
                    or remove some expenses to shrink the share payload.
                  </p>
                ) : qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt="QR code for share link"
                    className="h-64 w-64 rounded bg-white p-2"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">Generating QR code…</p>
                )}
              </div>
            </DialogBody>
          </DialogContent>
        </Dialog>

        <div className="text-xs text-muted-foreground">
          Token size: <span className="font-mono">{sizeBytes} bytes</span>
          {strippedImages > 0 && (
            <>
              {' · '}
              <span>{strippedImages} image{strippedImages === 1 ? '' : 's'} excluded</span>
            </>
          )}
          {tooLong && (
            <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-700 dark:text-amber-300">
              Link is long ({sizeBytes} bytes) — some apps may truncate it. Prefer "Export JSON" if you hit issues.
            </p>
          )}
          {roundTripError && (
            <p className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-destructive">
              Encoded token failed validation: {roundTripError}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild variant="outline">
            <a href={url} target="_blank" rel="noreferrer">
              <LinkIcon /> Open share view
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`/g/${group.id}/print`} target="_blank" rel="noreferrer">
              <FileText /> Export as PDF
            </a>
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Backup</h2>
        <p className="text-sm text-muted-foreground">
          Export this group to a JSON file as a local backup, or import a JSON file to recreate a group on this device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson} variant="outline">
            <Download /> Export JSON
          </Button>
          <Button onClick={() => fileInputRef.current?.click()} variant="outline">
            <Upload /> Import JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importJson(f);
              e.target.value = '';
            }}
          />
        </div>
      </section>
    </div>
  );
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
