import 'server-only';
import { serverEnv } from './env';

/**
 * The address of the person using the console, as far as it can be trusted.
 *
 * `X-Forwarded-For` is a list that every proxy appends to, and anyone can send their own. With
 * `TRUSTED_PROXY_HOPS = n`, only the entry `n` places from the right (the one added by our own
 * outermost proxy) is believed; everything to its left is whatever the caller claimed. With 0, the
 * header is ignored entirely and `undefined` is returned: the API then sees this server's address.
 */
export function clientIp(headers: Headers): string | undefined {
  const hops = serverEnv().trustedProxyHops;
  if (hops === 0) return undefined;
  const list = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const entry = list[list.length - hops];
  return entry && entry.length <= 45 ? entry : undefined;
}
