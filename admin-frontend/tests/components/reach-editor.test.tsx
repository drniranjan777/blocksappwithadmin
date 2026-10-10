import { screen, waitFor } from '@testing-library/react';
import { renderWithToasts } from './render';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReachVersionPage } from '@/components/reach/reach-version-page';
import { ApiError } from '@/lib/client/api';
import type { ReachVersionFull } from '@/lib/types';
import { apiResponses, mockApi, resetMocks, signInAs } from './mocks';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

const config = {
  schemaVersion: 1,
  weights: {
    qualifiedViewers: 0.25,
    watchCompletion: 0.25,
    shares: 0.15,
    saves: 0.1,
    comments: 0.1,
    geoExpansion: 0.1,
    trust: 0.05,
  },
  targets: {
    qualifiedViewers: 1000,
    watchQuality: 0.6,
    sharesPer1000: 20,
    savesPer1000: 30,
    commentsPer1000: 15,
    districts: 10,
    states: 5,
    countries: 3,
    geoMix: { districts: 0.5, states: 0.3, countries: 0.2 },
    ratioFloorViewers: 100,
  },
  qualification: {
    minWatchMs: 3000,
    minWatchRatio: 0.5,
    minPostDwellMs: 2000,
    completeRatio: 0.9,
    minViewerAccountAgeHours: 24,
    requireVerifiedViewer: true,
    meaningfulCommentMinChars: 12,
  },
  fraud: {
    excludeAtOrAbove: 70,
    maxEventsPerViewerPerMinute: 60,
    maxEventsPerDevicePerMinute: 120,
    maxViewersPerDevicePerContentPerDay: 5,
    maxWatchLoops: 3,
  },
  levels: {
    district: { minQualifiedReach: 0, minScore: 0 },
    state: { minQualifiedReach: 500, minScore: 55, minDistinctDistricts: 3 },
    national: { minQualifiedReach: 5000, minScore: 70, minDistinctStates: 4 },
    global: { minQualifiedReach: 50000, minScore: 85, minDistinctCountries: 5, minInternationalViewers: 1000 },
  },
  rewards: {
    levelMultipliers: { district: 1, state: 1.5, national: 2.5, global: 4 },
    minScoreForReward: 40,
    maxCreatorShare: 0.25,
    eligibility: { minFollowers: 100, minAccountAgeDays: 30, minPublishedItems: 5, minQualifiedReach30d: 200 },
  },
};

const version = (over: Partial<ReachVersionFull> = {}): ReachVersionFull => ({
  id: 'v2',
  version: 2,
  status: 'DRAFT',
  note: 'Raise shares',
  createdBy: 'Priya',
  createdAt: '2026-10-09T12:00:00Z',
  activatedAt: null,
  config,
  changesFromActive: [],
  ...over,
});

const open = (staff: string[], v = version()) => {
  signInAs(staff);
  apiResponses.set('reach/config/versions/v2', v);
  renderWithToasts(<ReachVersionPage id="v2" />);
  return userEvent.setup();
};

beforeEach(() => resetMocks());

describe('a Reach settings draft', () => {
  it('shows every number as the person would say it: weights as percentages', () => {
    open(['reach.config.read', 'reach.config.update']);
    expect(screen.getByLabelText('Shares and reposts')).toHaveValue('15');
    expect(screen.getByLabelText('Qualified unique viewers')).toHaveValue('25');
    expect(screen.getByLabelText('D1 multiplier')).toHaveValue('1');
    expect(screen.getAllByText('Total 100%')).toHaveLength(2);
  });

  it('shows a red total as soon as the weights stop adding up, before anything is sent', async () => {
    const user = open(['reach.config.read', 'reach.config.update']);
    const shares = screen.getByLabelText('Shares and reposts');
    await user.clear(shares);
    await user.type(shares, '30');
    expect(screen.getByText('Total 115%')).toBeInTheDocument();
  });

  it('turns edited percentages back into fractions when saving', async () => {
    mockApi.put.mockResolvedValueOnce({ data: version() });
    const user = open(['reach.config.read', 'reach.config.update']);
    const trust = screen.getByLabelText('Trust and originality');
    const shares = screen.getByLabelText('Shares and reposts');
    await user.clear(trust);
    await user.type(trust, '10');
    await user.clear(shares);
    await user.type(shares, '10');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await waitFor(() => expect(mockApi.put).toHaveBeenCalled());
    const [path, body] = mockApi.put.mock.calls[0] as [string, { config: typeof config }];
    expect(path).toBe('reach/config/versions/v2');
    expect(body.config.weights.trust).toBe(0.1);
    expect(body.config.weights.shares).toBe(0.1);
    expect(body.config.weights.qualifiedViewers).toBe(0.25);
    expect(body.config.levels.state.minScore).toBe(55);
    expect(body.config.qualification.requireVerifiedViewer).toBe(true);
  });

  it('lists every problem the API found, in percentages, and keeps what was typed', async () => {
    const problems = new ApiError(400, 'VALIDATION_FAILED', 'Invalid', {
      details: [
        { field: 'weights', reasons: ['weights must add up to 1 (they add up to 1.15)'] },
        { field: 'levels.national.minScore', reasons: ['each rung must need at least the score of the one below'] },
      ],
    });
    mockApi.put.mockRejectedValueOnce(problems);
    const user = open(['reach.config.read', 'reach.config.update']);
    const shares = screen.getByLabelText('Shares and reposts');
    await user.clear(shares);
    await user.type(shares, '30');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    const alert = await screen.findByText('This draft cannot be saved yet. Fix these and save again:');
    const box = alert.closest('[role="alert"]') as HTMLElement;
    expect(box).toHaveTextContent('weights must add up to 100% (they add up to 115%)');
    expect(box).toHaveTextContent('N1 National: score');
    expect(box).toHaveTextContent('each rung must need at least the score of the one below');
    expect(shares).toHaveValue('30');
  });

  it('refuses a number that is not a number, without calling the API', async () => {
    const user = open(['reach.config.read', 'reach.config.update']);
    const reach = screen.getByLabelText('S1 State: qualified reach');
    await user.clear(reach);
    await user.type(reach, '2.5');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(await screen.findByText('Use a whole number.')).toBeInTheDocument();
    expect(mockApi.put).not.toHaveBeenCalled();
  });

  it('shows what the draft would change from what is live', () => {
    open(
      ['reach.config.read', 'reach.config.update'],
      version({ changesFromActive: [{ path: 'weights.shares', from: 0.1, to: 0.15 }] }),
    );
    expect(screen.getByText('10%')).toBeInTheDocument();
    expect(screen.getAllByText('15%').length).toBeGreaterThan(0);
  });

  it("cannot be activated by the person who drafted it: the API's own words reach the screen", async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(403, 'FORBIDDEN', 'A configuration must be activated by someone other than its author.'),
    );
    const user = open(['reach.config.read', 'reach.config.update', 'reach.config.activate']);
    await user.click(screen.getByRole('button', { name: 'Activate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Activate version 2' });
    await user.type(dialog.querySelector('textarea')!, 'Testing the four-eyes rule');
    await user.click(Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Activate')!);
    expect(
      await screen.findByText('A configuration must be activated by someone other than its author.'),
    ).toBeInTheDocument();
  });

  it('is read-only for someone who may look but not change, and has no Activate button without the permission', () => {
    open(['reach.config.read']);
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Discard draft' })).not.toBeInTheDocument();
    expect(screen.getAllByText('25%').length).toBeGreaterThan(0);
  });

  it('is never editable once it has been live', () => {
    open(
      ['reach.config.read', 'reach.config.update', 'reach.config.activate'],
      version({ status: 'ARCHIVED', activatedAt: '2026-10-01T00:00:00Z' }),
    );
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Activate' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shares and reposts')).not.toBeInTheDocument();
  });

  it('shows no access to someone without the permission', () => {
    signInAs(['users.read']);
    renderWithToasts(<ReachVersionPage id="v2" />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to the Reach engine settings');
  });
});
