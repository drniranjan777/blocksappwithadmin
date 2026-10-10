import 'server-only';

/**
 * Server-side settings, read once. Nothing here is ever sent to the browser.
 */
function integer(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be a whole number from ${min} to ${max}`);
  }
  return n;
}

function apiUrl(): string {
  const raw = (process.env.BLOCKS_API_URL ?? 'http://localhost:4000').trim().replace(/\/+$/, '');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('BLOCKS_API_URL must be a full address such as https://api.example.com');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BLOCKS_API_URL must start with http:// or https://');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    url.protocol !== 'https:' &&
    !/^(localhost|127\.|\[::1\])/.test(url.hostname)
  ) {
    throw new Error('BLOCKS_API_URL must use https:// in production');
  }
  return raw;
}

/** A list of web addresses (origins), each checked, so a typo cannot widen the page's security policy. */
function origins(name: string): string[] {
  return (process.env[name] ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => {
      let url: URL;
      try {
        url = new URL(o);
      } catch {
        throw new Error(`${name}: "${o}" is not a web address`);
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${name}: "${o}" must start with http:// or https://`);
      }
      return url.origin;
    });
}

export interface ServerEnv {
  apiUrl: string;
  allowedOrigins: string[];
  /** Extra places the page may send files to (the object-storage address for uploads). */
  uploadOrigins: string[];
  /** Where photos and videos are served from (the CDN, or the API itself when there is none). */
  mediaOrigins: string[];
  cookieSecure: boolean;
  trustedProxyHops: number;
}

let cached: ServerEnv | undefined;

export function serverEnv(): ServerEnv {
  cached ??= {
    apiUrl: apiUrl(),
    allowedOrigins: origins('ALLOWED_ORIGINS'),
    uploadOrigins: origins('UPLOAD_ORIGINS'),
    mediaOrigins: origins('MEDIA_ORIGINS'),
    cookieSecure:
      process.env.COOKIE_SECURE === undefined || process.env.COOKIE_SECURE === ''
        ? process.env.NODE_ENV === 'production'
        : process.env.COOKIE_SECURE === 'true',
    trustedProxyHops: integer('TRUSTED_PROXY_HOPS', 0, 0, 5),
  };
  return cached;
}

/** For tests: forget what was read. */
export function resetServerEnvForTests(): void {
  cached = undefined;
}
