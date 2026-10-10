/**
 * Every error the API returns has the same shape:
 *
 *     { "error": { "code": "CONFLICT", "message": "...", "details": ..., "requestId": "..." } }
 *
 * `code` is stable and meant for programs (the mobile app maps it to a localised
 * message); `message` is for humans and may change. Messages are written so they
 * do not reveal whether an account exists, which password was wrong, or anything
 * about the server's internals.
 */

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'TOKEN_EXPIRED'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'ENROLMENT_REQUIRED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_RESTRICTED'
  | 'TWO_FACTOR_REQUIRED'
  | 'VERIFICATION_REQUIRED'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_LOCKED'
  | 'OTP_THROTTLED'
  | 'STEP_UP_REQUIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'USERNAME_TAKEN'
  | 'PRECONDITION_FAILED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INSUFFICIENT_FUNDS'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

export interface FieldIssue {
  /** Dotted path to the offending field, e.g. `address.district`. */
  field: string;
  /** Short machine-readable reasons, e.g. `too_short`, `required`. */
  reasons: string[];
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Constructors for the errors the API raises, so wording and codes stay consistent. */
export const Errors = {
  validation: (issues: FieldIssue[]): AppError =>
    new AppError(400, 'VALIDATION_FAILED', 'Some fields are not valid.', issues),

  badRequest: (code: ErrorCode, message: string, details?: unknown): AppError =>
    new AppError(400, code, message, details),

  tooLarge: (message: string, details?: unknown): AppError =>
    new AppError(413, 'PAYLOAD_TOO_LARGE', message, details),

  unsupportedMedia: (message: string, details?: unknown): AppError =>
    new AppError(415, 'UNSUPPORTED_MEDIA', message, details),

  unauthenticated: (message = 'Sign in to continue.'): AppError =>
    new AppError(401, 'UNAUTHENTICATED', message),

  tokenExpired: (): AppError => new AppError(401, 'TOKEN_EXPIRED', 'Your session has expired.'),

  sessionRevoked: (): AppError =>
    new AppError(401, 'SESSION_REVOKED', 'This device has been signed out.'),

  /** Staff only: signed out for inactivity or after the hard time limit. */
  sessionExpired: (): AppError =>
    new AppError(401, 'SESSION_EXPIRED', 'You were signed out. Please sign in again.'),

  /** Staff only: the account must finish setting up (password, two-step verification) first. */
  enrolmentRequired: (nextStep: string): AppError =>
    new AppError(403, 'ENROLMENT_REQUIRED', 'Finish setting up your account to continue.', {
      nextStep,
    }),

  /**
   * Used for an unknown account and a wrong password alike. `attemptsRemaining`
   * counts what was typed, not the account, so it is the same either way.
   */
  invalidCredentials: (attemptsRemaining?: number): AppError =>
    new AppError(
      401,
      'INVALID_CREDENTIALS',
      'The details you entered are not correct.',
      attemptsRemaining === undefined ? undefined : { attemptsRemaining },
    ),

  accountLocked: (until: Date, justTriggered = false): AppError =>
    new AppError(
      423,
      'ACCOUNT_LOCKED',
      'Sign-in is temporarily paused. Try again later or reset your password.',
      { until: until.toISOString(), justTriggered },
    ),

  accountSuspended: (): AppError =>
    new AppError(403, 'ACCOUNT_SUSPENDED', 'This account cannot be used right now.'),

  /** A restricted account can sign in and read, but not publish. */
  accountRestricted: (): AppError =>
    new AppError(403, 'ACCOUNT_RESTRICTED', 'This account cannot post or comment right now.'),

  forbidden: (message = 'You do not have permission to do that.'): AppError =>
    new AppError(403, 'FORBIDDEN', message),

  /** Also used when the caller may not *know* the resource exists. */
  notFound: (what = 'Resource'): AppError =>
    new AppError(404, 'NOT_FOUND', `${what} was not found.`),

  conflict: (message: string, code: ErrorCode = 'CONFLICT', details?: unknown): AppError =>
    new AppError(409, code, message, details),

  /** A sensitive action needs a fresh step-up (password + a code sent to the account's own contact). */
  stepUpRequired: (purpose: string): AppError =>
    new AppError(403, 'STEP_UP_REQUIRED', 'Confirm it is you to continue.', { purpose }),

  precondition: (message: string, details?: unknown): AppError =>
    new AppError(412, 'PRECONDITION_FAILED', message, details),

  otpInvalid: (attemptsLeft: number): AppError =>
    new AppError(400, 'OTP_INVALID', 'That code is not correct.', { attemptsLeft }),

  otpExpired: (): AppError =>
    new AppError(400, 'OTP_EXPIRED', 'That code has expired. Request a new one.'),

  otpLocked: (): AppError =>
    new AppError(429, 'OTP_LOCKED', 'Too many wrong codes. Request a new code to continue.'),

  rateLimited: (retryAfterSeconds: number): AppError =>
    new AppError(
      429,
      'RATE_LIMITED',
      'Too many requests. Please wait a moment and try again.',
      { retryAfterSeconds },
      { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) },
    ),

  insufficientFunds: (): AppError =>
    new AppError(409, 'INSUFFICIENT_FUNDS', 'The available balance does not cover this amount.'),

  unavailable: (message = 'The service is not ready.', details?: unknown): AppError =>
    new AppError(503, 'SERVICE_UNAVAILABLE', message, details),

  internal: (): AppError =>
    new AppError(500, 'INTERNAL', 'Something went wrong on our side. Please try again.'),
};
