import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Environment configuration, validated once at start-up.
 *
 * The process refuses to start when something is wrong, rather than limping on
 * with a weak default. In production every secret must be present and strong;
 * outside production, missing secrets fall back to clearly-labelled development
 * values so a fresh checkout runs, and `loadEnv` reports that it did so.
 */

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const csv = z.string().transform((v) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const secret = z.string().min(32, 'must be at least 32 characters');

const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** How many reverse proxies sit in front of the API (for the real client IP). */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  /** Allowed browser origins. Mobile apps send no Origin header and are unaffected. */
  CORS_ORIGINS: csv.default([]),
  SWAGGER_ENABLED: bool.optional(),

  DATABASE_URL: z.string().min(1),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
  REDIS_URL: z.string().optional(),

  // --- sessions and tokens ------------------------------------------------
  JWT_SECRET: secret.optional(),
  /** The previous secret, accepted for verification only while rotating. */
  JWT_SECRET_PREVIOUS: secret.optional(),
  JWT_ISSUER: z.string().default('blocks-api'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(60),
  ADMIN_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(1800).default(600),
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  ADMIN_SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(24).default(8),
  /** How long a new staff member has to use their temporary password. */
  ADMIN_INVITE_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  /** Where staff sign in; put in the invitation e-mail. */
  ADMIN_CONSOLE_URL: z.string().default('http://localhost:3000'),

  // --- account protection ---------------------------------------------------
  AUTH_MAX_FAILED_LOGINS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_LOCK_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),
  /** How long a one-time code lives. The e-mail says this number, so change it only deliberately. */
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_HMAC_SECRET: secret.optional(),
  ACCOUNT_DELETION_GRACE_DAYS: z.coerce.number().int().min(0).max(90).default(30),

  // --- field encryption (KYC, bank, tax) ------------------------------------
  /** JSON object: key id -> base64 of 32 random bytes. */
  FIELD_ENCRYPTION_KEYS: z.string().optional(),
  FIELD_ENCRYPTION_ACTIVE_KEY: z.string().optional(),
  BLIND_INDEX_KEY: secret.optional(),

  // --- providers ---------------------------------------------------------------
  EMAIL_PROVIDER: z.enum(['dev', 'smtp']).default('dev'),
  /**
   * SMTP, used when EMAIL_PROVIDER=smtp. The password comes from the environment (the server's
   * protected .env file) and is never written to a log, a response or a process argument.
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  /** TLS from the first byte (port 465). Default: on for port 465, off (STARTTLS required) otherwise. */
  SMTP_SECURE: bool.optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM_EMAIL: z.string().optional(),
  SMTP_FROM_NAME: z.string().default('BLOCKS'),
  /**
   * `none` is a deliberate "this deployment sends no SMS": it lets production run on e-mail alone.
   * Phone numbers can then be stored but not verified, and sign-up needs an e-mail address.
   */
  SMS_PROVIDER: z.enum(['dev', 'http', 'none']).default('dev'),
  PUSH_PROVIDER: z.enum(['dev', 'fcm']).default('dev'),
  /**
   * `dev` approves every upload (development only); `manual` sends every upload to a
   * person to approve, which is the safe choice until an automated service is connected.
   */
  MODERATION_PROVIDER: z.enum(['dev', 'manual']).default('dev'),
  KYC_PROVIDER: z.enum(['mock']).default('mock'),
  BANK_VERIFICATION_PROVIDER: z.enum(['mock']).default('mock'),
  PAYOUT_PROVIDER: z.enum(['mock']).default('mock'),
  /**
   * Who takes an advertiser's money. `none` (the default) means nobody: campaigns can be approved
   * but cannot be paid for, so none ever runs. `dev` pays instantly and moves no money; it is
   * for development and tests and is refused in production.
   */
  ADS_BILLING_PROVIDER: z.enum(['none', 'dev']).default('none'),
  /**
   * Master switch for identity verification, bank accounts and payouts. Off by default in
   * production, and refused there while only mock providers exist: no real money or real
   * identity document moves through a stand-in.
   */
  MONEY_FEATURES_ENABLED: bool.optional(),
  /** Development only: expose the in-memory mailbox so OTPs can be read. */
  DEV_OUTBOX_ENABLED: bool.optional(),
  /** Run the recurring housekeeping in this process. Off by default under test. */
  WORKERS_ENABLED: bool.optional(),

  // --- object storage ------------------------------------------------------------
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./uploads'),
  S3_REGION: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET_PRIVATE: z.string().optional(),
  S3_BUCKET_KYC: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  CDN_BASE_URL: z.string().optional(),
  /** This API's public address, used to build links when there is no CDN. */
  PUBLIC_API_URL: z.string().default('http://localhost:4000'),
  /** Where shared links to posts and profiles open (the web app or a smart link). */
  PUBLIC_WEB_URL: z.string().default('https://blocks.example'),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(900),

  // --- media processing ------------------------------------------------------------
  /** The ffmpeg / ffprobe programs. Use the host's own, patched builds in production. */
  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  /** How many files one process works on at once. */
  MEDIA_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  /** Scratch space for files being processed. Empty = the system temp directory. */
  MEDIA_TEMP_DIR: z.string().default(''),
});

export type Env = z.infer<typeof base> & {
  JWT_SECRET: string;
  OTP_HMAC_SECRET: string;
  BLIND_INDEX_KEY: string;
  FIELD_ENCRYPTION_KEYS: string;
  FIELD_ENCRYPTION_ACTIVE_KEY: string;
  isProduction: boolean;
  isTest: boolean;
  swaggerEnabled: boolean;
  /** Whether the SMTP connection starts encrypted (implicit TLS) rather than upgrading. */
  smtpSecure: boolean;
  devOutboxEnabled: boolean;
  workersEnabled: boolean;
  /** Whether KYC, bank-account and payout writes are allowed at all. */
  moneyEnabled: boolean;
};

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** A stable, obviously-fake 32-byte value derived from a label. Development only. */
function devSecret(label: string): string {
  return createHash('sha256').update(`blocks-dev-only:${label}`).digest('hex');
}

function devEncryptionKeys(): { keys: string; active: string } {
  const key = createHash('sha256').update('blocks-dev-only:field-key').digest('base64');
  return { keys: JSON.stringify({ dev1: key }), active: 'dev1' };
}

export interface LoadedEnv {
  env: Env;
  /** Things the operator should know, e.g. that development secrets are in use. */
  warnings: string[];
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): LoadedEnv {
  const parsed = base.safeParse(source);
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const v = parsed.data;
  const isProduction = v.NODE_ENV === 'production';
  const warnings: string[] = [];
  const problems: string[] = [];

  const need = (name: string, value: string | undefined): void => {
    if (!value) problems.push(`${name}: required in production`);
  };

  if (v.EMAIL_PROVIDER === 'smtp') {
    for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM_EMAIL'] as const) {
      if (!v[name]) problems.push(`${name}: required when EMAIL_PROVIDER=smtp`);
    }
    if (v.SMTP_FROM_EMAIL && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v.SMTP_FROM_EMAIL)) {
      problems.push(
        'SMTP_FROM_EMAIL: must be a plain e-mail address; the name goes in SMTP_FROM_NAME',
      );
    }
  }

  if (isProduction) {
    need('JWT_SECRET', v.JWT_SECRET);
    need('OTP_HMAC_SECRET', v.OTP_HMAC_SECRET);
    need('BLIND_INDEX_KEY', v.BLIND_INDEX_KEY);
    need('FIELD_ENCRYPTION_KEYS', v.FIELD_ENCRYPTION_KEYS);
    need('FIELD_ENCRYPTION_ACTIVE_KEY', v.FIELD_ENCRYPTION_ACTIVE_KEY);
    need('REDIS_URL', v.REDIS_URL);
    if (v.CORS_ORIGINS.length === 0) problems.push('CORS_ORIGINS: list the allowed web origins');
    if (v.CORS_ORIGINS.includes('*')) problems.push('CORS_ORIGINS: a wildcard is not allowed');
    if (v.EMAIL_PROVIDER === 'dev') problems.push('EMAIL_PROVIDER: "dev" cannot send real e-mail');
    if (v.SMS_PROVIDER === 'dev') {
      problems.push('SMS_PROVIDER: "dev" cannot send real SMS (use "none" to run on e-mail alone)');
    }
    if (v.PUSH_PROVIDER === 'dev') {
      warnings.push(
        'PUSH_PROVIDER=dev: push notifications are written to an in-memory outbox and are not delivered.',
      );
    }
    if (v.SMS_PROVIDER === 'none') {
      warnings.push(
        'SMS_PROVIDER=none: no text messages are sent. Sign-up needs an e-mail address, and phone ' +
          'numbers cannot be verified.',
      );
    }
    if (v.STORAGE_DRIVER === 'local') problems.push('STORAGE_DRIVER: use s3 in production');
    if (v.DEV_OUTBOX_ENABLED) problems.push('DEV_OUTBOX_ENABLED: must be off in production');
    if (v.MODERATION_PROVIDER === 'dev') {
      problems.push(
        'MODERATION_PROVIDER: "dev" approves every upload; use "manual" (or a connected service)',
      );
    }
    for (const name of ['JWT_SECRET', 'OTP_HMAC_SECRET', 'BLIND_INDEX_KEY'] as const) {
      const value = v[name];
      if (value && /blocks-dev-only|change-me|changeme|example/i.test(value)) {
        problems.push(`${name}: looks like a placeholder`);
      }
    }
    if (v.FIELD_ENCRYPTION_KEYS) {
      try {
        const keys = JSON.parse(v.FIELD_ENCRYPTION_KEYS) as Record<string, string>;
        for (const [id, b64] of Object.entries(keys)) {
          if (Buffer.from(b64, 'base64').length !== 32) {
            problems.push(`FIELD_ENCRYPTION_KEYS.${id}: must be 32 bytes, base64-encoded`);
          }
        }
        if (v.FIELD_ENCRYPTION_ACTIVE_KEY && !(v.FIELD_ENCRYPTION_ACTIVE_KEY in keys)) {
          problems.push('FIELD_ENCRYPTION_ACTIVE_KEY: not one of FIELD_ENCRYPTION_KEYS');
        }
      } catch {
        problems.push('FIELD_ENCRYPTION_KEYS: must be a JSON object');
      }
    }
    if (v.ADS_BILLING_PROVIDER === 'dev') {
      problems.push('ADS_BILLING_PROVIDER: "dev" pays for advertising without moving any money');
    }
    if (v.MONEY_FEATURES_ENABLED) {
      for (const name of [
        'KYC_PROVIDER',
        'BANK_VERIFICATION_PROVIDER',
        'PAYOUT_PROVIDER',
      ] as const) {
        if (v[name] === 'mock') {
          problems.push(
            `${name}: "mock" is a stand-in; money features cannot be enabled in production until a real provider is connected`,
          );
        }
      }
    }
    if (v.STORAGE_DRIVER === 's3') {
      for (const name of ['S3_BUCKET_PRIVATE', 'S3_BUCKET_KYC', 'S3_REGION'] as const)
        need(name, v[name]);
    }
    if (problems.length) throw new ConfigError(problems);
  } else {
    if (!v.JWT_SECRET || !v.OTP_HMAC_SECRET || !v.BLIND_INDEX_KEY || !v.FIELD_ENCRYPTION_KEYS) {
      warnings.push(
        'Using insecure development secrets for any of JWT_SECRET, OTP_HMAC_SECRET, BLIND_INDEX_KEY or ' +
          'FIELD_ENCRYPTION_KEYS that are not set. Never do this outside a developer machine.',
      );
    }
  }

  if (problems.length) throw new ConfigError(problems);

  const dev = devEncryptionKeys();
  const env: Env = {
    ...v,
    JWT_SECRET: v.JWT_SECRET ?? devSecret('jwt'),
    OTP_HMAC_SECRET: v.OTP_HMAC_SECRET ?? devSecret('otp'),
    BLIND_INDEX_KEY: v.BLIND_INDEX_KEY ?? devSecret('blind-index'),
    FIELD_ENCRYPTION_KEYS: v.FIELD_ENCRYPTION_KEYS ?? dev.keys,
    FIELD_ENCRYPTION_ACTIVE_KEY: v.FIELD_ENCRYPTION_ACTIVE_KEY ?? dev.active,
    isProduction,
    isTest: v.NODE_ENV === 'test',
    swaggerEnabled: v.SWAGGER_ENABLED ?? !isProduction,
    smtpSecure: v.SMTP_SECURE ?? v.SMTP_PORT === 465,
    devOutboxEnabled: !isProduction && (v.DEV_OUTBOX_ENABLED ?? true),
    workersEnabled: v.WORKERS_ENABLED ?? v.NODE_ENV !== 'test',
    moneyEnabled: v.MONEY_FEATURES_ENABLED ?? !isProduction,
  };
  return { env, warnings };
}
