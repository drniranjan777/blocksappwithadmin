import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/**
 * Field-level encryption for the few values that must be recoverable but are
 * too sensitive to sit in a database column in the clear (KYC identifiers, bank
 * account numbers, TOTP secrets).
 *
 * AES-256-GCM with a fresh 96-bit nonce per value. The stored form is
 *
 *     v1.<keyId>.<nonce>.<ciphertext>.<tag>          (base64url segments)
 *
 * Each value is bound to a *context* string ("kyc_documents.number_enc:<row id>")
 * through GCM's associated data, so a ciphertext copied into another row or
 * column fails to decrypt instead of silently yielding someone else's data.
 *
 * Keys are identified, so they can be rotated: new values use the active key,
 * old values keep decrypting with the key id they carry, and `needsRotation`
 * says which rows to re-encrypt. In production the keys come from a secrets
 * manager / KMS; this class only ever sees them as configuration.
 */

const VERSION = 'v1';

export class FieldCipherError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FieldCipherError';
  }
}

export class FieldCipher {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    keysJson: string,
    private readonly activeKeyId: string,
  ) {
    const parsed = JSON.parse(keysJson) as Record<string, string>;
    for (const [id, b64] of Object.entries(parsed)) {
      const key = Buffer.from(b64, 'base64');
      if (key.length !== 32) throw new FieldCipherError(`key "${id}" must be 32 bytes`);
      if (id.includes('.')) throw new FieldCipherError(`key id "${id}" must not contain "."`);
      this.keys.set(id, key);
    }
    if (!this.keys.has(activeKeyId))
      throw new FieldCipherError(`active key "${activeKeyId}" is not configured`);
  }

  encrypt(plaintext: string, context: string): string {
    const key = this.keys.get(this.activeKeyId) as Buffer;
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(context, 'utf8'));
    const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      this.activeKeyId,
      nonce.toString('base64url'),
      body.toString('base64url'),
      tag.toString('base64url'),
    ].join('.');
  }

  decrypt(envelope: string, context: string): string {
    const parts = envelope.split('.');
    if (parts.length !== 5 || parts[0] !== VERSION)
      throw new FieldCipherError('unrecognised ciphertext');
    const [, keyId, nonce, body, tag] = parts as [string, string, string, string, string];
    const key = this.keys.get(keyId);
    if (!key) throw new FieldCipherError(`no key "${keyId}" to decrypt with`);
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(nonce, 'base64url'));
      decipher.setAAD(Buffer.from(context, 'utf8'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(body, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Wrong key, wrong context or tampering all look the same on purpose.
      throw new FieldCipherError('decryption failed');
    }
  }

  /** True when the value was written with a key other than the active one. */
  needsRotation(envelope: string): boolean {
    return envelope.split('.')[1] !== this.activeKeyId;
  }
}

/**
 * A keyed hash of a value, for finding duplicates without decrypting
 * ("is this account number already on file?"). It is deterministic per key and
 * `purpose`, so it must only be used for equality lookups, and the key must be
 * kept apart from the database.
 */
export class BlindIndex {
  constructor(private readonly key: string) {}

  of(purpose: string, value: string): string {
    return createHmac('sha256', this.key).update(`${purpose}\u0000${value}`).digest('hex');
  }
}
