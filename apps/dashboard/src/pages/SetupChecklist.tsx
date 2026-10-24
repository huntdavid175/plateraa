import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { Panel, PanelRows } from '@/components/app/panel';
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
      detail: 'Start from a menu made for your kind of business, then set your prices.',
      done: menu.data.items.length > 0,
    },
    {
      start: 'pins',
      title: 'Make your PIN',
      detail: 'Six digits to unlock the tablet. Add your staff here too.',
      done: team.data.staff.find((member) => member.id === staffId)?.hasPin ?? false,
    },
    {
      start: 'moolre',
      title: 'Connect Moolre',
      detail: 'So mobile money from payment links and your store goes straight to you.',
      done: settings.data.moolre.connected,
    },
    {
      start: 'tablet',
      title: 'Set up the tablet',
      detail: 'Install the Brixx app on your Android tablet and sign it in.',
      done: tablets.length > 0,
    },
  ];
  const finished = tasks.filter((task) => task.done).length;
  if (finished === tasks.length) return null;

  return (
    <Panel
      className={className}
      title="Get ready for your first sale"
      description={`${finished} of ${tasks.length} done. Do them here, or with us on the phone.`}
    >
      <div className="mx-5 mb-3 flex gap-1.5" aria-hidden>
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
      <PanelRows>
        {tasks.map((task, index) => (
          <li key={task.start}>
            <Link
              to="/setup"
              state={{ start: task.start, back: '/' }}
              className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted"
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full border text-sm tabular-nums',
                  task.done
                    ? 'border-(--accent) bg-(--accent) text-(--accent-foreground)'
                    : 'border-(--border-strong) text-muted-foreground',
                )}
              >
                {task.done ? <Check size={16} strokeWidth={2} aria-hidden /> : index + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    'font-medium',
                    // Done steps are struck through (user request, 24 Oct), so what's left stands out.
                    task.done && 'text-text-secondary line-through decoration-(--border-strong)',
                  )}
                >
                  {task.title}
                  {task.done && <span className="sr-only"> (done)</span>}
                </span>
                <span className={cn('text-sm text-muted-foreground', task.done && 'line-through')}>
                  {task.detail}
                </span>
              </span>
              <ChevronRight
                size={18}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </PanelRows>
    </Panel>
  );
}
