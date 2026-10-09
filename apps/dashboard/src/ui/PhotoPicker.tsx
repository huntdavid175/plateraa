import { useMutation } from '@tanstack/react-query';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { Alert } from '@/components/arc/alert/alert';
import { Button } from '@/components/arc/button/button';
import { cn } from '@/lib/utils';
import { removePhoto, uploadPhoto } from '../lib/photos';

/**
 * A photo with Add, Change and Remove. The picture is made small in the browser, then kept at
 * `path` on the API (lib/photos.ts).
 */
export function PhotoPicker({
  path,
  url,
  longest,
  shape = 'square',
  label,
  hint,
  onSaved,
}: {
  path: string;
  url: string | null;
  longest: number;
  shape?: 'square' | 'wide';
  label: string;
  hint?: string;
  onSaved: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  // What was just saved shows at once, before the refreshed data comes back.
  const [saved, setSaved] = useState<string | null | undefined>(undefined);
  const current = saved === undefined ? url : saved;

  const uploading = useMutation({
    meta: { ok: 'Photo saved' },
    mutationFn: (file: File) => uploadPhoto(path, file, longest),
    onSuccess: (newUrl) => {
      setSaved(newUrl);
      onSaved();
    },
  });
  const removing = useMutation({
    meta: { ok: 'Photo removed' },
    mutationFn: () => removePhoto(path),
    onSuccess: () => {
      setSaved(null);
      onSaved();
    },
  });
  const busy = uploading.isPending || removing.isPending;
  const error = uploading.error ?? removing.error;
  const pick = () => input.current?.click();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          aria-label={`${current ? 'Change' : 'Add'} ${label.toLowerCase()}`}
          className={cn(
            'relative flex h-20 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-panel) border bg-muted text-muted-foreground transition-colors hover:border-foreground',
            shape === 'wide' ? 'w-36' : 'w-20',
            !current && 'border-dashed border-(--border-strong)',
          )}
        >
          {current ? (
            <img src={current} alt="" className="size-full object-cover" />
          ) : (
            <ImagePlus size={20} strokeWidth={1.75} aria-hidden />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin" aria-hidden />
            </span>
          )}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div>
            <p className="text-sm font-medium">{label}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={pick}>
              {current ? 'Change' : 'Add photo'}
            </Button>
            {current && (
              <Button variant="ghost" size="sm" disabled={busy} onClick={() => removing.mutate()}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Picking the same file again still counts as a change.
          event.target.value = '';
          if (file) uploading.mutate(file);
        }}
      />
      {error && (
        <Alert tone="danger" title="Couldn’t save the photo">
          {error.message}
        </Alert>
      )}
    </div>
  );
}
