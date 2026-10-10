import { screen, waitFor, within } from '@testing-library/react';
import { renderWithToasts } from './render';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserDrawer } from '@/components/users/user-drawer';
import { UsersPage } from '@/components/users/users-page';
import { ApiError } from '@/lib/client/api';
import type { AppUserCard, AppUserDetail } from '@/lib/types';
import { apiResponses, listResponses, mockApi, mutateSpy, reloadSpy, resetMocks, signInAs } from './mocks';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

const card = (over: Partial<AppUserCard> = {}): AppUserCard => ({
  id: 'u1',
  username: 'asha_k',
  displayName: 'Asha Kumar',
  email: 'a***@example.com',
  phone: null,
  emailVerified: true,
  phoneVerified: false,
  status: 'ACTIVE',
  statusReason: null,
  risk: 'LOW',
  accountType: 'PERSONAL',
  twoFactorEnabled: false,
  followers: 1234,
  following: 10,
  posts: 3,
  badge: 'NONE',
  location: { country: 'IN', state: 'Telangana', district: 'Hyderabad' },
  createdAt: '2026-10-01T10:00:00Z',
  lastActiveAt: null,
  ...over,
});

const detail = (over: Partial<AppUserDetail> = {}): AppUserDetail => ({
  ...card(),
  activeSessions: 2,
  reels: 1,
  identity: 'NOT_STARTED',
  monetization: 'NOT_ELIGIBLE',
  bestReachLevel: 'DISTRICT',
  reportsAgainst: 0,
  ...over,
});

beforeEach(() => resetMocks());

describe('the users table', () => {
  it('tells someone without access that they have none, and loads nothing', () => {
    signInAs(['audit.read']);
    renderWithToasts(<UsersPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to user accounts');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('lists people with their standing, location and masked contact details', () => {
    signInAs(['users.read']);
    listResponses.set('users', [
      card(),
      card({ id: 'u2', username: 'ravi', displayName: 'Ravi', status: 'SUSPENDED', risk: 'HIGH', location: null }),
    ]);
    renderWithToasts(<UsersPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Asha Kumar')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('@asha_k')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Hyderabad, Telangana')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('1,234')).toBeInTheDocument();
    // Shown twice by design: under the name on a phone, and in its own column on wider screens.
    expect(within(rows[1]!).getAllByText('Suspended')).toHaveLength(2);
    expect(within(rows[1]!).getByText('High')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('High risk')).toBeInTheDocument();
  });

  it('says when no one matches, and what to try', () => {
    signInAs(['users.read']);
    renderWithToasts(<UsersPage />);
    expect(screen.getByText('No one matches')).toBeInTheDocument();
  });

  it('labels every control so a screen reader can use it', () => {
    signInAs(['users.read']);
    renderWithToasts(<UsersPage />);
    expect(screen.getByLabelText('Search users')).toBeInTheDocument();
    expect(screen.getByLabelText('Status')).toBeInTheDocument();
    expect(screen.getByLabelText('Risk')).toBeInTheDocument();
  });
});

describe('one person', () => {
  const open = (staff: string[], user: AppUserDetail = detail()) => {
    signInAs(staff);
    apiResponses.set(`users/${user.id}`, user);
    apiResponses.set(`users/${user.id}/notes`, []);
    const onChanged = vi.fn();
    renderWithToasts(<UserDrawer userId={user.id} onClose={vi.fn()} onChanged={onChanged} />);
    return { onChanged, user: userEvent.setup() };
  };
  const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

  it('offers restrict and suspend on an active account to someone who may do both, and nothing to restore', () => {
    open(['users.read', 'users.suspend', 'users.restrict', 'users.restore']);
    expect(buttons()).toEqual(expect.arrayContaining(['Restrict', 'Suspend']));
    expect(buttons()).not.toContain('Restore');
  });

  it('offers restore, not suspend, on a suspended account', () => {
    open(
      ['users.read', 'users.suspend', 'users.restrict', 'users.restore'],
      detail({ status: 'SUSPENDED', statusReason: 'Repeated harassment reports' }),
    );
    expect(buttons()).toContain('Restore');
    expect(buttons()).not.toContain('Suspend');
    expect(buttons()).not.toContain('Restrict');
    expect(screen.getByText('Suspended: Repeated harassment reports')).toBeInTheDocument();
  });

  it("offers only the actions the person's roles allow", () => {
    open(['users.read', 'users.sessions.revoke']);
    expect(buttons()).toContain('Sign out everywhere');
    expect(buttons()).not.toContain('Suspend');
    expect(buttons()).not.toContain('Restrict');
  });

  it('offers nothing to someone who can only look', () => {
    open(['users.read']);
    for (const label of ['Suspend', 'Restrict', 'Restore', 'Sign out everywhere'])
      expect(buttons()).not.toContain(label);
  });

  it('says the contact details are masked when the person may not see them', () => {
    open(['users.read']);
    expect(screen.getByText('Contact details are masked for your role.')).toBeInTheDocument();
  });

  it('says nothing about masking to someone who may see them in full', () => {
    open(['users.read', 'users.read_contact']);
    expect(screen.queryByText('Contact details are masked for your role.')).not.toBeInTheDocument();
  });

  it('asks for a reason, sends it with the action, and refreshes the list', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail({ status: 'SUSPENDED' }) });
    const { user, onChanged } = open(['users.read', 'users.suspend']);
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend this account' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Repeated harassment reports');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('users/u1/suspend', { reason: 'Repeated harassment reports' }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutateSpy).toHaveBeenCalled();
  });

  it('keeps the dialog open and says why when the API refuses', async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'An account that is suspended cannot be suspended.'),
    );
    const { user, onChanged } = open(['users.read', 'users.suspend']);
    await user.click(screen.getByRole('button', { name: 'Suspend' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend this account' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Repeated harassment reports');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('cannot be suspended');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('adds an internal note only for people who may write them', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { id: 'n1' } });
    const { user } = open(['users.read', 'users.notes.read', 'users.notes.write']);
    await user.type(screen.getByLabelText('Add a note'), 'Called back, identity confirmed');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('users/u1/notes', { body: 'Called back, identity confirmed' }),
    );
  });

  it('hides the notes from someone who may not read them', () => {
    open(['users.read']);
    expect(screen.queryByText('Internal notes')).not.toBeInTheDocument();
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
