import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { MusicModule } from '../music/music.module.js';
import { SocialModule } from '../social/social.module.js';
import { ReelsController } from './reels.controller.js';
import { ReelsService } from './reels.service.js';

/** Making reels: the edit is described here, rendered by the media pipeline, published by moderation. */
@Module({
  imports: [SocialModule, MusicModule, MediaModule],
  controllers: [ReelsController],
  providers: [ReelsService],
  exports: [ReelsService],
})
export class ReelsModule {}
