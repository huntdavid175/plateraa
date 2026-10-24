import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import type { SetupStart } from '../auth/SetupPage';
import { fetchMenu } from '../lib/menu';
import { useSession } from '../lib/session';
import { fetchSettings } from '../lib/settings';
import { fetchTeam, type Tablet } from '../lib/team';

/**
 * Setting up an approved business, on Home (24 Oct, user decision): the four things a business
 * needs before its first sale, each opening its step of `/setup`. The owner can do them alone or
 * with the Brixx team on the call. It shows only to the owner, and goes away once all four are
 * done. Each is worked out from the business itself, so there's nothing to tick by hand.
 *
 * Kept compact (user request, 24 Oct: "too huge on laptop screens"): small type, one short line
 * under each step, tight rows, and a done step struck through.
 */
export function SetupChecklist({
  staffId,
  tablets,
  className,
}: {
  staffId: string;
  tablets: Tablet[] | undefined;
  className?: string;
}) {
  const { tenantId } = useSession();
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
  const team = useQuery({ queryKey: ['team', tenantId], queryFn: fetchTeam });
  const settings = useQuery({ queryKey: ['settings', tenantId], queryFn: fetchSettings });

  // Shown only once everything is known, so it never flashes in and out.
  if (!menu.data || !team.data || !settings.data || !tablets) return null;

  const tasks: { start: SetupStart; title: string; detail: string; done: boolean }[] = [
    {
      start: 'menu',
      title: 'Add your menu',
      detail: 'Pick a starter menu, then set your prices.',
      done: menu.data.items.length > 0,
    },
    {
      start: 'pins',
      title: 'Make your PIN',
      detail: 'Six digits to unlock the tablet.',
      done: team.data.staff.find((member) => member.id === staffId)?.hasPin ?? false,
    },
    {
      start: 'moolre',
      title: 'Connect payment',
      detail: 'So mobile money goes straight to you.',
      done: settings.data.moolre.connected,
    },
    {
      start: 'tablet',
      title: 'Set up the tablet',
      detail: 'Install the Brixx app and sign it in.',
      done: tablets.length > 0,
    },
  ];
  const finished = tasks.filter((task) => task.done).length;
  if (finished === tasks.length) return null;

  return (
    <section
      aria-labelledby="first-sale"
      className={cn('overflow-hidden rounded-(--radius-panel) border bg-card', className)}
    >
      <div className="flex items-center gap-3 px-4 pt-3 pb-2.5">
        <h2 id="first-sale" className="min-w-0 flex-1 truncate text-sm font-medium">
          Get ready for your first sale
        </h2>
        <div className="flex w-16 shrink-0 gap-1" aria-hidden>
          {tasks.map((task) => (
            <span
              key={task.start}
              className={cn(
                'h-1 flex-1 rounded-full',
                task.done ? 'bg-(--accent)' : 'bg-(--border-strong)/60',
              )}
            />
          ))}
        </div>
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {finished} of {tasks.length}
        </p>
      </div>
      <ol className="flex flex-col divide-y border-t">
        {tasks.map((task, index) => (
          <li key={task.start}>
            <Link
              to="/setup"
              state={{ start: task.start, back: '/' }}
              className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted"
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full border text-[10px] leading-none tabular-nums',
                  task.done
                    ? 'border-(--accent) bg-(--accent) text-(--accent-foreground)'
                    : 'border-(--border-strong) text-muted-foreground',
                )}
              >
                {task.done ? <Check size={10} strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 items-baseline gap-2">
                <span
                  className={cn(
                    'shrink-0 text-sm',
                    // Done steps are struck through (user request, 24 Oct), so what's left stands out.
                    task.done && 'text-muted-foreground line-through',
                  )}
                >
                  {task.title}
                  {task.done && <span className="sr-only"> (done)</span>}
                </span>
                <span
                  className={cn(
                    // Phones show only the step's name: the line would be cut off.
                    'hidden truncate text-xs text-muted-foreground sm:inline',
                    task.done && 'line-through',
                  )}
                >
                  {task.detail}
                </span>
              </span>
              <ChevronRight
                size={14}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
