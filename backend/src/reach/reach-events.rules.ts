import type { ReachConfig } from './reach-config.js';

/**
 * The rules that turn what a phone reports into what the Reach Engine counts.
 *
 * A client reports only what it observed ("this was on screen for 4.2 seconds"). Whether that
 * is a *qualified* view, whether it looks like a real person, and which place the viewer is
 * in are all decided here, on the server, from the viewer's own account. The client never says
 * "this counted", never names a place, and never sends a reach level.
 */

/** Share (0..1) of a reel that was watched. Replays count up to the loop limit; beyond it the figure is held. */
export function watchRatio(watchMs: number, durationMs: number, maxLoops: number): number {
  if (!(durationMs > 0) || !(watchMs > 0)) return 0;
  return Math.min(1, Math.min(watchMs, durationMs * maxLoops) / durationMs);
}

export interface ViewFacts {
  kind: 'reel' | 'post';
  /** How long it was on screen, as reported. */
  watchMs: number;
  /** The reel's length, known to the server. Zero for a post. */
  durationMs: number;
  viewerAccountAgeHours: number;
  viewerVerified: boolean;
}

/** Does this view count towards qualified reach? Fake-looking views are handled separately (see `fraudScore`). */
export function viewQualifies(config: ReachConfig, v: ViewFacts): boolean {
  const q = config.qualification;
  if (v.viewerAccountAgeHours < q.minViewerAccountAgeHours) return false;
  if (q.requireVerifiedViewer && !v.viewerVerified) return false;
  if (v.kind === 'post') return v.watchMs >= q.minPostDwellMs;
  // A very short reel can qualify by share watched, a longer one by time watched.
  return (
    v.watchMs >= q.minWatchMs ||
    watchRatio(v.watchMs, v.durationMs, config.fraud.maxWatchLoops) >= q.minWatchRatio
  );
}

/** A comment counts as meaningful at the configured length, ignoring spaces and repeated filler. */
export function isMeaningfulComment(config: ReachConfig, text: string): boolean {
  const compact = text.replace(/\s+/g, ' ').trim();
  if (compact.length < config.qualification.meaningfulCommentMinChars) return false;
  // "aaaaaaaaaaaa" or "ok ok ok ok ok": long, but not saying anything.
  const distinct = new Set(compact.toLowerCase().replace(/\s/g, '')).size;
  return distinct >= 4;
}

export interface FraudFacts {
  eventsByViewerLastMinute: number;
  eventsByDeviceLastMinute: number;
  /** Different accounts that have used this device on this content today, including this one. */
  viewersOnDeviceForContentToday: number;
  /** The event came from the same device the author's account last used. */
  sameDeviceAsAuthor: boolean;
  viewerRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  /** The reported watch time exceeded what the content could allow. */
  implausibleWatch: boolean;
}

export interface FraudAssessment {
  score: number;
  reasons: string[];
}

/**
 * 0..100: how much an event looks like it did not come from a person genuinely watching.
 * Each rule adds points; at or above the configured threshold the event is kept but set
 * aside from every count. These are heuristics, not proof: they are tuned by staff and
 * cannot catch a well-run farm of real devices.
 */
export function fraudScore(config: ReachConfig, f: FraudFacts): FraudAssessment {
  const limits = config.fraud;
  let score = 0;
  const reasons: string[] = [];
  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };
  if (f.eventsByViewerLastMinute > limits.maxEventsPerViewerPerMinute) add(50, 'viewer_velocity');
  if (f.eventsByDeviceLastMinute > limits.maxEventsPerDevicePerMinute) add(40, 'device_velocity');
  if (f.viewersOnDeviceForContentToday > limits.maxViewersPerDevicePerContentPerDay) {
    add(45, 'shared_device');
  }
  if (f.sameDeviceAsAuthor) add(60, 'author_device');
  if (f.viewerRisk === 'HIGH') add(40, 'high_risk_viewer');
  else if (f.viewerRisk === 'MEDIUM') add(15, 'medium_risk_viewer');
  if (f.implausibleWatch) add(30, 'implausible_watch');
  return { score: Math.min(100, score), reasons };
}

export const isExcluded = (config: ReachConfig, score: number): boolean =>
  score >= config.fraud.excludeAtOrAbove;
