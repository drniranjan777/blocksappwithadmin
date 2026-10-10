import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdvertisersPage } from '@/components/business/advertisers-page';
import { CampaignsPage } from '@/components/business/campaigns-page';
import { PagesPage } from '@/components/business/pages-page';
import { VerificationPage } from '@/components/business/verification-page';
import { ApiError } from '@/lib/client/api';
import type {
  AdvertiserRow,
  BusinessPageCard,
  BusinessPageDetail,
  CampaignCard,
  CampaignDetail,
  VerificationCard,
  VerificationDetail,
} from '@/lib/types';
import { apiResponses, listCalls, listResponses, mockApi, resetMocks, signInAs } from './mocks';
import { renderWithToasts } from './render';

vi.mock('@/lib/client/session', async () => (await import('./mocks')).sessionMock);
vi.mock('@/lib/client/use-api', async () => (await import('./mocks')).hooksMock);
vi.mock('@/lib/client/api', async () => ({
  ...(await vi.importActual<typeof import('@/lib/client/api')>('@/lib/client/api')),
  api: (await import('./mocks')).mockApi,
}));

beforeEach(() => resetMocks());

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

// =================================================================== pages ==

const pageCard = (over: Partial<BusinessPageCard> = {}): BusinessPageCard => ({
  id: 'p1',
  slug: 'rajus-chai',
  name: "Raju's Chai",
  category: 'Food and restaurants',
  status: 'ACTIVE',
  statusReason: null,
  verification: 'NONE',
  owner: { id: 'u1', username: 'raju', status: 'ACTIVE' },
  followers: 1234,
  location: { state: 'Telangana', district: 'Hyderabad' },
  createdAt: ago(48),
  ...over,
});

const pageDetail = (over: Partial<BusinessPageDetail> = {}): BusinessPageDetail => ({
  ...pageCard(),
  description: 'Fresh tea and snacks, made the way your grandmother would.',
  contactEmail: 'raju@example.com',
  websiteUrl: 'https://rajuschai.example',
  city: null,
  gstinLast4: null,
  statusChangedAt: null,
  counts: { posts: 4, offers: 1 },
  campaigns: { ACTIVE: 1, IN_REVIEW: 2 },
  verificationRequests: [{ id: 'v1', type: 'BUSINESS', status: 'PENDING', submittedAt: ago(5) }],
  ownerReportsAgainst: 0,
  ...over,
});

describe('business pages', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<PagesPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to business pages');
  });

  it('lists pages with their standing', () => {
    signInAs(['business.read']);
    listResponses.set('business/pages', [
      pageCard(),
      pageCard({ id: 'p2', name: 'Fake Brand', status: 'SUSPENDED', verification: 'APPROVED' }),
    ]);
    renderWithToasts(<PagesPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText("Raju's Chai")).toBeInTheDocument();
    expect(within(rows[0]!).getByText('/rajus-chai · Food and restaurants')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('@raju')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('1,234')).toBeInTheDocument();
    expect(within(rows[1]!).getAllByText('Suspended').length).toBeGreaterThan(0);
    expect(within(rows[1]!).getByText('Verified')).toBeInTheDocument();
  });

  it('sends the search and filters', async () => {
    signInAs(['business.read']);
    const user = userEvent.setup();
    renderWithToasts(<PagesPage />);
    await user.selectOptions(screen.getByLabelText('Status'), 'SUSPENDED');
    await user.selectOptions(screen.getByLabelText('Verification'), 'PENDING');
    expect(listCalls.at(-1)!.params).toMatchObject({ status: 'SUSPENDED', verification: 'PENDING' });
  });

  const open = async (staff: string[], page: BusinessPageDetail = pageDetail()) => {
    signInAs(staff);
    listResponses.set('business/pages', [pageCard({ status: page.status })]);
    apiResponses.set(`business/pages/${page.id}`, page);
    const user = userEvent.setup();
    renderWithToasts(<PagesPage />);
    await user.click(screen.getByRole('button', { name: /^Open Raju/ }));
    await screen.findByRole('dialog', { name: "Raju's Chai" });
    return user;
  };

  it('shows the page, its campaigns and its verification history', async () => {
    await open(['business.read']);
    expect(screen.getByText(/Fresh tea and snacks/)).toBeInTheDocument();
    expect(screen.getByText('Running: 1')).toBeInTheDocument();
    expect(screen.getByText('Waiting for review: 2')).toBeInTheDocument();
    expect(screen.getByText(/Business badge/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Suspend this page/ })).not.toBeInTheDocument();
  });

  it('says a registration number is not checked against the register', async () => {
    await open(['business.read'], pageDetail({ gstinLast4: '1ZVZ' }));
    expect(screen.getByText(/not checked against the register/)).toBeInTheDocument();
  });

  it('suspends with a reason the owner is told', async () => {
    mockApi.post.mockResolvedValueOnce({ data: pageDetail({ status: 'SUSPENDED' }) });
    const user = await open(['business.read', 'business.manage']);
    await user.click(screen.getByRole('button', { name: 'Suspend this page' }));
    const dialog = await screen.findByRole('dialog', { name: 'Suspend this page' });
    expect(within(dialog).getByText(/Shown to the owner/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Reason'), 'Impersonating another brand');
    await user.click(within(dialog).getByRole('button', { name: 'Suspend' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('business/pages/p1/suspend', { reason: 'Impersonating another brand' }),
    );
  });

  it('offers to restore a suspended page, and shows why it was suspended', async () => {
    mockApi.post.mockResolvedValueOnce({ data: pageDetail() });
    const user = await open(
      ['business.read', 'business.manage'],
      pageDetail({ status: 'SUSPENDED', statusReason: 'Impersonating another brand' }),
    );
    expect(screen.getByText('Suspended: Impersonating another brand')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend this page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore this page' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore this page' });
    await user.type(within(dialog).getByLabelText('Reason'), 'Owner proved they own the brand');
    await user.click(within(dialog).getByRole('button', { name: 'Restore' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('business/pages/p1/restore', {
        reason: 'Owner proved they own the brand',
      }),
    );
  });

  it('offers neither for a draft', async () => {
    await open(['business.read', 'business.manage'], pageDetail({ status: 'DRAFT' }));
    expect(screen.queryByRole('button', { name: /Suspend|Restore/ })).not.toBeInTheDocument();
  });
});

// ============================================================== verification ==

const requestCard = (over: Partial<VerificationCard> = {}): VerificationCard => ({
  id: 'v1',
  type: 'BUSINESS',
  status: 'PENDING',
  user: { id: 'u1', username: 'raju', status: 'ACTIVE' },
  page: { id: 'p1', slug: 'rajus-chai', name: "Raju's Chai" },
  submittedAt: ago(5),
  reviewedBy: null,
  reviewedAt: null,
  ...over,
});

const requestDetail = (over: Partial<VerificationDetail> = {}): VerificationDetail => ({
  ...requestCard(),
  note: 'We are at Gupta Chowk.',
  decisionNote: null,
  evidence: {
    identity: null,
    page: {
      status: 'ACTIVE',
      category: 'Food and restaurants',
      description: 'Tea',
      websiteUrl: 'https://rajuschai.example',
      contactEmail: 'raju@example.com',
      followersCount: 900,
      verificationStatus: 'PENDING',
      gstinLast4: '1ZVX',
      gstinChecked: 'Format and check character only. Not checked against the register.',
    },
    account: { reportsAgainst: 2, badge: 'NONE', followers: 50, posts: 10 },
  },
  earlier: [{ id: 'v0', type: 'PUBLISHER', status: 'REJECTED', submittedAt: ago(500) }],
  ...over,
});

describe('business verification', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<VerificationPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to verification requests');
  });

  it('lists waiting requests and asks for the other views when chosen', async () => {
    signInAs(['business.read']);
    listResponses.set('business/verification', [
      requestCard(),
      requestCard({ id: 'v2', type: 'IDENTITY', page: null }),
    ]);
    const user = userEvent.setup();
    renderWithToasts(<VerificationPage />);
    expect(listCalls.at(-1)!.params).toMatchObject({ status: 'PENDING' });
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Business badge')).toBeInTheDocument();
    expect(within(rows[0]!).getByText("Raju's Chai")).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Identity badge')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Granted' }));
    expect(listCalls.at(-1)!.params).toMatchObject({ status: 'APPROVED' });
    await user.selectOptions(screen.getByLabelText('Kind of badge'), 'PUBLISHER');
    expect(listCalls.at(-1)!.params).toMatchObject({ status: 'APPROVED', type: 'PUBLISHER' });
  });

  const open = async (staff: string[], detail: VerificationDetail = requestDetail()) => {
    signInAs(staff);
    listResponses.set('business/verification', [requestCard({ status: detail.status })]);
    apiResponses.set(`business/verification/${detail.id}`, detail);
    const user = userEvent.setup();
    renderWithToasts(<VerificationPage />);
    await user.click(screen.getByRole('button', { name: /Open Business badge request from raju/ }));
    await screen.findByRole('dialog', { name: 'Business badge' });
    return user;
  };

  it('shows the evidence and says plainly that nothing was checked with an authority', async () => {
    await open(['business.read']);
    expect(screen.getByText('We are at Gupta Chowk.')).toBeInTheDocument();
    expect(screen.getByText('…1ZVX')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent('Not checked against the register');
    expect(screen.getByText(/Nothing here is checked with an outside authority/)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument(); // reports against
    expect(within(screen.getByRole('dialog')).getByText(/Publisher badge/)).toBeInTheDocument(); // earlier request
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('grants with a note the person can read', async () => {
    mockApi.post.mockResolvedValueOnce({ data: requestDetail({ status: 'APPROVED' }) });
    const user = await open(['business.read', 'business.verify']);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant this badge' });
    expect(within(dialog).getByText(/They can read this/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Note to the person'), 'Registration confirmed by phone.');
    await user.click(within(dialog).getByRole('button', { name: 'Grant badge' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('business/verification/v1/decision', {
        decision: 'APPROVE',
        note: 'Registration confirmed by phone.',
      }),
    );
  });

  it('refuses, saying what is wrong', async () => {
    mockApi.post.mockResolvedValueOnce({ data: requestDetail({ status: 'REJECTED' }) });
    const user = await open(['business.read', 'business.verify']);
    await user.click(screen.getByRole('button', { name: 'Refuse' }));
    const dialog = await screen.findByRole('dialog', { name: 'Refuse this request' });
    await user.type(within(dialog).getByLabelText('Note to the person'), 'The name does not match the registration.');
    await user.click(within(dialog).getByRole('button', { name: 'Refuse' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('business/verification/v1/decision', {
        decision: 'REJECT',
        note: 'The name does not match the registration.',
      }),
    );
  });

  it('shows the API’s reason when it cannot grant', async () => {
    mockApi.post.mockRejectedValueOnce(
      new ApiError(409, 'CONFLICT', 'The page is no longer published, so it cannot be verified.'),
    );
    const user = await open(['business.read', 'business.verify']);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Grant this badge' });
    await user.type(within(dialog).getByLabelText('Note to the person'), 'All in order, granting it.');
    await user.click(within(dialog).getByRole('button', { name: 'Grant badge' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('no longer published');
  });

  it('takes a granted badge back as its own step', async () => {
    mockApi.post.mockResolvedValueOnce({ data: requestDetail({ status: 'REJECTED' }) });
    const user = await open(
      ['business.read', 'business.verify'],
      requestDetail({
        status: 'APPROVED',
        decisionNote: 'Registration confirmed.',
        reviewedBy: { id: 's', name: 'Bina Business' },
        reviewedAt: ago(1),
      }),
    );
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByText('Registration confirmed.')).toBeInTheDocument();
    expect(screen.getByText('The person can read this note.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Take the badge back' }));
    const dialog = await screen.findByRole('dialog', { name: 'Take the badge back' });
    await user.type(within(dialog).getByLabelText('Reason'), 'It turned out to be a scam');
    await user.click(within(dialog).getByRole('button', { name: 'Take it back' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('business/verification/v1/revoke', {
        reason: 'It turned out to be a scam',
      }),
    );
  });
});

// ================================================================== campaigns ==

const campaignCard = (over: Partial<CampaignCard> = {}): CampaignCard => ({
  id: 'c1',
  name: 'Monsoon sale',
  objective: 'TRAFFIC',
  status: 'IN_REVIEW',
  advertiser: { id: 'u1', username: 'raju', status: 'ACTIVE' },
  page: { id: 'p1', slug: 'rajus-chai', name: "Raju's Chai" },
  budget: '2000.00',
  spent: '0.00',
  startsAt: ahead(3),
  endsAt: ahead(120),
  submittedAt: ago(7),
  waitingHours: 7,
  billingStatus: 'NOT_CONFIGURED',
  flags: { linkShortener: true, destinationHost: 'bit.ly', newAccount: true, audienceAtLeast: 400 },
  ...over,
});

const campaignDetail = (over: Partial<CampaignDetail> = {}): CampaignDetail => ({
  ...campaignCard(),
  dailyBudget: '500.00',
  currency: 'INR',
  targeting: { countries: ['IN'], states: ['Telangana'], districts: ['Hyderabad'], ageBands: ['25-34'] },
  audience: { exact: 463 },
  creative: {
    headline: 'Monsoon sale at Raju’s',
    body: 'Warm tea for rainy days.',
    destinationUrl: 'https://bit.ly/monsoon',
  },
  boost: null,
  pausedBy: null,
  reviewNote: null,
  reviewedBy: null,
  reviewedAt: null,
  pageStatus: { status: 'ACTIVE', verified: false },
  billing: { status: 'NOT_CONFIGURED', reference: null, fundedAt: null },
  advertiserStanding: {
    user: { id: 'u1', username: 'raju', status: 'ACTIVE', createdAt: ago(100) },
    campaigns: { IN_REVIEW: 1, COMPLETED: 3 },
    reportsAgainst: 1,
  },
  history: [{ action: 'ads.submit', actorLabel: null, reason: null, createdAt: ago(7) }],
  ...over,
});

describe('campaigns', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<CampaignsPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to advertising campaigns');
  });

  it('lists the waiting campaigns with the advertiser, budget and how long they have waited', () => {
    signInAs(['ads.read']);
    listResponses.set('ads/campaigns', [campaignCard()]);
    renderWithToasts(<CampaignsPage />);
    expect(listCalls.at(-1)!.params).toMatchObject({ scope: 'review' });
    const row = screen.getAllByRole('row')[1]!;
    expect(within(row).getByText('Monsoon sale')).toBeInTheDocument();
    expect(within(row).getByText('Send visitors to a website')).toBeInTheDocument();
    expect(within(row).getByText('Waiting 7 h')).toBeInTheDocument();
    expect(within(row).getByText("@raju · Raju's Chai")).toBeInTheDocument();
    expect(within(row).getByText('₹2,000.00')).toBeInTheDocument();
    expect(within(row).getByText('Waiting for review')).toBeInTheDocument();
  });

  it('shows the payment filter only to those who may see payments', () => {
    signInAs(['ads.read']);
    const view = renderWithToasts(<CampaignsPage />);
    expect(screen.queryByLabelText('Payment')).not.toBeInTheDocument();
    view.unmount();
    resetMocks();
    signInAs(['ads.read', 'ads.billing.read']);
    renderWithToasts(<CampaignsPage />);
    expect(screen.getByLabelText('Payment')).toBeInTheDocument();
  });

  it('asks for everything when a filter or the other view is chosen', async () => {
    signInAs(['ads.read']);
    const user = userEvent.setup();
    renderWithToasts(<CampaignsPage />);
    await user.click(screen.getByRole('tab', { name: 'All campaigns' }));
    expect(listCalls.at(-1)!.params).toMatchObject({ scope: 'all' });
    await user.click(screen.getByRole('tab', { name: 'Waiting for review' }));
    await user.selectOptions(screen.getByLabelText('Status'), 'FLAGGED');
    expect(listCalls.at(-1)!.params).toMatchObject({ scope: 'all', status: 'FLAGGED' });
  });

  const open = async (staff: string[], detail: CampaignDetail = campaignDetail()) => {
    signInAs(staff);
    listResponses.set('ads/campaigns', [campaignCard({ status: detail.status })]);
    apiResponses.set(`ads/campaigns/${detail.id}`, detail);
    const user = userEvent.setup();
    renderWithToasts(<CampaignsPage />);
    await user.click(screen.getByRole('button', { name: 'Open Monsoon sale' }));
    await screen.findByRole('dialog', { name: 'Monsoon sale' });
    return user;
  };

  it('shows the advertisement, who it is aimed at, and what the system noticed', async () => {
    await open(['ads.read']);
    expect(screen.getByText('Monsoon sale at Raju’s')).toBeInTheDocument();
    expect(screen.getByText('Leads to https://bit.ly/monsoon')).toBeInTheDocument();
    expect(screen.getByText('25-34')).toBeInTheDocument();
    expect(screen.getByText('463')).toBeInTheDocument();
    expect(screen.getByText(/rounded down, and never who is in it/)).toBeInTheDocument();
    expect(screen.getByText('Uses a link shortener, so the real destination is hidden')).toBeInTheDocument();
    expect(screen.getByText('The advertiser’s account is under a week old')).toBeInTheDocument();
    expect(screen.getByText('Audience of at least 400')).toBeInTheDocument();
    expect(screen.getByText('Reports against them').nextSibling).toHaveTextContent('1');
    expect(screen.getByText('Submit')).toBeInTheDocument(); // the history
    // Reading is not deciding.
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('hides payment details from those who may not see them', async () => {
    await open(['ads.read'], campaignDetail({ billing: null, billingStatus: undefined }));
    expect(screen.queryByText('Payment')).not.toBeInTheDocument();
  });

  it('shows payment details to those who may', async () => {
    await open(
      ['ads.read', 'ads.billing.read'],
      campaignDetail({ billingStatus: 'PAID', billing: { status: 'PAID', reference: 'pay_123', fundedAt: ago(1) } }),
    );
    expect(screen.getByText('pay_123')).toBeInTheDocument();
  });

  it('approves after a checklist', async () => {
    mockApi.post.mockResolvedValueOnce({ data: campaignDetail({ status: 'APPROVED' }) });
    const user = await open(['ads.read', 'ads.manage']);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this campaign' });
    expect(within(dialog).getByText(/not so small it could point at one person/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(mockApi.post).toHaveBeenCalledWith('ads/campaigns/c1/approve', {}));
    expect(await screen.findByText('Campaign approved')).toBeInTheDocument();
  });

  it('keeps the dialog open and says why when approving is refused', async () => {
    mockApi.post.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Its page is not published.'));
    const user = await open(['ads.read', 'ads.manage']);
    await user.click(screen.getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this campaign' });
    await user.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Its page is not published.');
  });

  it('turns it down with a note the advertiser reads', async () => {
    mockApi.post.mockResolvedValueOnce({ data: campaignDetail({ status: 'REJECTED' }) });
    const user = await open(['ads.read', 'ads.manage']);
    await user.click(screen.getByRole('button', { name: 'Turn down' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn this campaign down' });
    expect(within(dialog).getByText(/Shown to the advertiser/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Note'), 'The headline promises results we cannot allow.');
    await user.click(within(dialog).getByRole('button', { name: 'Turn down' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('ads/campaigns/c1/reject', {
        note: 'The headline promises results we cannot allow.',
      }),
    );
  });

  it('offers only what fits where the campaign is', async () => {
    const buttons = () => screen.getAllByRole('button').map((b) => b.textContent);
    await open(['ads.read', 'ads.manage'], campaignDetail({ status: 'ACTIVE' }));
    expect(buttons()).toEqual(expect.arrayContaining(['Pause', 'Flag and stop']));
    expect(buttons()).not.toContain('Approve');
    expect(buttons()).not.toContain('Resume');
  });

  it('offers to clear a flag, and to resume a paused one', async () => {
    mockApi.post.mockResolvedValueOnce({ data: campaignDetail({ status: 'PAUSED' }) });
    const user = await open(
      ['ads.read', 'ads.manage'],
      campaignDetail({ status: 'FLAGGED', reviewNote: 'The offer is misleading.' }),
    );
    expect(screen.getByText('Note to the advertiser: The offer is misleading.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear flag' }));
    const dialog = await screen.findByRole('dialog', { name: 'Clear the flag' });
    await user.type(within(dialog).getByLabelText('Note'), 'Advertiser fixed the wording.');
    await user.click(within(dialog).getByRole('button', { name: 'Clear flag' }));
    await waitFor(() =>
      expect(mockApi.post).toHaveBeenCalledWith('ads/campaigns/c1/clear-flag', {
        note: 'Advertiser fixed the wording.',
      }),
    );
  });

  it('shows who paused a campaign', async () => {
    await open(
      ['ads.read', 'ads.manage'],
      campaignDetail({ status: 'PAUSED', pausedBy: 'STAFF', reviewNote: 'Under investigation.' }),
    );
    expect(screen.getByText('Paused by staff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  });

  it('shows what is promoted, and says when it is gone', async () => {
    await open(
      ['ads.read'],
      campaignDetail({
        objective: 'BOOST_CONTENT',
        boost: {
          type: 'POST',
          id: 'post1',
          available: false,
          state: 'REMOVED',
          owner: null,
          excerpt: null,
          details: {},
        },
      }),
    );
    expect(screen.getByText('Promotes a post')).toBeInTheDocument();
    expect(screen.getByText('It is no longer available.')).toBeInTheDocument();
  });
});

// ================================================================= advertisers ==

describe('advertisers', () => {
  it('tells someone without access that they have none', () => {
    signInAs(['audit.read']);
    renderWithToasts(<AdvertisersPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('You do not have access to advertisers');
  });

  it('lists who advertises with totals, and nothing about audiences', () => {
    signInAs(['ads.read']);
    const row: AdvertiserRow = {
      id: 'u1',
      username: 'raju',
      displayName: 'Raju Gupta',
      status: 'ACTIVE',
      campaigns: { ACTIVE: 1, IN_REVIEW: 2 },
      total: 3,
      committed: '12500.00',
      spent: '1500.50',
      since: ago(100),
    };
    listResponses.set('ads/advertisers', [
      row,
      { ...row, id: 'u2', username: 'banned', displayName: 'Bad Actor', status: 'SUSPENDED' },
    ]);
    renderWithToasts(<AdvertisersPage />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]!).getByText('Raju Gupta')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('₹12,500.00')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('₹1,500.50')).toBeInTheDocument();
    expect(within(rows[0]!).getByText('Running 1')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Suspended')).toBeInTheDocument();
  });

  it('searches by username', async () => {
    signInAs(['ads.read']);
    const user = userEvent.setup();
    renderWithToasts(<AdvertisersPage />);
    await user.type(screen.getByLabelText('Search advertisers'), 'raju');
    await waitFor(() => expect(listCalls.at(-1)!.params).toMatchObject({ q: 'raju' }));
  });
});
