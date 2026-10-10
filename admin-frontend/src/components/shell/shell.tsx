'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { avatarColour, initials } from '@/lib/client/format';
import { activeItem } from '@/lib/nav';
import { useSession } from '@/lib/client/session';
import { cn } from '@/lib/client/cn';
import { Icon } from '../ui/icon';
import { Sidebar } from './sidebar';

function UserMenu() {
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) {
        if (event.key === 'Escape') setOpen(false);
      } else if (root.current && !root.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  if (!session) return null;
  const { admin } = session;
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="border-line hover:bg-soft flex items-center gap-2 rounded-xl border bg-white py-1 pr-3 pl-1 font-bold"
      >
        <span
          className="grid size-7 place-items-center rounded-lg text-xs font-extrabold text-white"
          style={{ background: avatarColour(admin.id) }}
          aria-hidden="true"
        >
          {initials(admin.name)}
        </span>
        <span className="hidden max-w-36 truncate sm:inline">{admin.name}</span>
        <Icon name="chevronDown" className="size-3.5" />
      </button>
      {open && (
        <div
          role="menu"
          className="border-line absolute right-0 z-30 mt-2 w-64 rounded-xl border bg-white p-2 shadow-xl"
        >
          <div className="border-line border-b px-2.5 pt-1 pb-2.5">
            <div className="font-bold">{admin.name}</div>
            <div className="text-muted truncate text-xs">{admin.email}</div>
            <div className="text-muted mt-1 text-xs">{admin.roles.map((r) => r.name).join(', ')}</div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            className="hover:bg-soft mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-semibold"
          >
            <Icon name="logout" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

/** The frame around every console page: menu on the left, title bar on top. */
export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The phone menu is "open on this page": moving to another page (a link, or the back button)
  // closes it without any code having to notice.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const menuOpen = openOn === pathname;
  const setMenuOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const title = activeItem(pathname)?.label ?? 'BLOCKS';

  return (
    <div className="flex min-h-screen">
      <a
        href="#content"
        className="sr-only z-50 rounded-lg bg-white px-3 py-2 font-bold focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-screen w-[236px] flex-none lg:block">
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            className="bg-ink/50 absolute inset-0"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative h-full w-[260px] max-w-[85vw]">
            <Sidebar onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="border-line bg-canvas/90 sticky top-0 z-20 flex items-center gap-3 border-b px-4 py-3 backdrop-blur-md sm:px-7">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className={cn('hover:bg-soft rounded-lg p-1.5 lg:hidden')}
          >
            <Icon name="menu" />
          </button>
          <p className="flex-1 truncate text-[17px] font-extrabold tracking-tight">{title}</p>
          <UserMenu />
        </header>
        <main id="content" className="mx-auto max-w-[1280px] px-4 pt-6 pb-16 sm:px-7">
          {children}
        </main>
      </div>
    </div>
  );
}
