import { describe, expect, it } from 'vitest';
import { ConfigError, loadEnv } from './env.js';

const strong = (c: string): string => c.repeat(40);
const goodKeys = JSON.stringify({ k1: Buffer.alloc(32, 7).toString('base64') });

const production = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://u:p@db:5432/blocks',
  REDIS_URL: 'redis://redis:6379/0',
  JWT_SECRET: strong('a'),
  OTP_HMAC_SECRET: strong('b'),
  BLIND_INDEX_KEY: strong('c'),
  FIELD_ENCRYPTION_KEYS: goodKeys,
  FIELD_ENCRYPTION_ACTIVE_KEY: 'k1',
  CORS_ORIGINS: 'https://admin.blocks.example',
  EMAIL_PROVIDER: 'smtp',
  SMS_PROVIDER: 'http',
  MODERATION_PROVIDER: 'manual',
  STORAGE_DRIVER: 's3',
  S3_REGION: 'ap-south-1',
  S3_BUCKET_PRIVATE: 'blocks-private',
  S3_BUCKET_KYC: 'blocks-kyc',
});

const problemsOf = (source: NodeJS.ProcessEnv): string[] => {
  try {
    loadEnv(source);
    return [];
  } catch (e) {
    if (e instanceof ConfigError) return e.problems;
    throw e;
  }
};

describe('loadEnv', () => {
  it('needs a database', () => {
    expect(problemsOf({}).join('\n')).toMatch(/DATABASE_URL/);
  });

  it('starts in development with warned, clearly fake secrets', () => {
    const { env, warnings } = loadEnv({ DATABASE_URL: 'postgresql://x' });
    expect(env.isProduction).toBe(false);
    expect(env.JWT_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(warnings.join(' ')).toMatch(/insecure development secrets/);
    expect(env.swaggerEnabled).toBe(true);
    expect(env.devOutboxEnabled).toBe(true);
  });

  it('derives the same development secrets every time, so restarts keep sessions', () => {
    const a = loadEnv({ DATABASE_URL: 'postgresql://x' }).env;
    const b = loadEnv({ DATABASE_URL: 'postgresql://x' }).env;
    expect(a.JWT_SECRET).toBe(b.JWT_SECRET);
  });

  it('accepts a complete production configuration', () => {
    const { env, warnings } = loadEnv(production());
    expect(env.isProduction).toBe(true);
    expect(env.swaggerEnabled).toBe(false);
    expect(env.devOutboxEnabled).toBe(false);
    expect(warnings).toEqual([]);
  });

  it('refuses production without secrets, naming every one that is missing', () => {
    const source = production();
    for (const k of [
      'JWT_SECRET',
      'OTP_HMAC_SECRET',
      'BLIND_INDEX_KEY',
      'FIELD_ENCRYPTION_KEYS',
      'REDIS_URL',
    ]) {
      delete source[k];
    }
    const problems = problemsOf(source).join('\n');
    for (const k of [
      'JWT_SECRET',
      'OTP_HMAC_SECRET',
      'BLIND_INDEX_KEY',
      'FIELD_ENCRYPTION_KEYS',
      'REDIS_URL',
    ]) {
      expect(problems).toContain(k);
    }
  });

  it('refuses short secrets', () => {
    expect(problemsOf({ ...production(), JWT_SECRET: 'too-short' }).join('\n')).toMatch(
      /JWT_SECRET/,
    );
  });

  it('refuses placeholder secrets in production', () => {
    const source = { ...production(), OTP_HMAC_SECRET: 'change-me-'.repeat(5) };
    expect(problemsOf(source).join('\n')).toMatch(/OTP_HMAC_SECRET: looks like a placeholder/);
  });

  it('refuses providers that cannot work in production', () => {
    const problems = problemsOf({
      ...production(),
      EMAIL_PROVIDER: 'dev',
      SMS_PROVIDER: 'dev',
      STORAGE_DRIVER: 'local',
    }).join('\n');
    expect(problems).toMatch(/EMAIL_PROVIDER/);
    expect(problems).toMatch(/SMS_PROVIDER/);
    expect(problems).toMatch(/STORAGE_DRIVER/);
  });

  it('refuses to approve every upload automatically in production', () => {
    const problems = problemsOf({ ...production(), MODERATION_PROVIDER: 'dev' }).join('; ');
    expect(problems).toMatch(/MODERATION_PROVIDER/);
    // Sending everything to a person is allowed: slow, but safe.
    expect(problemsOf({ ...production(), MODERATION_PROVIDER: 'manual' })).toEqual([]);
  });

  it('keeps identity, bank and payout features off in production, and refuses them while only mock providers exist', () => {
    // On in development and tests, off in production unless asked for.
    expect(loadEnv({ DATABASE_URL: 'postgresql://x' }).env.moneyEnabled).toBe(true);
    expect(loadEnv(production()).env.moneyEnabled).toBe(false);
    // Asking for them in production while the only providers are stand-ins is a start-up error, naming each.
    const problems = problemsOf({ ...production(), MONEY_FEATURES_ENABLED: 'true' }).join('\n');
    for (const name of ['KYC_PROVIDER', 'BANK_VERIFICATION_PROVIDER', 'PAYOUT_PROVIDER']) {
      expect(problems).toContain(name);
    }
    expect(problems).toMatch(/real provider/);
    // Switching them off explicitly in development is honoured.
    expect(
      loadEnv({ DATABASE_URL: 'postgresql://x', MONEY_FEATURES_ENABLED: 'false' }).env.moneyEnabled,
    ).toBe(false);
  });

  it('refuses a wildcard CORS origin, or none, in production', () => {
    expect(problemsOf({ ...production(), CORS_ORIGINS: '*' }).join('\n')).toMatch(/wildcard/);
    expect(problemsOf({ ...production(), CORS_ORIGINS: '' }).join('\n')).toMatch(/CORS_ORIGINS/);
  });

  it('refuses a malformed field-encryption key', () => {
    const bad = JSON.stringify({ k1: Buffer.alloc(16).toString('base64') });
    expect(problemsOf({ ...production(), FIELD_ENCRYPTION_KEYS: bad }).join('\n')).toMatch(
      /32 bytes/,
    );
    expect(problemsOf({ ...production(), FIELD_ENCRYPTION_ACTIVE_KEY: 'nope' }).join('\n')).toMatch(
      /not one of/,
    );
  });

  it('keeps the developer outbox off in production even if asked', () => {
    expect(problemsOf({ ...production(), DEV_OUTBOX_ENABLED: 'true' }).join('\n')).toMatch(
      /DEV_OUTBOX_ENABLED/,
    );
  });

  it('parses lists and numbers', () => {
    const { env } = loadEnv({
      DATABASE_URL: 'postgresql://x',
      CORS_ORIGINS: 'https://a.test, https://b.test ,',
      PORT: '8080',
      AUTH_MAX_FAILED_LOGINS: '7',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://a.test', 'https://b.test']);
    expect(env.PORT).toBe(8080);
    expect(env.AUTH_MAX_FAILED_LOGINS).toBe(7);
  });

  it('rejects out-of-range values', () => {
    expect(problemsOf({ DATABASE_URL: 'x', PORT: '70000' }).join('\n')).toMatch(/PORT/);
    expect(problemsOf({ DATABASE_URL: 'x', AUTH_MAX_FAILED_LOGINS: '1' }).join('\n')).toMatch(
      /AUTH_MAX_FAILED_LOGINS/,
    );
  });
});
