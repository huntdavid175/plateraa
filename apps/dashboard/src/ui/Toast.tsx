import { useSyncExternalStore } from 'react';
import { cx } from './controls';

type Kind = 'ok' | 'problem';

interface Note {
  id: number;
  kind: Kind;
  text: string;
}

/** How long a note stays up. A problem stays longer: there's more to read, and to act on. */
const SHOWN_MS: Record<Kind, number> = { ok: 4000, problem: 8000 };
/** Newest at the bottom; older ones drop off rather than filling the screen. */
const MOST = 3;

let notes: Note[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

const emit = () => {
  for (const listener of listeners) listener();
};

function dismiss(id: number) {
  notes = notes.filter((note) => note.id !== id);
  emit();
}

function show(kind: Kind, text: string) {
  const id = nextId++;
  notes = [...notes, { id, kind, text }].slice(-MOST);
  emit();
  setTimeout(() => dismiss(id), SHOWN_MS[kind]);
}

/**
 * Says what just happened, at the bottom of the screen: "Opening hours saved", or why something
 * failed. Every mutation's failure shows here on its own (see `lib/query.ts`); a success shows
 * when the mutation says what to call it (`meta: { ok: '…' }`).
 */
export const toast = {
  ok: (text: string) => show('ok', text),
  problem: (text: string) => show('problem', text),
};

export function Toasts() {
  const shown = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => notes,
  );
  if (!shown.length) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6"
      aria-live="polite"
    >
      {shown.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => dismiss(note.id)}
          // Ink on the page's own colour, so it reads at full contrast in both looks.
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl bg-text px-4 py-3 text-left text-sm font-medium text-bg shadow-lg"
        >
          <span
            aria-hidden="true"
            className={cx(
              'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
              note.kind === 'ok' ? 'bg-green' : 'bg-red',
            )}
          />
          <span className="min-w-0 flex-1">{note.text}</span>
        </button>
      ))}
    </div>
  );
}
