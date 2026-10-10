import type { IssuedChallenge } from './otp.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Seconds until the access token expires. */
  expiresIn: number;
  expiresAt: string;
}

/** The account as the signed-in person sees it. Contact details are masked. */
export interface MeResponse {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  twoFactorEnabled: boolean;
  accountType: string;
  status: string;
  language: string;
  createdAt: string;
}

export interface VerificationChallenge {
  challengeId: string;
  channel: 'EMAIL' | 'SMS';
  /** `null` when answering without revealing where the code went. */
  destinationMasked: string | null;
  expiresAt: string;
  resendAvailableAt: string;
}

export type LoginOutcome =
  | { status: 'authenticated'; tokens: AuthTokens; user: MeResponse; newDevice: boolean }
  | {
      status: 'two_factor_required';
      challengeId: string;
      /** What can satisfy it: `totp`, `otp` (sent to `destinationMasked`), `backup_code`. */
      methods: string[];
      destinationMasked: string | null;
    }
  | {
      status: 'verification_required';
      verification: VerificationChallenge;
      reason: 'unusual_sign_in' | 'unverified_contact';
    };

export type AuthResult = Extract<LoginOutcome, { status: 'authenticated' }>;

export function toVerification(c: IssuedChallenge, reveal = true): VerificationChallenge {
  return {
    challengeId: c.id,
    channel: c.channel,
    destinationMasked: reveal ? c.destinationMasked : null,
    expiresAt: c.expiresAt.toISOString(),
    resendAvailableAt: c.resendAvailableAt.toISOString(),
  };
}
