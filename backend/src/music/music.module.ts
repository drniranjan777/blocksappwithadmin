import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { StorageModule } from '../media/storage/storage.module.js';
import { SocialModule } from '../social/social.module.js';
import { MusicAdminController } from './music-admin.controller.js';
import { MusicAdminService } from './music-admin.service.js';
import { MusicAssetsService } from './music-assets.service.js';
import { MusicController } from './music.controller.js';
import { MusicService } from './music.service.js';

/** The licensed music library: what people can pick, and how staff run it. */
@Module({
  imports: [StorageModule, SocialModule, AdminModule],
  controllers: [MusicController, MusicAdminController],
  providers: [MusicService, MusicAdminService, MusicAssetsService],
  exports: [MusicService, MusicAdminService, MusicAssetsService],
})
export class MusicModule {}
