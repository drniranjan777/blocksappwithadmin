import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppealsPage } from '@/components/moderation/appeals-page';
import { ApiError } from '@/lib/client/api';
import type { AppealCard, AppealDetail } from '@/lib/types';
import { apiResponses, listCalls, listResponses, mockApi, resetMocks, signInAs } from './mocks';
import { renderWithToasts } from './render';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

const card = (over: Partial<AppealCard> = {}): AppealCard => ({
  id: 'a1',
  kind: 'MODERATION',
  status: 'OPEN',
  user: { id: 'u1', username: 'asha_k', status: 'ACTIVE' },
  decision: { id: 'd1', action: 'REMOVE', source: 'ADMIN', policyTitle: 'Harassment and bullying' },
  assignedTo: null,
  decidedBy: null,
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  slaDueAt: new Date(Date.now() + 70 * 3_600_000).toISOString(),
  overdue: false,
  decidedAt: null,
  ...over,
});

const detail = (over: Partial<AppealDetail> = {}): AppealDetail => ({
  ...card(),
  reason: 'It was a joke between friends and we both laughed',
  decisionNote: null,
  original: {
    id: 'd1',
    action: 'REMOVE',
    source: 'ADMIN',
    policyReason: 'harassment_bullying',
    policyTitle: 'Harassment and bullying',
    notes: 'Repeat offender, see ticket 4417',
    by: { id: 'staff-9', name: 'Sena Senior' },
    at: '2026-10-08T10:00:00Z',
    reversed: false,
    report: { id: 'r1', category: 'HARASSMENT', description: null, status: 'RESOLVED' },
  },
  target: {
    type: 'POST',
    id: 'p1',
    available: true,
    state: 'REMOVED',
    owner: { id: 'u1', username: 'asha_k', status: 'ACTIVE' },
    excerpt: 'You are all idiots',
    details: {},
  },
  you: { madeTheOriginalDecision: false, canClaim: true, canDecide: false },
  ...over,
});

beforeEach(() => resetMocks());

describe('the appeals list', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<AppealsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to appeals');
  });

  it('lists who appealed, what the decision was, and which rule', () => {
    signInAs(['appeals.read']);
    listResponses.set('appeals', [
      card(),
      card({
        id: 'a2',
        kind: 'ACCOUNT',
        overdue: true,
        status: 'IN_REVIEW',
        assignedTo: { id: 's', name: 'Saul Senior' },
        decision: { id: 'd2', action: 'RESTRICT_USER', source: 'ADMIN', policyTitle: 'Account standing' },
      }),
    ]);
    renderWithToasts(<AppealsPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('@asha_k')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Removed')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Harassment and bullying')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Account restricted')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Saul Senior')).toBeInTheDocument();
  });

  it('asks for the view chosen', async () => {
    signInAs(['appeals.read']);
    const user = userEvent.setup();
    renderWithToasts(<AppealsPage />);
    await user.click(screen.getByRole('tab', { name: 'Mine' }));
    expect(listCalls.at(-1)!.params).toEqual({ assignee: 'me' });
    await user.click(screen.getByRole('tab', { name: 'Decided' }));
    expect(listCalls.at(-1)!.params).toEqual({ scope: 'decided' });
  });

  it('says when none are waiting', () => {
    signInAs(['appeals.read']);
    renderWithToasts(<AppealsPage />);
    expect(screen.getByText('No appeals are waiting')).toBeInTheDocument();
  });
});

describe('one appeal', () => {
  const open = async (staff: string[], appeal: AppealDetail = detail()) => {
    signInAs(staff, { id: 'me-1' });
    listResponses.set('appeals', [card()]);
    apiResponses.set(`appeals/${appeal.id}`, appeal);
    const user = userEvent.setup();
    renderWithToasts(<AppealsPage />);
    await user.click(screen.getByRole('button', { name: /Open appeal from asha_k/ }));
    await screen.findByRole('dialog', { name: 'Appeal from @asha_k' });
    return user;
  };

  it('shows what they say, the decision with its staff note, and what it was about', async () => {
    await open(['appeals.read']);
    expect(screen.getByText('It was a joke between friends and we both laughed')).toBeInTheDocument();
    expect(screen.getByText('Sena Senior')).toBeInTheDocument();
    expect(screen.getByText(/Repeat offender, see ticket 4417/)).toBeInTheDocument();
    expect(screen.getByText('You are all idiots')).toBeInTheDocument();
  });

  it('lets someone take it if the API says they can, and only then', async () => {
    mockApi.post.mockResolvedValueOnce({
      data: detail({ status: 'IN_REVIEW', you: { madeTheOriginalDecision: false, canClaim: false, canDecide: true } }),
    });
    const user = await open(['appeals.read', 'appeals.decide']);
    await user.click(screen.getByRole('button', { name: 'Take this appeal' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('appeals/a1/claim'));
  });

  it('shows no way in for someone who only reads', async () => {
    await open(
      ['appeals.read'],
      detail({ you: { madeTheOriginalDecision: false, canClaim: false, canDecide: false } }),
    );
    expect(screen.queryByRole('button', { name: 'Take this appeal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Decide…' })).not.toBeInTheDocument();
  });

  it('tells the person who made the decision that someone else has to review it', async () => {
    await open(
      ['appeals.read', 'appeals.decide'],
      detail({ you: { madeTheOriginalDecision: true, canClaim: false, canDecide: false } }),
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'You made the decision under appeal, so someone else has to review it',
    );
    expect(screen.queryByRole('button', { name: 'Take this appeal' })).not.toBeInTheDocument();
  });

  it('says who is reviewing it when it is somebody else', async () => {
    await open(
      ['appeals.read', 'appeals.decide'],
      detail({
        status: 'IN_REVIEW',
        assignedTo: { id: 'other', name: 'Saul Senior' },
        you: { madeTheOriginalDecision: false, canClaim: false, canDecide: false },
      }),
    );
    expect(screen.getByText('Saul Senior is reviewing this appeal.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Put back' })).not.toBeInTheDocument();
  });

  it('shows a message when the API refuses the claim', async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'You made the decision under appeal, so someone else has to review it.'),
    );
    const user = await open(['appeals.read', 'appeals.decide']);
    await user.click(screen.getByRole('button', { name: 'Take this appeal' }));
    expect(
      await screen.findByText(/someone else has to review it/, { selector: '[role="status"] *' }),
    ).toBeInTheDocument();
  });

  it('decides with an outcome and a note written for the person', async () => {
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const user = await open(
      ['appeals.read', 'appeals.decide'],
      detail({
        status: 'IN_REVIEW',
        assignedTo: { id: 'me-1', name: 'Test Staff' },
        you: { madeTheOriginalDecision: false, canClaim: false, canDecide: true },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Decide…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decide this appeal' });
    // It says the note is read by the person.
    expect(within(dialog).getByText(/Shown to the person who appealed/)).toBeInTheDocument();
    // An outcome and a real note are both needed.
    await user.click(within(dialog).getByRole('button', { name: 'Record decision' }));
    expect(await within(dialog).findByText('Choose an outcome.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.click(within(dialog).getByLabelText(/Overturn the decision/));
    await user.type(within(dialog).getByLabelText('Note to the person'), 'short');
    await user.click(within(dialog).getByRole('button', { name: 'Record decision' }));
    expect(await within(dialog).findByText(/at least 10 characters/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Note to the person'));
    await user.type(within(dialog).getByLabelText('Note to the person'), 'On a second look this was banter.');
    await user.click(within(dialog).getByRole('button', { name: 'Record decision' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('appeals/a1/decision', {
        decision: 'OVERTURNED',
        note: 'On a second look this was banter.',
      }),
    );
  });

  it('keeps the dialog open with the reason when the decision cannot be made', async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'A later decision exists. Take that one back first.'),
    );
    const user = await open(
      ['appeals.read', 'appeals.decide'],
      detail({
        status: 'IN_REVIEW',
        assignedTo: { id: 'me-1', name: 'Test Staff' },
        you: { madeTheOriginalDecision: false, canClaim: false, canDecide: true },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Decide…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decide this appeal' });
    await user.click(within(dialog).getByLabelText(/Overturn the decision/));
    await user.type(within(dialog).getByLabelText('Note to the person'), 'We are changing this decision.');
    await user.click(within(dialog).getByRole('button', { name: 'Record decision' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A later decision exists');
  });

  it('shows the outcome and the note that was sent to the person once decided', async () => {
    await open(
      ['appeals.read'],
      detail({
        status: 'UPHELD',
        decidedAt: new Date().toISOString(),
        decidedBy: { id: 's', name: 'Saul Senior' },
        decisionNote: 'The comments were aimed at one person repeatedly.',
        you: { madeTheOriginalDecision: false, canClaim: false, canDecide: false },
      }),
    );
    expect(screen.getByText('The comments were aimed at one person repeatedly.')).toBeInTheDocument();
    expect(screen.getByText('This note is shown to the person.')).toBeInTheDocument();
  });

  it('says an appeal closed by reversing the decision was closed that way', async () => {
    await open(
      ['appeals.read'],
      detail({
        status: 'OVERTURNED',
        decidedAt: new Date().toISOString(),
        decidedBy: null,
        decisionNote: 'The decision was taken back before the appeal was reviewed.',
      }),
    );
    expect(screen.getByText(/by reversing the decision directly/)).toBeInTheDocument();
  });
});
