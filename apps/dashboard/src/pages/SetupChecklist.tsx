import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
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
 */
export function SetupChecklist({
  staffId,
  tablets,
}: {
  staffId: string;
  tablets: Tablet[] | undefined;
}) {
  const { tenantId } = useSession();
  const menu = useQuery({ queryKey: ['menu', tenantId], queryFn: fetchMenu });
  const team = useQuery({ queryKey: ['team', tenantId], queryFn: fetchTeam });
  const settings = useQuery({ queryKey: ['settings', tenantId], queryFn: fetchSettings });

  // Shown only once everything is known, so it never flashes in and out.
  if (!menu.data || !team.data || !settings.data || !tablets) return null;

  const tasks: { start: SetupStart; title: string; done: boolean }[] = [
    { start: 'menu', title: 'Add your menu', done: menu.data.items.length > 0 },
    {
      start: 'pins',
      title: 'Make your PIN',
      done: team.data.staff.find((member) => member.id === staffId)?.hasPin ?? false,
    },
    { start: 'moolre', title: 'Connect Moolre', done: settings.data.moolre.connected },
    { start: 'tablet', title: 'Set up the tablet', done: tablets.length > 0 },
  ];
  const finished = tasks.filter((task) => task.done).length;
  if (finished === tasks.length) return null;

  // A slim strip (user request, 24 Oct: the panel was too big): one line saying where they are,
  // then the four steps as small tiles, four across on a laptop and two by two on a phone.
  return (
    <section
      aria-labelledby="first-sale"
      className="flex flex-col gap-3 rounded-(--radius-surface) border bg-card p-3 sm:p-4"
    >
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 id="first-sale" className="text-sm font-medium">
          Get ready for your first sale
        </h2>
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {finished} of {tasks.length} done
        </p>
      </div>
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {tasks.map((task, index) => (
          <li key={task.start}>
            <Link
              to="/setup"
              state={{ start: task.start, back: '/' }}
              className={cn(
                'flex h-full items-center gap-2.5 rounded-(--radius-control) border px-3 py-2.5 text-sm transition-colors hover:bg-muted',
                task.done && 'border-transparent bg-muted/60 text-text-secondary',
              )}
            >
              <span
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded-full border text-[11px] tabular-nums',
                  task.done
                    ? 'border-(--accent) bg-(--accent) text-(--accent-foreground)'
                    : 'border-(--border-strong) text-muted-foreground',
                )}
              >
                {task.done ? <Check size={12} strokeWidth={2.5} aria-hidden /> : index + 1}
              </span>
              <span className="min-w-0 truncate">
                {task.title}
                {task.done && <span className="sr-only"> (done)</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
