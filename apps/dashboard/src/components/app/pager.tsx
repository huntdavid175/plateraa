import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/arc/button/button';

/**
 * "1–10 of 31 days", with Newer and Older, under a table that's split into pages (Reports' days,
 * Cash's closes). Shows nothing when everything fits on one page.
 */
export function Pager({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  /** Counting from 0. */
  page: number;
  pageSize: number;
  total: number;
  /** What's counted, plural: "days", "closes". */
  noun: string;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <nav
      aria-label={`Pages of ${noun}`}
      className="flex items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"
    >
      <span className="text-sm text-muted-foreground tabular-nums">
        {first}–{last} of {total} {noun}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          aria-label={`Newer ${noun}`}
        >
          <ChevronLeft size={16} strokeWidth={1.75} aria-hidden />
          Newer
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages - 1}
          aria-label={`Older ${noun}`}
        >
          Older
          <ChevronRight size={16} strokeWidth={1.75} aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
