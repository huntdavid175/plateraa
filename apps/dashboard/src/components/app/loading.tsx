import { LoaderCircle } from 'lucide-react';

/** The whole screen while what it needs first is on its way (who's signed in, a lazy screen). */
export function ScreenLoading() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground" role="status">
      <LoaderCircle size={24} strokeWidth={1.75} className="animate-spin" aria-hidden />
      <span className="sr-only">Loading</span>
    </div>
  );
}
