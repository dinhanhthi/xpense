import { useEffect, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent } from '@/components/ui/dialog';
import { saveImage, getImageUrl } from '@/lib/images';

export function ImageAttachments({
  imageIds,
  onChange,
}: {
  imageIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const ids = await Promise.all([...files].map((f) => saveImage(f)));
    onChange([...imageIds, ...ids]);
  }

  function handleRemove(id: string) {
    // Don't delete the IDB blob yet — the parent dialog reconciles draft vs
    // initial image lists on save/cancel and GCs as appropriate.
    onChange(imageIds.filter((x) => x !== id));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {imageIds.map((id) => (
          <Thumbnail key={id} id={id} onClick={() => setPreviewId(id)} onRemove={() => handleRemove(id)} />
        ))}
        <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-md border border-dashed text-muted-foreground hover:bg-accent">
          <ImagePlus className="h-5 w-5" />
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <Dialog open={previewId !== null} onOpenChange={(open) => !open && setPreviewId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogBody className="p-0">
            {previewId && <PreviewImage id={previewId} />}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Thumbnail({
  id,
  onClick,
  onRemove,
}: {
  id: string;
  onClick: () => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    getImageUrl(id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <div className="relative h-20 w-20 overflow-hidden rounded-md border">
      <button type="button" onClick={onClick} className="block h-full w-full">
        {url ? (
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
            ?
          </div>
        )}
      </button>
      <Button
        type="button"
        size="icon"
        variant="destructive"
        className="absolute right-1 top-1 h-5 w-5"
        onClick={onRemove}
        aria-label={t('imageAttachments.removeAria')}
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}

function PreviewImage({ id }: { id: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getImageUrl(id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);
  if (!url) return <div className="h-64 animate-pulse bg-muted" />;
  return <img src={url} alt="" className="max-h-[80vh] w-full object-contain" />;
}
