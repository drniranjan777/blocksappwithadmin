import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage, fromEditable, showValue } from '@/components/settings/settings-page';
import { describeError } from '@/components/ui/states';
import { ApiError } from '@/lib/client/api';
import type { SettingRow } from '@/lib/types';
import { apiResponses, mockApi, resetMocks, signInAs } from './mocks';
import { renderWithToasts } from './render';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

const row = (over: Partial<SettingRow>): SettingRow => ({
  key: 'stories.ttl_hours',
  label: 'Story lifetime (hours)',
  description: 'How long a story stays up.',
  group: 'Stories',
  value: 24,
  default: 24,
  isDefault: true,
  version: 0,
  updatedAt: null,
  ...over,
});

const SETTINGS: SettingRow[] = [
  row({}),
  row({
    key: 'payouts.min_amount',
    label: 'Smallest payout (₹)',
    group: 'Payouts',
    value: '100.00',
    default: '100.00',
  }),
  row({
    key: 'payouts.daily_limit',
    label: 'Daily payout limit (₹)',
    group: 'Payouts',
    value: '100000.00',
    default: '100000.00',
    isDefault: false,
    version: 2,
    updatedAt: '2026-10-09T10:00:00Z',
  }),
  row({
    key: 'moderation.blocked_terms',
    label: 'Blocked terms',
    group: 'Moderation',
    value: ['spam', 'scam'],
    default: [],
    isDefault: false,
  }),
];

beforeEach(() => resetMocks());

describe('how a setting reads', () => {
  it('writes amounts as rupees, lists as a count, and numbers as numbers', () => {
    expect(showValue(SETTINGS[1]!)).toBe('₹100.00');
    expect(showValue(SETTINGS[2]!)).toBe('₹1,00,000.00');
    expect(showValue(SETTINGS[3]!)).toBe('2 entries');
    expect(showValue(row({ key: 'moderation.blocked_terms', value: [], default: [] }))).toBe('None');
    expect(showValue(row({ key: 'moderation.blocked_terms', value: ['one'], default: [] }))).toBe('1 entry');
    expect(showValue(SETTINGS[0]!)).toBe('24');
  });
});

describe('what a person types becomes what the API expects', () => {
  it('splits a list on lines and drops blanks', () => {
    expect(fromEditable('list', ' spam \n\n scam \n')).toEqual(['spam', 'scam']);
    expect(fromEditable('list', '')).toEqual([]);
  });

  it('turns a number into a number, and blank into something the form can refuse', () => {
    expect(fromEditable('number', '12')).toBe(12);
    expect(fromEditable('number', '')).toBeNaN();
  });

  it('keeps an amount as text, so no rupee is ever lost to rounding', () => {
    expect(fromEditable('text', ' 250.00 ')).toBe('250.00');
  });
});

describe('the settings page', () => {
  const open = (permissions: string[]) => {
    signInAs(permissions);
    apiResponses.set('settings', SETTINGS);
    renderWithToasts(<SettingsPage />);
    return userEvent.setup();
  };

  it('lists the settings by group, marking the ones that are still at their default', () => {
    open(['settings.read']);
    expect(screen.getByText('Moderation')).toBeInTheDocument();
    expect(screen.getByText('Payouts')).toBeInTheDocument();
    expect(screen.getAllByText('Default')).toHaveLength(2);
    expect(screen.getByText('₹1,00,000.00')).toBeInTheDocument();
  });

  it('offers no way to change anything to someone who may only look', () => {
    open(['settings.read']);
    expect(screen.queryByRole('button', { name: /^Change/ })).not.toBeInTheDocument();
  });

  it('shows no access to anyone else', () => {
    signInAs(['users.read']);
    renderWithToasts(<SettingsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to settings');
  });

  it('asks for a reason, and sends the new value in the shape the API wants', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    const user = open(['settings.read', 'settings.update']);
    await user.click(screen.getByRole('button', { name: 'Change Story lifetime (hours)' }));
    const value = await screen.findByLabelText('Story lifetime (hours)');
    await user.clear(value);
    await user.type(value, '12');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Give a reason of at least 10 characters.')).toBeInTheDocument();
    expect(mockApi.put).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Reason'), 'Shorter stories as an experiment');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('settings/stories.ttl_hours', {
        value: 12,
        reason: 'Shorter stories as an experiment',
      }),
    );
  });

  it('edits a list one entry per line', async () => {
    mockApi.put.mockResolvedValueOnce({ data: {} });
    const user = open(['settings.read', 'settings.update']);
    await user.click(screen.getByRole('button', { name: 'Change Blocked terms' }));
    const box = await screen.findByLabelText('Blocked terms');
    expect(box).toHaveValue('spam\nscam');
    await user.type(box, '\nphishing');
    await user.type(screen.getByLabelText('Reason'), 'Adding a newly seen scam word');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(mockApi.put).toHaveBeenCalledWith('settings/moderation.blocked_terms', {
        value: ['spam', 'scam', 'phishing'],
        reason: 'Adding a newly seen scam word',
      }),
    );
  });

  it("puts the API's objection next to the value, for example when limits would contradict each other", async () => {
    mockApi.put.mockRejectedValueOnce(
      new ApiError(400, 'VALIDATION_FAILED', 'Invalid', {
        details: [{ field: 'value', reasons: ['The smallest payout cannot be more than the largest.'] }],
      }),
    );
    const user = open(['settings.read', 'settings.update']);
    await user.click(screen.getByRole('button', { name: 'Change Smallest payout (₹)' }));
    const value = await screen.findByLabelText('Smallest payout (₹)');
    await user.clear(value);
    await user.type(value, '60000.00');
    await user.type(screen.getByLabelText('Reason'), 'Raising the minimum payout a lot');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('The smallest payout cannot be more than the largest.')).toBeInTheDocument();
  });

  it('will not send a blank number', async () => {
    const user = open(['settings.read', 'settings.update']);
    await user.click(screen.getByRole('button', { name: 'Change Story lifetime (hours)' }));
    await user.clear(await screen.findByLabelText('Story lifetime (hours)'));
    await user.type(screen.getByLabelText('Reason'), 'Shorter stories as an experiment');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Enter a number.')).toBeInTheDocument();
    expect(mockApi.put).not.toHaveBeenCalled();
  });
});

describe('what a failed request says', () => {
  it("uses the API's own words for a refusal that explains itself", () => {
    expect(describeError(new ApiError(403, 'FORBIDDEN', 'Only a super admin can change a super admin.'))).toBe(
      'Only a super admin can change a super admin.',
    );
  });

  it("uses its own for the API's stock refusal", () => {
    expect(describeError(new ApiError(403, 'FORBIDDEN', 'You do not have permission to do that.'))).toBe(
      'You do not have permission to see or do this.',
    );
  });

  it('says when to try again after too many attempts', () => {
    expect(describeError(new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 30 }))).toBe(
      'Too many attempts. Try again in 30 seconds.',
    );
    expect(describeError(new ApiError(429, 'RATE_LIMITED', 'x'))).toBe('Too many attempts. Please wait a moment.');
  });

  it("passes the API's message through for anything else, and is calm about the unexpected", () => {
    expect(describeError(new ApiError(409, 'CONFLICT', 'Already done.'))).toBe('Already done.');
    expect(describeError(new Error('boom'))).toBe('Something went wrong. Please try again.');
    expect(describeError('weird')).toBe('Something went wrong. Please try again.');
  });
});
