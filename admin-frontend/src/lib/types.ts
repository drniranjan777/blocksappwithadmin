/** The shapes the staff API returns, for the parts of it the console shows. */

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'RESTRICTED' | 'PENDING_DELETION' | 'DELETED';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReachLevel = 'DISTRICT' | 'STATE' | 'NATIONAL' | 'GLOBAL';

export interface DayCount {
  day: string;
  count: number;
}

export interface DashboardData {
  generatedAt: string;
  users?: {
    total: number;
    active: number;
    suspended: number;
    restricted: number;
    newLast7Days: number;
    signupsPerDay: DayCount[];
  };
  content?: {
    posts: number;
    reels: number;
    activeStories: number;
    reelsBeingMade: number;
    heldForReview: { posts: number; reels: number };
  };
  reach?: {
    itemsByLevel: Record<ReachLevel, number>;
    activeConfigVersion: number | null;
    activatedAt: string | null;
    qualifiedViewsPerDay: DayCount[];
  };
  money?: {
    currency: 'INR';
    owedToCreators: string;
    rewardsGranted: string;
    payoutsInFlight: string;
    paidOut: string;
    manualAdjustments: string;
    cycles: Record<string, number>;
  };
  queues: Record<string, number>;
}

export interface AppUserCard {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: UserStatus;
  statusReason: string | null;
  risk: RiskLevel;
  accountType: string;
  twoFactorEnabled: boolean;
  followers: number;
  following: number;
  posts: number;
  badge: string;
  location: { country: string | null; state: string | null; district: string | null } | null;
  createdAt: string;
  lastActiveAt: string | null;
}

export interface AppUserDetail extends AppUserCard {
  activeSessions: number;
  reels: number;
  identity: string;
  monetization: string;
  bestReachLevel: ReachLevel;
  reportsAgainst: number;
}

export interface UserNote {
  id: string;
  body: string;
  by: string;
  at: string;
}

export interface MediaView {
  id: string;
  kind: string;
  url: string | null;
  thumbnailUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
}

export interface ReviewItem {
  id: string;
  ownerId: string;
  purpose: string;
  processedAt: string | null;
  media: MediaView | null;
}

export interface MediaJob {
  id: string;
  type: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  queuedAt: string;
  finishedAt: string | null;
  asset: { id: string; ownerId: string; kind: string; purpose: string; status: string; failureCode: string | null };
}

export interface SettingRow {
  key: string;
  label: string;
  description: string;
  group: string;
  value: unknown;
  default: unknown;
  isDefault: boolean;
  version: number;
  updatedAt: string | null;
}

export interface StaffView {
  id: string;
  email: string;
  name: string;
  status: 'INVITED' | 'ACTIVE' | 'DISABLED';
  roles: Array<{ key: string; name: string }>;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
  inviteExpiresAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface StaffSession {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  mfaVerified: boolean;
  ip: string | null;
}

export interface RoleView {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
}

export interface PermissionGroup {
  module: string;
  permissions: Array<{ key: string; description: string }>;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  actorType: string;
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  reason: string | null;
  before: unknown;
  after: unknown;
  ip: string | null;
  requestId: string | null;
  sensitive: boolean;
}

export interface ReachVersionSummary {
  id: string;
  version: number;
  status: string;
  note: string | null;
  createdBy: string;
  createdAt: string;
  activatedAt: string | null;
}

export interface ConfigChange {
  path: string;
  from: unknown;
  to: unknown;
}

export interface ReachVersionFull extends ReachVersionSummary {
  config: Record<string, unknown>;
  changesFromActive?: ConfigChange[];
}

export interface ReachHistoryRow {
  id: string;
  computedAt: string;
  configVersion: number;
  qualifiedReach: number;
  score: number;
  level: string;
  previousLevel: string | null;
  distinctDistricts: number;
  distinctStates: number;
  distinctCountries: number;
  excludedEvents: number;
  signals: unknown;
}

export interface CycleView {
  id: string;
  label: string;
  status: 'OPEN' | 'CALCULATING' | 'CLOSED' | 'FINALIZED';
  startsAt: string;
  endsAt: string;
  poolAmount: string;
  configVersion: number | null;
  finalizedAt: string | null;
  summary: Record<string, unknown> | null;
}

export interface CycleDetail extends CycleView {
  top: Array<{
    creatorId: string;
    status: string;
    estimatedAmount: string;
    finalizedAmount: string | null;
    qualifiedReach: number;
    level: string;
  }>;
}

export interface EligibilityRequirement {
  key: string;
  have: number;
  need: number;
  met: boolean;
}

export interface CreatorOverview {
  eligibility: {
    status: string;
    eligible: boolean;
    requirements: EligibilityRequirement[];
    suspended: { since: string | null } | null;
  };
  earnings: {
    currency: string;
    estimated: {
      amount: string;
      cycle: { label: string; startsAt: string; endsAt: string };
      qualifiedReach: number;
      level: string;
      updatedAt: string;
    } | null;
    pending: string;
    finalized: string;
    available: string;
  };
}

export interface LedgerEntryView {
  id: string;
  createdAt: string;
  type: string;
  memo: string | null;
  amount: string;
  balanceAfter: string;
}

export interface CreatorLedger {
  balance: string;
  entries: LedgerEntryView[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface KycRow {
  id: string;
  userId: string;
  subject: 'INDIVIDUAL' | 'BUSINESS';
  status: string;
  legalName: string | null;
  pan: string | null;
  reasonCode: string | null;
  documents: number;
  submittedAt: string;
}

export interface KycCase {
  id: string;
  userId: string;
  subject: 'INDIVIDUAL' | 'BUSINESS';
  status: string;
  legalName: string | null;
  pan: string | null;
  businessType: string | null;
  reasonCode: string | null;
  providerReference: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  expiresAt: string | null;
  documents: Array<{
    id: string;
    type: string;
    role: string;
    status: string;
    number: string | null;
    rejectionCode: string | null;
    hasScan: boolean;
  }>;
  reviews: Array<{ decision: string; reasonCode: string | null; note: string; by: string; at: string }>;
}

export interface BankRow {
  id: string;
  userId: string;
  holderName: string;
  bankName: string;
  ifsc: string;
  accountNumber: string;
  accountType: string;
  status: string;
  nameMatch: string | null;
  isPrimary: boolean;
  failureCode: string | null;
  createdAt: string;
  verifiedAt: string | null;
}

export interface PayoutRow {
  id: string;
  userId: string;
  amount: string;
  currency: string;
  status: string;
  account: { bankName: string; accountNumber: string };
  requestedAt: string;
  estimatedFrom: string | null;
  estimatedTo: string | null;
  completedAt: string | null;
  failureCode: string | null;
  onHold: boolean;
  riskFlags: unknown;
  approvals: number;
  holdReason: string | null;
}

export interface PayoutDetail extends Omit<PayoutRow, 'approvals'> {
  providerReference: string | null;
  approvals: Array<{ decision: string; note: string; by: string; at: string }>;
}

export type MusicStatus = 'DRAFT' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
export type MusicRights = 'PLATFORM_OWNED' | 'LICENSED' | 'CREATOR_OWNED' | 'ROYALTY_FREE' | 'RESTRICTED';

export interface MusicTrackView {
  id: string;
  title: string;
  artist: string;
  language: string;
  genre: string | null;
  durationMs: number;
  categories: string[];
  status: MusicStatus;
  rightsType: MusicRights;
  allowedCountries: string[];
  allowedUses: string[];
  licenceExpiresAt: string | null;
  hasAudio: boolean;
  coverUrl: string | null;
  previewUrl: string | null;
  reelsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MusicLicenceView {
  id: string;
  trackId: string;
  licensor: string;
  reference: string;
  rightsType: MusicRights;
  territories: string[];
  status: string;
  startsAt: string;
  expiresAt: string | null;
  restrictionsNote: string | null;
  hasDocument: boolean;
  createdBy: string;
  createdAt: string;
}

// ------------------------------------------------------------------ trust and safety --

export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ReportStatus = 'OPEN' | 'IN_REVIEW' | 'ESCALATED' | 'RESOLVED' | 'DISMISSED';
export type ReportCategory =
  | 'MISINFORMATION'
  | 'VIOLENCE'
  | 'FRAUD'
  | 'HARASSMENT'
  | 'SPAM'
  | 'COPYRIGHT'
  | 'NUDITY'
  | 'SELF_HARM'
  | 'CHILD_SAFETY'
  | 'FAKE_ENGAGEMENT'
  | 'DEEPFAKE'
  | 'OTHER';
export type ReportTargetType = 'POST' | 'REEL' | 'STORY' | 'COMMENT' | 'USER' | 'LIVE' | 'MESSAGE';
export type StaffAction =
  'APPROVE' | 'RESTRICT' | 'REMOVE' | 'WARN' | 'RESTRICT_USER' | 'SUSPEND_USER' | 'DISMISS_REPORT';

export interface ReportCard {
  id: string;
  targetType: ReportTargetType;
  targetId: string;
  category: ReportCategory;
  severity: Severity;
  priority: number;
  status: ReportStatus;
  source: 'USER' | 'AUTOMATED' | 'ADMIN';
  excerpt: string | null;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
  resolvedAt: string | null;
  assignedTo: { id: string; name: string } | null;
  reporter: { username: string } | null;
  targetUser: { id: string; username: string } | null;
  reportsOnTarget: number;
}

export interface TargetView {
  type: ReportTargetType;
  id: string;
  available: boolean;
  state: string | null;
  owner: { id: string; username: string; status: string } | null;
  excerpt: string | null;
  details: Record<string, unknown>;
}

export interface DecisionRecord {
  id: string;
  action: string;
  source: 'ADMIN' | 'AUTOMATED' | 'USER';
  targetType: ReportTargetType;
  targetId: string;
  targetUserId: string | null;
  reportId: string | null;
  policyReason: string;
  policyTitle: string;
  notes: string | null;
  by: { id: string; name: string } | null;
  reversalOfId: string | null;
  reversed: boolean;
  appeal: { id: string; status: string } | null;
  createdAt: string;
}

export interface ReportDetail extends ReportCard {
  description: string | null;
  resolution: string | null;
  evidence: {
    refs: Array<{ kind: string; id: string }>;
    snapshot: { excerpt?: string | null; ownerUsername?: string; capturedAt?: string } | null;
  };
  target: TargetView;
  standing: {
    user: { id: string; username: string; status: string; risk: string };
    memberSince: string;
    reportsAgainst: number;
    last90Days: {
      warnings: number;
      restricted: number;
      removed: number;
      accountRestrictions: number;
      suspensions: number;
    };
    lastActionAt: string | null;
  } | null;
  otherReports: Array<{
    id: string;
    category: ReportCategory;
    status: ReportStatus;
    source: string;
    description: string | null;
    reporter: { username: string } | null;
    createdAt: string;
  }>;
  history: DecisionRecord[];
  allowed: { claim: boolean; release: boolean; escalate: boolean; actions: StaffAction[] };
}

export interface ModerationSummary {
  reports: {
    active: number;
    open: number;
    inReview: number;
    escalated: number;
    bySeverity: Record<Severity, number>;
    overdue: number;
    unassigned: number;
    mine: number;
    resolvedLast24h: number;
  };
  appeals: { open: number; inReview: number; overdue: number } | null;
  incidents: { open: number; escalated: number } | null;
  live: { live: number } | null;
}

export interface PolicyRule {
  code: string;
  title: string;
  summary: string;
  categories: ReportCategory[];
}

export interface CategoryPolicyRow {
  category: ReportCategory;
  severity: Severity;
  slaHours: number;
  autoHoldAt: number;
  default: { severity: Severity; slaHours: number; autoHoldAt: number };
  isDefault: boolean;
  floor: { minSeverity: Severity; maxSlaHours: number } | null;
}

export interface PolicyView {
  policyVersion: string;
  version: number;
  updatedAt: string | null;
  rules: PolicyRule[];
  categories: CategoryPolicyRow[];
  limits: { reportsPerDay: number; appealWindowDays: number; appealSlaHours: number };
}

export type AppealStatus = 'OPEN' | 'IN_REVIEW' | 'UPHELD' | 'OVERTURNED' | 'REJECTED';

export interface AppealCard {
  id: string;
  kind: 'MODERATION' | 'EARNINGS' | 'ACCOUNT';
  status: AppealStatus;
  user: { id: string; username: string; status: string };
  decision: { id: string | null; action: string; source: string; policyTitle: string } | null;
  assignedTo: { id: string; name: string } | null;
  decidedBy: { id: string; name: string } | null;
  createdAt: string;
  slaDueAt: string | null;
  overdue: boolean;
  decidedAt: string | null;
}

export interface AppealDetail extends AppealCard {
  reason: string;
  decisionNote: string | null;
  original: {
    id: string;
    action: string;
    source: string;
    policyReason: string;
    policyTitle: string;
    notes: string | null;
    by: { id: string; name: string } | null;
    at: string;
    reversed: boolean;
    report: { id: string; category: ReportCategory; description: string | null; status: ReportStatus } | null;
  } | null;
  target: TargetView | null;
  you: { madeTheOriginalDecision: boolean; canClaim: boolean; canDecide: boolean };
}

export type IncidentType = 'SELF_HARM' | 'VIOLENCE' | 'SCAM' | 'CHILD_SAFETY' | 'HARASSMENT' | 'OTHER';
export type IncidentStatus = 'OPEN' | 'ESCALATED' | 'RESOLVED';

export interface IncidentCard {
  id: string;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  summary: string;
  actionTaken: string | null;
  escalatedTo: string | null;
  user: { id: string; username: string; status: string } | null;
  liveSessionId: string | null;
  reportId: string | null;
  owner: { id: string; name: string } | null;
  createdBy: { id: string; name: string } | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface IncidentDetail extends IncidentCard {
  events: Array<{
    id: string;
    kind: 'OPENED' | 'NOTE' | 'ASSIGNED' | 'ESCALATED' | 'RESOLVED' | 'REOPENED';
    note: string | null;
    by: { id: string; name: string } | null;
    at: string;
  }>;
}

export type LiveStatus = 'SCHEDULED' | 'LIVE' | 'ENDED' | 'TERMINATED';

export interface LiveSessionCard {
  id: string;
  title: string;
  status: LiveStatus;
  host: { id: string; username: string; status: string };
  startedAt: string | null;
  endedAt: string | null;
  peakViewers: number;
  riskFlags: { signals?: string[] } | null;
  terminatedBy: { id: string; name: string } | null;
  terminationReason: string | null;
  createdAt: string;
  openReports: number;
  openIncidents: number;
}

// ------------------------------------------------------------- business and advertising --

export type BusinessStatus = 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED';
export type VerificationState = 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
export type VerificationKind = 'IDENTITY' | 'BUSINESS' | 'PUBLISHER';

export interface BusinessPageCard {
  id: string;
  slug: string;
  name: string;
  category: string;
  status: BusinessStatus;
  statusReason: string | null;
  verification: VerificationState;
  owner: { id: string; username: string; status: string };
  followers: number;
  location: { state: string | null; district: string | null };
  createdAt: string;
}

export interface BusinessPageDetail extends BusinessPageCard {
  description: string | null;
  contactEmail: string | null;
  websiteUrl: string | null;
  city: string | null;
  gstinLast4: string | null;
  statusChangedAt: string | null;
  counts: { posts: number; offers: number };
  campaigns: Record<string, number>;
  verificationRequests: Array<{ id: string; type: VerificationKind; status: VerificationState; submittedAt: string }>;
  ownerReportsAgainst: number;
}

export interface VerificationCard {
  id: string;
  type: VerificationKind;
  status: VerificationState;
  user: { id: string; username: string; status: string };
  page: { id: string; slug: string; name: string } | null;
  submittedAt: string;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
}

export interface VerificationDetail extends VerificationCard {
  note: string | null;
  decisionNote: string | null;
  evidence: {
    identity: { status: string } | null;
    page: {
      status: string;
      category: string;
      description: string | null;
      websiteUrl: string | null;
      contactEmail: string | null;
      followersCount: number;
      verificationStatus: string;
      gstinLast4: string | null;
      gstinChecked: string;
    } | null;
    account: { reportsAgainst: number; badge: string; followers: number; posts: number };
  };
  earlier: Array<{ id: string; type: VerificationKind; status: VerificationState; submittedAt: string }>;
}

export type CampaignStatus =
  'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'REJECTED' | 'FLAGGED' | 'CANCELLED';
export type BillingState = 'NOT_CONFIGURED' | 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';

export interface CampaignCard {
  id: string;
  name: string;
  objective: string;
  status: CampaignStatus;
  advertiser: { id: string; username: string; status: string };
  page: { id: string; slug: string; name: string } | null;
  budget: string;
  spent: string;
  startsAt: string;
  endsAt: string;
  submittedAt: string | null;
  waitingHours: number | null;
  billingStatus?: BillingState;
  flags: Record<string, unknown> | null;
}

export interface CampaignDetail extends CampaignCard {
  dailyBudget: string | null;
  currency: string;
  targeting: { countries: string[]; states: string[]; districts: string[]; ageBands: string[] };
  audience: { exact: number };
  creative: { headline: string; body: string | null; destinationUrl: string | null };
  boost: TargetView | null;
  pausedBy: 'OWNER' | 'STAFF' | 'SYSTEM' | null;
  reviewNote: string | null;
  reviewedBy: { id: string; name: string } | null;
  reviewedAt: string | null;
  pageStatus: { status: string; verified: boolean } | null;
  billing: { status: BillingState; reference: string | null; fundedAt: string | null } | null;
  advertiserStanding: {
    user: { id: string; username: string; status: string; createdAt: string } | null;
    campaigns: Record<string, number>;
    reportsAgainst: number;
  };
  history: Array<{ action: string; actorLabel: string | null; reason: string | null; createdAt: string }>;
}

export interface AdvertiserRow {
  id: string;
  username: string;
  displayName: string;
  status: string;
  campaigns: Record<string, number>;
  total: number;
  committed: string;
  spent: string;
  since: string;
}
