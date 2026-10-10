import { Global, Module } from '@nestjs/common';
import { hmacHex } from '../../common/crypto/tokens.js';
import { ENV } from '../../config/config.module.js';
import type { Env } from '../../config/env.js';
import { LocalObjectStorage } from './local-object-storage.js';
import { ObjectStorage } from './object-storage.js';
import { S3ObjectStorage } from './s3-object-storage.js';

/** Injection token for the bucket that holds uploaded originals and processed media. */
export const MEDIA_BUCKET = Symbol('MEDIA_BUCKET');
export const DEFAULT_MEDIA_BUCKET = 'blocks-media';

/** The separate, stricter bucket for identity documents. Nothing in it is ever served by an address. */
export const KYC_BUCKET = Symbol('KYC_BUCKET');
export const DEFAULT_KYC_BUCKET = 'blocks-kyc';

/**
 * Chooses where files live from configuration. The rest of the application only
 * sees `ObjectStorage`.
 */
@Global()
@Module({
  providers: [
    {
      provide: ObjectStorage,
      inject: [ENV],
      useFactory: (env: Env): ObjectStorage =>
        env.STORAGE_DRIVER === 's3'
          ? new S3ObjectStorage({
              region: env.S3_REGION ?? 'auto',
              endpoint: env.S3_ENDPOINT,
              accessKeyId: env.S3_ACCESS_KEY_ID,
              secretAccessKey: env.S3_SECRET_ACCESS_KEY,
            })
          : new LocalObjectStorage(
              env.STORAGE_LOCAL_DIR,
              hmacHex(env.JWT_SECRET, 'blocks:storage:local'),
              env.PUBLIC_API_URL.replace(/\/$/, ''),
            ),
    },
    {
      provide: MEDIA_BUCKET,
      inject: [ENV],
      useFactory: (env: Env): string => env.S3_BUCKET_PRIVATE ?? DEFAULT_MEDIA_BUCKET,
    },
    {
      provide: KYC_BUCKET,
      inject: [ENV],
      useFactory: (env: Env): string => env.S3_BUCKET_KYC ?? DEFAULT_KYC_BUCKET,
    },
  ],
  exports: [ObjectStorage, MEDIA_BUCKET, KYC_BUCKET],
})
export class StorageModule {}
