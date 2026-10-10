import 'server-only';
import { serverEnv } from './env';

/** The header every request from the console's own pages carries. A form on another site cannot add it. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_VALUE = 'blocks-console';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Cross-site request protection for everything that changes something.
 *
 * Three independent checks, all of which must pass (the cookies are also `SameSite=Strict`, which is
 * a fourth layer):
 *  1. the request names an `Origin` and it is this app's own address (or one explicitly allowed);
 *  2. it carries the custom header above, which browsers only let same-origin scripts add;
 *  3. when the browser says so (`Sec-Fetch-Site`), the request is same-origin.
 *
 * Returns a reason when the request should be refused, otherwise `null`.
 */
export function crossSiteProblem(request: Request): string | null {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return null;

  const origin = request.headers.get('origin');
  if (!origin) return 'missing origin';
  const own = new URL(request.url).origin;
  const allowed = new Set([own, ...serverEnv().allowedOrigins]);
  if (!allowed.has(origin)) return 'origin not allowed';

  if (request.headers.get(CSRF_HEADER) !== CSRF_VALUE) return 'missing request marker';

  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return 'cross-site request';
  return null;
}
