import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { removePhoto, uploadPhoto } from '../lib/photos';
import { Button, ErrorNote, Spinner, cx } from './controls';

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
    mutationFn: (file: File) => uploadPhoto(path, file, longest),
    onSuccess: (newUrl) => {
      setSaved(newUrl);
      onSaved();
    },
  });
  const removing = useMutation({
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
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={pick}
          disabled={busy}
          aria-label={`${current ? 'Change' : 'Add'} ${label.toLowerCase()}`}
          className={cx(
            'relative flex h-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-tile text-2xl text-muted',
            shape === 'wide' ? 'w-36' : 'w-20',
            !current && 'border-dashed',
          )}
        >
          {current ? <img src={current} alt="" className="h-full w-full object-cover" /> : '+'}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
              <Spinner />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          <div className="mt-2 flex gap-2">
            <Button variant="secondary" small disabled={busy} onClick={pick}>
              {current ? 'Change' : 'Add photo'}
            </Button>
            {current && (
              <Button variant="ghost" small disabled={busy} onClick={() => removing.mutate()}>
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
        <div className="mt-3">
          <ErrorNote>{error.message}</ErrorNote>
        </div>
      )}
    </div>
  );
}
