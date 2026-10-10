import { z } from 'zod';
import type { AdObjective, AdStatus } from '../generated/prisma/client.js';

/**
 * What an advertiser can ask for, and the shape every campaign takes.
 *
 * Targeting is deliberately coarse. An advertiser chooses a place (country, states, districts) and
 * broad age bands, and nothing else: no interests derived from behaviour, no gender, religion,
 * health, politics, or lists of individual people. The schema is closed, so a field that is not
 * here cannot be sent. People are never shown to advertisers: they get an audience size rounded
 * down, never a list and never an exact count, and a campaign aimed at too few people is refused
 * so that targeting cannot be used to single anyone out.
 */

export const AGE_BANDS = ['18-24', '25-34', '35-44', '45+'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** Inclusive age ranges of the bands, in whole years. */
export const BAND_RANGE: Record<AgeBand, { from: number; to: number }> = {
  '18-24': { from: 18, to: 24 },
  '25-34': { from: 25, to: 34 },
  '35-44': { from: 35, to: 44 },
  '45+': { from: 45, to: 130 },
};

const place = z.string().trim().min(2).max(80);

export const targetingSchema = z
  .object({
    countries: z.array(z.literal('IN')).min(1).max(1).default(['IN']),
    states: z.array(place).max(10).default([]),
    districts: z.array(place).max(20).default([]),
    ageBands: z.array(z.enum(AGE_BANDS)).max(4).default([]),
  })
  .strict();
export type Targeting = z.infer<typeof targetingSchema>;

/** Removes repeats (ignoring case and spacing) and puts the lists in a steady order. */
export function normaliseTargeting(t: Targeting): Targeting {
  const uniq = (xs: string[]) => {
    const seen = new Map<string, string>();
    for (const x of xs) {
      const key = x.replace(/\s+/g, ' ').trim().toLowerCase();
      if (!seen.has(key)) seen.set(key, x.replace(/\s+/g, ' ').trim());
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  };
  return {
    countries: ['IN'],
    states: uniq(t.states),
    districts: uniq(t.districts),
    ageBands: AGE_BANDS.filter((b) => t.ageBands.includes(b)),
  };
}

export const OBJECTIVES: readonly AdObjective[] = [
  'AWARENESS',
  'TRAFFIC',
  'LOCAL_REACH',
  'BOOST_CONTENT',
  'LEADS',
];

/** What each objective needs beyond the basics. */
export const OBJECTIVE_NEEDS: Record<
  AdObjective,
  { destination: boolean; boost: boolean; district: boolean }
> = {
  AWARENESS: { destination: false, boost: false, district: false },
  TRAFFIC: { destination: true, boost: false, district: false },
  LOCAL_REACH: { destination: false, boost: false, district: true },
  BOOST_CONTENT: { destination: false, boost: true, district: false },
  LEADS: { destination: true, boost: false, district: false },
};

/** Statuses in which an advertiser can still change the creative, targeting, budget and schedule. */
export const EDITABLE: readonly AdStatus[] = ['DRAFT', 'REJECTED'];

/** Statuses that count against how many campaigns a person can have open at once. */
export const OPEN_STATUSES: readonly AdStatus[] = [
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'ACTIVE',
  'PAUSED',
  'FLAGGED',
];

/** Who paused a campaign decides who can resume it. */
export type PausedBy = 'OWNER' | 'STAFF' | 'SYSTEM';

export const DEFAULTS = {
  minBudget: '500.00',
  maxBudget: '1000000.00',
  maxCampaignDays: 90,
  minAudience: 100,
  maxOpenCampaigns: 10,
  /** A campaign cannot start sooner than this after it is sent, so there is time to review it. */
  minLeadHours: 1,
} as const;

export const SETTING_KEYS = {
  minBudget: 'ads.min_budget',
  maxBudget: 'ads.max_budget',
  maxCampaignDays: 'ads.max_campaign_days',
  minAudience: 'ads.min_audience',
  maxOpenCampaigns: 'ads.max_open_campaigns',
} as const;

/** An audience size shown to an advertiser: never exact, never below the floor. */
export function coarseAudience(n: number): number {
  return Math.floor(n / 100) * 100;
}
