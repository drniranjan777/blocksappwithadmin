/**
 * How the Reach engine's settings document is laid out for editing: which numbers exist, what to call
 * them, and whether they are shown as percentages. The *rules* between them (weights add up to 100%,
 * each rung needs more than the one below...) are checked by the API, which reports every problem
 * at once; this file only describes the form.
 */

export type FieldKind = 'percent' | 'number' | 'int' | 'bool';

export interface FieldDef {
  /** Where the value sits in the settings document, e.g. `levels.state.minScore`. */
  path: string;
  label: string;
  hint?: string;
  kind: FieldKind;
}

export interface FieldGroup {
  id: string;
  title: string;
  hint?: string;
  fields: FieldDef[];
  /** Shows a running total for fields that must add up to 100%. */
  mustTotal100?: boolean;
}

const f = (path: string, label: string, kind: FieldKind, hint?: string): FieldDef => ({
  path,
  label,
  kind,
  ...(hint ? { hint } : {}),
});

export const REACH_GROUPS: FieldGroup[] = [
  {
    id: 'weights',
    title: 'Score weights',
    hint: 'How much each signal counts towards the 0 to 100 Qualified Reach Score. Must add up to 100%.',
    mustTotal100: true,
    fields: [
      f('weights.qualifiedViewers', 'Qualified unique viewers', 'percent'),
      f('weights.watchCompletion', 'Watch time and completion', 'percent'),
      f('weights.shares', 'Shares and reposts', 'percent'),
      f('weights.saves', 'Saves and meaningful actions', 'percent'),
      f('weights.comments', 'Comments and conversations', 'percent'),
      f('weights.geoExpansion', 'Audience geographic expansion', 'percent'),
      f('weights.trust', 'Trust and originality', 'percent'),
    ],
  },
  {
    id: 'targets',
    title: 'What counts as full marks',
    hint: "A signal is divided by its target and held at 1, so a number far beyond the target cannot buy more than the signal's weight.",
    fields: [
      f('targets.qualifiedViewers', 'Unique qualified viewers', 'number'),
      f('targets.watchQuality', 'Watch quality', 'percent', 'The share at which the watch signal is full.'),
      f('targets.sharesPer1000', 'Shares per 1,000 viewers', 'number'),
      f('targets.savesPer1000', 'Saves per 1,000 viewers', 'number'),
      f('targets.commentsPer1000', 'Meaningful comments per 1,000 viewers', 'number'),
      f('targets.districts', 'Districts reached', 'number'),
      f('targets.states', 'States reached', 'number'),
      f('targets.countries', 'Countries reached', 'number'),
      f(
        'targets.ratioFloorViewers',
        'Fewest viewers a ratio is computed over',
        'number',
        'So a handful of viewers cannot look like a trend.',
      ),
    ],
  },
  {
    id: 'geoMix',
    title: 'Geographic mix',
    hint: 'How districts, states and countries combine into the geographic signal. Must add up to 100%.',
    mustTotal100: true,
    fields: [
      f('targets.geoMix.districts', 'Districts', 'percent'),
      f('targets.geoMix.states', 'States', 'percent'),
      f('targets.geoMix.countries', 'Countries', 'percent'),
    ],
  },
  {
    id: 'qualification',
    title: 'What makes a view count',
    fields: [
      f('qualification.minWatchMs', 'Reel: least time watched (ms)', 'int'),
      f(
        'qualification.minWatchRatio',
        'Reel: or this share of it',
        'percent',
        'So a very short reel can still qualify.',
      ),
      f('qualification.minPostDwellMs', 'Post: least time on screen (ms)', 'int'),
      f('qualification.completeRatio', 'Share watched that counts as completing a reel', 'percent'),
      f('qualification.minViewerAccountAgeHours', 'Youngest viewer account that counts (hours)', 'number'),
      f('qualification.requireVerifiedViewer', 'Viewer must have a verified e-mail or phone', 'bool'),
      f('qualification.meaningfulCommentMinChars', 'Shortest meaningful comment (characters)', 'int'),
    ],
  },
  {
    id: 'fraud',
    title: 'Suspected fake engagement',
    hint: 'Events at or above the threshold are kept but excluded from every count.',
    fields: [
      f('fraud.excludeAtOrAbove', 'Exclude at or above this fraud score (20 to 100)', 'int'),
      f('fraud.maxEventsPerViewerPerMinute', 'Most events per viewer per minute', 'int'),
      f('fraud.maxEventsPerDevicePerMinute', 'Most events per device per minute', 'int'),
      f(
        'fraud.maxViewersPerDevicePerContentPerDay',
        'Most accounts on one device engaging with one item per day',
        'int',
      ),
      f('fraud.maxWatchLoops', 'Longest believable view, in loops of the reel', 'number'),
    ],
  },
  {
    id: 'levels',
    title: 'Reach Ladder: what each rung needs',
    hint: 'A level needs all of its own conditions and those of the rungs below. District is where everything starts, so its two numbers must be 0.',
    fields: [
      f('levels.district.minQualifiedReach', 'D1 District: qualified reach', 'int'),
      f('levels.district.minScore', 'D1 District: score', 'number'),
      f('levels.state.minQualifiedReach', 'S1 State: qualified reach', 'int'),
      f('levels.state.minScore', 'S1 State: score', 'number'),
      f('levels.state.minDistinctDistricts', 'S1 State: districts', 'int'),
      f('levels.national.minQualifiedReach', 'N1 National: qualified reach', 'int'),
      f('levels.national.minScore', 'N1 National: score', 'number'),
      f('levels.national.minDistinctStates', 'N1 National: states', 'int'),
      f('levels.global.minQualifiedReach', 'G1 Global: qualified reach', 'int'),
      f('levels.global.minScore', 'G1 Global: score', 'number'),
      f('levels.global.minDistinctCountries', 'G1 Global: countries', 'int'),
      f('levels.global.minInternationalViewers', 'G1 Global: international viewers', 'int'),
    ],
  },
  {
    id: 'rewards',
    title: 'Rewards',
    hint: 'How the money pool is shared. A higher rung is never worth less than a lower one.',
    fields: [
      f('rewards.levelMultipliers.district', 'D1 multiplier', 'number'),
      f('rewards.levelMultipliers.state', 'S1 multiplier', 'number'),
      f('rewards.levelMultipliers.national', 'N1 multiplier', 'number'),
      f('rewards.levelMultipliers.global', 'G1 multiplier', 'number'),
      f('rewards.minScoreForReward', 'Lowest score that earns anything', 'number'),
      f('rewards.maxCreatorShare', 'Most one creator can take of a pool', 'percent'),
      f('rewards.eligibility.minFollowers', 'Creator needs: followers', 'int'),
      f('rewards.eligibility.minAccountAgeDays', 'Creator needs: account age (days)', 'int'),
      f('rewards.eligibility.minPublishedItems', 'Creator needs: published items', 'int'),
      f('rewards.eligibility.minQualifiedReach30d', 'Creator needs: qualified reach in 30 days', 'int'),
    ],
  },
];

// ------------------------------------------------------------ path helpers --

export function getPath(doc: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) => (value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
      doc,
    );
}

/** A copy of `doc` with one value replaced. The original is never changed. */
export function setPath<T>(doc: T, path: string, value: unknown): T {
  const keys = path.split('.');
  const clone = structuredClone(doc) as Record<string, unknown>;
  let cursor = clone;
  for (const key of keys.slice(0, -1)) {
    const next = cursor[key];
    cursor[key] = typeof next === 'object' && next !== null ? next : {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (last !== undefined) cursor[last] = value;
  return clone as T;
}

// -------------------------------------------------------- form <-> document --

/** Rounds away binary noise: `0.07 * 100` is `7.000000000000001`. */
const tidy = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places;

export type FormValue = string | boolean;

/** The text a person edits for one field, from the stored document. */
export function toFormValue(def: FieldDef, doc: unknown): FormValue {
  const raw = getPath(doc, def.path);
  if (def.kind === 'bool') return raw === true;
  if (typeof raw !== 'number') return '';
  return String(def.kind === 'percent' ? tidy(raw * 100, 4) : raw);
}

export type ParsedValue = { ok: true; value: number | boolean } | { ok: false; message: string };

export function parseFormValue(def: FieldDef, raw: FormValue): ParsedValue {
  if (def.kind === 'bool') return { ok: true, value: raw === true };
  const text = String(raw).trim();
  if (text === '') return { ok: false, message: 'Enter a number.' };
  const n = Number(text);
  if (!Number.isFinite(n)) return { ok: false, message: 'Enter a number.' };
  if (def.kind === 'int' && !Number.isInteger(n)) return { ok: false, message: 'Use a whole number.' };
  if (n < 0) return { ok: false, message: 'Cannot be negative.' };
  return { ok: true, value: def.kind === 'percent' ? tidy(n / 100, 6) : n };
}

/** How a stored value reads in a table or a change list. */
export function showConfigValue(value: unknown, kind: FieldKind | undefined = undefined): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return kind === 'percent' ? `${tidy(value * 100, 4)}%` : String(value);
  if (value === undefined || value === null) return '—';
  return JSON.stringify(value);
}

export function fieldFor(path: string): FieldDef | undefined {
  return REACH_GROUPS.flatMap((g) => g.fields).find((d) => d.path === path);
}
