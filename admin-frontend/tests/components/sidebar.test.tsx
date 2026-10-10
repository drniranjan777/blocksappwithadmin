import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Sidebar } from '@/components/shell/sidebar';
import { resetCollapsedGroupsForTests } from '@/lib/client/use-collapsed-groups';
import { NAV, activeItem, visibleNav } from '@/lib/nav';
import { apiResponses, resetMocks, signInAs } from './mocks';

const pathname = vi.hoisted(() => ({ current: '/' }));

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }));
vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);

const labels = () => screen.getAllByRole('link').map((a) => a.textContent?.replace(/\d+ waiting$/, '').trim());

beforeEach(() => {
  resetMocks();
  pathname.current = '/';
  window.localStorage.clear();
  resetCollapsedGroupsForTests();
});

describe('the menu', () => {
  it('shows a super admin every module', () => {
    signInAs(NAV.flatMap((g) => g.items.flatMap((i) => i.anyOf)));
    render(<Sidebar />);
    expect(labels()).toEqual(NAV.flatMap((g) => g.items.map((i) => i.label)));
  });

  it('shows a support agent the dashboard and users, and nothing they cannot use', () => {
    signInAs(['users.read', 'users.sessions.revoke', 'users.notes.read']);
    render(<Sidebar />);
    expect(labels()).toEqual(['Dashboard', 'Users']);
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
    expect(screen.queryByText('Payouts')).not.toBeInTheDocument();
  });

  it('shows a finance operator the compliance group, not the staff group', () => {
    signInAs(['payout.read', 'payout.approve', 'bank.read', 'kyc.read']);
    render(<Sidebar />);
    expect(labels()).toEqual(['Dashboard', 'Identity checks', 'Bank accounts', 'Payouts']);
  });

  it('shows an analyst the dashboard and the media view, not user accounts', () => {
    signInAs(['analytics.read', 'media.read', 'music.read', 'reach.read']);
    render(<Sidebar />);
    expect(labels()).toEqual(['Dashboard', 'Media review', 'Music library']);
  });

  it('hides a whole group when nothing in it is allowed', () => {
    signInAs(['users.read']);
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: /Govern/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Operate/i })).toBeInTheDocument();
  });

  it('marks the page you are on', () => {
    signInAs(['users.read']);
    pathname.current = '/users/abc';
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});

describe('opening and closing groups', () => {
  it('starts open, folds up on a click, and opens again on the next', async () => {
    signInAs(['users.read', 'media.read', 'music.read']);
    const user = userEvent.setup();
    render(<Sidebar />);
    const group = screen.getByRole('button', { name: /Operate/i });
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();

    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();

    await user.click(group);
    expect(group).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Users' })).toBeInTheDocument();
  });

  it('remembers which groups were folded, for next time', async () => {
    signInAs(['users.read']);
    const user = userEvent.setup();
    const first = render(<Sidebar />);
    await user.click(screen.getByRole('button', { name: /Operate/i }));
    first.unmount();

    render(<Sidebar />);
    expect(await screen.findByRole('button', { name: /Operate/i })).toHaveAttribute('aria-expanded', 'false');
  });

  it('never hides the group of the page you are on', async () => {
    signInAs(['users.read']);
    window.localStorage.setItem('blocks.nav.collapsed', JSON.stringify(['operate']));
    pathname.current = '/users';
    render(<Sidebar />);
    expect(await screen.findByRole('link', { name: 'Users' })).toBeInTheDocument();
  });

  it('works when the browser will not let it remember', async () => {
    signInAs(['users.read']);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    render(<Sidebar />);
    await user.click(screen.getByRole('button', { name: /Operate/i }));
    expect(screen.getByRole('button', { name: /Operate/i })).toHaveAttribute('aria-expanded', 'false');
    setItem.mockRestore();
  });
});

describe('counts of work waiting', () => {
  it('shows how many items wait next to the module that handles them', () => {
    signInAs(['users.read', 'media.read', 'content.moderate', 'kyc.read']);
    apiResponses.set('dashboard', { queues: { mediaAwaitingReview: 4, identityUnderReview: 0 } });
    render(<Sidebar />);
    const media = screen.getByRole('link', { name: /Media review/ });
    expect(within(media).getByLabelText('4 waiting')).toBeInTheDocument();
    const identity = screen.getByRole('link', { name: /Identity checks/ });
    expect(within(identity).queryByLabelText(/waiting/)).not.toBeInTheDocument();
  });
});

describe('the menu definition', () => {
  it('has no page listed twice', () => {
    const hrefs = NAV.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it('finds the owner of a nested path', () => {
    expect(activeItem('/reach/01990000')?.label).toBe('Reach engine');
    expect(activeItem('/')?.label).toBe('Dashboard');
    expect(activeItem('/nowhere')).toBeUndefined();
  });

  it('gives a person with no permissions only the dashboard', () => {
    expect(visibleNav(() => false).map((g) => g.id)).toEqual([]);
    expect(visibleNav((...p) => p.length === 0).flatMap((g) => g.items.map((i) => i.label))).toEqual(['Dashboard']);
  });
});
