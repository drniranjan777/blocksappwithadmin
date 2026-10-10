import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IncidentsPage } from '@/components/moderation/incidents-page';
import { LivePage } from '@/components/moderation/live-page';
import { PolicyPage } from '@/components/moderation/policy-page';
import { ApiError } from '@/lib/client/api';
import type { IncidentCard, IncidentDetail, LiveSessionCard, PolicyView } from '@/lib/types';
import { apiResponses, listCalls, listResponses, mockApi, resetMocks, signInAs } from './mocks';
import { renderWithToasts } from './render';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

beforeEach(() => resetMocks());

// ================================================================== incidents ==

const incident = (over: Partial<IncidentCard> = {}): IncidentCard => ({
  id: 'i1',
  type: 'SELF_HARM',
  severity: 'HIGH',
  status: 'OPEN',
  summary: 'A viewer reported a person saying they may hurt themselves.',
  actionTaken: null,
  escalatedTo: null,
  user: { id: 'u1', username: 'asha_k', status: 'ACTIVE' },
  liveSessionId: null,
  reportId: null,
  owner: { id: 'staff-9', name: 'Mina Moderator' },
  createdBy: { id: 'staff-9', name: 'Mina Moderator' },
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  resolvedAt: null,
  ...over,
});

const incidentDetail = (over: Partial<IncidentDetail> = {}): IncidentDetail => ({
  ...incident(),
  events: [
    {
      id: 'e1',
      kind: 'OPENED',
      note: 'Opened by staff.',
      by: { id: 'staff-9', name: 'Mina Moderator' },
      at: new Date(Date.now() - 3_600_000).toISOString(),
    },
    {
      id: 'e2',
      kind: 'NOTE',
      note: 'Called the number on file; no answer.',
      by: { id: 'staff-9', name: 'Mina Moderator' },
      at: new Date(Date.now() - 1_800_000).toISOString(),
    },
  ],
  ...over,
});

describe('safety incidents', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<IncidentsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to safety incidents');
  });

  it('lists incidents with kind, severity and owner', () => {
    signInAs(['safety.incidents.read']);
    listResponses.set('safety/incidents', [
      incident(),
      incident({ id: 'i2', type: 'CHILD_SAFETY', severity: 'CRITICAL', owner: null }),
    ]);
    renderWithToasts(<IncidentsPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Self-harm risk')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Mina Moderator')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Child safety')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Critical')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Nobody yet')).toBeInTheDocument();
  });

  it('asks for the view chosen', async () => {
    signInAs(['safety.incidents.read']);
    const user = userEvent.setup();
    renderWithToasts(<IncidentsPage />);
    expect(listCalls.at(-1)!.params).toEqual({ status: 'OPEN' });
    await user.click(screen.getByRole('tab', { name: 'Mine' }));
    expect(listCalls.at(-1)!.params).toEqual({ owner: 'me' });
    await user.click(screen.getByRole('tab', { name: 'Resolved' }));
    expect(listCalls.at(-1)!.params).toEqual({ status: 'RESOLVED' });
  });

  it('is read-only for someone who cannot write', () => {
    signInAs(['safety.incidents.read']);
    renderWithToasts(<IncidentsPage />);
    expect(screen.queryByRole('button', { name: 'Open an incident' })).not.toBeInTheDocument();
  });

  it('opens an incident with the kind, severity, facts and (optionally) an account', async () => {
    signInAs(['safety.incidents.read', 'safety.incidents.write']);
    mockApi.post.mockResolvedValueOnce({ data: {} });
    const user = userEvent.setup();
    renderWithToasts(<IncidentsPage />);
    await user.click(screen.getByRole('button', { name: 'Open an incident' }));
    const dialog = await screen.findByRole('dialog', { name: 'Open a safety incident' });
    await user.click(within(dialog).getByRole('button', { name: 'Open incident' }));
    expect(await within(dialog).findByText('Write at least 10 characters.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('What happened'), 'A person said goodbye in a live chat');
    await user.type(within(dialog).getByLabelText('Account id (optional)'), 'not-an-id');
    await user.click(within(dialog).getByRole('button', { name: 'Open incident' }));
    expect(await within(dialog).findByText('That is not an account id.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Account id (optional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Open incident' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('safety/incidents', {
        type: 'SELF_HARM',
        severity: 'HIGH',
        summary: 'A person said goodbye in a live chat',
      }),
    );
  });

  const openDrawer = async (staff: string[], inc: IncidentDetail = incidentDetail()) => {
    signInAs(staff, { id: 'me-1' });
    listResponses.set('safety/incidents', [incident({ status: inc.status })]);
    apiResponses.set(`safety/incidents/${inc.id}`, inc);
    const user = userEvent.setup();
    renderWithToasts(<IncidentsPage />);
    await user.click(screen.getByRole('button', { name: /Open Self-harm risk incident/ }));
    await screen.findByRole('dialog', { name: 'Self-harm risk' });
    return user;
  };

  it('shows the log in order, with who did each thing', async () => {
    await openDrawer(['safety.incidents.read']);
    const items = within(screen.getByRole('dialog')).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Opened');
    expect(items[1]).toHaveTextContent('Called the number on file; no answer.');
    expect(items[1]).toHaveTextContent('Mina Moderator');
    // Nobody can edit it, and a reader cannot add to it.
    expect(screen.queryByLabelText('Add to the log')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Resolve' })).not.toBeInTheDocument();
  });

  it('adds to the log', async () => {
    mockApi.post.mockResolvedValueOnce({ data: incidentDetail() });
    const user = await openDrawer(['safety.incidents.read', 'safety.incidents.write']);
    await user.type(screen.getByLabelText('Add to the log'), 'Spoke with the family.');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('safety/incidents/i1/notes', { note: 'Spoke with the family.' }),
    );
  });

  it('records an escalation only for those who may, saying that BLOCKS contacts nobody', async () => {
    const plain = await openDrawer(['safety.incidents.read', 'safety.incidents.write']);
    expect(screen.queryByRole('button', { name: 'Record escalation' })).not.toBeInTheDocument();
    void plain;
  });

  it('records who was told outside the platform', async () => {
    mockApi.post.mockResolvedValueOnce({ data: incidentDetail({ status: 'ESCALATED' }) });
    const user = await openDrawer(['safety.incidents.read', 'safety.incidents.write', 'reports.escalate']);
    await user.click(screen.getByRole('button', { name: 'Record escalation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record an escalation' });
    expect(within(dialog).getByText(/does not contact anyone for you/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Record escalation' }));
    expect(await within(dialog).findByText('Say who was told.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Who was told'), 'iCall helpline, phone, ref 8812');
    await user.click(within(dialog).getByRole('button', { name: 'Record escalation' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('safety/incidents/i1/escalate', {
        escalatedTo: 'iCall helpline, phone, ref 8812',
      }),
    );
  });

  it('resolves with what was done, sent as the action taken', async () => {
    mockApi.post.mockResolvedValueOnce({ data: incidentDetail({ status: 'RESOLVED' }) });
    const user = await openDrawer(['safety.incidents.read', 'safety.incidents.write']);
    await user.click(screen.getByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Resolve this incident' });
    await user.type(within(dialog).getByLabelText('What was done'), 'Helpline reached the family; safe.');
    await user.click(within(dialog).getByRole('button', { name: 'Resolve' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('safety/incidents/i1/resolve', {
        actionTaken: 'Helpline reached the family; safe.',
      }),
    );
  });

  it('reopens a resolved incident only for seniors', async () => {
    const resolved = incidentDetail({ status: 'RESOLVED', resolvedAt: new Date().toISOString(), actionTaken: 'Done' });
    await openDrawer(['safety.incidents.read', 'safety.incidents.write'], resolved);
    expect(screen.queryByRole('button', { name: 'Reopen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Add to the log')).not.toBeInTheDocument();
  });

  it('offers to take an incident that someone else owns', async () => {
    mockApi.post.mockResolvedValueOnce({ data: incidentDetail() });
    const user = await openDrawer(['safety.incidents.read', 'safety.incidents.write']);
    await user.click(screen.getByRole('button', { name: 'Take this incident' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('safety/incidents/i1/assign', {}));
  });

  it('shows the API’s reason when it refuses', async () => {
    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Someone else is looking after this incident.'));
    const user = await openDrawer(['safety.incidents.read', 'safety.incidents.write']);
    await user.click(screen.getByRole('button', { name: 'Take this incident' }));
    expect(await screen.findByText('Someone else is looking after this incident.')).toBeInTheDocument();
  });
});

// ====================================================================== live ==

const session = (over: Partial<LiveSessionCard> = {}): LiveSessionCard => ({
  id: 'l1',
  title: 'Friday night chat',
  status: 'LIVE',
  host: { id: 'u1', username: 'asha_k', status: 'ACTIVE' },
  startedAt: new Date(Date.now() - 1_200_000).toISOString(),
  endedAt: null,
  peakViewers: 1200,
  riskFlags: { signals: ['rapid_reports'] },
  terminatedBy: null,
  terminationReason: null,
  createdAt: new Date(Date.now() - 1_800_000).toISOString(),
  openReports: 2,
  openIncidents: 0,
  ...over,
});

describe('live monitoring', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<LivePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to live sessions');
  });

  it('says plainly that there is no live service, and so nothing to show', () => {
    signInAs(['live.read']);
    renderWithToasts(<LivePage />);
    expect(screen.getByRole('note')).toHaveTextContent('BLOCKS does not stream live video yet');
    expect(screen.getByText('Nothing is live')).toBeInTheDocument();
    expect(
      screen.getByText('There is no live service connected, so there are no sessions to show.'),
    ).toBeInTheDocument();
  });

  it('lists sessions with their viewers, reports and risk signals', () => {
    signInAs(['live.read']);
    listResponses.set('live/sessions', [
      session(),
      session({ id: 'l2', title: 'Quiet one', openReports: 0, riskFlags: null, peakViewers: 3 }),
    ]);
    renderWithToasts(<LivePage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Friday night chat')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('2 report(s)')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Rapid reports')).toBeInTheDocument();
    expect(within(rows[0]!).getAllByText('Live now').length).toBeGreaterThan(0);
    expect(within(rows[1]!).getByText('None')).toBeInTheDocument();
  });

  it('only offers to end a session to someone who may', () => {
    signInAs(['live.read']);
    listResponses.set('live/sessions', [session()]);
    const view = renderWithToasts(<LivePage />);
    expect(screen.queryByRole('button', { name: /End Friday night chat/ })).not.toBeInTheDocument();
    view.unmount();
    resetMocks();
    signInAs(['live.read', 'live.terminate']);
    listResponses.set('live/sessions', [
      session(),
      session({ id: 'l3', status: 'ENDED', endedAt: new Date().toISOString() }),
    ]);
    renderWithToasts(<LivePage />);
    // Not for one that has already ended.
    expect(screen.getAllByRole('button', { name: /End / })).toHaveLength(1);
  });

  it('shows the past view with who ended it and why', async () => {
    signInAs(['live.read']);
    const user = userEvent.setup();
    listResponses.set('live/sessions', [
      session({
        status: 'TERMINATED',
        endedAt: new Date().toISOString(),
        terminatedBy: { id: 's', name: 'Sena Senior' },
        terminationReason: 'Threats on screen',
      }),
    ]);
    renderWithToasts(<LivePage />);
    await user.click(screen.getByRole('tab', { name: 'Past' }));
    expect(listCalls.at(-1)!.params).toEqual({ scope: 'past' });
    expect(screen.getByText(/Ended by Sena Senior: Threats on screen/)).toBeInTheDocument();
  });

  const endIt = async () => {
    signInAs(['live.read', 'live.terminate']);
    apiResponses.set('moderation/rules', {
      rules: [
        { code: 'violence_threats', title: 'Violence and threats', summary: '', categories: [] },
        { code: 'no_violation', title: 'No violation found', summary: '', categories: [] },
      ],
    });
    listResponses.set('live/sessions', [session()]);
    const user = userEvent.setup();
    renderWithToasts(<LivePage />);
    await user.click(screen.getByRole('button', { name: /End Friday night chat/ }));
    const dialog = await screen.findByRole('dialog', { name: 'End this live session now' });
    return { user, dialog };
  };

  it('asks why and under which rule, and never offers "no violation"', async () => {
    const { user, dialog } = await endIt();
    expect(within(dialog).getByText(/cuts it immediately and cannot be undone/)).toBeInTheDocument();
    const options = within(within(dialog).getByLabelText('Rule'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Choose a rule…', 'Violence and threats']);
    await user.click(within(dialog).getByRole('button', { name: 'End session now' }));
    expect(await within(dialog).findByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(await within(dialog).findByText('Choose the rule.')).toBeInTheDocument();
    expect(mockApi.post).not.toHaveBeenCalled();
  });

  it('ends the session, and can open an incident in the same step', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { providerConfirmed: true } });
    const { user, dialog } = await endIt();
    await user.type(within(dialog).getByLabelText('Why is it being ended?'), 'Threatening someone on screen');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'violence_threats');
    await user.click(within(dialog).getByLabelText(/Also open a safety incident/));
    await user.click(within(dialog).getByRole('button', { name: 'End session now' }));
    expect(await within(dialog).findByText('Write at least 10 characters.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('What happened'), 'Host threatened a named person.');
    await user.click(within(dialog).getByRole('button', { name: 'End session now' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('live/sessions/l1/terminate', {
        reason: 'Threatening someone on screen',
        policyReason: 'violence_threats',
        incident: { type: 'VIOLENCE', summary: 'Host threatened a named person.' },
      }),
    );
    expect(await screen.findByText('Session ended')).toBeInTheDocument();
  });

  it('warns when the live service did not confirm it stopped', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { providerConfirmed: false } });
    const { user, dialog } = await endIt();
    await user.type(within(dialog).getByLabelText('Why is it being ended?'), 'Emergency stop by the safety lead');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'violence_threats');
    await user.click(within(dialog).getByRole('button', { name: 'End session now' }));
    expect(await screen.findByText(/did not confirm it stopped. Cut the stream at the source too/)).toBeInTheDocument();
  });

  it('keeps the dialog open when the API refuses', async () => {
    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'This session has already ended.'));
    const { user, dialog } = await endIt();
    await user.type(within(dialog).getByLabelText('Why is it being ended?'), 'Threatening someone on screen');
    await user.selectOptions(within(dialog).getByLabelText('Rule'), 'violence_threats');
    await user.click(within(dialog).getByRole('button', { name: 'End session now' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This session has already ended.');
  });
});

// =================================================================== policy ==

const policy = (over: Partial<PolicyView> = {}): PolicyView => ({
  policyVersion: 'draft-2026-10',
  version: 3,
  updatedAt: '2026-10-08T10:00:00Z',
  rules: [{ code: 'spam', title: 'Spam', summary: 'Repetitive, unsolicited promotion.', categories: ['SPAM'] }],
  categories: [
    {
      category: 'SPAM',
      severity: 'LOW',
      slaHours: 72,
      autoHoldAt: 0,
      default: { severity: 'LOW', slaHours: 72, autoHoldAt: 0 },
      isDefault: true,
      floor: null,
    },
    {
      category: 'CHILD_SAFETY',
      severity: 'CRITICAL',
      slaHours: 1,
      autoHoldAt: 1,
      default: { severity: 'CRITICAL', slaHours: 1, autoHoldAt: 1 },
      isDefault: false,
      floor: { minSeverity: 'HIGH', maxSlaHours: 24 },
    },
  ],
  limits: { reportsPerDay: 30, appealWindowDays: 30, appealSlaHours: 72 },
  ...over,
});

describe('policy configuration', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<PolicyPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to the moderation policy');
  });

  it('shows how each kind of report is handled, the rules and the limits, read-only without policy.update', () => {
    signInAs(['policy.read']);
    apiResponses.set('policy', policy());
    renderWithToasts(<PolicyPage />);
    expect(screen.getByText('Version draft-2026-10')).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    const spam = rows.find((r) => within(r).queryByText('Spam') && within(r).queryByText('3 days'));
    expect(spam).toBeTruthy();
    expect(screen.getByText('Never')).toBeInTheDocument();
    expect(screen.getByText('1 person')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('Repetitive, unsolicited promotion.')).toBeInTheDocument();
    expect(screen.getByText('Reports one person can make a day').nextSibling).toHaveTextContent('30');
    expect(screen.getByRole('link', { name: 'settings page' })).toHaveAttribute('href', '/settings');
    expect(screen.queryByRole('button', { name: /^Edit / })).not.toBeInTheDocument();
  });

  it('says the rule wording is a draft pending legal review', () => {
    signInAs(['policy.read']);
    apiResponses.set('policy', policy());
    renderWithToasts(<PolicyPage />);
    expect(screen.getByText(/draft pending legal review/)).toBeInTheDocument();
  });

  const edit = async (name: RegExp) => {
    signInAs(['policy.read', 'policy.update']);
    apiResponses.set('policy', policy());
    const user = userEvent.setup();
    renderWithToasts(<PolicyPage />);
    await user.click(screen.getByRole('button', { name }));
    const dialog = await screen.findByRole('dialog');
    return { user, dialog };
  };

  it('validates before sending, and says what the floor is', async () => {
    const { user, dialog } = await edit(/Edit Child safety/);
    expect(within(dialog).getByText('Cannot be set below high.')).toBeInTheDocument();
    expect(within(dialog).getByText('Cannot be slower than 24 hours.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Answer within (hours)'));
    await user.type(within(dialog).getByLabelText('Answer within (hours)'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('At least 1 hour.')).toBeInTheDocument();
    expect(await within(dialog).findByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it('saves with the version it loaded, so a stale edit is refused', async () => {
    mockApi.put.mockResolvedValueOnce({ data: policy({ version: 4 }) });
    const { user, dialog } = await edit(/Edit Spam/);
    await user.selectOptions(within(dialog).getByLabelText('Severity'), 'MEDIUM');
    await user.clear(within(dialog).getByLabelText('Answer within (hours)'));
    await user.type(within(dialog).getByLabelText('Answer within (hours)'), '48');
    await user.clear(within(dialog).getByLabelText(/Hide after this many different people/));
    await user.type(within(dialog).getByLabelText(/Hide after this many different people/), '5');
    await user.type(within(dialog).getByLabelText('Reason for the change'), 'Spam waves this month');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('policy/categories/SPAM', {
        severity: 'MEDIUM',
        slaHours: 48,
        autoHoldAt: 5,
        reason: 'Spam waves this month',
        expectedVersion: 3,
      }),
    );
    expect(await screen.findByText('Policy updated')).toBeInTheDocument();
  });

  it('shows the API’s floor message next to the field it is about', async () => {
    mockApi.put.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_FAILED', 'Some fields are not valid.', {
        details: [{ field: 'severity', reasons: ['at_least_high'] }],
      }),
    );
    const { user, dialog } = await edit(/Edit Child safety/);
    await user.selectOptions(within(dialog).getByLabelText('Severity'), 'LOW');
    await user.type(within(dialog).getByLabelText('Reason for the change'), 'Trying to make this quieter');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findAllByText('Cannot be set below High.')).not.toHaveLength(0);
  });

  it('says when someone else changed the policy first', async () => {
    mockApi.put.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'The policy was changed by someone else. Reload it and try again.'),
    );
    const { user, dialog } = await edit(/Edit Spam/);
    await user.type(within(dialog).getByLabelText('Reason for the change'), 'Relaxing spam handling');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('changed by someone else');
  });
});
