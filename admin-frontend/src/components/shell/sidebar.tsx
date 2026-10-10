'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/client/cn';
import { visibleNav, activeItem } from '@/lib/nav';
import { useSession } from '@/lib/client/session';
import { useCollapsedGroups } from '@/lib/client/use-collapsed-groups';
import { useApi } from '@/lib/client/use-api';
import { useRecentlyActive } from '@/lib/client/use-recently-active';
import { Icon, Logo } from '../ui/icon';

interface Overview {
  queues?: Record<string, number>;
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can, session } = useSession();
  const groups = visibleNav(can);
  const current = activeItem(pathname);
  const [collapsed, toggle] = useCollapsedGroups();
  const inUse = useRecentlyActive();
  const { data } = useApi<Overview>('dashboard', { refreshInterval: inUse ? 60_000 : 0 });
  const queues = data?.data.queues ?? {};

  return (
    <nav aria-label="Main" className="bg-ink flex h-full flex-col px-3 py-[18px] text-[#C9C7E3]">
      <div className="flex items-center gap-2.5 px-2 pb-[18px] text-[17px] font-extrabold tracking-tight text-white">
        <Logo />
        <div className="leading-tight">
          BLOCKS
          <small className="block text-[10px] font-bold tracking-[0.1em] text-[#8F8CB8]">STAFF CONSOLE</small>
        </div>
      </div>

      <div className="-mr-1 flex-1 overflow-y-auto pr-1">
        {groups.map((group) => {
          const isOpen = !collapsed.includes(group.id) || group.items.some((i) => i === current);
          const panel = `nav-${group.id}`;
          return (
            <div key={group.id} className="mb-1">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panel}
                onClick={() => toggle(group.id)}
                className="flex w-full items-center justify-between rounded-lg px-2.5 pt-3.5 pb-1.5 text-[10px] font-bold tracking-[0.1em] text-[#7F7CAA] uppercase hover:text-white"
              >
                {group.label}
                <Icon name="chevronDown" className={cn('size-3.5 transition-transform', !isOpen && '-rotate-90')} />
              </button>
              {isOpen && (
                <ul id={panel} className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = item === current;
                    const count = item.queue ? queues[item.queue] : undefined;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          prefetch={false}
                          onClick={onNavigate}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex items-center gap-[11px] rounded-[10px] px-2.5 py-[9px] font-semibold',
                            active ? 'bg-brand text-white' : 'hover:bg-white/[0.07]',
                          )}
                        >
                          <Icon name={item.icon} />
                          <span className="flex-1">{item.label}</span>
                          {count ? (
                            <span
                              className="bg-g1 rounded-full px-[7px] py-px text-[11px] text-white"
                              aria-label={`${count} waiting`}
                            >
                              {count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {session && (
        <div className="mt-3 border-t border-white/10 px-2.5 pt-3 text-[11.5px] text-[#8F8CB8]">
          Signed in as <b className="text-white">{session.admin.roles.map((r) => r.name).join(', ') || 'Staff'}</b>
          <br />
          Two-step verification on
        </div>
      )}
    </nav>
  );
}
