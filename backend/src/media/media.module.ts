import { Module } from '@nestjs/common';
import { ENV } from '../config/config.module.js';
import type { Env } from '../config/env.js';
import { AdminModule } from '../admin/admin.module.js';
import { SystemSettingsService } from '../common/settings/system-settings.service.js';
import { MusicModule } from '../music/music.module.js';
import { SocialModule } from '../social/social.module.js';
import { MediaAdminController } from './admin/media-admin.controller.js';
import { MediaAdminService } from './admin/media-admin.service.js';
import { MediaFilesController } from './delivery/media-files.controller.js';
import { MediaJobsService } from './jobs/media-jobs.service.js';
import { ContentReleaseService } from './processing/content-release.service.js';
import { MediaFilesService } from './processing/media-files.service.js';
import { MediaRetentionService } from './processing/media-retention.service.js';
import { MediaModerationService } from './processing/media-moderation.service.js';
import { MediaProcessor } from './processing/media-processor.js';
import { ReelComposer } from './processing/reel-composer.js';
import { MediaWorker } from './processing/media-worker.js';
import {
  DevModerationProvider,
  ManualModerationProvider,
  ModerationProvider,
} from './processing/moderation.provider.js';
import { LocalStorageController } from './storage/local-storage.controller.js';
import { StorageModule } from './storage/storage.module.js';
import { UploadsController } from './uploads/uploads.controller.js';
import { UploadsService } from './uploads/uploads.service.js';

/**
 * Photos, videos and the processing behind them: signed direct-to-storage uploads,
 * the work queue, validation, transcoding, thumbnails and moderation.
 */
@Module({
  imports: [StorageModule, SocialModule, MusicModule, AdminModule],
  controllers: [
    UploadsController,
    LocalStorageController,
    MediaFilesController,
    MediaAdminController,
  ],
  providers: [
    MediaAdminService,
    UploadsService,
    MediaJobsService,
    MediaProcessor,
    ReelComposer,
    MediaWorker,
    ContentReleaseService,
    MediaFilesService,
    MediaModerationService,
    MediaRetentionService,
    {
      provide: ModerationProvider,
      inject: [ENV, SystemSettingsService],
      useFactory: (env: Env, settings: SystemSettingsService): ModerationProvider =>
        env.MODERATION_PROVIDER === 'manual'
          ? new ManualModerationProvider()
          : new DevModerationProvider(settings),
    },
  ],
  exports: [
    UploadsService,
    MediaJobsService,
    MediaWorker,
    MediaProcessor,
    MediaModerationService,
    MediaFilesService,
    MediaRetentionService,
    StorageModule,
  ],
})
export class MediaModule {}
