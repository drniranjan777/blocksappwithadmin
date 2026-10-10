import { Global, Module } from '@nestjs/common';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { BlindIndex, FieldCipher } from './field-cipher.js';
import { PasswordHasher } from './password.js';

/** The cryptographic helpers, configured from the validated environment. */
@Global()
@Module({
  providers: [
    PasswordHasher,
    {
      provide: FieldCipher,
      inject: [ENV],
      useFactory: (env: Env): FieldCipher =>
        new FieldCipher(env.FIELD_ENCRYPTION_KEYS, env.FIELD_ENCRYPTION_ACTIVE_KEY),
    },
    {
      provide: BlindIndex,
      inject: [ENV],
      useFactory: (env: Env): BlindIndex => new BlindIndex(env.BLIND_INDEX_KEY),
    },
  ],
  exports: [PasswordHasher, FieldCipher, BlindIndex],
})
export class CryptoModule {}
