import { useEffect } from 'react';
import {
  ToastStack,
  ToastStackProvider,
  useToastStack,
} from '@/components/arc/toast-stack/toast-stack';

type Kind = 'ok' | 'problem';

interface Note {
  kind: Kind;
  text: string;
}

/**
 * Notes raised before the stack is on screen wait here; after that each goes straight to it.
 * `toast` is called from outside React (lib/query.ts's mutation cache), so it can't use Arc's
 * hook itself: the `Bridge` below hands notes over.
 */
let waiting: Note[] = [];
let deliver: ((note: Note) => void) | null = null;

function show(kind: Kind, text: string) {
  const note = { kind, text };
  if (deliver) deliver(note);
  else waiting.push(note);
}

/**
 * Says what just happened, at the bottom of the screen: "Opening hours saved", or why something
 * failed. Every mutation's failure shows here on its own (see `lib/query.ts`); a success shows
 * when the mutation says what to call it (`meta: { ok: '…' }`). Drawn by Arc's toast stack
 * (10 Oct, user request): new ones rise, older ones tuck behind and fan out on hover, a swipe
 * dismisses, and timers pause while someone is reading.
 */
export const toast = {
  ok: (text: string) => show('ok', text),
  problem: (text: string) => show('problem', text),
};

function Bridge() {
  // Arc's toast function is stable; the hook's object isn't (it carries the count).
  const { toast: push } = useToastStack();
  useEffect(() => {
    deliver = (note) => {
      push(
        note.kind === 'ok'
          ? { type: 'success', title: note.text }
          : // A problem's reason can be long: a short title, and the reason underneath.
            { type: 'error', title: 'Something went wrong', description: note.text },
      );
    };
    for (const note of waiting) deliver(note);
    waiting = [];
    return () => {
      deliver = null;
    };
  }, [push]);
  return null;
}

/** Mounted once, beside the router (main.tsx). A success stays 4 s; Arc keeps errors longer. */
export function Toasts() {
  return (
    <ToastStackProvider duration={4000}>
      <Bridge />
      <ToastStack position="bottom-right" />
    </ToastStackProvider>
  );
}
