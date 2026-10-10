import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModerationPage } from '@/components/moderation/moderation-page';
import { ReportDrawer } from '@/components/moderation/report-drawer';
import { ApiError } from '@/lib/client/api';
import type { DecisionRecord, ReportCard, ReportDetail } from '@/lib/types';
import { apiResponses, listCalls, listResponses, mockApi, mutateSpy, reloadSpy, resetMocks, signInAs } from './mocks';
import { renderWithToasts } from './render';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

const RULES = [
  { code: 'harassment_bullying', title: 'Harassment and bullying', summary: 'x', categories: ['HARASSMENT'] },
  { code: 'spam', title: 'Spam', summary: 'x', categories: ['SPAM'] },
  { code: 'account_standing', title: 'Account standing', summary: 'x', categories: ['SPAM'] },
  { code: 'no_violation', title: 'No violation found', summary: 'x', categories: ['SPAM'] },
  { code: 'report_in_bad_faith', title: 'Report made in bad faith', summary: 'x', categories: ['SPAM'] },
];

const card = (over: Partial<ReportCard> = {}): ReportCard => ({
  id: 'r1',
  targetType: 'POST',
  targetId: 'p1',
  category: 'HARASSMENT',
  severity: 'MEDIUM',
  priority: 22,
  status: 'OPEN',
  source: 'USER',
  excerpt: 'You are all idiots',
  createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString(),
  slaDueAt: new Date(Date.now() + 20 * 3_600_000).toISOString(),
  overdue: false,
  resolvedAt: null,
  assignedTo: null,
  reporter: { username: 'reporter_one' },
  targetUser: { id: 'u9', username: 'rude_dude' },
  reportsOnTarget: 1,
  ...over,
});

const decision = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: 'd1',
  action: 'REMOVE',
  source: 'ADMIN',
  targetType: 'POST',
  targetId: 'p1',
  targetUserId: 'u9',
  reportId: 'r1',
  policyReason: 'harassment_bullying',
  policyTitle: 'Harassment and bullying',
  notes: 'Second offence this week',
  by: { id: 'staff-9', name: 'Mina Moderator' },
  reversalOfId: null,
  reversed: false,
  appeal: null,
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  ...over,
});

const detail = (over: Partial<ReportDetail> = {}): ReportDetail => ({
  ...card(),
  description: 'Keeps tagging me in rude posts',
  resolution: null,
  evidence: { refs: [], snapshot: { excerpt: 'You are all idiots', ownerUsername: 'rude_dude' } },
  target: {
    type: 'POST',
    id: 'p1',
    available: true,
    state: 'APPROVED',
    owner: { id: 'u9', username: 'rude_dude', status: 'ACTIVE' },
    excerpt: 'You are all idiots',
    details: {},
  },
  standing: {
    user: { id: 'u9', username: 'rude_dude', status: 'ACTIVE', risk: 'LOW' },
    memberSince: '2026-01-01T00:00:00Z',
    reportsAgainst: 4,
    last90Days: { warnings: 1, restricted: 0, removed: 2, accountRestrictions: 0, suspensions: 0 },
    lastActionAt: null,
  },
  otherReports: [
    {
      id: 'r2',
      category: 'SPAM',
      status: 'OPEN',
      source: 'USER',
      description: null,
      reporter: { username: 'reporter_two' },
      createdAt: new Date(Date.now() - 3_600_000).toISOString(),
    },
  ],
  history: [decision()],
  allowed: {
    claim: true,
    release: false,
    escalate: true,
    actions: ['APPROVE', 'DISMISS_REPORT', 'WARN', 'RESTRICT', 'REMOVE'],
  },
  ...over,
});

beforeEach(() => {
  resetMocks();
  apiResponses.set('moderation/rules', { policyVersion: 'draft', rules: RULES });
});

describe('the moderation queue', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<ModerationPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to the moderation queue');
  });

  it('lists reports with urgency, what and who, and how long they have waited', () => {
    signInAs(['reports.read']);
    listResponses.set('moderation/reports', [
      card(),
      card({
        id: 'r3',
        severity: 'CRITICAL',
        category: 'SELF_HARM',
        overdue: true,
        reportsOnTarget: 3,
        assignedTo: { id: 's1', name: 'Mina Moderator' },
        source: 'ADMIN',
        reporter: null,
      }),
    ]);
    renderWithToasts(<ModerationPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Harassment')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Medium')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('You are all idiots')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('@rude_dude')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Critical')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Overdue')).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/3 reports/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/flagged by staff/)).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Mina Moderator')).toBeInTheDocument();
  });

  it('says plainly when nothing is waiting', () => {
    signInAs(['reports.read']);
    renderWithToasts(<ModerationPage />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('shows the counts that matter at the top', () => {
    signInAs(['reports.read']);
    apiResponses.set('moderation/summary', {
      reports: {
        active: 12,
        open: 8,
        inReview: 3,
        escalated: 1,
        bySeverity: { CRITICAL: 2, HIGH: 3, MEDIUM: 4, LOW: 3 },
        overdue: 5,
        unassigned: 8,
        mine: 3,
        resolvedLast24h: 21,
      },
      appeals: null,
      incidents: null,
      live: null,
    });
    renderWithToasts(<ModerationPage />);
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('21 closed in the last day')).toBeInTheDocument();
    expect(screen.getByText('3 high')).toBeInTheDocument();
    expect(screen.getByText('Overdue', { selector: 'div' })).toBeInTheDocument();
  });

  it('asks the API for the view and filters chosen', async () => {
    signInAs(['reports.read']);
    const user = userEvent.setup();
    renderWithToasts(<ModerationPage />);
    const last = () => listCalls.at(-1)!;
    expect(last()).toMatchObject({
      path: 'moderation/reports',
      params: { targetType: '', category: '', severity: '' },
    });

    await user.click(screen.getByRole('tab', { name: 'Mine' }));
    expect(last().params).toMatchObject({ assignee: 'me' });
    await user.click(screen.getByRole('tab', { name: 'Overdue' }));
    expect(last().params).toMatchObject({ overdue: true });
    await user.click(screen.getByRole('tab', { name: 'Escalated' }));
    expect(last().params).toMatchObject({ status: 'ESCALATED' });
    await user.click(screen.getByRole('tab', { name: 'Closed' }));
    expect(last().params).toMatchObject({ scope: 'closed' });

    await user.selectOptions(screen.getByLabelText('Reason'), 'COPYRIGHT');
    await user.selectOptions(screen.getByLabelText('Kind of thing'), 'REEL');
    await user.selectOptions(screen.getByLabelText('Severity'), 'HIGH');
    expect(last().params).toMatchObject({
      scope: 'closed',
      category: 'COPYRIGHT',
      targetType: 'REEL',
      severity: 'HIGH',
    });
    expect(screen.getByRole('tab', { name: 'Closed' })).toHaveAttribute('aria-selected', 'true');
  });

  it('lists decisions, and offers to take one back only to those who may', async () => {
    signInAs(['reports.read']);
    listResponses.set('moderation/actions', [
      decision(),
      decision({ id: 'd2', action: 'RESTORE', reversalOfId: 'd1' }),
      decision({ id: 'd3', reversed: true }),
    ]);
    const user = userEvent.setup();
    const view = renderWithToasts(<ModerationPage />);
    await user.click(screen.getByRole('tab', { name: 'Decisions' }));
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getAllByText('Removed').length).toBeGreaterThan(0);
    expect(screen.getByText('Taken back')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Take back' })).not.toBeInTheDocument();
    view.unmount();

    resetMocks();
    signInAs(['reports.read', 'content.restore']);
    listResponses.set('moderation/actions', [
      decision(),
      decision({ id: 'd2', action: 'RESTORE' }),
      decision({ id: 'd3', reversed: true }),
    ]);
    renderWithToasts(<ModerationPage />);
    await user.click(screen.getByRole('tab', { name: 'Decisions' }));
    // Only the one that can be undone and has not been.
    expect(screen.getAllByRole('button', { name: 'Take back' })).toHaveLength(1);
  });

  it('takes a decision back with a reason', async () => {
    signInAs(['reports.read', 'content.restore']);
    listResponses.set('moderation/actions', [decision()]);
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    renderWithToasts(<ModerationPage />);
    await user.click(screen.getByRole('tab', { name: 'Decisions' }));
    await user.click(screen.getByRole('button', { name: 'Take back' }));
    const dialog = await screen.findByRole('dialog', { name: /Take back: Removed/ });
    await user.type(within(dialog).getByLabelText('Why?'), 'Context shows it was a joke');
    await user.click(within(dialog).getByRole('button', { name: 'Take it back' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('moderation/actions/d1/reverse', {
        reason: 'Context shows it was a joke',
      }),
    );
    await waitFor(() => expect(reloadSpy).toHaveBeenCalled());
  });
});

describe('one report', () => {
  const open = (staff: string[], report: ReportDetail = detail()) => {
    signInAs(staff, { id: 'me-1' });
    apiResponses.set(`moderation/reports/${report.id}`, report);
    const onChanged = vi.fn();
    renderWithToasts(<ReportDrawer reportId={report.id} onClose={vi.fn()} onChanged={onChanged} />);
    return { onChanged, user: userEvent.setup() };
  };
  const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);

  it('shows what was reported, what the reporter said, and the account’s standing', () => {
    open(['reports.read']);
    expect(screen.getByRole('dialog', { name: 'Harassment report' })).toBeInTheDocument();
    expect(screen.getAllByText('You are all idiots').length).toBeGreaterThan(0);
    expect(screen.getByText('Keeps tagging me in rude posts')).toBeInTheDocument();
    expect(screen.getByText('Standing of @rude_dude')).toBeInTheDocument();
    expect(screen.getByText(/1 warning\(s\), 0 hidden, 2 removed/)).toBeInTheDocument();
    expect(screen.getByText('Other reports about this (1)')).toBeInTheDocument();
    expect(screen.getByText(/reporter_two/)).toBeInTheDocument();
    // What has already been decided, with who and why.
    expect(screen.getByText('Second offence this week')).toBeInTheDocument();
    expect(screen.getByText(/Mina Moderator/)).toBeInTheDocument();
    expect(screen.getByText(/never told who reported them/)).toBeInTheDocument();
  });

  it('offers exactly what the API says this person may do', () => {
    open(['reports.read'], detail({ allowed: { claim: false, release: false, escalate: false, actions: [] } }));
    expect(buttons()).not.toContain('Take this report');
    expect(buttons()).not.toContain('Decide…');
    expect(buttons()).not.toContain('Escalate');
    expect(screen.getByText('Your role can read reports but not decide them.')).toBeInTheDocument();
  });

  it('says who has it when it is somebody else’s, and why a senior is needed when escalated', () => {
    open(
      ['reports.read'],
      detail({
        assignedTo: { id: 'other', name: 'Moe Moderator' },
        allowed: { claim: false, release: false, escalate: false, actions: [] },
      }),
    );
    expect(screen.getByText('Moe Moderator is looking at this report.')).toBeInTheDocument();
  });

  it('explains an escalated report to a moderator who cannot touch it', () => {
    open(
      ['reports.read'],
      detail({ status: 'ESCALATED', allowed: { claim: false, release: false, escalate: false, actions: [] } }),
    );
    expect(screen.getByText('Escalated reports are decided by a senior moderator.')).toBeInTheDocument();
  });

  it('says a closed report is closed, and shows the outcome', () => {
    open(
      ['reports.read'],
      detail({
        status: 'RESOLVED',
        resolution: 'Second offence this week',
        resolvedAt: new Date().toISOString(),
        allowed: { claim: false, release: false, escalate: false, actions: [] },
      }),
    );
    expect(screen.getByText('This report is closed.')).toBeInTheDocument();
    expect(screen.getByText(/Outcome:/)).toBeInTheDocument();
  });

  it('tells the moderator when the author deleted it, and what it said when reported', () => {
    open(['reports.read'], detail({ target: { ...detail().target, available: false, excerpt: null } }));
    expect(screen.getByText(/no longer there/)).toBeInTheDocument();
    expect(screen.getByText(/“You are all idiots”/)).toBeInTheDocument();
  });

  it('points out when it has been edited since it was reported', () => {
    open(['reports.read'], detail({ target: { ...detail().target, excerpt: 'I am sorry, I was wrong' } }));
    expect(screen.getByText(/It has been edited since it was reported/)).toBeInTheDocument();
  });

  it('takes a report', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail({ status: 'IN_REVIEW' }) });
    const { user, onChanged } = open(['reports.read', 'reports.assign']);
    await user.click(screen.getByRole('button', { name: 'Take this report' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('moderation/reports/r1/claim'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mutateSpy).toHaveBeenCalled();
  });

  it('says so when someone else got there first, and reloads', async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'Someone else is already looking at this report.'),
    );
    const { user, onChanged } = open(['reports.read', 'reports.assign']);
    await user.click(screen.getByRole('button', { name: 'Take this report' }));
    expect(await screen.findByText('Someone else is already looking at this report.')).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    expect(mutateSpy).toHaveBeenCalled(); // reloaded to show who has it
  });

  it('escalates with a reason', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail({ status: 'ESCALATED' }) });
    const { user, onChanged } = open(['reports.read', 'reports.resolve']);
    await user.click(screen.getByRole('button', { name: 'Escalate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Escalate to a senior moderator' });
    await user.type(
      within(dialog).getByLabelText('Why does it need a senior?'),
      'Possible threat against a named person',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Escalate' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('moderation/reports/r1/escalate', {
        reason: 'Possible threat against a named person',
      }),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('puts a report back only when the API allows it', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail() });
    const { user } = open(
      ['reports.read', 'reports.assign'],
      detail({
        assignedTo: { id: 'me-1', name: 'Test Staff' },
        status: 'IN_REVIEW',
        allowed: { claim: false, release: true, escalate: true, actions: ['WARN'] },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Put back' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('moderation/reports/r1/release'));
  });
});

describe('deciding', () => {
  const start = async (actions = detail().allowed.actions) => {
    signInAs(['reports.read', 'reports.resolve', 'content.moderate'], { id: 'me-1' });
    apiResponses.set(
      'moderation/reports/r1',
      detail({ allowed: { claim: false, release: true, escalate: true, actions } }),
    );
    const user = userEvent.setup();
    renderWithToasts(<ReportDrawer reportId="r1" onClose={vi.fn()} onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Decide…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decide this report' });
    return { user, dialog };
  };
  const options = (select: HTMLElement) =>
    within(select)
      .getAllByRole('option')
      .map((o) => o.textContent);

  it('offers only the decisions the API allowed, and says what each does', async () => {
    const { user, dialog } = await start(['WARN', 'REMOVE']);
    const decisionSelect = within(dialog).getByLabelText('Decision');
    expect(options(decisionSelect)).toEqual(['Choose…', 'Warn the person', 'Remove it']);
    await user.selectOptions(decisionSelect, 'REMOVE');
    expect(within(dialog).getByText(/Taken down for everyone but kept on record/)).toBeInTheDocument();
  });

  it('offers only the rules that fit the decision', async () => {
    const { user, dialog } = await start();
    const rule = within(dialog).getByLabelText('Rule');
    expect(rule).toBeDisabled();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'REMOVE');
    // Nothing is removed for "no violation", and bad faith is for dismissals.
    expect(options(rule)).toEqual(['Choose a rule…', 'Harassment and bullying', 'Spam']);
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'APPROVE');
    expect(options(rule)).toEqual(['Choose a rule…', 'No violation found']);
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'DISMISS_REPORT');
    expect(options(rule)).toEqual(['Choose a rule…', 'No violation found', 'Report made in bad faith']);
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'WARN');
    expect(options(rule)).toEqual(['Choose a rule…', 'Harassment and bullying', 'Spam', 'Account standing']);
  });

  it('forgets the rule when the decision changes to one it does not fit', async () => {
    const { user, dialog } = await start();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'REMOVE');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'spam');
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'APPROVE');
    expect(within(dialog).getByLabelText('Rule')).toHaveValue('');
  });

  it('will not send without a decision and a rule', async () => {
    const { user, dialog } = await start();
    await user.click(within(dialog).getByRole('button', { name: 'Decide' }));
    expect(await within(dialog).findByText('Choose what to do.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'REMOVE');
    await user.click(within(dialog).getByRole('button', { name: 'Remove it' }));
    expect(await within(dialog).findByText('Choose the rule this is under.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('sends the decision, the rule and the private note', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail({ status: 'RESOLVED' }) });
    const { user, dialog } = await start();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'REMOVE');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'harassment_bullying');
    await user.type(within(dialog).getByLabelText('Private note'), 'Third time this week');
    await user.click(within(dialog).getByRole('button', { name: 'Remove it' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('moderation/reports/r1/decision', {
        action: 'REMOVE',
        policyReason: 'harassment_bullying',
        notes: 'Third time this week',
      }),
    );
    expect(await screen.findByText('Decision recorded')).toBeInTheDocument();
  });

  it('leaves the note out when there is none', async () => {
    mockApi.post.mockResolvedValueOnce({ data: detail({ status: 'DISMISSED' }) });
    const { user, dialog } = await start();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'APPROVE');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'no_violation');
    await user.click(within(dialog).getByRole('button', { name: 'No violation: leave it up' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('moderation/reports/r1/decision', {
        action: 'APPROVE',
        policyReason: 'no_violation',
      }),
    );
  });

  it('keeps the dialog open and says why when the API refuses', async () => {
    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Someone else is looking at this report.'));
    const { user, dialog } = await start();
    await user.selectOptions(within(dialog).getByLabelText('Decision'), 'WARN');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'spam');
    await user.click(within(dialog).getByRole('button', { name: 'Warn the person' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Someone else is looking at this report.');
    expect(screen.queryByText('Decision recorded')).not.toBeInTheDocument();
  });

  it('says so when the rules cannot be loaded, rather than offering an empty list', async () => {
    signInAs(['reports.read', 'reports.resolve'], { id: 'me-1' });
    apiResponses.set('moderation/reports/r1', detail());
    apiResponses.set('moderation/rules', new ApiError(500, 'INTERNAL', 'Something went wrong. Please try again.'));
    const user = userEvent.setup();
    renderWithToasts(<ReportDrawer reportId="r1" onClose={vi.fn()} onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Decide…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decide this report' });
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(within(dialog).queryByLabelText('Rule')).not.toBeInTheDocument();
  });
});
